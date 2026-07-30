# MakitiPlus — Assistant IA (implémentation réelle)

## Date
2026-07-31

## Contexte

`src/pages/AIAssistant.tsx` utilisait auparavant une fonction locale `generateAIResponse()` qui simulait des réponses par correspondance de mots-clés — aucun appel à un vrai modèle de langage, malgré `has_ai_assistant` déjà facturé comme fonctionnalité Enterprise. Voir `docs/production/STRATEGIC_AUDIT_AFRICA_WORLD_LEADER.md` section 2.1.

## Architecture

```
Frontend (AIAssistant.tsx)
  → supabase.functions.invoke("ai-assistant-chat", { message, history })
    → Edge Function (supabase/functions/ai-assistant-chat/index.ts)
      1. Vérifie le JWT de l'appelant
      2. Vérifie check_feature_access('ai_assistant') côté serveur
         (indépendamment du FeatureGate frontend — défense en profondeur)
      3. Lit le contexte métier réel via le JWT de l'appelant :
         get_dashboard_stats, get_product_stats, get_expense_stats
         (RLS scope automatiquement à l'organisation de l'appelant)
      4. Appelle l'API Groq (llama-3.3-70b-versatile) avec un prompt
         système grounded sur ces données réelles
      5. Retourne { content, suggestions }
```

## Fournisseur : Groq

- **Modèle** : `llama-3.3-70b-versatile`
- **Pourquoi Groq plutôt que OpenAI/Anthropic direct** : inférence rapide et peu coûteuse, largement suffisant pour des conseils métier contextuels ("quels produits réapprovisionner", "pourquoi mes ventes ont baissé") — pas besoin d'un modèle de raisonnement avancé pour ce cas d'usage.
- **Format de réponse** : `response_format: { type: "json_object" }` — le modèle renvoie `{content, suggestions}` directement, avec un repli sur le texte brut si le JSON est malformé (ne jamais faire échouer la requête pour un problème de parsing).

## Secrets requis

Configurés via `supabase secrets set` (jamais dans le dépôt, jamais dans `.env` local commité) :
- `GROQ_API_KEY` — utilisée par `ai-assistant-chat`.
- `OPENROUTER_API_KEY` — **stockée en réserve, pas encore câblée** dans aucune fonction. Option de secours ou de changement de fournisseur pour plus tard, décision volontairement différée pour ne pas complexifier le v1 (RULE 0 — pas de multi-provider fallback tant que Groq seul suffit).

## Sécurité

- La clé Groq n'est **jamais** exposée au frontend — appel exclusivement depuis l'Edge Function.
- Accès re-vérifié côté serveur (`check_feature_access`) : même si le `FeatureGate` frontend était de nouveau contourné par erreur (voir l'historique du bug corrigé dans `PlanLimitGuard.tsx`), la fonction refuse elle-même l'accès à un appelant dont le plan n'inclut pas `ai_assistant`.
- Les données métier envoyées au modèle sont lues avec le JWT de l'appelant (pas la clé service_role) — aucune fuite cross-organisation possible, RLS s'applique normalement.
- Rate limiting : 20 requêtes / 5 minutes par client (les appels LLM ont un coût réel, contrairement à la majorité des autres RPC).
- Message limité à 2000 caractères.

## Limites connues (v1)

- **Pas de persistance de conversation côté serveur** : l'historique envoyé à chaque appel est le contenu de la session frontend en cours (6 derniers messages), rien n'est stocké en base. Une conversation reprise après un rechargement de page repart à zéro contextuellement (mais l'historique visible reste affiché côté client tant que la page n'est pas rechargée).
- **Pas de fallback OpenRouter automatique** : si Groq est indisponible, l'utilisateur voit une erreur ("Assistant IA temporairement indisponible"), pas de bascule automatique vers un autre fournisseur.
- **Contexte métier limité à 3 RPC** (dashboard, produits, dépenses) — pas d'historique de ventes détaillé, pas de données fournisseurs/clients. Suffisant pour les cas d'usage du prompt système actuel ; à étendre si de nouveaux types de questions deviennent fréquents.
- **Non testé en conditions réelles** : je n'ai pas pu me connecter avec un vrai compte pour valider le round-trip complet (contrainte permanente de cette collaboration — je ne me connecte jamais comme un utilisateur réel, RULE 1). Vérifié : le garde d'authentification de la fonction déployée répond bien 401 sans token ; le format de requête Groq correspond à leur API OpenAI-compatible documentée. **À valider manuellement par un humain avant announcement client.**

## Coût

Non chiffré dans le cadre de cette implémentation — à surveiller via le dashboard Groq une fois en usage réel. Le rate limit (20 req/5 min/client) et la limite de 800 tokens de sortie par réponse bornent le risque d'emballement de coût, mais ne remplacent pas un suivi de facturation réel.

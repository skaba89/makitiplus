# MakitiPlus — Validation live de l'Assistant IA — 2026-08-01

## Fonction auditée
`supabase/functions/ai-assistant-chat` — déployée, `ACTIVE`, version 1, `verify_jwt: true` (voir `docs/production/SUPABASE_LIVE_VERIFICATION_2026_08_01.md`).

## Méthode
Revue de code complète (checklist ci-dessous) + **un seul appel réel non authentifié** contre la fonction déployée en production (`https://exxntkuursgwhxvehekr.supabase.co/functions/v1/ai-assistant-chat`), sans aucun header `Authorization` — aucune donnée d'aucun magasin n'est accessible ni modifiée par cet appel, c'est le cas le plus sûr à tester en dehors d'un compte de test dédié.

## Checklist sécurité (section P0.6 de l'audit)

| Vérification | Méthode | Résultat |
|---|---|---|
| Sans JWT → 401 | **Testé en direct** contre la fonction déployée : `curl -X POST .../ai-assistant-chat` sans `Authorization` | ✅ **`HTTP_STATUS:401`** confirmé réellement, pas seulement en lecture de code |
| Plan sans `ai_assistant` → refus | Revue de code : `check_feature_access('ai_assistant')` appelé côté serveur via le JWT de l'appelant, indépendant du `FeatureGate` frontend ; retourne `403` si `allowed` est faux | ✅ code conforme — **non testé en live** (nécessite un compte réel dont le plan exclut `ai_assistant`, indisponible pour cet audit) |
| Plan avec `ai_assistant` → réponse Groq | Revue de code : appel réel à `https://api.groq.com/openai/v1/chat/completions` avec `GROQ_MODEL = llama-3.3-70b-versatile`, clé lue depuis `GROQ_API_KEY` (secret Supabase) | ✅ code conforme — **non testé en live** (nécessite un compte réel autorisé avec `ai_assistant` actif, indisponible pour cet audit) |
| Données lues sous RLS de l'appelant | Revue de code : `userClient` créé avec `Authorization: authHeader` (le JWT de l'appelant), jamais de client `service_role`. `profiles`/`get_dashboard_stats`/`get_product_stats`/`get_expense_stats` passent tous par ce client | ✅ conforme par construction |
| Pas de `service_role` exposé | Revue de code + `grep` : aucune occurrence de `SERVICE_ROLE` dans le fichier | ✅ confirmé |
| Message trop long refusé | Revue de code : `message.length > 2000` → `400` | ✅ conforme — non testé en live (nécessite un JWT valide pour dépasser l'étape 401) |
| Rate limit actif | Revue de code : `createRateLimiter('ai-assistant-chat', { maxRequests: 20, windowMs: 5*60_000 })` | ✅ conforme |
| Erreur Groq visible proprement | Revue de code : réponse Groq non-`ok` → log serveur tronqué (500 caractères), réponse client générique `502` sans corps d'erreur brut | ✅ conforme |
| Pas de fuite cross-tenant | Revue de code : `ChatPayload` n'expose que `message`/`history`, aucun `organization_id` accepté du client ; toutes les lectures passent par `userClient` (RLS) | ✅ conforme par construction, voir `src/test/aiAssistantSecurityRegression.test.ts` |

## Ce qui N'A PAS été testé en conditions réelles

Cet audit **n'a pas pu exécuter le parcours complet avec un compte réellement autorisé** (plan incluant `ai_assistant`, appel effectif à Groq, réponse réelle affichée) : aucun identifiant de test (E2E ou autre) disponible pour cet audit n'a de plan incluant cette fonctionnalité, et aucun compte de démonstration n'a été fourni. Le code est conforme à la revue, mais **la règle du plan d'audit s'applique explicitement** :

> Ne pas vendre l'IA comme fonctionnalité premium tant que le test réel avec un compte autorisé n'est pas passé.

**Action recommandée avant toute annonce commerciale de l'Assistant IA** : effectuer manuellement, avec un compte réel dont le plan inclut `ai_assistant` (ou en configurant temporairement un compte `E2E_TEST_ORG` avec ce plan), un aller-retour complet dans l'interface (`/dashboard/ai-assistant`) et confirmer qu'une réponse Groq réelle et cohérente s'affiche, avec des données de contexte exactes.

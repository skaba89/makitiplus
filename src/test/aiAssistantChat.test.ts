import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * L'Assistant IA était une simulation par mots-clés côté frontend
 * (voir docs/production/STRATEGIC_AUDIT_AFRICA_WORLD_LEADER.md, section 2.1) --
 * un client payant pour has_ai_assistant recevait des réponses canned, jamais
 * un vrai appel LLM. Remplacé par un vrai appel Groq via Edge Function
 * (supabase/functions/ai-assistant-chat), avec la clé API strictement
 * côté serveur et l'accès re-vérifié indépendamment du FeatureGate frontend.
 */

const edgeFn = fs.readFileSync(
  path.join(process.cwd(), "supabase/functions/ai-assistant-chat/index.ts"),
  "utf-8"
);
const frontend = fs.readFileSync(
  path.join(process.cwd(), "src/pages/AIAssistant.tsx"),
  "utf-8"
);

describe("Edge Function ai-assistant-chat — sécurité", () => {
  it("exige un header Authorization avant tout traitement", () => {
    expect(edgeFn).toMatch(/req\.headers\.get\('Authorization'\)/);
    expect(edgeFn).toMatch(/Missing authorization/);
  });

  it("vérifie check_feature_access('ai_assistant') côté serveur, indépendamment du FeatureGate frontend", () => {
    // Défense en profondeur : la clé Groq ne doit jamais être atteignable par
    // un appelant dont le plan n'inclut pas has_ai_assistant, même si un futur
    // bug réintroduit un contournement du FeatureGate (voir PR précédente
    // fix/plan-limit-guard-admin-bypass).
    expect(edgeFn).toMatch(/check_feature_access/);
    expect(edgeFn).toMatch(/p_feature_key:\s*['"]ai_assistant['"]/);
    expect(edgeFn).toMatch(/status:\s*403/);
  });

  it("utilise le JWT de l'appelant (pas service role) pour lire les données métier", () => {
    // C'est ce qui garantit que get_dashboard_stats/get_product_stats/
    // get_expense_stats restent scopés à l'organisation de l'appelant via
    // auth.uid() + RLS, sans que cette fonction ait besoin de faire confiance
    // à un organization_id fourni par le client.
    expect(edgeFn).toMatch(/global:\s*\{\s*headers:\s*\{\s*Authorization:\s*authHeader\s*\}\s*\}/);
  });

  it("ne journalise jamais la valeur de la clé GROQ_API_KEY", () => {
    // Mentionner le NOM de la variable d'env dans un message de diagnostic
    // ("GROQ_API_KEY not configured") est acceptable -- ce qui ne doit
    // jamais arriver, c'est que la VALEUR (la variable groqKey une fois lue)
    // parte dans un console.*.
    const groqKeyUsages = edgeFn.match(/GROQ_API_KEY/g) ?? [];
    expect(groqKeyUsages.length).toBeGreaterThan(0);
    expect(edgeFn).not.toMatch(/console\.(log|error|warn)\([^)]*groqKey\b/i);
  });

  it("est protégée par un rate limiter", () => {
    expect(edgeFn).toMatch(/createRateLimiter\('ai-assistant-chat'/);
  });

  it("limite la longueur du message (protection contre l'abus de coût LLM)", () => {
    expect(edgeFn).toMatch(/message\.length > 2000/);
  });

  it("gère les erreurs Groq sans jamais renvoyer le corps brut de l'erreur au client", () => {
    const groqErrorBlock = edgeFn.match(/if \(!groqResponse\.ok\) \{[\s\S]{0,400}?\}/)?.[0] ?? "";
    expect(groqErrorBlock).not.toMatch(/JSON\.stringify\(\{\s*error:\s*errText/);
  });

  it("répond aux requêtes OPTIONS (préflight CORS)", () => {
    expect(edgeFn).toMatch(/req\.method === 'OPTIONS'/);
    expect(edgeFn).toMatch(/corsOptionsResponse/);
  });

  it("n'accepte que POST", () => {
    expect(edgeFn).toMatch(/req\.method !== 'POST'/);
    expect(edgeFn).toMatch(/status:\s*405/);
  });
});

describe("AIAssistant.tsx — plus de simulation par mots-clés", () => {
  it("n'a plus la fonction generateAIResponse (mots-clés codés en dur)", () => {
    expect(frontend).not.toMatch(/function generateAIResponse/);
  });

  it("appelle réellement l'Edge Function ai-assistant-chat", () => {
    expect(frontend).toMatch(/supabase\.functions\.invoke\(\s*["']ai-assistant-chat["']/);
  });

  it("envoie le message et un historique court", () => {
    const invokeBlock = frontend.match(/functions\.invoke\(\s*["']ai-assistant-chat["'][\s\S]{0,200}?\}\);/)?.[0] ?? "";
    expect(invokeBlock).toMatch(/message:\s*content/);
    expect(invokeBlock).toMatch(/history/);
  });

  it("gère les deux formes d'erreur (invoke error + data.error applicatif)", () => {
    expect(frontend).toMatch(/if \(error\) throw error;/);
    expect(frontend).toMatch(/if \(data\?\.error\) throw new Error\(data\.error\);/);
  });

  it("remonte les erreurs via toast et reportError (pas d'échec silencieux)", () => {
    const catchBlock = frontend.match(/\} catch \(error: unknown\) \{[\s\S]{0,600}?\n {4}\}/)?.[0] ?? "";
    expect(catchBlock).toMatch(/toast\(/);
    expect(catchBlock).toMatch(/reportError\(/);
  });

  it("le message de bienvenue reste statique (pas d'appel LLM juste pour dire bonjour)", () => {
    expect(frontend).toMatch(/const INITIAL_GREETING = \{/);
  });

  it("reste gatée par FeatureGate('ai_assistant') côté UI (en plus du contrôle serveur)", () => {
    expect(frontend).toMatch(/feature="ai_assistant"/);
  });
});

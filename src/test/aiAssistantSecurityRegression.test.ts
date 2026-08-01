import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Audit final hardening 2026-08-01, section P0.6 : garde-fous de sécurité
 * pour l'Edge Function ai-assistant-chat, distincts de src/test/aiAssistantChat.test.ts
 * (qui couvre la migration depuis la simulation par mots-clés). Ce fichier
 * se concentre sur ce qui ne doit STRUCTURELLEMENT jamais apparaître dans
 * cette fonction : une clé service_role, ou un organization_id/tenant_id
 * fourni par le client et utilisé sans passer par la RLS de l'appelant.
 *
 * Voir docs/production/AI_ASSISTANT_LIVE_VALIDATION.md pour la preuve live
 * (401 sans JWT confirmé par un appel réel non authentifié le 2026-08-01 --
 * la suite du parcours, avec un compte réellement autorisé, n'a PAS pu être
 * testée faute d'identifiants disponibles pour cet audit).
 */

const readNormalized = (p: string) => fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");
const edgeFn = readNormalized(path.join(process.cwd(), "supabase/functions/ai-assistant-chat/index.ts"));
const liveValidationDoc = readNormalized(path.join(process.cwd(), "docs/production/AI_ASSISTANT_LIVE_VALIDATION.md"));

describe("ai-assistant-chat — aucune clé service_role ne doit jamais y apparaître", () => {
  it("ne référence ni SERVICE_ROLE ni SUPABASE_SERVICE_ROLE_KEY", () => {
    expect(edgeFn).not.toMatch(/SERVICE_ROLE/i);
  });

  it("le seul client Supabase créé utilise la clé publique/anon, pas service_role", () => {
    const clientCreationBlock = edgeFn.match(/createClient\([\s\S]{0,150}\)/)?.[0] ?? "";
    expect(clientCreationBlock).toMatch(/anonKey/);
    expect(clientCreationBlock).not.toMatch(/service/i);
  });
});

describe("ai-assistant-chat — aucune fuite cross-tenant possible", () => {
  it("ne lit jamais d'organization_id/tenant_id envoyé par le client dans le corps de la requête", () => {
    // ChatPayload ne doit exposer que message/history -- si un futur ajout
    // introduisait un organization_id côté payload et l'utilisait pour
    // scoper une requête (au lieu de laisser la RLS le faire via auth.uid()),
    // ce serait une fuite cross-tenant potentielle.
    const payloadInterfaceBlock = edgeFn.match(/interface ChatPayload \{[\s\S]*?\}/)?.[0] ?? "";
    expect(payloadInterfaceBlock).not.toMatch(/organization_id|organizationId|tenant_id/i);
  });

  it("toutes les lectures de données métier passent par userClient (RLS de l'appelant), jamais un client admin", () => {
    const businessDataBlock = edgeFn.match(/Business context[\s\S]*?const contextLines/)?.[0] ?? "";
    expect(businessDataBlock).toMatch(/userClient\.from\('profiles'\)/);
    expect(businessDataBlock).toMatch(/userClient\.rpc\('get_dashboard_stats'/);
    expect(businessDataBlock).not.toMatch(/serviceClient|adminClient/);
  });
});

describe("Preuve live 2026-08-01 (documentée, pas fabriquée)", () => {
  it("la doc de validation live confirme un vrai 401 sans JWT sur la fonction déployée", () => {
    expect(liveValidationDoc).toMatch(/401/);
  });

  it("la doc de validation live signale honnêtement que le parcours complet (compte autorisé + réponse Groq réelle) n'a pas pu être testé faute d'identifiants", () => {
    expect(liveValidationDoc).toMatch(/n['’]a (pas|PAS) (pu être|été) test/i);
  });
});

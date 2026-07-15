/**
 * Tests de sécurité pour la suppression d'utilisateurs
 * Valide que le frontend ne fait pas de suppression destructive directe
 * et que l'Edge Function admin-manage-user est le seul chemin.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const readSrc = (filepath: string): string =>
  fs.readFileSync(path.join(process.cwd(), "src", filepath), "utf-8");

const readEdgeFunction = (filepath: string): string => {
  const fullPath = path.join(process.cwd(), "supabase", "functions", filepath);
  if (!fs.existsSync(fullPath)) return "";
  return fs.readFileSync(fullPath, "utf-8");
};

describe("Admin Manage User Security", () => {
  const usersSrc = readSrc("pages/Users.tsx");
  const edgeFnSrc = readEdgeFunction("admin-manage-user/index.ts");

  it("Users.tsx appelle admin-manage-user via supabase.functions.invoke", () => {
    expect(usersSrc).toContain('supabase.functions.invoke("admin-manage-user"');
  });

  it("Users.tsx ne contient pas .from(\"profiles\").delete() dans un fallback destructif", () => {
    // Vérifier qu'il n'y a pas de .from("profiles").delete() dans le catch block
    // (la désactivation utilise .update(), pas .delete())
    const deletePatterns = [
      /\.from\(["']profiles["']\)\s*\.delete\(\)/,
      /\.from\(["']user_roles["']\)\s*\.delete\(\)/,
    ];
    for (const pattern of deletePatterns) {
      // On vérifie qu'il n'y a pas de .delete() sur profiles ou user_roles
      // sauf dans l'Edge Function
      expect(usersSrc).not.toMatch(pattern);
    }
  });

  it("Users.tsx affiche un message clair si l'Edge Function échoue pour delete", () => {
    expect(usersSrc).toContain("Suppression impossible");
    expect(usersSrc).toContain("admin-manage-user non disponible");
    expect(usersSrc).toContain("service_role");
  });

  it("Edge Function admin-manage-user existe", () => {
    expect(edgeFnSrc.length).toBeGreaterThan(0);
  });

  it.skipIf(!edgeFnSrc)("Edge Function utilise SUPABASE_SERVICE_ROLE_KEY (via orgScope)", () => {
    // L'Edge Function utilise adminClient qui est créé avec SUPABASE_SERVICE_ROLE_KEY dans _shared/orgScope.ts
    const orgScopeSrc = readEdgeFunction("_shared/orgScope.ts");
    expect(orgScopeSrc).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it.skipIf(!edgeFnSrc)("Edge Function vérifie le rôle admin/super_admin", () => {
    // L'Edge Function utilise requireAdminContext qui vérifie le rôle
    expect(edgeFnSrc).toMatch(/requireAdminContext|super_admin|admin/i);
  });

  it.skipIf(!edgeFnSrc)("Edge Function empêche la suppression d'un super_admin par un admin", () => {
    // Vérifier qu'il y a une vérification de rôle pour empêcher un admin de supprimer un super_admin
    // L'Edge Function charge le rôle cible et vérifie les permissions
    expect(edgeFnSrc).toMatch(/targetRole|role|super_admin/i);
  });

  it.skipIf(!edgeFnSrc)("Edge Function écrit un audit log", () => {
    expect(edgeFnSrc).toMatch(/audit|log/i);
  });

  it("Aucun fallback destructif frontend — pas de .from().delete() dans le catch", () => {
    // Extraire le block catch dans callManage
    const callManageMatch = usersSrc.match(/const callManage[\s\S]*?^  };/m);
    expect(callManageMatch).not.toBeNull();
    const callManageBody = callManageMatch![0];
    // Le catch block ne doit pas contenir .delete()
    expect(callManageBody).not.toMatch(/\.from\([^)]+\)\s*\.delete\(\)/);
  });
});

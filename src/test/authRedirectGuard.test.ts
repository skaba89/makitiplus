import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const protectedRouteSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/ProtectedRoute.tsx"),
  "utf-8"
);
const supabaseClientSource = fs.readFileSync(
  path.join(process.cwd(), "src/integrations/supabase/client.ts"),
  "utf-8"
);

describe("ProtectedRoute auth redirect behavior", () => {
  it("redirects missing users to auth", () => {
    expect(protectedRouteSource).toContain('return <Navigate to="/auth" replace />');
  });

  it("redirects incomplete sessions instead of rendering a blocking page", () => {
    expect(protectedRouteSource).toContain("IncompleteSessionRedirect");
    expect(protectedRouteSource).toContain('window.location.replace("/auth")');
    expect(protectedRouteSource).not.toContain("Session incomplète");
    expect(protectedRouteSource).not.toContain("Votre rôle n'a pas pu être chargé");
  });

  it("keeps browser session persistence disabled", () => {
    expect(supabaseClientSource).toContain("persistSession: false");
    expect(supabaseClientSource).toContain("autoRefreshToken: false");
    expect(supabaseClientSource).not.toContain("storage: localStorage");
  });
});

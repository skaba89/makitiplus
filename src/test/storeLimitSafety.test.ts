import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf-8");

describe("Store creation plan-limit safety", () => {
  it("create_first_organization enforces store limits when adding a store to an existing organization", () => {
    const sql = read("supabase/migrations/20260706190000_enforce_store_limit_in_first_org_rpc.sql");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.create_first_organization");
    expect(sql).toContain("FROM public.check_plan_limit('stores')");
    expect(sql).toContain("IF NOT COALESCE(v_limit_ok, FALSE)");
    expect(sql).toContain("Seuls les administrateurs peuvent créer des boutiques");
  });

  it("frontend store creation still uses the onboarding RPC but server-side quota is enforced", () => {
    const stores = read("src/pages/Stores.tsx");
    const sql = read("supabase/migrations/20260706190000_enforce_store_limit_in_first_org_rpc.sql");

    expect(stores).toContain("create_first_organization");
    expect(sql).toContain("check_plan_limit('stores')");
  });
});

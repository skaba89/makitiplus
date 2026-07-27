import { describe, expect, it } from "vitest";
import {
  CASH_CLOSING_CREATE_ROLES,
  CASH_CLOSING_REVIEW_ROLES,
  CASH_CLOSING_ACCESS_ROLES,
  POS_ROLES,
} from "@/types";

describe("Rôles clôture de caisse — P0.1 du plan cash-closing-complete", () => {
  it("CASH_CLOSING_CREATE_ROLES est identique à POS_ROLES (qui peut vendre peut clôturer sa caisse)", () => {
    expect(CASH_CLOSING_CREATE_ROLES).toEqual(POS_ROLES);
  });

  it("le vendeur peut ouvrir/clôturer sa propre caisse", () => {
    expect(CASH_CLOSING_CREATE_ROLES).toContain("vendeur");
  });

  it("super_admin ne peut PAS ouvrir de session de caisse opérationnelle", () => {
    expect(CASH_CLOSING_CREATE_ROLES).not.toContain("super_admin");
  });

  it("CASH_CLOSING_REVIEW_ROLES inclut super_admin, admin, manager, comptable", () => {
    expect(CASH_CLOSING_REVIEW_ROLES).toEqual(
      expect.arrayContaining(["super_admin", "admin", "manager", "comptable"])
    );
  });

  it("le vendeur n'est PAS dans les rôles de revue (ne peut pas approuver, ne voit pas les autres)", () => {
    expect(CASH_CLOSING_REVIEW_ROLES).not.toContain("vendeur");
  });

  it("CASH_CLOSING_ACCESS_ROLES (gating route/menu) = union des deux ensembles, sans doublon", () => {
    const expectedUnion = new Set([...CASH_CLOSING_CREATE_ROLES, ...CASH_CLOSING_REVIEW_ROLES]);
    expect(new Set(CASH_CLOSING_ACCESS_ROLES)).toEqual(expectedUnion);
    expect(CASH_CLOSING_ACCESS_ROLES.length).toBe(new Set(CASH_CLOSING_ACCESS_ROLES).size);
  });

  it("tous les rôles applicatifs ont accès à la route (vendeur via create, super_admin via review)", () => {
    for (const role of ["super_admin", "admin", "manager", "vendeur", "comptable"]) {
      expect(CASH_CLOSING_ACCESS_ROLES).toContain(role);
    }
  });
});

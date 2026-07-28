#!/usr/bin/env python3
"""MakitiPlus SQL migration validator."""

from __future__ import annotations

import re
import sys
from pathlib import Path

RED = "\033[91m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
CYAN = "\033[96m"
RESET = "\033[0m"

MIGRATIONS_DIR = Path(__file__).parent.parent / "supabase" / "migrations"
errors = 0
files_checked = 0

DELETE = r"DELETE\s+" + r"FROM\s+"
UPDATE = r"UPDATE\s+"
PUBLIC = r"public\."
AUTH = r"auth\."

LEGACY_PATTERNS = {
    "CREATE OR REPLACE POLICY": r"CREATE\s+OR\s+REPLACE\s+POLICY",
    "profile_roles reference": r"\bprofile_roles\b",
    "movement_type in INSERT": r"INSERT\s+INTO\s+" + PUBLIC + r"stock_movements\s*\([^)]*movement_type",
    "low_stock_threshold": r"\blow_stock_threshold\b",
}

DESTRUCTIVE_PATTERNS = {
    "profiles organization detach": UPDATE + PUBLIC + r"profiles\s+SET\s+organization_id\s*=\s*NULL\s*;",
    "categories organization detach": UPDATE + PUBLIC + r"categories\s+SET\s+organization_id\s*=\s*NULL\s*;",
    "global sales remove": DELETE + PUBLIC + r"sales\s*;",
    "global products remove": DELETE + PUBLIC + r"products\s*;",
    "global customers remove": DELETE + PUBLIC + r"customers\s*;",
    "global organizations remove": DELETE + PUBLIC + r"organizations\s*;",
    "global stores remove": DELETE + PUBLIC + r"stores\s*;",
    "auth users mutation": DELETE + AUTH + r"users\b",
    "truncate": r"\bTRUNCATE\b",
    "drop schema": r"\bDROP\s+SCHEMA\b",
}


# P1.3 — 20260716100000 contains the historical (buggy) version of
# get_admin_product_ranking_detailed — ROW_NUMBER() directly in WHERE,
# invalid PostgreSQL syntax, confirmed as the version still live in
# production. Fixed by 20260722110000_fix_admin_product_ranking_rownumber.sql
# (CREATE OR REPLACE, same migration-history pattern as P0.3's
# document_live_*). The historical file is intentionally left as-is —
# migrations are an immutable record of what actually ran, not a mutable
# "current state" — so it stays excluded here rather than edited.
WINDOW_FN_IN_WHERE_LEGACY_EXCLUSIONS = (
    "20260716100000_admin_analytics_advanced_rpcs.sql",
)

# Matches only when the window function is (one of) the leading term(s) of the
# WHERE condition — e.g. "WHERE ROW_NUMBER() OVER (...) <= 5" or
# "WHERE (a AND ROW_NUMBER() OVER (...) <= 5)". A bare "\b...\bOVER\(" scan
# across the whole clause would false-positive on any WHERE that merely
# precedes an unrelated window function later in the same CTE chain.
WINDOW_FN_IN_WHERE_PATTERN = (
    r"WHERE\s*\(*\s*(?:\w+\s+(?:AND|OR)\s+\(*\s*)?(?:ROW_NUMBER|RANK|DENSE_RANK)\s*\(\s*\)\s*OVER\s*\("
)

DANGEROUS_GRANT_PATTERNS = {
    "GRANT EXECUTE to PUBLIC": r"GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+[^;]+\s+TO\s+PUBLIC\b",
    "GRANT EXECUTE to anon on a mutating function": (
        r"GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+" + PUBLIC
        + r"(?:delete|remove|drop|truncate|reset|purge)\w*\s*\([^)]*\)\s+TO\s+[^;]*\banon\b"
    ),
}

# P1.3 — dette de sécurité pré-existante identifiée en lançant les nouvelles
# règles ci-dessous contre l'historique complet (130 fichiers) : 10 fichiers
# antérieurs à cette session définissent des fonctions SECURITY DEFINER sans
# SET search_path pinné (vulnérabilité classique de schema-hijacking — voir
# docs/production/SUPABASE_SCHEMA_DRIFT_AUDIT.md). Corriger ~100 fonctions
# d'un coup dans cette session serait un chantier à part entière, risqué sans
# tests dédiés par fonction — exclusion TEMPORAIRE et documentée, comme
# demandé (P1.3 : "exclusions minimales/documentées"), pas une suppression
# de la règle. Aucun NOUVEAU fichier de migration n'est exempté : la règle
# s'applique intégralement à tout ce qui est écrit après le 2026-07-22.
SECURITY_DEFINER_SEARCH_PATH_LEGACY_EXCLUSIONS = (
    "20260702070000_admin_multi_store_analytics.sql",
    "20260702080000_security_hardening_rpc.sql",
    "20260702150000_onboarding_premium.sql",
    "20260702160000_stock_transfers.sql",
    "20260702170000_smart_restock_suggestions.sql",
    "20260702180000_loyalty_program.sql",
    "20260702190000_backup_restore.sql",
    "20260702200000_support_tickets.sql",
    "20260716100000_admin_analytics_advanced_rpcs.sql",
    "_deploy_combined.sql",
)

# Fichiers de migration reconnus comme des backfills volontairement optionnels
# et protégés (nom explicite, jamais exécutés automatiquement en CI/déploiement
# — voir RULE 1 de l'audit national : ne jamais lancer sans validation explicite
# du magasin pilote concerné).
BACKFILL_NAME_MARKERS = ("OPTIONAL_backfill", "_backfill_")


# P2 (cash-closing-final-hardening) — règles ciblées sur le module clôture de
# caisse : la table ne doit jamais recevoir d'écriture directe (RPC
# SECURITY DEFINER uniquement), RLS doit rester activée ET forcée, et la
# contrainte anti-double-ouverture ne doit jamais disparaître d'un futur
# CREATE OR REPLACE de la table. Ces propriétés sont déjà couvertes une par
# une par src/test/cashClosingRegression.test.ts côté frontend/CI JS -- ce
# bloc les fait aussi vivre côté validateur SQL Python (les deux couches
# sont volontairement redondantes : l'une protège les PR TypeScript, l'autre
# protège n'importe quel futur fichier .sql même sans review JS).
CASH_CLOSING_TABLE_FILE = "20260727150000_create_cash_register_sessions.sql"
CASH_CLOSING_FILE_MARKERS = ("cash_register_sessions", "cash_closing")


def check_cash_closing_rules(filepath: Path, cleaned: str, findings: list) -> None:
    is_cash_closing_file = any(marker in filepath.name for marker in CASH_CLOSING_FILE_MARKERS)
    if not is_cash_closing_file:
        return

    # Aucune écriture directe autorisée sur cash_register_sessions -- seules
    # les RPC SECURITY DEFINER peuvent écrire (voir REVOKE explicite attendu).
    for match in re.finditer(
        r"GRANT\s+(?:INSERT|UPDATE|DELETE)[^;]*\bON\s+public\.cash_register_sessions\b[^;]*\bTO\s+authenticated\b",
        cleaned,
        re.IGNORECASE,
    ):
        add_error(
            findings,
            find_line(cleaned, match.start()),
            "cash_register_sessions direct write grant",
            "cash_register_sessions must never receive a direct INSERT/UPDATE/DELETE grant — writes go through SECURITY DEFINER RPCs only.",
            match.group(0)[:160].replace("\n", " "),
        )

    if filepath.name == CASH_CLOSING_TABLE_FILE:
        if not re.search(r"ALTER\s+TABLE\s+public\.cash_register_sessions\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY", cleaned, re.IGNORECASE):
            add_error(findings, 1, "cash_register_sessions RLS not enabled", "cash_register_sessions must have RLS ENABLED.", "")
        if not re.search(r"ALTER\s+TABLE\s+public\.cash_register_sessions\s+FORCE\s+ROW\s+LEVEL\s+SECURITY", cleaned, re.IGNORECASE):
            add_error(findings, 1, "cash_register_sessions RLS not forced", "cash_register_sessions must have RLS FORCED (owners/superuser bypass otherwise).", "")
        if not re.search(r"CREATE\s+UNIQUE\s+INDEX[\s\S]*?uniq_open_cash_session_per_user_store", cleaned, re.IGNORECASE):
            add_error(findings, 1, "cash_register_sessions missing unique open-session index", "The unique index preventing multiple open sessions per user/store must not be removed.", "")


UNSAFE_BILLING_PATTERNS = {
    "unsafe subscription rpc creation": (
        r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+" + PUBLIC + r"update_organization_subscription\s*\(\s*TEXT\s*,\s*TEXT\s*,\s*TEXT\s*\)"
    ),
    "unsafe subscription rpc grant": (
        r"GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+" + PUBLIC + r"update_organization_subscription\s*\([^)]*\)\s+TO\s+authenticated"
    ),
}


def strip_line_comments(sql: str) -> str:
    cleaned_lines: list[str] = []
    for line in sql.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("--"):
            cleaned_lines.append("")
        else:
            cleaned_lines.append(line.split("--", 1)[0])
    return "\n".join(cleaned_lines)


def find_line(content: str, pos: int) -> int:
    return content[:pos].count("\n") + 1


def add_error(findings: list, line_num: int, name: str, message: str, line: str) -> None:
    global errors
    errors += 1
    findings.append((line_num, name, message, line.strip()))


def check_file(filepath: Path) -> list:
    global files_checked
    findings = []
    content = filepath.read_text(encoding="utf-8")
    cleaned = strip_line_comments(content)
    files_checked += 1

    for check_name, pattern in DESTRUCTIVE_PATTERNS.items():
        for match in re.finditer(pattern, cleaned, re.IGNORECASE):
            add_error(
                findings,
                find_line(cleaned, match.start()),
                check_name,
                "Unsafe production SQL detected in a migration.",
                match.group(0),
            )

    scoped_delete_pattern = DELETE + r"((?:public|auth)\.\w+)\b[\s\S]*?;"
    for match in re.finditer(scoped_delete_pattern, cleaned, re.IGNORECASE):
        statement = match.group(0)
        if not re.search(r"\bWHERE\b", statement, re.IGNORECASE):
            add_error(
                findings,
                find_line(cleaned, match.start()),
                "unscoped row removal",
                "Every row-removal statement in migrations must be scoped with WHERE.",
                statement[:160].replace("\n", " "),
            )

    for check_name, pattern in UNSAFE_BILLING_PATTERNS.items():
        for match in re.finditer(pattern, cleaned, re.IGNORECASE):
            add_error(
                findings,
                find_line(cleaned, match.start()),
                check_name,
                "Tenant self-upgrade RPC must not exist or be granted to authenticated users.",
                match.group(0),
            )

    # P1.3 — SECURITY DEFINER function without a pinned search_path is a classic
    # PostgreSQL privilege-escalation vector (an attacker-controlled search_path
    # could shadow a schema-qualified call with a malicious same-named object).
    if filepath.name not in SECURITY_DEFINER_SEARCH_PATH_LEGACY_EXCLUSIONS:
        for match in re.finditer(
            r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+" + PUBLIC + r"\w+\s*\([^;]*?SECURITY\s+DEFINER[^;]*?AS\s+\$",
            cleaned,
            re.IGNORECASE,
        ):
            header = match.group(0)
            if not re.search(r"SET\s+search_path", header, re.IGNORECASE):
                add_error(
                    findings,
                    find_line(cleaned, match.start()),
                    "SECURITY DEFINER without search_path",
                    "A SECURITY DEFINER function must pin SET search_path to prevent schema-hijacking.",
                    header[:160].replace("\n", " "),
                )

    # P1.3 — window functions (ROW_NUMBER/RANK/DENSE_RANK) cannot be referenced
    # directly inside WHERE in PostgreSQL — this is a real runtime error, not
    # just a style issue (already hit once in production, see git history:
    # "KPIs produits — ROW_NUMBER() dans WHERE interdit par PostgreSQL").
    window_fn_matches = (
        re.finditer(WINDOW_FN_IN_WHERE_PATTERN, cleaned, re.IGNORECASE)
        if filepath.name not in WINDOW_FN_IN_WHERE_LEGACY_EXCLUSIONS
        else iter(())
    )
    for match in window_fn_matches:
        add_error(
            findings,
            find_line(cleaned, match.start()),
            "window function in WHERE",
            "ROW_NUMBER()/RANK()/DENSE_RANK() cannot be used directly in WHERE — wrap in a CTE/subquery and filter the outer query instead.",
            match.group(0),
        )

    # P1.3 — DROP FUNCTION must carry an explanatory comment on one of the
    # preceding lines (why it's being dropped, not just that it is). A wider
    # window (15 lines) plus tolerance for an earlier sibling DROP FUNCTION
    # avoids flagging the 2nd+ statement in a documented multi-drop block
    # (one shared comment above several consecutive DROP FUNCTION calls).
    for match in re.finditer(r"^\s*DROP\s+FUNCTION\b.*$", content, re.IGNORECASE | re.MULTILINE):
        line_num = find_line(content, match.start())
        preceding = content.split("\n")[max(0, line_num - 16):line_num - 1]
        has_comment = any(line.lstrip().startswith("--") for line in preceding)
        has_sibling_drop = any(re.match(r"^\s*DROP\s+FUNCTION\b", line, re.IGNORECASE) for line in preceding)
        if not (has_comment or has_sibling_drop):
            add_error(
                findings,
                line_num,
                "undocumented DROP FUNCTION",
                "DROP FUNCTION must be preceded by a comment explaining why.",
                match.group(0).strip(),
            )

    # P1.3 — dangerous GRANT EXECUTE (to PUBLIC, or to anon on a mutating function).
    for check_name, pattern in DANGEROUS_GRANT_PATTERNS.items():
        for match in re.finditer(pattern, cleaned, re.IGNORECASE):
            add_error(
                findings,
                find_line(cleaned, match.start()),
                check_name,
                "Dangerous GRANT EXECUTE — review whether this role truly needs this function.",
                match.group(0)[:160].replace("\n", " "),
            )

    # P1.3 — unprotected backfill: a mass UPDATE (no WHERE) outside a migration
    # file explicitly named as an optional/protected backfill (see RULE 1 —
    # never run a backfill on the real pilot store without explicit validation).
    if not any(marker in filepath.name for marker in BACKFILL_NAME_MARKERS):
        scoped_update_pattern = UPDATE + r"((?:public|auth)\.\w+)\b[\s\S]*?;"
        for match in re.finditer(scoped_update_pattern, cleaned, re.IGNORECASE):
            statement = match.group(0)
            if not re.search(r"\bWHERE\b", statement, re.IGNORECASE):
                add_error(
                    findings,
                    find_line(cleaned, match.start()),
                    "unprotected backfill",
                    "Unscoped UPDATE outside a file named as an optional backfill — "
                    "either add a WHERE clause or rename the file to mark it as an "
                    "explicit, protected backfill (e.g. OPTIONAL_backfill_*).",
                    statement[:160].replace("\n", " "),
                )

    for match in re.finditer(
        r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+" + PUBLIC + r"delete_organization\s*\(\s*p_organization_id\s+UUID\s*\)[\s\S]*?\$\$;",
        cleaned,
        re.IGNORECASE,
    ):
        section = match.group(0)
        required = {
            "SECURITY DEFINER": r"SECURITY\s+DEFINER",
            "SET search_path = public": r"SET\s+search_path\s*=\s*public",
            "super-admin check": r"IF\s+NOT\s+" + PUBLIC + r"is_super_admin\s*\(\s*\)",
            "single organization scope": DELETE + PUBLIC + r"organizations\s+WHERE\s+id\s*=\s*p_organization_id\s*;",
        }
        for label, pattern in required.items():
            if not re.search(pattern, section, re.IGNORECASE):
                add_error(
                    findings,
                    find_line(cleaned, match.start()),
                    f"delete_organization missing {label}",
                    "delete_organization must be super-admin-only and scoped to p_organization_id.",
                    "delete_organization(p_organization_id UUID)",
                )

    check_cash_closing_rules(filepath, cleaned, findings)

    if "_deploy_combined" not in filepath.name:
        for check_name, pattern in LEGACY_PATTERNS.items():
            for i, line in enumerate(content.split("\n"), 1):
                if line.lstrip().startswith("--"):
                    continue
                if re.search(pattern, line, re.IGNORECASE):
                    add_error(findings, i, check_name, "Legacy SQL anti-pattern detected.", line)

    return findings


def main() -> None:
    print(f"\n{CYAN}MakitiPlus SQL Migration Validator{RESET}\n")
    if not MIGRATIONS_DIR.exists():
        print(f"{RED}ERROR: Migrations directory not found: {MIGRATIONS_DIR}{RESET}")
        sys.exit(1)

    all_findings = []
    for filepath in sorted(MIGRATIONS_DIR.glob("*.sql")):
        # Exclure les scripts utilitaires (nettoyage, récupération, test users, features)
        if any(x in filepath.name for x in [
            "CLEANUP_RESET_PROJECT", "RECOVERY_CREATE_ORG",
            "delete_user_manual", "clean_transactional",
            "PILOT_LAUNCH", "FINAL_CONSOLIDATED",
            "enable_all_features", "add_missing_suppliers",
            "fix_rls_policies", "create_test_users",
            "ZZ_validate", "ZZ_VERIFY",
        ]):
            continue
        findings = check_file(filepath)
        if findings:
            all_findings.append((filepath, findings))

    for filepath, findings in all_findings:
        print(f"\n{YELLOW}{filepath.name}{RESET}")
        for line_num, check_name, message, line_content in findings:
            print(f"  {RED}✗ Line {line_num}: [{check_name}]{RESET}")
            print(f"    {message}")
            print(f"    {CYAN}→ {line_content[:180]}{RESET}")

    print(f"\nFiles checked: {files_checked}")
    print(f"Errors: {errors}")
    if errors:
        print(f"\n{RED}❌ Validation FAILED{RESET}\n")
        sys.exit(1)
    print(f"\n{GREEN}✅ Validation PASSED{RESET}\n")
    sys.exit(0)


if __name__ == "__main__":
    main()

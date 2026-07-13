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

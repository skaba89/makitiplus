#!/usr/bin/env python3
"""
SQL Migration Validation Script for MakitiPlus.

This script is intentionally conservative for production safety:
- no global destructive reset in supabase/migrations
- no DELETE without WHERE in migration files
- no auth.users deletion in migrations
- no tenant-accessible update_organization_subscription RPC
- delete_organization definitions, when present, must be super-admin-only
  and delete the organization by id only.

Run: python3 scripts/validate_sql_migrations.py
"""

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

LEGACY_PATTERNS = {
    "CREATE OR REPLACE POLICY": {
        "pattern": r"CREATE\s+OR\s+REPLACE\s+POLICY",
        "level": "ERROR",
        "message": "Use DROP POLICY IF EXISTS + CREATE POLICY instead of CREATE OR REPLACE POLICY.",
    },
    "profile_roles reference": {
        "pattern": r"\bprofile_roles\b",
        "level": "ERROR",
        "message": "Table 'profile_roles' does not exist. Use 'user_roles' instead.",
    },
    "movement_type in INSERT": {
        "pattern": r"INSERT\s+INTO\s+public\.stock_movements\s*\([^)]*movement_type",
        "level": "ERROR",
        "message": "Column 'movement_type' does not exist in stock_movements. Use 'type' instead.",
    },
    "low_stock_threshold": {
        "pattern": r"\blow_stock_threshold\b",
        "level": "ERROR",
        "message": "Column 'low_stock_threshold' does not exist in products. Use 'min_stock_alert' instead.",
    },
    "EXECUTE format with limit_type": {
        "pattern": r"EXECUTE\s+format\s*\(\s*['\"].*%I.*FROM\s+public\.plans",
        "level": "WARNING",
        "message": "Dynamic column access via EXECUTE format is fragile. Use explicit CASE mapping.",
    },
}

DESTRUCTIVE_PATTERNS = {
    "profiles org detach": r"UPDATE\s+public\.profiles\s+SET\s+organization_id\s*=\s*NULL\s*;",
    "categories org detach": r"UPDATE\s+public\.categories\s+SET\s+organization_id\s*=\s*NULL\s*;",
    "global sales delete": r"DELETE\s+FROM\s+public\.sales\s*;",
    "global products delete": r"DELETE\s+FROM\s+public\.products\s*;",
    "global customers delete": r"DELETE\s+FROM\s+public\.customers\s*;",
    "global organizations delete": r"DELETE\s+FROM\s+public\.organizations\s*;",
    "global stores delete": r"DELETE\s+FROM\s+public\.stores\s*;",
    "auth users delete": r"DELETE\s+FROM\s+auth\.users\b",
    "truncate": r"\bTRUNCATE\b",
    "drop schema": r"\bDROP\s+SCHEMA\b",
}

UNSAFE_BILLING_PATTERNS = {
    "create unsafe update_organization_subscription": (
        r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.update_organization_subscription\s*\(\s*TEXT\s*,\s*TEXT\s*,\s*TEXT\s*\)"
    ),
    "grant unsafe update_organization_subscription": (
        r"GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.update_organization_subscription\s*\([^)]*\)\s+TO\s+authenticated"
    ),
}

errors = 0
warnings = 0
files_checked = 0


def strip_line_comments(sql: str) -> str:
    cleaned_lines: list[str] = []
    for line in sql.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("--"):
            cleaned_lines.append("")
        else:
            cleaned_lines.append(line.split("--", 1)[0])
    return "\n".join(cleaned_lines)


def add_finding(findings: list, level: str, line_num: int, name: str, message: str, line: str) -> None:
    global errors, warnings
    findings.append((level, line_num, name, message, line.strip()))
    if level == "ERROR":
        errors += 1
    else:
        warnings += 1


def find_line(content: str, pos: int) -> int:
    return content[:pos].count("\n") + 1


def check_destructive_sql(filepath: Path, content: str, findings: list) -> None:
    cleaned = strip_line_comments(content)

    if "reset_demo" in filepath.name.lower() or "cleanup_final" in filepath.name.lower():
        add_finding(
            findings,
            "ERROR",
            1,
            "manual reset in migrations",
            "Reset/demo cleanup files must not be placed in supabase/migrations.",
            filepath.name,
        )

    for check_name, pattern in DESTRUCTIVE_PATTERNS.items():
        for match in re.finditer(pattern, cleaned, re.IGNORECASE):
            add_finding(
                findings,
                "ERROR",
                find_line(cleaned, match.start()),
                check_name,
                "Destructive SQL is forbidden in production migrations.",
                match.group(0),
            )

    # No DELETE FROM <table>; without WHERE in migrations.
    for match in re.finditer(r"DELETE\s+FROM\s+((?:public|auth)\.\w+)\b[\s\S]*?;", cleaned, re.IGNORECASE):
        statement = match.group(0)
        if not re.search(r"\bWHERE\b", statement, re.IGNORECASE):
            add_finding(
                findings,
                "ERROR",
                find_line(cleaned, match.start()),
                "DELETE without WHERE",
                "Every DELETE in supabase/migrations must be scoped with WHERE.",
                statement[:160].replace("\n", " "),
            )


def check_unsafe_billing_rpc(filepath: Path, content: str, findings: list) -> None:
    cleaned = strip_line_comments(content)
    for check_name, pattern in UNSAFE_BILLING_PATTERNS.items():
        for match in re.finditer(pattern, cleaned, re.IGNORECASE):
            add_finding(
                findings,
                "ERROR",
                find_line(cleaned, match.start()),
                check_name,
                "Tenant-accessible self-upgrade RPC must not exist in SQL migrations.",
                match.group(0),
            )


def check_delete_organization_contract(filepath: Path, content: str, findings: list) -> None:
    cleaned = strip_line_comments(content)
    for match in re.finditer(
        r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.delete_organization\s*\(\s*p_organization_id\s+UUID\s*\)[\s\S]*?\$\$;",
        cleaned,
        re.IGNORECASE,
    ):
        section = match.group(0)
        required = {
            "SECURITY DEFINER": r"SECURITY\s+DEFINER",
            "SET search_path = public": r"SET\s+search_path\s*=\s*public",
            "is_super_admin check": r"IF\s+NOT\s+public\.is_super_admin\s*\(\s*\)",
            "organization delete by id": r"DELETE\s+FROM\s+public\.organizations\s+WHERE\s+id\s*=\s*p_organization_id\s*;",
        }
        for label, pattern in required.items():
            if not re.search(pattern, section, re.IGNORECASE):
                add_finding(
                    findings,
                    "ERROR",
                    find_line(cleaned, match.start()),
                    f"delete_organization missing {label}",
                    "delete_organization must be super-admin-only and delete exactly WHERE id = p_organization_id.",
                    "public.delete_organization(p_organization_id UUID)",
                )


def check_legacy_patterns(filepath: Path, content: str, findings: list) -> None:
    lines = content.split("\n")
    for check_name, check_info in LEGACY_PATTERNS.items():
        pattern = check_info["pattern"]
        level = check_info["level"]
        message = check_info["message"]
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if stripped.startswith("--"):
                continue
            if re.search(pattern, line, re.IGNORECASE):
                add_finding(findings, level, i, check_name, message, line)


def check_security_definer_grants(filepath: Path, content: str, findings: list) -> None:
    func_pattern = r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)\s*\("
    for func_match in re.finditer(func_pattern, content, re.IGNORECASE):
        func_name = func_match.group(1)
        func_start = func_match.start()
        func_body_start = content.find("$$", func_start)
        if func_body_start == -1:
            continue
        func_body_end = content.find("$$;", func_body_start + 2)
        if func_body_end == -1:
            func_body_end = len(content)
        func_section = content[func_start:func_body_end]
        if "SECURITY DEFINER" not in func_section:
            continue
        if "RETURNS TRIGGER" in func_section:
            continue
        if any(re.search(p, func_name) for p in [r"^handle_", r"^set_", r"^auto_", r"^update_\w+_updated_at$"]):
            continue
        after_func = content[func_body_end:]
        grant_pattern = rf"GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.{func_name}"
        if not re.search(grant_pattern, after_func, re.IGNORECASE):
            add_finding(
                findings,
                "WARNING",
                find_line(content, func_start),
                f"Missing GRANT EXECUTE on {func_name}",
                f"SECURITY DEFINER function public.{func_name} is missing an explicit GRANT EXECUTE.",
                func_name,
            )


def check_file(filepath: Path) -> list:
    global files_checked
    findings = []
    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception as exc:  # pragma: no cover
        add_finding(findings, "ERROR", 1, "read error", f"Could not read file: {exc}", filepath.name)
        return findings

    files_checked += 1
    check_destructive_sql(filepath, content, findings)
    check_unsafe_billing_rpc(filepath, content, findings)
    check_delete_organization_contract(filepath, content, findings)

    # Legacy correctness checks are intentionally skipped for generated combined files
    # to avoid double-reporting historical content already checked in source migrations.
    if "_deploy_combined" not in filepath.name:
        check_legacy_patterns(filepath, content, findings)
        check_security_definer_grants(filepath, content, findings)

    return findings


def main() -> None:
    print(f"\n{CYAN}╔══════════════════════════════════════════════════════════════╗")
    print("║     MakitiPlus SQL Migration Validator                      ║")
    print(f"╚══════════════════════════════════════════════════════════════╝{RESET}\n")

    if not MIGRATIONS_DIR.exists():
        print(f"{RED}ERROR: Migrations directory not found: {MIGRATIONS_DIR}{RESET}")
        sys.exit(1)

    sql_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    print(f"Scanning {len(sql_files)} SQL files in {MIGRATIONS_DIR}\n")
    print(f"{CYAN}{'─' * 80}{RESET}\n")

    all_findings = []
    for filepath in sql_files:
        findings = check_file(filepath)
        if findings:
            all_findings.append((filepath, findings))

    if not all_findings:
        print(f"{GREEN}✓ All {files_checked} SQL files passed validation!{RESET}\n")
        print("  No unsafe SQL anti-patterns detected.")
    else:
        for filepath, findings in all_findings:
            print(f"\n{YELLOW}📄 {filepath.name}{RESET}")
            for finding in findings:
                level, line_num, check_name, message, line_content = finding
                color = RED if level == "ERROR" else YELLOW
                icon = "✗" if level == "ERROR" else "⚠"
                print(f"  {color}{icon} Line {line_num}: [{check_name}]{RESET}")
                print(f"    {message}")
                print(f"    {CYAN}→ {line_content[:180]}{RESET}")

    print(f"\n{CYAN}{'─' * 80}{RESET}")
    print(f"\n  Files checked: {files_checked}")
    print(f"  {RED}Errors:   {errors}{RESET}")
    print(f"  {YELLOW}Warnings: {warnings}{RESET}")

    if errors > 0:
        print(f"\n{RED}❌ Validation FAILED — fix errors before deploying{RESET}\n")
        sys.exit(1)

    print(f"\n{GREEN}✅ Validation PASSED{RESET}\n")
    sys.exit(0)


if __name__ == "__main__":
    main()

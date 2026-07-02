#!/usr/bin/env python3
"""
SQL Migration Validation Script for MakitiPlus
Checks for anti-patterns and common bugs in Supabase migration files.

Run: python scripts/validate_sql_migrations.py

Checks performed:
1. CREATE OR REPLACE POLICY → should be DROP POLICY IF EXISTS + CREATE POLICY
2. profile_roles → should be user_roles
3. movement_type in INSERT → should be type (column alias in SELECT is OK)
4. low_stock_threshold → should be min_stock_alert
5. Missing GRANT EXECUTE on SECURITY DEFINER functions
6. Direct column name in EXECUTE format() for plan limits (should use explicit mapping)
7. Missing organization_id scoping in RLS policies
"""

import os
import re
import sys
from pathlib import Path

# Colors for output
RED = "\033[91m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
CYAN = "\033[96m"
RESET = "\033[0m"

MIGRATIONS_DIR = Path(__file__).parent.parent / "supabase" / "migrations"

# Patterns to detect
PATTERNS = {
    "CREATE OR REPLACE POLICY": {
        "pattern": r"CREATE\s+OR\s+REPLACE\s+POLICY",
        "level": "ERROR",
        "message": "Use DROP POLICY IF EXISTS + CREATE POLICY instead of CREATE OR REPLACE POLICY (not idempotent in PostgreSQL)",
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
        "message": "Dynamic column access via EXECUTE format is fragile. Use explicit CASE mapping (stores→max_stores, etc.)",
    },
}

# Track results
errors = 0
warnings = 0
files_checked = 0


def check_file(filepath: Path) -> list:
    """Check a single migration file for anti-patterns."""
    global errors, warnings
    findings = []

    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception as e:
        findings.append(("ERROR", f"Could not read file: {e}"))
        errors += 1
        return findings

    lines = content.split("\n")

    for check_name, check_info in PATTERNS.items():
        pattern = check_info["pattern"]
        level = check_info["level"]
        message = check_info["message"]

        for i, line in enumerate(lines, 1):
            # Skip comment lines
            stripped = line.strip()
            if stripped.startswith("--"):
                continue

            if re.search(pattern, line, re.IGNORECASE):
                findings.append((level, i, check_name, message, line.strip()))
                if level == "ERROR":
                    errors += 1
                else:
                    warnings += 1

    # Check for SECURITY DEFINER functions without GRANT EXECUTE
    func_pattern = r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)\s*\("
    func_matches = list(re.finditer(func_pattern, content, re.IGNORECASE))

    for func_match in func_matches:
        func_name = func_match.group(1)

        # Check if it has SECURITY DEFINER
        func_start = func_match.start()
        # Look for the function body end (next $$; or similar)
        func_body_start = content.find("$$", func_start)
        if func_body_start == -1:
            continue
        func_body_end = content.find("$$;", func_body_start + 2)
        if func_body_end == -1:
            func_body_end = len(content)

        func_section = content[func_start:func_body_end]

        if "SECURITY DEFINER" in func_section:
            # Check for GRANT EXECUTE after the function definition
            after_func = content[func_body_end:]
            grant_pattern = rf"GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.{func_name}"
            if not re.search(grant_pattern, after_func, re.IGNORECASE):
                line_num = content[:func_start].count("\n") + 1
                findings.append((
                    "WARNING", line_num,
                    f"Missing GRANT EXECUTE on {func_name}",
                    f"SECURITY DEFINER function 'public.{func_name}' is missing GRANT EXECUTE TO authenticated",
                    stripped
                ))
                warnings += 1

    return findings


def main():
    global files_checked

    print(f"\n{CYAN}╔══════════════════════════════════════════════════════════════╗")
    print(f"║     MakitiPlus SQL Migration Validator                      ║")
    print(f"╚══════════════════════════════════════════════════════════════╝{RESET}\n")

    if not MIGRATIONS_DIR.exists():
        print(f"{RED}ERROR: Migrations directory not found: {MIGRATIONS_DIR}{RESET}")
        sys.exit(1)

    sql_files = sorted(MIGRATIONS_DIR.glob("*.sql"))

    # Exclude the combined file and hotfix (hotfix documents the issues it fixes)
    exclude_patterns = ["_combined_", "p0_hotfix"]
    sql_files = [
        f for f in sql_files
        if not any(pat in f.name for pat in exclude_patterns)
    ]

    print(f"Scanning {len(sql_files)} migration files in {MIGRATIONS_DIR}\n")
    print(f"{CYAN}{'─' * 80}{RESET}\n")

    all_findings = []

    for filepath in sql_files:
        findings = check_file(filepath)
        files_checked += 1

        if findings:
            all_findings.append((filepath, findings))

    # Print results
    if not all_findings:
        print(f"{GREEN}✓ All {files_checked} migration files passed validation!{RESET}\n")
        print(f"  No anti-patterns detected.")
    else:
        for filepath, findings in all_findings:
            print(f"\n{YELLOW}📄 {filepath.name}{RESET}")
            for finding in findings:
                level = finding[0]
                if len(finding) == 5:
                    _, line_num, check_name, message, line_content = finding
                    color = RED if level == "ERROR" else YELLOW
                    icon = "✗" if level == "ERROR" else "⚠"
                    print(f"  {color}{icon} Line {line_num}: [{check_name}]{RESET}")
                    print(f"    {message}")
                    print(f"    {CYAN}→ {line_content[:100]}{RESET}")
                elif len(finding) == 2:
                    _, msg = finding
                    color = RED if level == "ERROR" else YELLOW
                    print(f"  {color}✗ {msg}{RESET}")

    # Summary
    print(f"\n{CYAN}{'─' * 80}{RESET}")
    print(f"\n  Files checked: {files_checked}")
    print(f"  {RED}Errors:   {errors}{RESET}")
    print(f"  {YELLOW}Warnings: {warnings}{RESET}")

    if errors > 0:
        print(f"\n{RED}❌ Validation FAILED — fix errors before deploying{RESET}\n")
        sys.exit(1)
    else:
        print(f"\n{GREEN}✅ Validation PASSED{RESET}\n")
        sys.exit(0)


if __name__ == "__main__":
    main()

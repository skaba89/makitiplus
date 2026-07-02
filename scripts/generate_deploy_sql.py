#!/usr/bin/env python3
"""
Generate a combined deployment SQL script from all migration files.

This script concatenates all migrations in order into a single file
that can be pasted into the Supabase SQL Editor for one-shot deployment.

Run: python scripts/generate_deploy_sql.py

Output: supabase/migrations/_deploy_combined.sql
"""

import os
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).parent.parent / "supabase" / "migrations"
OUTPUT_FILE = MIGRATIONS_DIR / "_deploy_combined.sql"

# Files to skip (already applied or meta)
SKIP_PATTERNS = [
    "_combined_",
    "_deploy_",
    "p0_hotfix",  # hotfix is for already-deployed DBs; fresh deploy doesn't need it
]

# Original Supabase migrations (already applied on most instances)
# These are the UUID-named files from the initial setup
ORIGINAL_UUID_MIGRATIONS = [
    "20260202072852",  # initial schema
    "20260207065000",  # early additions
    "20260423040958",  # early auth
    "20260423042235",  # early auth 2
    "20260424042936",  # indexes
    "20260424042947",  # more schema
    "20260425041530",  # more schema
    "20260426042420",  # more schema
    "20260426042625",  # more schema
    "20260427045819",  # more schema
    "20260612031944",  # early DB
    "20260612031957",  # early DB 2
    "20260612032011",  # early DB 3
]

def should_include(filepath: Path) -> bool:
    """Check if a migration file should be included in the deploy script."""
    name = filepath.name

    # Skip meta files
    for pattern in SKIP_PATTERNS:
        if pattern in name:
            return False

    # Skip original UUID migrations (already applied on remote DB)
    for prefix in ORIGINAL_UUID_MIGRATIONS:
        if name.startswith(prefix):
            return False

    return True


def main():
    sql_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    deploy_files = [f for f in sql_files if should_include(f)]

    print(f"Found {len(sql_files)} total migration files")
    print(f"Including {len(deploy_files)} files for deployment")
    print()

    combined = []
    combined.append("-- ============================================================")
    combined.append("-- MakitiPlus — Combined Deployment Script")
    combined.append("-- Generated automatically — DO NOT EDIT")
    combined.append("-- ============================================================")
    combined.append("")

    for filepath in deploy_files:
        print(f"  + {filepath.name}")
        content = filepath.read_text(encoding="utf-8")

        combined.append(f"-- ════════════════════════════════════════════════════════════════")
        combined.append(f"-- MIGRATION: {filepath.name}")
        combined.append(f"-- ════════════════════════════════════════════════════════════════")
        combined.append("")
        combined.append(content)
        combined.append("")
        combined.append("")

    output = "\n".join(combined)
    OUTPUT_FILE.write_text(output, encoding="utf-8")

    print()
    print(f"✅ Combined deployment script written to: {OUTPUT_FILE}")
    print(f"   Size: {len(output):,} bytes")
    print()
    print("⚠️  IMPORTANT: Before deploying, make sure the original UUID migrations")
    print("   are already applied on your Supabase instance. This script only")
    print("   includes the custom migrations (202606+ prefix).")
    print()
    print("   To deploy: Open Supabase SQL Editor → paste _deploy_combined.sql → Run")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Rebuild supabase/migrations/_deploy_combined.sql from individual migration files.
Migrations are sorted chronologically by filename.
Only includes files matching the pattern YYYYMMDD*.sql.
"""

import os
import re
import sys

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "supabase", "migrations")
OUTPUT_FILE = os.path.join(MIGRATIONS_DIR, "_deploy_combined.sql")

def main():
    # Collect migration files
    files = []
    for f in sorted(os.listdir(MIGRATIONS_DIR)):
        if re.match(r"\d{8,14}_.*\.sql$", f) and f != "_deploy_combined.sql" and f != "_combined_remaining_migrations.sql":
            files.append(f)

    if not files:
        print("ERROR: No migration files found")
        sys.exit(1)

    # Build combined SQL
    lines = [
        "-- ============================================================",
        "-- MakitiPlus — Combined Deployment Script",
        "-- Auto-generated — DO NOT EDIT",
        "-- ============================================================",
        "",
    ]

    for f in files:
        filepath = os.path.join(MIGRATIONS_DIR, f)
        with open(filepath, "r", encoding="utf-8") as fh:
            content = fh.read().strip()

        lines.append(f"-- ═════════════════════════════════════════════════════════════════")
        lines.append(f"-- MIGRATION: {f}")
        lines.append(f"-- ═════════════════════════════════════════════════════════════════")
        lines.append("")
        lines.append(content)
        lines.append("")
        lines.append("")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))

    print(f"✓ Rebuilt _deploy_combined.sql with {len(files)} migrations")
    print(f"  Output: {OUTPUT_FILE}")
    for f in files:
        print(f"    - {f}")

if __name__ == "__main__":
    main()

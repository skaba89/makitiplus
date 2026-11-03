#!/usr/bin/env python3
"""MKP-025: block destructive data scripts and credentials in supabase/migrations.

Every file in supabase/migrations/ is applied by `supabase db push` to ANY
project whose migration history does not list it yet (new project, restored
backup, history drift). A one-off maintenance script stored there can
therefore wipe real merchants' data. This gate scans ALL migration files
(not only the PR diff) and fails on:

  * TRUNCATE of any table;
  * DELETE FROM <table> without a WHERE clause in the same statement;
  * writes to auth.users (account creation belongs to Supabase Auth / seeds);
  * crypt('<literal>') — a hard-coded password;
  * a literal e-mail address — personal or environment-specific data.

Maintenance scripts live in scripts/admin/*.sql.example and are run by hand,
after a backup, never through the migration pipeline.

Static lint, defense in depth: it does not replace replaying migrations on a
disposable PostgreSQL. SQL comments are stripped first, so a commented-out
example does not fail, and a fake WHERE in a comment cannot satisfy the rule.
"""
from __future__ import annotations

import pathlib
import re
import sys

MIGRATIONS = pathlib.Path(__file__).resolve().parent.parent / "supabase" / "migrations"

# (file name, rule) -> justification. Keep empty unless a reviewed exception
# is unavoidable; a new entry needs the PR that justified it.
ALLOWLIST: dict[tuple[str, str], str] = {
    ("20260426042420_f2188ae3-aeea-4b23-9b02-04b4b9938345.sql", "email-literal"): (
        "LIKE '%.test@malikiplus.local' : motif de domaine de test, pas une "
        "adresse réelle ; ne fait que marquer des profils de test (UPDATE ciblé)."
    ),
}

TRUNCATE = re.compile(r"\bTRUNCATE\b", re.I)
DELETE = re.compile(r"\bDELETE\s+FROM\s+(?:ONLY\s+)?([\w.\"]+)", re.I)
AUTH_USERS_WRITE = re.compile(
    r"\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:ONLY\s+)?\"?auth\"?\.\"?users\b", re.I
)
CRYPT_LITERAL = re.compile(r"\bcrypt\s*\(\s*'", re.I)
EMAIL_LITERAL = re.compile(r"'[^'\s]*[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}[^'\s]*'")


def strip_comments(sql: str) -> str:
    sql = re.sub(r"/\*[\s\S]*?\*/", " ", sql)
    return re.sub(r"--[^\n]*", " ", sql)


def statement_after(sql: str, start: int) -> str:
    """Text from `start` up to the end of the SQL statement (next ';')."""
    end = sql.find(";", start)
    return sql[start:] if end == -1 else sql[start:end]


def line_of(sql: str, pos: int) -> int:
    return sql.count("\n", 0, pos) + 1


def audit_sql(sql: str) -> list[tuple[int, str, str]]:
    """Return (line, rule, message) findings for one migration's SQL text."""
    code = strip_comments(sql)
    findings: list[tuple[int, str, str]] = []
    for m in TRUNCATE.finditer(code):
        findings.append((line_of(code, m.start()), "truncate",
                         "TRUNCATE interdit dans une migration (perte de données)."))
    for m in DELETE.finditer(code):
        if m.group(1).strip('"').lower() in ("auth.users",):
            continue  # reported by the auth.users rule
        stmt = statement_after(code, m.start())
        if not re.search(r"\bWHERE\b", stmt, re.I):
            findings.append((line_of(code, m.start()), "delete-without-where",
                             f"DELETE FROM {m.group(1)} sans WHERE : vide la table "
                             "pour toutes les organisations."))
    for m in AUTH_USERS_WRITE.finditer(code):
        findings.append((line_of(code, m.start()), "auth-users-write",
                         "Écriture dans auth.users : les comptes se créent via Supabase "
                         "Auth ou un seed de test, jamais par migration."))
    for m in CRYPT_LITERAL.finditer(code):
        findings.append((line_of(code, m.start()), "hardcoded-password",
                         "crypt('…') avec un mot de passe en clair."))
    for m in EMAIL_LITERAL.finditer(code):
        findings.append((line_of(code, m.start()), "email-literal",
                         "Adresse e-mail en dur : donnée personnelle ou propre à un "
                         "environnement."))
    return sorted(findings)


def main() -> int:
    files = sorted(p for p in MIGRATIONS.glob("*.sql") if not p.name.startswith("_"))
    blocking = 0
    for path in files:
        for line, rule, message in audit_sql(path.read_text(encoding="utf-8")):
            if (path.name, rule) in ALLOWLIST:
                continue
            blocking += 1
            print(f"{path.relative_to(MIGRATIONS.parent.parent)}:{line}: [{rule}] {message}")
    print(f"\nMigrations analysées : {len(files)} — blocages : {blocking}")
    if blocking:
        print("Déplacer les scripts de maintenance vers scripts/admin/*.sql.example "
              "et les exécuter à la main après sauvegarde.")
        return 1
    print("Migration safety gate OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

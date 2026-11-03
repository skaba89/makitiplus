#!/usr/bin/env python3
"""MKP-007: fail PRs adding or changing unguarded tenant-scoped SECURITY DEFINER RPCs.

Checks modified function definitions (not grandfathered, unchanged migrations).
This is defense-in-depth static lint, not a substitute for database authorization tests.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys

MIGRATIONS = pathlib.Path("supabase/migrations")
FUNCTION = re.compile(
    r"\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+"
    r"(?:(?:public|auth)\.)?[a-z_][\w]*\s*\(",
    re.IGNORECASE,
)
DOLLAR = re.compile(r"\$[A-Za-z_0-9]*\$")
ORG_PARAM = re.compile(r"\bp_organization_id\b", re.IGNORECASE)
DEFINER = re.compile(r"\bSECURITY\s+DEFINER\b", re.IGNORECASE)
# Conservative allowlist of existing, server-side membership/role checks.
# A comparison p_organization_id = p_organization_id is NOT an authorization guard.
AUTH_GUARDS = (
    re.compile(r"\b(?:public\.)?is_member_of_organization\s*\(\s*p_organization_id\b", re.I),
    re.compile(r"\b(?:public\.)?is_super_admin\s*\(", re.I),
    re.compile(r"\b(?:public\.)?get_user_organization_id\s*\(", re.I),
    re.compile(r"\bauth\.uid\s*\(\s*\)", re.I),
)

def without_comments(sql: str) -> str:
    """Ignore SQL comments so fake guards in comments cannot satisfy lint."""
    sql = re.sub(r"/\*[\s\S]*?\*/", " ", sql)
    return re.sub(r"--[^\n]*", " ", sql)

def extract_functions(sql: str) -> dict[str, str]:
    """Extract CREATE FUNCTION statements with dollar-quoted bodies.

    Ignores semicolons inside function bodies. Handles $$ and $tag$ delimiters.
    """
    src = without_comments(sql)
    found: dict[str, str] = {}
    for match in FUNCTION.finditer(src):
        start = match.start()
        header_end = src.find("AS", match.end())
        if header_end < 0:
            continue
        opening = DOLLAR.search(src, header_end)
        if not opening:
            continue
        closing = src.find(opening.group(), opening.end())
        if closing < 0:
            continue
        end = src.find(";", closing + len(opening.group()))
        if end < 0:
            continue
        definition = src[start:end + 1]
        # Identity includes signature so overloads are analyzed independently.
        key = re.sub(r"\s+", " ", src[match.start():opening.start()]).strip().lower()
        found[key] = definition
    return found

def audit_change(before: str, after: str) -> list[str]:
    old = extract_functions(before)
    findings: list[str] = []
    for key, definition in extract_functions(after).items():
        if old.get(key) == definition:
            continue
        header = definition[:definition.find("AS")]
        if not (DEFINER.search(header) and ORG_PARAM.search(header)):
            continue
        body = definition[definition.find("AS"):]
        guards = [pattern for pattern in AUTH_GUARDS if pattern.search(body)]
        # A generic auth.uid() or super_admin check is not sufficient on its own:
        # require explicit target-org scoping, or a combination of authenticated
        # user identity and organization-scoped comparison.
        explicit_membership = bool(AUTH_GUARDS[0].search(body))
        org_lookup = bool(AUTH_GUARDS[2].search(body))
        scoped_equality = bool(re.search(
            r"(?:organization_id\s*=\s*p_organization_id|"
            r"p_organization_id\s*=\s*(?:public\.)?get_user_organization_id\s*\()", body, re.I))
        if not (explicit_membership or (org_lookup and scoped_equality)):
            findings.append(
                f"{key[:130]}: SECURITY DEFINER with p_organization_id "
                "requires explicit server-side target-organization membership "
                "check (not only auth.uid() or is_super_admin())."
            )
    return findings

def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], text=True, stderr=subprocess.PIPE)

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-ref", default="origin/main",
                        help="Git ref to compare against (default: origin/main)")
    args = parser.parse_args()
    try:
        base = git("merge-base", args.base_ref, "HEAD").strip()
        changed = git("diff", "--name-only", "--diff-filter=ACMR", base, "HEAD").splitlines()
    except (OSError, subprocess.CalledProcessError) as exc:
        print(f"ERROR: cannot resolve diff base {args.base_ref}: {exc}", file=sys.stderr)
        return 2
    failures = 0
    checked = 0
    for name in changed:
        path = pathlib.Path(name)
        if path.parent != MIGRATIONS or path.suffix != ".sql":
            continue
        try:
            current = path.read_text(encoding="utf-8")
            previous = git("show", f"{base}:{name}")
        except subprocess.CalledProcessError:
            previous = ""  # newly added migration
        except OSError as exc:
            print(f"ERROR reading {name}: {exc}", file=sys.stderr)
            return 2
        checked += 1
        for finding in audit_change(previous, current):
            failures += 1
            print(f"FAIL {name}: {finding}")
    print(f"MKP-007 tenant RPC guard: {checked} changed SQL files, {failures} findings")
    return 1 if failures else 0

if __name__ == "__main__":
    sys.exit(main())

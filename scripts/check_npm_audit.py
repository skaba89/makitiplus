#!/usr/bin/env python3
"""
Security audit gate — blocks the pipeline on any high/critical npm
vulnerability in production dependencies, EXCEPT a narrow, documented
allowlist of advisories confirmed inapplicable to this app's actual
runtime usage.

Why this exists (not just `npm audit --audit-level=high --omit=dev`):
react-router-dom 7.x (upgraded from 6.x to fix 2 real moderate CVEs —
open redirect via backslash in <Link>/useNavigate, and SSR hydration
deserialization) has NO version in the 7.x line that avoids
GHSA-qwww-vcr4-c8h2 (CSRF bypass in "RSC Mode"). This app is a
client-only Vite SPA using react-router's classic declarative API
(BrowserRouter/Routes/Route) — zero usage of React Server Components,
zero `react-router/rsc` import, zero data-router APIs (createBrowserRouter,
loaders/actions) where this CVE's attack surface (RSC action execution)
could ever be reached. Fully avoiding the advisory would require jumping
to react-router v8 — a separate, unplanned major migration.

Allowlisting is per-advisory (GHSA ID), not per-package or blanket —
any NEW advisory on react-router (or any other prod dependency) still
fails the pipeline immediately, including a future advisory on
react-router itself if it's a different GHSA ID.
"""

import json
import subprocess
import sys

# Advisory ID -> why it's safe to ignore for THIS app. Keep this list as
# short and as well-justified as possible; each entry should point to the
# PR/commit where the trade-off was made.
ALLOWLISTED_ADVISORIES = {
    "GHSA-qwww-vcr4-c8h2": (
        "React Router CSRF bypass in RSC Mode — app uses only the classic "
        "declarative API (BrowserRouter/Routes/Route), no React Server "
        "Components, no react-router/rsc import, no data-router APIs. "
        "See PR #53 (chore/react-router-v7-upgrade)."
    ),
}


def main() -> int:
    # shell=True for cross-platform npm resolution (npm.cmd on Windows) —
    # safe here, the command is fixed with no user-controlled input.
    result = subprocess.run(
        "npm audit --omit=dev --json",
        shell=True,
        capture_output=True,
        text=True,
        check=False,
    )

    try:
        data = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        print("ERROR: could not parse `npm audit --json` output", file=sys.stderr)
        print(result.stdout, file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        return 1

    vulnerabilities = data.get("vulnerabilities", {})

    def resolve_advisory_ids(pkg_name: str, seen: set) -> set:
        """A package's `via` is either direct advisory objects (with a URL)
        or a list of package-name strings it inherits the vulnerability
        from (e.g. react-router-dom depending on a vulnerable react-router).
        Resolve the latter recursively to the underlying advisory IDs."""
        if pkg_name in seen:
            return set()
        seen.add(pkg_name)

        vuln = vulnerabilities.get(pkg_name)
        if not vuln:
            return set()

        ids = set()
        for item in vuln.get("via", []):
            if isinstance(item, dict):
                url = item.get("url", "")
                if "/advisories/" in url:
                    ids.add(url.rstrip("/").rsplit("/", 1)[-1])
            elif isinstance(item, str):
                ids |= resolve_advisory_ids(item, seen)
        return ids

    blocking = []
    ignored = []

    for pkg_name, vuln in vulnerabilities.items():
        severity = vuln.get("severity")
        if severity not in ("high", "critical"):
            continue

        advisory_ids = resolve_advisory_ids(pkg_name, set())

        unallowed = advisory_ids - set(ALLOWLISTED_ADVISORIES)
        if unallowed or not advisory_ids:
            blocking.append((pkg_name, severity, advisory_ids or {"<unresolved>"}))
        else:
            ignored.append((pkg_name, advisory_ids))

    if ignored:
        print("Ignored (allowlisted, documented) advisories:")
        for pkg_name, advisory_ids in ignored:
            for advisory_id in advisory_ids:
                print(f"  - {pkg_name}: {advisory_id} — {ALLOWLISTED_ADVISORIES[advisory_id]}")
        print()

    if blocking:
        print("BLOCKING high/critical vulnerabilities (not allowlisted):", file=sys.stderr)
        for pkg_name, severity, advisory_ids in blocking:
            print(f"  - {pkg_name} ({severity}): {', '.join(sorted(advisory_ids))}", file=sys.stderr)
        print(file=sys.stderr)
        print("Run `npm audit --omit=dev` for full details.", file=sys.stderr)
        return 1

    print("Security audit passed (0 blocking high/critical vulnerabilities).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

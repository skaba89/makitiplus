#!/usr/bin/env python3
"""MKP-005: read-only evidence for a restoration on an isolated staging database.

No RESTORE, DROP, INSERT, UPDATE or DELETE is performed.
Capture a baseline on a disposable database with synthetic fixture data, create
its backup, restore that backup in a *different* isolated database, then verify.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import sys
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

# All aggregates stay strings (Postgres numeric -> text), preserving exactness.
# No PII, product titles, customer names or payment references are exported.
METRICS_SQL = """
SELECT json_build_object(
 'organizations', (SELECT count(*) FROM public.organizations),
 'stores', (SELECT count(*) FROM public.stores),
 'products', (SELECT count(*) FROM public.products),
 'sales', (SELECT count(*) FROM public.sales),
 'sale_items', (SELECT count(*) FROM public.sale_items),
 'customers', (SELECT count(*) FROM public.customers),
 'customer_credits', (SELECT count(*) FROM public.customer_credits),
 'sales_total', (SELECT coalesce(sum(total_amount),0)::text FROM public.sales),
 'stock_total', (SELECT coalesce(sum(stock_quantity),0)::text FROM public.products),
 'credit_total', (SELECT coalesce(sum(total_credit),0)::text FROM public.customers),
 'latest_sale_at', (SELECT max(created_at)::text FROM public.sales)
)::text;
""".strip()

COUNTERS = ("organizations", "stores", "products", "sales",
            "sale_items", "customers", "customer_credits")
AMOUNTS = ("sales_total", "stock_total", "credit_total")
FIELDS = COUNTERS + AMOUNTS + ("latest_sale_at",)


def validate(metrics: dict) -> dict:
    if not isinstance(metrics, dict):
        raise ValueError("Expected JSON object")
    if set(metrics) != set(FIELDS):
        raise ValueError("Missing/extra metrics: " + ", ".join(sorted(set(FIELDS) ^ set(metrics))))
    clean = {}
    for key in COUNTERS:
        value = metrics[key]
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ValueError(f"{key} is not a nonnegative integer")
        clean[key] = value
    for key in AMOUNTS:
        try:
            amount = Decimal(str(metrics[key]))
        except (InvalidOperation, TypeError, ValueError):
            raise ValueError(f"{key} is not numeric") from None
        if not amount.is_finite():
            raise ValueError(f"{key} is not finite")
        clean[key] = format(amount, "f")
    timestamp = metrics["latest_sale_at"]
    if timestamp is not None and not isinstance(timestamp, str):
        raise ValueError("latest_sale_at must be a string or null")
    clean["latest_sale_at"] = timestamp
    return clean


def compare(before: dict, after: dict) -> list[str]:
    a, b = validate(before), validate(after)
    return [f"{key}: expected {a[key]}, restored {b[key]}"
            for key in FIELDS
            if (Decimal(a[key]) != Decimal(b[key])
                if key in AMOUNTS else a[key] != b[key])]


def query_staging() -> dict:
    url = os.environ.get("RESTORE_TEST_DATABASE_URL")
    if not url:
        raise ValueError("RESTORE_TEST_DATABASE_URL must be set for an isolated staging DB")
    # Two explicit safeguards: operator confirmation + a read-only transaction.
    # Users must also provision a read-only DB role and verify the URL themselves.
    env = dict(os.environ, PGOPTIONS="-c default_transaction_read_only=on", PGDATABASE=url)
    proc = subprocess.run(
        ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
         "-c", METRICS_SQL],
        env=env, capture_output=True, text=True, check=False, timeout=45
    )
    if proc.returncode != 0:
        # Do not print stderr: it may embed connection-string credentials.
        raise RuntimeError("Read-only psql query failed (details suppressed)")
    try:
        return validate(json.loads(proc.stdout.strip()))
    except json.JSONDecodeError as exc:
        raise RuntimeError("Invalid JSON from staging psql") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", choices=("capture", "verify"), required=True)
    parser.add_argument("--baseline", type=pathlib.Path, required=True)
    parser.add_argument("--confirm-isolated-staging", required=True,
                        help="must be exactly STAGING_ONLY")
    parser.add_argument("--restore-started-at",
                        help="UTC ISO-8601 time; required for verification to calculate RTO")
    args = parser.parse_args()
    if args.confirm_isolated_staging != "STAGING_ONLY":
        print("Refusing: explicitly confirm an isolated staging database", file=sys.stderr)
        return 2
    try:
        metrics = query_staging()
        if args.phase == "capture":
            if args.baseline.exists():
                raise ValueError("Baseline already exists; choose a new path to avoid overwriting evidence")
            payload = {"captured_at": datetime.now(timezone.utc).isoformat(),
                       "metrics": metrics, "data_kind": "synthetic_staging_only"}
            args.baseline.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
            print(f"Captured aggregate-only evidence in {args.baseline}")
            return 0
        if not args.restore_started_at:
            raise ValueError("--restore-started-at is mandatory when verifying")
        started_at = datetime.fromisoformat(args.restore_started_at.replace("Z", "+00:00"))
        if started_at.tzinfo is None:
            raise ValueError("--restore-started-at must include a timezone")
        baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
        if baseline.get("data_kind") != "synthetic_staging_only":
            raise ValueError("Baseline was not marked as synthetic staging data")
        differences = compare(baseline["metrics"], metrics)
        rto = max(0, (datetime.now(timezone.utc) - started_at).total_seconds())
        # This measures elapsed restore+verification time, NOT an observed RPO.
        print(json.dumps({"result": "PASS" if not differences else "FAIL",
                          "differences": differences,
                          "rto_observed_seconds": round(rto, 1),
                          "rpo": "not measured; requires independent source/backup watermark"},
                         indent=2))
        return 1 if differences else 0
    except (ValueError, RuntimeError, OSError, subprocess.TimeoutExpired) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())

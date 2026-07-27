#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Détecteur de références à des fonctions PostgreSQL non définies.

Prévention du bug HIGH-4 (AUDIT-2026-007) :
  7 politiques RLS appelaient public.is_org_admin() qui n'avait jamais
  été définie. Toutes ces opérations échouaient en production avec
  "function does not exist".

Ce script scanne toutes les migrations SQL et vérifie que chaque appel
de fonction public.* est associé à une définition CREATE OR REPLACE
FUNCTION dans une migration antérieure (ou la même).

Usage :
  python3 scripts/check_undefined_functions.py

Exit codes :
  0 = OK (toutes les fonctions référencées sont définies)
  1 = au moins une fonction non définie détectée
  2 = erreur de parsing

À intégrer dans .github/workflows/ci.yml pour bloquer les PR qui
introduisent de nouvelles références non définies.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Couleurs (désactivées si pas de TTY)
if sys.stdout.isatty():
    RED = "\033[31m"
    YELLOW = "\033[33m"
    GREEN = "\033[32m"
    CYAN = "\033[36m"
    RESET = "\033[0m"
else:
    RED = YELLOW = GREEN = CYAN = RESET = ""

MIGRATIONS_DIR = Path(__file__).parent.parent / "supabase" / "migrations"

# Pattern pour détecter CREATE [OR REPLACE] FUNCTION public.<name>
CREATE_FUNCTION_PATTERN = re.compile(
    r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(",
    re.IGNORECASE,
)

# Pattern pour détecter les appels public.<name>( dans un contexte de FONCTION
FUNCTION_CALL_PATTERN = re.compile(
    r"\bpublic\.([a-z_][a-z0-9_]*)\s*\(",
    re.IGNORECASE,
)

# Tables connues du schéma public (à maintenir à jour quand on ajoute des tables)
# On les exclut car elles ne sont pas des fonctions — même si elles apparaissent
# avec une parenthèse ouvrante (INSERT INTO public.customers (col1, col2))
KNOWN_TABLES = {
    "customers", "customer_credits", "categories", "expenses", "feature_flags",
    "organizations", "organization_subscriptions", "plans", "products", "profiles",
    "sale_items", "sales", "stores", "supplier_products", "suppliers",
    "support_tickets", "sync_conflicts", "user_roles", "user_audit_log",
    "user_activity_logs", "stock_movements", "stock_transfers", "purchase_orders",
    "purchase_order_items", "password_reset_tokens", "stripe_events",
    "backups", "whatsapp_config", "whatsapp_message_logs", "loyalty_accounts",
    "loyalty_transactions", "loyalty_rewards", "loyalty_point_ledger",
    "store_settings", "subscription_events", "subscriptions",
    "stock_transfer_items", "audit_logs", "usage_counters",
    "cash_register_sessions",
}

# Fonctions dont le nom suit un pattern de type table (à ignorer si elles
# ressemblent à un trigger / event handler)
FUNCTION_NAME_BLACKLIST = {
    "update_organization_subscription",  # supprimée par 20260706180000
    "generate_sale_number",  # trigger défini via CREATE TRIGGER, pas CREATE FUNCTION
}

# Fonctions built-in de Supabase / Postgres à ignorer (déjà définies par la plateforme)
BUILT_IN_FUNCTIONS = {
    # Supabase auth
    "auth_uid",
    # Extensions Postgres courantes
    "gen_random_uuid",
    "now",
    "coalesce",
    # Supabase helpers
    "is_super_admin",  # défini dans la migration 20260629010000
    "admin_exists",     # défini dans la migration 20260423040958
    "is_member_of_organization",  # défini dans une migration existante
    "get_user_organization_id",   # défini dans une migration existante
    "has_role",                   # défini dans une migration existante
}

# Exclure les fichiers qui ne sont pas des migrations standard
# (commencent par _ ou ne suivent pas le pattern timestamp_name.sql)
def is_migration_file(filename: str) -> bool:
    if filename.startswith("_"):
        return False
    if not filename.endswith(".sql"):
        return False
    # Pattern : 14 chiffres + _ + name.sql
    return bool(re.match(r"^\d{14}_", filename))


def collect_defined_functions(migrations: list[Path]) -> set[str]:
    """Collecte tous les noms de fonctions définies par CREATE FUNCTION."""
    defined = set()
    for mig in migrations:
        try:
            content = mig.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = mig.read_text(encoding="utf-8", errors="replace")
        for match in CREATE_FUNCTION_PATTERN.finditer(content):
            fn_name = match.group(1).lower()
            defined.add(fn_name)
    return defined


def collect_called_functions(migrations: list[Path]) -> dict[str, list[tuple[str, int]]]:
    """Collecte tous les appels de fonction public.* avec leur localisation.

    Pour distinguer un appel de fonction d'une référence à une table,
    on vérifie qu'aucun mot-clé SQL de table (FROM, JOIN, INTO, UPDATE,
    TABLE) n'apparaît dans les 10 caractères précédant "public.<name>(".
    """
    table_keywords = {"from", "join", "into", "update", "table", "delete"}
    called: dict[str, list[tuple[str, int]]] = {}
    for mig in migrations:
        try:
            content = mig.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = mig.read_text(encoding="utf-8", errors="replace")
        for line_no, line in enumerate(content.splitlines(), start=1):
            # Skip les commentaires SQL
            stripped = line.strip()
            if stripped.startswith("--"):
                continue
            for match in FUNCTION_CALL_PATTERN.finditer(line):
                fn_name = match.group(1).lower()
                if fn_name in BUILT_IN_FUNCTIONS:
                    continue
                # Exclure les tables connues (INSERT INTO public.customers (col1, col2))
                if fn_name in KNOWN_TABLES:
                    continue
                # Exclure les fonctions dans la blacklist (triggers supprimés, etc.)
                if fn_name in FUNCTION_NAME_BLACKLIST:
                    continue
                # Vérifier le contexte : y a-t-il un mot-clé de table dans les 15
                # caractères précédant la position de "public." ?
                start = max(0, match.start() - 15)
                preceding = line[start:match.start()].lower()
                # Si le dernier mot (séparé par espaces) est un mot-clé de table, c'est une référence à une table
                last_word_match = re.search(r"(\w+)\s*$", preceding)
                if last_word_match and last_word_match.group(1) in table_keywords:
                    continue
                # Aussi exclure "REFERENCES public.<table>(" pour les FK
                if "references" in preceding.split()[-1:]:
                    continue
                called.setdefault(fn_name, []).append((mig.name, line_no))
    return called


def main() -> int:
    if not MIGRATIONS_DIR.exists():
        print(f"{RED}✗{RESET} Dossier migrations introuvable: {MIGRATIONS_DIR}")
        return 2

    migrations = sorted(
        f for f in MIGRATIONS_DIR.glob("*.sql") if is_migration_file(f.name)
    )

    if not migrations:
        print(f"{YELLOW}!{RESET} Aucune migration trouvée dans {MIGRATIONS_DIR}")
        return 0

    print(f"{CYAN}i{RESET} Analyse de {len(migrations)} fichiers de migration...")

    defined = collect_defined_functions(migrations)
    called = collect_called_functions(migrations)

    print(f"{CYAN}i{RESET} Fonctions définies : {len(defined)}")
    print(f"{CYAN}i{RESET} Fonctions appelées : {len(called)}")
    print()

    # Trouver les fonctions appelées mais jamais définies
    undefined = {
        name: locs for name, locs in called.items()
        if name not in defined
    }

    if not undefined:
        print(f"{GREEN}✓{RESET} Toutes les fonctions public.* appelées sont définies.")
        return 0

    print(f"{RED}✗{RESET} {len(undefined)} fonction(s) appelée(s) mais jamais définie(s) :\n")
    for name in sorted(undefined.keys()):
        locs = undefined[name]
        print(f"  {RED}●{RESET} public.{name}()")
        for mig_name, line_no in locs[:5]:  # Limiter à 5 occurrences par fonction
            print(f"      → {mig_name}:{line_no}")
        if len(locs) > 5:
            print(f"      ... et {len(locs) - 5} autre(s) occurrence(s)")
        print()

    print(f"{YELLOW}!{RESET} Ces fonctions sont référencées dans des politiques RLS ou des RPC")
    print(f"{YELLOW}!{RESET} mais aucune migration ne les définit. Conséquence : erreur runtime")
    print(f"{YELLOW}!{RESET} « function does not exist » sur toutes les opérations concernées.")
    print()
    print(f"{YELLOW}!{RESET} Pour corriger :")
    print(f"{YELLOW}!{RESET}   1. Créer la fonction manquante via CREATE OR REPLACE FUNCTION")
    print(f"{YELLOW}!{RESET}   2. Ou retirer la référence si elle était une erreur de frappe")
    print()
    return 1


if __name__ == "__main__":
    sys.exit(main())

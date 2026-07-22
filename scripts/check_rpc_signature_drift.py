#!/usr/bin/env python3
"""
Détecte la dérive entre les fonctions PostgreSQL définies dans les migrations
locales (supabase/migrations/*.sql) et celles réellement présentes sur le
schéma live — voir P1.2 de l'audit national (docs/production/SUPABASE_SCHEMA_DRIFT_AUDIT.md).

Ce script est volontairement scindé en deux étapes, comme
scripts/validate_sql_migrations.py : il ne se connecte JAMAIS à la base
lui-même (aucun credential embarqué). L'inventaire "live" doit être fourni
séparément, via une introspection en lecture seule du schéma réel :

    npx supabase db query --linked \\
      "SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace \\
       WHERE n.nspname = 'public' AND p.prokind = 'f' ORDER BY p.proname;" \\
      > live_functions.json

Usage :
    python3 scripts/check_rpc_signature_drift.py --live-json live_functions.json

Sans --live-json, le script se contente d'imprimer l'inventaire extrait des
migrations locales (utile pour vérifier l'extraction elle-même).

Sortie : deux catégories de dérive, ni bloquantes ni destructives — un
rapport de lecture seule.
"""
import argparse
import json
import re
import sys
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "supabase" / "migrations"
FUNCTION_RE = re.compile(r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z_][a-z_0-9]*)", re.IGNORECASE)


def extract_migration_functions() -> set[str]:
    names: set[str] = set()
    for sql_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
        text = sql_file.read_text(encoding="utf-8", errors="replace")
        for match in FUNCTION_RE.finditer(text):
            names.add(match.group(1).lower())
    return names


def load_live_functions(path: Path) -> set[str]:
    """Parse the JSON emitted by `supabase db query --linked` (wrapped in a
    prompt-injection warning banner + boundary markers — we only trust the
    'rows' array's proname field, never any free text in the payload)."""
    raw = path.read_text(encoding="utf-8", errors="replace")
    start = raw.index("{")
    data = json.loads(raw[start:])
    return {row["proname"].lower() for row in data.get("rows", [])}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--live-json", type=Path, help="Fichier JSON produit par `supabase db query --linked` (voir docstring)")
    args = parser.parse_args()

    migration_fns = extract_migration_functions()
    print(f"Fonctions trouvées dans les migrations locales : {len(migration_fns)}")

    if not args.live_json:
        for name in sorted(migration_fns):
            print(f"  - {name}")
        print("\nPas de --live-json fourni : comparaison avec le schéma live sautée.")
        return 0

    live_fns = load_live_functions(args.live_json)
    print(f"Fonctions trouvées sur le schéma live : {len(live_fns)}")

    only_live = sorted(live_fns - migration_fns)
    only_migration = sorted(migration_fns - live_fns)

    print(f"\n=== Live mais absentes de toute migration locale ({len(only_live)}) ===")
    print("(dérive : la base a été modifiée directement, sans migration correspondante — ")
    print(" à documenter via une migration 'document_live_*' comme dans P0.3)")
    for name in only_live:
        print(f"  - {name}")

    print(f"\n=== Dans les migrations mais absentes du live ({len(only_migration)}) ===")
    print("(fonction jamais déployée, supprimée depuis, ou renommée — à trier au cas par cas,")
    print(" ce n'est PAS forcément un bug : peut être une fonctionnalité en développement)")
    for name in only_migration:
        print(f"  - {name}")

    if only_live:
        print(f"\nATTENTION : {len(only_live)} fonction(s) en dérive directe non documentée.")
        return 1

    print("\nAucune dérive directe non documentée détectée.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

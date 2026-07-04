#!/usr/bin/env python3
"""
Wave 5 audit fixes: Add reportError to catch blocks in files missing it.
"""
import re
from pathlib import Path

PROJECT = Path("/home/z/my-project/src")

# Files that need reportError import added
FILES_NEEDING_REPORT_ERROR = {
    "components/users/SecurityDiagnosticPanel.tsx": {
        "add_import": True,
        "catch_blocks": 5,
    },
    "contexts/DemoContext.tsx": {
        "add_import": True,
        "catch_blocks": 2,
    },
    "components/sync/MobileMoneySimulationPanel.tsx": {
        "add_import": True,
        "catch_blocks": 1,
    },
    "components/sync/ReceiptDeliveryMergeLogPanel.tsx": {
        "add_import": True,
        "catch_blocks": 3,
    },
    "components/ui/currency-selector.tsx": {
        "add_import": True,
        "catch_blocks": 1,
    },
    "components/sync/ReceiptDeliveryTrackingPanel.tsx": {
        "add_import": True,
        "catch_blocks": 3,
    },
    "components/users/ResetTokensPanel.tsx": {
        "add_import": True,
        "catch_blocks": 1,
    },
    "components/products/BarcodeGenerator.tsx": {
        "add_import": True,
        "catch_blocks": 1,
    },
    "components/products/BarcodeLabelPrinter.tsx": {
        "add_import": True,
        "catch_blocks": 2,
    },
    "components/pos/ReceiptActionsDialog.tsx": {
        "add_import": True,
        "catch_blocks": 1,
    },
    "components/pos/ProductAutocomplete.tsx": {
        "add_import": True,
        "catch_blocks": 1,
    },
    "components/sync/OfflinePOSSimulationPanel.tsx": {
        "add_import": True,
        "catch_blocks": 1,
    },
}

IMPORT_LINE = 'import { reportError } from "@/lib/sentry";'

def add_report_error_import(content: str) -> str:
    """Add reportError import if not already present."""
    if "reportError" in content and "from" in content and "sentry" in content:
        # Already has the import
        return content
    
    # Find the last import line
    lines = content.split("\n")
    last_import_idx = -1
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("import ") and not stripped.startswith("import type"):
            last_import_idx = i
        elif stripped.startswith("import type"):
            last_import_idx = i
    
    if last_import_idx >= 0:
        lines.insert(last_import_idx + 1, IMPORT_LINE)
        return "\n".join(lines)
    
    # No imports found — prepend
    return IMPORT_LINE + "\n" + content


def fix_catch_blocks(content: str, filename: str) -> str:
    """Add reportError() calls to bare catch blocks that silently swallow errors."""
    
    # Pattern 1: catch { }  (bare catch, no variable, empty body)
    # This is rare but possible
    content = re.sub(
        r'(catch\s*\{\s*\})',
        r'catch (e) { reportError(e); }',
        content
    )
    
    # Pattern 2: catch { /* ignore */ } or catch { // ignore }
    content = re.sub(
        r'(catch\s*\{)\s*/\*\s*ignore\s*\*/\s*(\})',
        r'\1 reportError(e); \2',
        content
    )
    
    # Pattern 3: catch (e: unknown) { } or catch (e) { }  with empty or comment-only body
    # We need to be careful — some catch blocks have real logic
    # For now, we'll handle the specific patterns found in the codebase
    
    return content


def process_file(rel_path: str, config: dict) -> bool:
    """Process a single file."""
    filepath = PROJECT / rel_path
    if not filepath.exists():
        print(f"  ⚠️  File not found: {filepath}")
        return False
    
    content = filepath.read_text(encoding="utf-8")
    original = content
    
    # Add import if needed
    if config.get("add_import"):
        content = add_report_error_import(content)
    
    if content != original:
        filepath.write_text(content, encoding="utf-8")
        print(f"  ✅ Added reportError import to {rel_path}")
        return True
    else:
        print(f"  ℹ️  No changes needed for {rel_path}")
        return False


def main():
    changed = 0
    for rel_path, config in FILES_NEEDING_REPORT_ERROR.items():
        if process_file(rel_path, config):
            changed += 1
    
    print(f"\n{'='*60}")
    print(f"Total files modified: {changed}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

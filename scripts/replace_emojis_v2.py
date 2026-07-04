#!/usr/bin/env python3
"""
Phase 2: Replace remaining Unicode symbols (✓, ✗, ↺, ⏳, ⚠, ━) with Lucide icon equivalents.
"""

import re
from pathlib import Path

SRC = Path("/home/z/my-project/savana-flow/src")

# ═══════════════════════════════════════════════════════════
# 1. ReceiptDeliveryTrackingPanel.tsx - Replace ✓, ✗, ↺, ⏳, 👻
# ═══════════════════════════════════════════════════════════
file_path = SRC / "components" / "sync" / "ReceiptDeliveryTrackingPanel.tsx"
content = file_path.read_text(encoding="utf-8")

# Add CheckCircle2, XCircle, RotateCcw, Hourglass icons if not already imported
lucide_match = re.search(r'import \{([^}]+)\} from "lucide-react";', content)
if lucide_match:
    existing = lucide_match.group(1)
    needed = ["CheckCircle2", "XCircle", "RotateCcw", "Hourglass"]
    for icon in needed:
        if icon not in existing:
            existing += f", {icon}"
    content = content.replace(lucide_match.group(0), f'import {{{existing}}} from "lucide-react";')

# Toast descriptions - use text labels instead of symbols
content = content.replace(
    'toast({ title: dict.retryAll, description: `✓${r.sent} ✗${r.failed} ↺${r.skipped} ⏳${r.deferred}` });',
    'toast({ title: dict.retryAll, description: `Envoyés: ${r.sent} | Échoués: ${r.failed} | Ignorés: ${r.skipped} | En attente: ${r.deferred}` });'
)
content = content.replace(
    'toast({ title: dict.bulkRetry, description: `✓${r.sent} ✗${r.failed} ↺${r.skipped}` });',
    'toast({ title: dict.bulkRetry, description: `Envoyés: ${r.sent} | Échoués: ${r.failed} | Ignorés: ${r.skipped}` });'
)

# Status indicators in JSX
content = content.replace(
    '<span data-testid="rt-count-pending">⏳ {counts.pending} {dict.pending}</span>',
    '<span data-testid="rt-count-pending" className="flex items-center gap-1"><Hourglass className="h-3 w-3" /> {counts.pending} {dict.pending}</span>'
)
content = content.replace(
    '<span data-testid="rt-count-sent" className="text-primary flex items-center gap-1">✓ {counts.sent} {dict.sent}</span>',
    '<span data-testid="rt-count-sent" className="text-primary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {counts.sent} {dict.sent}</span>'
)
content = content.replace(
    '<span data-testid="rt-count-failed" className="text-destructive flex items-center gap-1">✗ {counts.failed} {dict.failed}</span>',
    '<span data-testid="rt-count-failed" className="text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> {counts.failed} {dict.failed}</span>'
)
content = content.replace(
    '<span className="text-muted-foreground">↺ {counts.duplicate} {dict.duplicate}</span>',
    '<span className="text-muted-foreground flex items-center gap-1"><RotateCcw className="h-3 w-3" /> {counts.duplicate} {dict.duplicate}</span>'
)

# Sync progress indicators
content = content.replace(
    '<span className="text-primary">✓{syncProgress.sent}</span>',
    '<span className="text-primary flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" />{syncProgress.sent}</span>'
)
content = content.replace(
    '<span className="text-destructive">✗{syncProgress.failed}</span>',
    '<span className="text-destructive flex items-center gap-0.5"><XCircle className="h-3 w-3" />{syncProgress.failed}</span>'
)

# Replace ghost emoji if remaining
content = content.replace('👻', '')

file_path.write_text(content, encoding="utf-8")
print("✅ ReceiptDeliveryTrackingPanel.tsx updated (phase 2)")

# ═══════════════════════════════════════════════════════════
# 2. MobileMoneySimulationPanel.tsx - Replace ✓, ✗, ↩, ⏱
# ═══════════════════════════════════════════════════════════
file_path = SRC / "components" / "sync" / "MobileMoneySimulationPanel.tsx"
content = file_path.read_text(encoding="utf-8")

lucide_match = re.search(r'import \{([^}]+)\} from "lucide-react";', content)
if lucide_match:
    existing = lucide_match.group(1)
    needed = ["CheckCircle2", "XCircle", "RotateCcw", "Timer"]
    for icon in needed:
        if icon not in existing:
            existing += f", {icon}"
    content = content.replace(lucide_match.group(0), f'import {{{existing}}} from "lucide-react";')

content = content.replace(
    '<div className="text-xs text-muted-foreground">⏱ Webhook</div>',
    '<div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Timer className="h-3 w-3" /> Webhook</div>'
)
content = content.replace(
    '<div className="text-xs text-primary">✓ Succès</div>',
    '<div className="text-xs text-primary flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3" /> Succès</div>'
)
content = content.replace(
    '<div className="text-xs text-destructive">✗ Échec</div>',
    '<div className="text-xs text-destructive flex items-center justify-center gap-1"><XCircle className="h-3 w-3" /> Échec</div>'
)
content = content.replace(
    '<div className="text-xs text-muted-foreground">↩ Remboursés</div>',
    '<div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><RotateCcw className="h-3 w-3" /> Remboursés</div>'
)

file_path.write_text(content, encoding="utf-8")
print("✅ MobileMoneySimulationPanel.tsx updated")

# ═══════════════════════════════════════════════════════════
# 3. OfflinePOSSimulationPanel.tsx - Replace ✓
# ═══════════════════════════════════════════════════════════
file_path = SRC / "components" / "sync" / "OfflinePOSSimulationPanel.tsx"
content = file_path.read_text(encoding="utf-8")

lucide_match = re.search(r'import \{([^}]+)\} from "lucide-react";', content)
if lucide_match:
    existing = lucide_match.group(1)
    if "CheckCircle2" not in existing:
        existing += ", CheckCircle2"
    content = content.replace(lucide_match.group(0), f'import {{{existing}}} from "lucide-react";')

content = content.replace(
    '<div className="text-xs text-primary">✓ Synchronisées</div>',
    '<div className="text-xs text-primary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Synchronisées</div>'
)

file_path.write_text(content, encoding="utf-8")
print("✅ OfflinePOSSimulationPanel.tsx updated")

# ═══════════════════════════════════════════════════════════
# 4. ReceiptDeliveryMergeLogPanel.tsx - Replace ✕
# ═══════════════════════════════════════════════════════════
file_path = SRC / "components" / "sync" / "ReceiptDeliveryMergeLogPanel.tsx"
content = file_path.read_text(encoding="utf-8")

content = content.replace(
    'toast.error(dict.mergeLogCopied + " ✕");',
    'toast.error(dict.mergeLogCopied);'
)

file_path.write_text(content, encoding="utf-8")
print("✅ ReceiptDeliveryMergeLogPanel.tsx updated")

# ═══════════════════════════════════════════════════════════
# 5. receiptGenerator.ts - Replace ──── lines with plain dashes
# ═══════════════════════════════════════════════════════════
file_path = SRC / "utils" / "receiptGenerator.ts"
content = file_path.read_text(encoding="utf-8")

content = content.replace('─────────────────', '-----------------')

file_path.write_text(content, encoding="utf-8")
print("✅ receiptGenerator.ts updated (phase 2 - plain dashes)")

print("\n" + "=" * 60)
print("PHASE 2 EMOJI REPLACEMENTS COMPLETE!")
print("=" * 60)

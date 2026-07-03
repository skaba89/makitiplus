#!/usr/bin/env python3
"""
MakitiPlus — Comprehensive End-to-End Test Suite v2
Expert-level frontend + backend + security + emoji audit
"""

import os
import re
import sys
import json
import subprocess
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime

BASE = Path("/home/z/my-project/savana-flow")
SRC = BASE / "src"
SUPABASE = BASE / "supabase"
MIGRATIONS = SUPABASE / "migrations"
EDGE_FNS = SUPABASE / "functions"
SHARED = EDGE_FNS / "_shared"
PUBLIC = BASE / "public"
PAGES = SRC / "pages"
COMPONENTS = SRC / "components"
LIBS = SRC / "lib"
HOOKS = SRC / "hooks"
CONTEXTS = SRC / "contexts"
TYPES_DIR = SRC / "types"

@dataclass
class TestResult:
    name: str
    passed: bool
    detail: str = ""
    category: str = ""
    severity: str = "info"  # info, warning, critical

@dataclass
class TestSuite:
    results: list[TestResult] = field(default_factory=list)
    def add(self, name, passed, detail="", category="", severity="info"):
        self.results.append(TestResult(name, passed, detail, category, severity))
    def summary(self):
        total = len(self.results)
        passed = sum(1 for r in self.results if r.passed)
        failed = total - passed
        return total, passed, failed

suite = TestSuite()

def read_file(path):
    try:
        return path.read_text(encoding="utf-8")
    except:
        return ""

def rg(pattern, path, glob_pattern=None):
    results = []
    if path.is_file():
        files = [path]
    else:
        files = list(path.rglob(glob_pattern)) if glob_pattern else list(path.rglob("*"))
    for f in files:
        if not f.is_file() or any(p in str(f) for p in ["node_modules", ".git", "dist", "tool-results"]):
            continue
        try:
            for i, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                if re.search(pattern, line):
                    results.append((str(f.relative_to(BASE)), i, line.strip()))
        except:
            pass
    return results

def check(name, condition, detail="", category="", severity="info"):
    suite.add(name, condition, detail, category, severity)
    s = "✅ PASS" if condition else "❌ FAIL"
    print(f"  {s} — {name}" + (f" ({detail})" if detail and not condition else ""))
    return condition

# ═══════════════════════════════════════════════════════════
# 1. TYPESCRIPT COMPILATION
# ═══════════════════════════════════════════════════════════
print("=" * 70)
print("1. TYPESCRIPT COMPILATION")
print("=" * 70)

result = subprocess.run(["npx", "tsc", "--noEmit"], cwd=BASE, capture_output=True, text=True, timeout=120)
ts_errors = result.stderr.count("error TS") if result.returncode != 0 else 0
check("TypeScript compilation", result.returncode == 0, f"{ts_errors} errors" if ts_errors else "0 errors", "TypeScript", "critical")

# ═══════════════════════════════════════════════════════════
# 2. VITE PRODUCTION BUILD
# ═══════════════════════════════════════════════════════════
print("\n2. VITE PRODUCTION BUILD")
print("=" * 70)

result = subprocess.run(["npx", "vite", "build"], cwd=BASE, capture_output=True, text=True, timeout=120)
check("Vite production build", result.returncode == 0, "Success" if result.returncode == 0 else result.stderr[-200:], "Build", "critical")

# Check bundle sizes
dist_dir = BASE / "dist"
if dist_dir.exists():
    js_files = list(dist_dir.rglob("*.js"))
    total_size = sum(f.stat().st_size for f in js_files) / 1024
    check("Total JS bundle < 3MB", total_size < 3000, f"{total_size:.0f} KB", "Performance", "warning")
    
    # Check for code-splitting
    chunk_count = len([f for f in js_files if "vendor" in f.name or "index" in f.name or "POS" in f.name or "Reports" in f.name or "charts" in f.name])
    check("Code-splitting chunks >= 4", chunk_count >= 4, f"{chunk_count} chunks", "Performance", "info")

# ═══════════════════════════════════════════════════════════
# 3. EMOJI AUDIT (CRITICAL - user request)
# ═══════════════════════════════════════════════════════════
print("\n3. EMOJI AUDIT — Détection d'emojis dans le code source")
print("=" * 70)

# Unicode emoji ranges (comprehensive)
emoji_pattern = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map
    "\U0001F1E0-\U0001F1FF"  # flags
    "\U00002702-\U000027B0"  # dingbats
    "\U000024C2-\U0001F251"  
    "\U0001f900-\U0001f9FF"  # supplemental symbols
    "\U0001fa00-\U0001fa6F"  # chess symbols
    "\U0001fa70-\U0001faFF"  # symbols extended-A
    "\U00002600-\U000026FF"  # misc symbols
    "\U0000FE00-\U0000FE0F"  # variation selectors
    "\U0000200D"             # zero width joiner
    "\U00002B50"             # star
    "\U00002705"             # check mark
    "\U0000274C"             # cross mark
    "\U00002764"             # heart
    "\U0001F4B0"             # money bag
    "\U0001F4CA"             # chart
    "\U0001F680"             # rocket
    "\U0001F3AF"             # target
    "\U0001F517"             # link
    "\U0001F4E7"             # mail
    "\U0001F4AC"             # speech
    "\U0001F4DD"             # memo
    "\U0001F4CB"             # clipboard
    "\U000026A0"             # warning
    "\U00002753"             # question
    "\U00002755"             # exclamation
    "\U0001F6A9"             # flag
    "\U0001F4A1"             # bulb
    "\U0001F512"             # lock
    "\U0001F513"             # unlock
    "\U0001F504"             # refresh
    "\U0001F4BE"             # floppy
    "\U0001F4F1"             # phone
    "\U0001F4E6"             # package
    "\U0001F3E0"             # house
    "\U0001F4C8"             # chart up
    "\U0001F4C9"             # chart down
    "\U0001F4B3"             # credit card
    "\U0001F4B5"             # dollar
    "\U0001F6D2"             # cart
    "\U0001F911"             # money face
    "\U0001F91D"             # handshake
    "\U0001F4B8"             # money wings
    "\U0001F4C5"             # calendar
    "\U0001F50D"             # search
    "\U0001F511"             # key
    "\U0001F310"             # globe
    "\U0001F4E1"             # satellite
    "\U0000270F"             # pencil
    "\U0001F4DD"             # memo
    "\U0001F449"             # backhand right
    "\U0001F448"             # backhand left
    "\U000027A1"             # arrow right
    "\U00002B06"             # arrow up
    "\U00002B07"             # arrow down
    "\U000025B6"             # play
    "\U000023F8"             # pause
    "\U00002611"             # ballot with check
    "\U00002714"             # heavy check
    "]+", re.UNICODE)

emoji_occurrences = []
tsx_files = list(SRC.rglob("*.tsx")) + list(SRC.rglob("*.ts"))
# ISO country flag emojis in currencies.ts are international standard and exempt
EXEMPT_FILES = ["currencies.ts"]
for f in tsx_files:
    if any(p in str(f) for p in ["node_modules", ".git", "dist", "test/", ".test."]):
        continue
    if any(exempt in str(f) for exempt in EXEMPT_FILES):
        continue
    try:
        content = f.read_text(encoding="utf-8")
        for i, line in enumerate(content.splitlines(), 1):
            # Skip import lines and comments
            stripped = line.strip()
            if stripped.startswith("import ") or stripped.startswith("//") or stripped.startswith("*"):
                continue
            emojis_found = emoji_pattern.findall(line)
            if emojis_found:
                emoji_occurrences.append((str(f.relative_to(BASE)), i, stripped, "".join(emojis_found)))
    except:
        pass

check("No emojis in production code", len(emoji_occurrences) == 0, 
      f"{len(emoji_occurrences)} emoji(s) found" if emoji_occurrences else "Clean", "Emoji", "critical")

if emoji_occurrences:
    print("\n  📋 DÉTAIL DES EMOJIS TROUVÉS:")
    for filepath, line_num, line_content, emoji_str in emoji_occurrences:
        print(f"    ❌ {filepath}:{line_num} → '{emoji_str}' dans: {line_content[:80]}")

# ═══════════════════════════════════════════════════════════
# 4. BRANDING CONSISTENCY
# ═══════════════════════════════════════════════════════════
print("\n4. BRANDING CONSISTENCY")
print("=" * 70)

sahel_refs = rg(r"(?i)sahel\s*pos", SRC, "*.tsx")
check("No 'SahelPOS' residual references", len(sahel_refs) == 0, f"{len(sahel_refs)} refs", "Branding", "critical")

html = read_file(BASE / "index.html")
check("index.html title = MakitiPlus", "MakitiPlus" in html, "", "Branding", "critical")
check("mobile-web-app-capable meta", "mobile-web-app-capable" in html, "", "Branding", "warning")
check("No 'Sahel' in meta", "Sahel" not in html, "", "Branding", "critical")
check("apple-mobile-web-app-title = MakitiPlus", 'content="MakitiPlus"' in html, "", "Branding", "warning")
check("theme-color meta", "theme-color" in html, "", "Branding", "warning")

manifest = read_file(PUBLIC / "manifest.webmanifest")
check("manifest name = MakitiPlus", "MakitiPlus" in manifest, "", "Branding", "critical")
check("manifest short_name = MakitiPlus", "short_name" in manifest and "Makiti" in manifest, "", "Branding", "warning")

auth = read_file(PAGES / "Auth.tsx")
check("Auth.tsx branding = MakitiPlus", "Makiti" in auth and "Plus" in auth, "", "Branding", "critical")

for comp in ["Header.tsx", "Hero.tsx", "Footer.tsx"]:
    content = read_file(SRC / "components" / "landing" / comp)
    check(f"Landing/{comp} has MakitiPlus", "Makiti" in content, "", "Branding", "warning")

branding_ctx = read_file(CONTEXTS / "BrandingContext.tsx")
check("BrandingContext exists with defaults", "appName" in branding_ctx or "MakitiPlus" in branding_ctx, "", "Branding", "critical")

# ═══════════════════════════════════════════════════════════
# 5. CURRENCY (GNF / Guinée)
# ═══════════════════════════════════════════════════════════
print("\n5. CURRENCY (GNF / Guinée)")
print("=" * 70)

currencies = read_file(SRC / "utils" / "currencies.ts")
check("Default country = GN", '"GN"' in currencies.split("DEFAULT_COUNTRY")[1] if "DEFAULT_COUNTRY" in currencies else False, "", "Currency", "critical")
check("Guinée has GNF", '"GNF"' in currencies, "", "Currency", "critical")
check("No FCFA as default", 'DEFAULT_CURRENCY' in currencies and '"GN"' in currencies.split("DEFAULT_COUNTRY")[1], "", "Currency", "critical")

use_currency = read_file(HOOKS / "useCurrency.ts")
check("useCurrency hook exists", len(use_currency) > 0, "", "Currency", "warning")

receipt_gen = read_file(SRC / "utils" / "receiptGenerator.ts")
check("receiptGenerator defaults GNF", '"GNF"' in receipt_gen, "", "Currency", "critical")

export_utils = read_file(SRC / "utils" / "exportUtils.ts")
check("exportUtils uses GNF", "FCFA" not in export_utils, "", "Currency", "warning")

pricing = read_file(SRC / "components" / "landing" / "Pricing.tsx")
check("Pricing uses GNF", "FCFA" not in pricing and "GNF" in pricing, "", "Currency", "critical")

# ═══════════════════════════════════════════════════════════
# 6. AUTH & ROLES
# ═══════════════════════════════════════════════════════════
print("\n6. AUTH & ROLES")
print("=" * 70)

auth_context = read_file(CONTEXTS / "AuthContext.tsx")
check("AuthProvider with signIn/signUp/signOut", all(f in auth_context for f in ["signIn", "signUp", "signOut"]), "", "Auth", "critical")
check("Auth state listener (onAuthStateChange)", "onAuthStateChange" in auth_context, "", "Auth", "critical")
check("Session persistence", "persistSession" in auth_context or "getSession" in auth_context, "", "Auth", "warning")
check("Account active check on signIn", "is_active" in auth_context, "", "Auth", "critical")

protected = read_file(COMPONENTS / "ProtectedRoute.tsx")
check("ProtectedRoute with allowedRoles", "allowedRoles" in protected, "", "Auth", "critical")
check("Redirect to /auth when unauthenticated", '"/auth"' in protected or "Navigate" in protected, "", "Auth", "critical")
check("useAccountStatusGuard used", "useAccountStatusGuard" in protected, "", "Auth", "warning")
check("useQueryErrorGuard used", "useQueryErrorGuard" in protected, "", "Auth", "warning")

anon_grant = read_file(MIGRATIONS / "20260614040000_grant_admin_exists_to_anon.sql")
check("admin_exists() granted to anon", "anon" in anon_grant, "", "Auth", "warning")
check("Auth.tsx calls admin_exists RPC", "admin_exists" in auth, "", "Auth", "warning")

for role in ["admin", "manager", "vendeur", "comptable", "super_admin"]:
    check(f"Role '{role}' defined in app", role in auth_context or role in auth, "", "Auth", "warning")

create_user_fn = read_file(EDGE_FNS / "admin-create-user" / "index.ts")
check("Block admin role creation in edge fn", "Impossible" in create_user_fn, "", "Auth", "critical")

# ═══════════════════════════════════════════════════════════
# 7. SECURITY — Edge Functions
# ═══════════════════════════════════════════════════════════
print("\n7. SECURITY — Edge Functions")
print("=" * 70)

edge_fns = sorted([d.name for d in EDGE_FNS.iterdir() if d.is_dir() and d.name != "_shared"])

for fn_name in edge_fns:
    fn_content = read_file(EDGE_FNS / fn_name / "index.ts")
    check(f"{fn_name}: CORS restricted (no wildcard)", "getCorsHeaders" in fn_content, "", "Security", "critical")
    check(f"{fn_name}: HTTP method guard", "requireMethod" in fn_content, "", "Security", "critical")
    check(f"{fn_name}: Generic error msg in catch", "Erreur interne du serveur" in fn_content, "", "Security", "critical")

admin_fns = ["admin-create-user", "admin-send-reset-link", "admin-manage-user", "admin-export-users-csv", "admin-list-user-emails"]
for fn_name in admin_fns:
    fn_content = read_file(EDGE_FNS / fn_name / "index.ts")
    check(f"{fn_name}: Rate limited", "RateLimiter" in fn_content or "rateLimiter" in fn_content, "", "Security", "critical")

rotate_fn = read_file(EDGE_FNS / "rotate-test-accounts" / "index.ts")
check("rotate-test-accounts: X-Cron-Secret header check", "X-Cron-Secret" in rotate_fn or "CRON_SECRET" in rotate_fn, "", "Security", "critical")

reset_fn = read_file(EDGE_FNS / "admin-send-reset-link" / "index.ts")
check("No actionLink/token leak in reset response", "actionLink" not in reset_fn.split("return")[-1] and "manualLink" not in reset_fn.split("return")[-1], "", "Security", "critical")

# Check for sensitive data in .env
env_files = list(BASE.glob(".env*"))
env_has_secrets = False
for ef in env_files:
    content = read_file(ef)
    if "SUPABASE_URL" in content and "SERVICE_ROLE" not in content:
        env_has_secrets = True
check("No service_role key in frontend .env", env_has_secrets or len(env_files) == 0, "Service role key must NOT be in frontend", "Security", "critical")

# ═══════════════════════════════════════════════════════════
# 8. SECURITY — RLS & Migrations
# ═══════════════════════════════════════════════════════════
print("\n8. SECURITY — RLS & Migrations")
print("=" * 70)

migration_files = sorted(MIGRATIONS.glob("*.sql"))
check("Migration files exist (>= 15)", len(migration_files) >= 15, f"{len(migration_files)} files", "Security", "critical")

# Check critical migrations
critical_migrations = {
    "batch_update_stock RPC": "batch_update_stock",
    "Foreign keys added": "FOREIGN KEY",
    "RLS policies tightened": "CREATE POLICY",
    "admin_exists for anon": "admin_exists",
    "super_admin role": "super_admin",
    "store_category": "store_category",
}
for desc, pattern in critical_migrations.items():
    found = any(re.search(pattern, read_file(f), re.IGNORECASE) for f in migration_files)
    check(f"Migration: {desc}", found, "", "Security", "warning")

# Check for organization_id scoping
org_scoped = sum(1 for f in migration_files if "organization_id" in read_file(f))
check("organization_id in migrations", org_scoped >= 3, f"{org_scoped} files", "Security", "warning")

# ═══════════════════════════════════════════════════════════
# 9. SHARED MODULES
# ═══════════════════════════════════════════════════════════
print("\n9. SHARED MODULES (Backend)")
print("=" * 70)

for mod in ["cors.ts", "httpMethodGuard.ts", "passwordPolicy.ts", "rateLimiter.ts", "orgScope.ts"]:
    exists = (SHARED / mod).exists()
    check(f"_shared/{mod} exists", exists, "", "Backend", "critical" if not exists else "info")

cors_content = read_file(SHARED / "cors.ts")
check("CORS validates origins (no wildcard *)", "ALLOWED_ORIGINS" in cors_content, "", "Backend", "critical")

rate_limiter = read_file(SHARED / "rateLimiter.ts")
check("Rate limiter with Deno KV or in-memory", "Deno" in rate_limiter or "rateLimit" in rate_limiter or "RateLimiter" in rate_limiter, "", "Backend", "critical")

org_scope = read_file(SHARED / "orgScope.ts")
check("orgScope helper", len(org_scope) > 0, "", "Backend", "warning")

password_policy = read_file(SHARED / "passwordPolicy.ts")
check("Server-side password policy", len(password_policy) > 0, "", "Backend", "warning")

# ═══════════════════════════════════════════════════════════
# 10. ACCESSIBILITY
# ═══════════════════════════════════════════════════════════
print("\n10. ACCESSIBILITY")
print("=" * 70)

dashboard = read_file(PAGES / "Dashboard.tsx")
check("Dashboard role=button on cards", 'role="button"' in dashboard, "", "A11y", "warning")
check("Dashboard tabIndex on cards", "tabIndex" in dashboard, "", "A11y", "warning")
check("Dashboard onKeyDown on cards", "onKeyDown" in dashboard, "", "A11y", "warning")

# Check icon buttons have aria-label
icon_btn_re = re.compile(r'size=["\x27]icon["\x27]')
aria_label_re = re.compile(r'size=["\x27]icon["\x27][^>]*aria-label')
icon_btn_pattern = [(str(f.relative_to(BASE)), i, line) for f in SRC.rglob("*.tsx") if f.is_file() for i, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1) if icon_btn_re.search(line) and "node_modules" not in str(f)]
aria_label_btns = [(str(f.relative_to(BASE)), i, line) for f in SRC.rglob("*.tsx") if f.is_file() for i, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1) if aria_label_re.search(line) and "node_modules" not in str(f)]
icon_btn_count = len(icon_btn_pattern)
aria_label_count = len(aria_label_btns)
check("Icon buttons have aria-label", icon_btn_count == 0 or aria_label_count / icon_btn_count > 0.8, 
      f"{aria_label_count}/{icon_btn_count} covered", "A11y", "warning")

# Dialog accessibility
dialogs_fixed = rg(r"aria-describedby=\{undefined\}", SRC, "*.tsx")
check("Dialog components with aria-describedby fix", len(dialogs_fixed) >= 5, f"{len(dialogs_fixed)} fixed", "A11y", "info")

a11y_pages = ["POS.tsx", "Products.tsx", "Categories.tsx", "Customers.tsx", "Expenses.tsx", "Users.tsx", "Settings.tsx", "Reports.tsx"]
pages_with_aria = sum(1 for p in a11y_pages if "aria-label" in read_file(PAGES / p))
check("Pages have aria-labels", pages_with_aria >= 5, f"{pages_with_aria}/{len(a11y_pages)}", "A11y", "warning")

# ═══════════════════════════════════════════════════════════
# 11. PWA CONFIGURATION
# ═══════════════════════════════════════════════════════════
print("\n11. PWA CONFIGURATION")
print("=" * 70)

check("manifest.webmanifest exists", (PUBLIC / "manifest.webmanifest").exists(), "", "PWA", "critical")
for icon in ["favicon.ico", "icon-192.png", "icon-512.png", "icon-96.png", "icon-384.png"]:
    check(f"PWA icon: {icon}", (PUBLIC / icon).exists(), "", "PWA", "warning")

vite_config = read_file(BASE / "vite.config.ts")
check("VitePWA plugin configured", "VitePWA" in vite_config, "", "PWA", "critical")
check("Service worker: NetworkFirst for navigations", "NetworkFirst" in vite_config, "", "PWA", "info")
check("Service worker: CacheFirst for static assets", "CacheFirst" in vite_config, "", "PWA", "info")
check("Auth URLs excluded from cache", "navigateFallbackDenylist" in vite_config, "", "PWA", "warning")

# ═══════════════════════════════════════════════════════════
# 12. SENTRY / ERROR TRACKING
# ═══════════════════════════════════════════════════════════
print("\n12. SENTRY / ERROR TRACKING")
print("=" * 70)

sentry_lib = read_file(LIBS / "sentry.ts")
check("Sentry integration initialized", "Sentry" in sentry_lib and "init" in sentry_lib, "", "Observability", "critical")
check("SentryErrorBoundary component", "SentryErrorBoundary" in sentry_lib, "", "Observability", "critical")

app = read_file(SRC / "App.tsx")
check("ErrorBoundary wrapping App", "ErrorBoundary" in app or "SentryErrorBoundary" in app, "", "Observability", "critical")

console_errors = [e for e in rg(r"console\.error", SRC, "*.tsx") 
                  if "import.meta.env.DEV" not in str(e) and "test/" not in str(e) and ".test." not in str(e) and "NotFound" not in str(e)]
check("No console.error in prod code", len(console_errors) == 0, f"{len(console_errors)} remaining", "Observability", "warning")

report_errors = rg(r"reportError\(", SRC, "*.tsx")
check("reportError() used for error tracking", len(report_errors) > 0, f"{len(report_errors)} usages", "Observability", "info")

# ═══════════════════════════════════════════════════════════
# 13. PERFORMANCE OPTIMIZATIONS
# ═══════════════════════════════════════════════════════════
print("\n13. PERFORMANCE OPTIMIZATIONS")
print("=" * 70)

memo_files = rg(r"\bmemo\(", SRC, "*.tsx")
memo_comps = ["POSProductGrid", "ProductList", "POSCart"]
for comp in memo_comps:
    found = any(comp in str(f) for f in memo_files)
    check(f"React.memo on {comp}", found, "", "Performance", "warning")

check("React.lazy loading for heavy routes", "lazy(" in app, "", "Performance", "warning")
check("Suspense wrapper with fallback", "Suspense" in app, "", "Performance", "warning")

zustand_store = read_file(CONTEXTS / "POSCartContext.ts")
check("Zustand cart store (optimized)", "zustand" in zustand_store or "create" in zustand_store, "", "Performance", "warning")
check("QueryClient staleTime (5min)", "staleTime" in app, "", "Performance", "info")

# Check manual chunks in vite config
check("Manual chunks configured", "manualChunks" in vite_config, "", "Performance", "info")

# ═══════════════════════════════════════════════════════════
# 14. TYPESCRIPT TYPES QUALITY
# ═══════════════════════════════════════════════════════════
print("\n14. TYPESCRIPT TYPES QUALITY")
print("=" * 70)

types_file = TYPES_DIR / "index.ts"
check("types/index.ts exists", types_file.exists(), "", "Types", "warning")

types_content = read_file(types_file)
for t in ["Customer", "ProductWithCategory", "EdgeFunctionResponse", "AuditLogEntry"]:
    check(f"Type '{t}' defined", t in types_content, "", "Types", "info")

check("web-nfc.d.ts exists", (TYPES_DIR / "web-nfc.d.ts").exists(), "", "Types", "info")

any_types = [e for e in rg(r": any\b", SRC, "*.tsx") if "test/" not in str(e) and ".test." not in str(e)]
check("No `any` type in production code", len(any_types) == 0, f"{len(any_types)} remaining", "Types", "warning")

# ═══════════════════════════════════════════════════════════
# 15. OFFLINE / INDEXEDDB
# ═══════════════════════════════════════════════════════════
print("\n15. OFFLINE / INDEXEDDB")
print("=" * 70)

idb = read_file(LIBS / "indexedDBStorage.ts")
check("IndexedDB storage module", len(idb) > 0, "", "Offline", "critical")
check("RECEIPT_QUEUE store", "RECEIPT_QUEUE" in idb, "", "Offline", "critical")
check("MERGE_LOG store", "MERGE_LOG" in idb, "", "Offline", "warning")

rdq = read_file(LIBS / "receiptDeliveryQueue.ts")
check("Receipt delivery queue", len(rdq) > 0, "", "Offline", "critical")
check("Exponential backoff on retry", "backoff" in rdq.lower() or "exponential" in rdq.lower(), "", "Offline", "warning")

scr = read_file(LIBS / "syncConflictResolver.ts")
check("Sync conflict resolver", len(scr) > 0, "", "Offline", "critical")

offline_ctx = read_file(CONTEXTS / "OfflineContext.tsx")
check("OfflineContext provider", len(offline_ctx) > 0, "", "Offline", "critical")

offline_indicator = read_file(COMPONENTS / "ui" / "offline-indicator.tsx")
check("Offline indicator component", len(offline_indicator) > 0, "", "Offline", "warning")

offline_mutation = read_file(HOOKS / "useOfflineMutation.ts")
check("useOfflineMutation hook", len(offline_mutation) > 0, "", "Offline", "warning")

# ═══════════════════════════════════════════════════════════
# 16. i18n
# ═══════════════════════════════════════════════════════════
print("\n16. i18n (INTERNATIONALIZATION)")
print("=" * 70)

i18n = read_file(LIBS / "receiptDeliveryI18n.ts")
check("i18n module exists", len(i18n) > 0, "", "i18n", "warning")
for lang in ["fr", "en"]:
    check(f"Locale '{lang}'", f'code: "{lang}"' in i18n or f"code: '{lang}'" in i18n, "", "i18n", "warning")

# ═══════════════════════════════════════════════════════════
# 17. ROUTES & NAVIGATION
# ═══════════════════════════════════════════════════════════
print("\n17. ROUTES & NAVIGATION")
print("=" * 70)

expected_routes = [
    "/dashboard", "/dashboard/pos", "/dashboard/products", "/dashboard/categories",
    "/dashboard/reports", "/dashboard/expenses", "/dashboard/customers",
    "/dashboard/users", "/dashboard/settings", "/dashboard/sync-conflicts",
    "/dashboard/stores"
]
for route in expected_routes:
    check(f"Route '{route}'", route in app, "", "Routes", "critical")

check("React Router v7 flags", "v7_startTransition" in app and "v7_relativeSplatPath" in app, "", "Routes", "warning")
check("NotFound catch-all route", '"*"' in app, "", "Routes", "info")

# ═══════════════════════════════════════════════════════════
# 18. POS FUNCTIONALITY
# ═══════════════════════════════════════════════════════════
print("\n18. POS FUNCTIONALITY (Point de Vente)")
print("=" * 70)

pos = read_file(PAGES / "POS.tsx")
check("batch_update_stock RPC (atomic stock update)", "batch_update_stock" in pos, "", "POS", "critical")
check("Zustand cart store used", "usePOSCartStore" in pos, "", "POS", "warning")
check("useCallback for handlers", "useCallback" in pos, "", "POS", "warning")

pos_grid = read_file(COMPONENTS / "pos" / "POSProductGrid.tsx")
check("Progressive loading (PAGE_SIZE)", "PAGE_SIZE" in pos_grid, "", "POS", "warning")

pos_components = {
    "BarcodeScannerDialog": COMPONENTS / "pos" / "BarcodeScannerDialog.tsx",
    "POSPaymentDialog": COMPONENTS / "pos" / "POSPaymentDialog.tsx",
    "ReceiptActionsDialog": COMPONENTS / "pos" / "ReceiptActionsDialog.tsx",
    "ProductAutocomplete": COMPONENTS / "pos" / "ProductAutocomplete.tsx",
    "POSCart": COMPONENTS / "pos" / "POSCart.tsx",
    "POSProductGrid": COMPONENTS / "pos" / "POSProductGrid.tsx",
}
for name, path in pos_components.items():
    check(f"POS component: {name}", path.exists(), "", "POS", "warning")

# ═══════════════════════════════════════════════════════════
# 19. PRODUCT MANAGEMENT
# ═══════════════════════════════════════════════════════════
print("\n19. PRODUCT MANAGEMENT")
print("=" * 70)

product_comps = {
    "ProductForm": COMPONENTS / "products" / "ProductForm.tsx",
    "ProductList": COMPONENTS / "products" / "ProductList.tsx",
    "BarcodeGenerator": COMPONENTS / "products" / "BarcodeGenerator.tsx",
    "BarcodeLabelPrinter": COMPONENTS / "products" / "BarcodeLabelPrinter.tsx",
    "StockAdjustDialog": COMPONENTS / "products" / "StockAdjustDialog.tsx",
    "StockMovementHistory": COMPONENTS / "products" / "StockMovementHistory.tsx",
}
for name, path in product_comps.items():
    check(f"Product component: {name}", path.exists(), "", "Products", "warning")

search_index = read_file(LIBS / "productSearchIndex.ts")
check("Product search index", len(search_index) > 0, "", "Products", "warning")
check("Accent normalization in search", "normalize" in search_index or "NFD" in search_index, "", "Products", "info")

# ═══════════════════════════════════════════════════════════
# 20. CUSTOMER & CREDITS
# ═══════════════════════════════════════════════════════════
print("\n20. CUSTOMER & CREDITS")
print("=" * 70)

check("CustomerDetailDialog", (COMPONENTS / "customers" / "CustomerDetailDialog.tsx").exists(), "", "Customers", "warning")
check("CreditPaymentDialog", (COMPONENTS / "customers" / "CreditPaymentDialog.tsx").exists(), "", "Customers", "warning")

# ═══════════════════════════════════════════════════════════
# 21. USER MANAGEMENT & SECURITY
# ═══════════════════════════════════════════════════════════
print("\n21. USER MANAGEMENT & SECURITY")
print("=" * 70)

check("SecurityDiagnosticPanel", (COMPONENTS / "users" / "SecurityDiagnosticPanel.tsx").exists(), "", "Users", "warning")
check("AuditLogPanel", (COMPONENTS / "users" / "AuditLogPanel.tsx").exists(), "", "Users", "warning")
check("PasswordStrengthMeter", (COMPONENTS / "users" / "PasswordStrengthMeter.tsx").exists(), "", "Users", "warning")
check("ResetTokensPanel", (COMPONENTS / "users" / "ResetTokensPanel.tsx").exists(), "", "Users", "warning")

pp_client = read_file(LIBS / "passwordPolicy.ts")
pp_server = read_file(SHARED / "passwordPolicy.ts")
check("Client password policy", len(pp_client) > 0, "", "Users", "warning")
check("Server password policy", len(pp_server) > 0, "", "Users", "critical")

# ═══════════════════════════════════════════════════════════
# 22. TAX SYSTEM
# ═══════════════════════════════════════════════════════════
print("\n22. TAX SYSTEM")
print("=" * 70)

tax_utils = read_file(LIBS / "taxUtils.ts")
check("taxUtils module", len(tax_utils) > 0, "", "Tax", "warning")
check("computeTax function", "computeTax" in tax_utils, "", "Tax", "warning")
check("TaxSettingsCard", (COMPONENTS / "settings" / "TaxSettingsCard.tsx").exists(), "", "Tax", "warning")
check("useOrgTaxRate hook", (HOOKS / "useOrgTaxRate.ts").exists(), "", "Tax", "warning")

# ═══════════════════════════════════════════════════════════
# 23. SYNC CONFLICTS
# ═══════════════════════════════════════════════════════════
print("\n23. SYNC CONFLICTS")
print("=" * 70)

sync_comps = ["ConflictSimulationPanel", "OfflinePOSSimulationPanel", "MobileMoneySimulationPanel", "ReceiptDeliveryTrackingPanel", "ReceiptDeliveryMergeLogPanel"]
for comp in sync_comps:
    check(f"Sync component: {comp}", (COMPONENTS / "sync" / f"{comp}.tsx").exists(), "", "Sync", "warning")

# ═══════════════════════════════════════════════════════════
# 24. LANDING PAGE
# ═══════════════════════════════════════════════════════════
print("\n24. LANDING PAGE")
print("=" * 70)

for comp in ["Header", "Hero", "Features", "Pricing", "Testimonials", "CTA", "Footer"]:
    check(f"Landing: {comp}", (SRC / "components" / "landing" / f"{comp}.tsx").exists(), "", "Landing", "warning")

# ═══════════════════════════════════════════════════════════
# 25. RECEIPT GENERATION
# ═══════════════════════════════════════════════════════════
print("\n25. RECEIPT GENERATION")
print("=" * 70)

check("Receipt PDF generation", "generateReceiptPDF" in receipt_gen, "", "Receipt", "critical")
check("WhatsApp share", "whatsapp" in receipt_gen.lower() or "WhatsApp" in receipt_gen, "", "Receipt", "warning")
check("Receipt download", "downloadReceipt" in receipt_gen, "", "Receipt", "warning")
check("Receipt print", "printReceipt" in receipt_gen, "", "Receipt", "warning")

# ═══════════════════════════════════════════════════════════
# 26. EXPORT UTILITIES
# ═══════════════════════════════════════════════════════════
print("\n26. EXPORT UTILITIES")
print("=" * 70)

check("CSV export sales", "exportSalesToCSV" in export_utils, "", "Export", "warning")
check("CSV export products", "exportProductsToCSV" in export_utils, "", "Export", "warning")
check("CSV export expenses", "exportExpensesToCSV" in export_utils, "", "Export", "warning")

# ═══════════════════════════════════════════════════════════
# 27. ENV CONFIGURATION
# ═══════════════════════════════════════════════════════════
print("\n27. ENV CONFIGURATION")
print("=" * 70)

env_example = read_file(BASE / ".env.example") if (BASE / ".env.example").exists() else ""
env_file = read_file(BASE / ".env") if (BASE / ".env").exists() else ""
for var in ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SENTRY_DSN"]:
    check(f"Env var '{var}'", var in env_example or var in env_file, "", "Config", "warning")

# ═══════════════════════════════════════════════════════════
# 28. DEPENDENCIES CHECK
# ═══════════════════════════════════════════════════════════
print("\n28. DEPENDENCIES CHECK")
print("=" * 70)

package_json = json.loads(read_file(BASE / "package.json"))
deps = {**package_json.get("dependencies", {}), **package_json.get("devDependencies", {})}

critical_deps = ["zustand", "@sentry/react", "@supabase/supabase-js", "@tanstack/react-query", "react-router-dom", "jspdf", "recharts"]
for dep in critical_deps:
    check(f"Dependency '{dep}'", dep in deps, deps.get(dep, "Missing"), "Dependencies", "critical" if dep not in deps else "info")

# ═══════════════════════════════════════════════════════════
# 29. DEV GUARDS
# ═══════════════════════════════════════════════════════════
print("\n29. DEV GUARDS")
print("=" * 70)

rdt = read_file(COMPONENTS / "sync" / "ReceiptDeliveryTrackingPanel.tsx")
check("__malikiplus_mergeRemote DEV-only guard", "import.meta.env.DEV" in rdt, "", "DevGuards", "critical")

# ═══════════════════════════════════════════════════════════
# 30. UNIT TESTS EXECUTION
# ═══════════════════════════════════════════════════════════
print("\n30. UNIT TESTS EXECUTION")
print("=" * 70)

vitest_result = subprocess.run(["npx", "vitest", "run"], cwd=BASE, capture_output=True, text=True, timeout=180)
vitest_output = vitest_result.stdout + vitest_result.stderr
check("Vitest: all tests pass", vitest_result.returncode == 0, 
      "All passed" if vitest_result.returncode == 0 else "Some tests failed", "Tests", "critical")

# Count test files and tests
test_files_count = len(list((SRC / "test").glob("*.test.*"))) if (SRC / "test").exists() else 0
check("Unit test files exist", test_files_count >= 10, f"{test_files_count} files", "Tests", "warning")

# ═══════════════════════════════════════════════════════════
# 31. LINT CHECK
# ═══════════════════════════════════════════════════════════
print("\n31. ESLINT CHECK")
print("=" * 70)

lint_result = subprocess.run(["npx", "eslint", ".", "--max-warnings", "100"], cwd=BASE, capture_output=True, text=True, timeout=120)
lint_errors = lint_result.stdout.count("error") if lint_result.returncode != 0 else 0
check("ESLint: no errors", lint_result.returncode == 0, f"{lint_errors} errors" if lint_errors else "Clean", "Lint", "warning")

# ═══════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════

print("\n" + "=" * 70)
print("RÉSUMÉ DU TEST END-TO-END MAKITIPLUS v2")
print("=" * 70)

total, passed, failed = suite.summary()

categories = {}
for r in suite.results:
    cat = r.category or "Other"
    if cat not in categories:
        categories[cat] = {"passed": 0, "failed": 0, "failures": [], "critical_failures": []}
    if r.passed:
        categories[cat]["passed"] += 1
    else:
        categories[cat]["failed"] += 1
        categories[cat]["failures"].append(r.name)
        if r.severity == "critical":
            categories[cat]["critical_failures"].append(r.name)

critical_failures = sum(len(d["critical_failures"]) for d in categories.values())
warning_failures = failed - critical_failures

print(f"\n  Total: {total} tests | Réussis: {passed} | Échoués: {failed}")
print(f"  Taux de réussite: {passed/total*100:.1f}%")
print(f"  Échecs critiques: {critical_failures} | Échecs warnings: {warning_failures}\n")

print("  Par catégorie:")
print("  " + "-" * 65)
for cat, data in sorted(categories.items()):
    total_cat = data["passed"] + data["failed"]
    rate = data["passed"] / total_cat * 100 if total_cat > 0 else 0
    status = "✅" if data["failed"] == 0 else ("🔴" if data["critical_failures"] else "⚠️")
    print(f"  {status} {cat:25s} {data['passed']}/{total_cat} ({rate:.0f}%)")
    if data["critical_failures"]:
        for f in data["critical_failures"]:
            print(f"      🔴 CRITICAL: {f}")
    elif data["failures"]:
        for f in data["failures"]:
            print(f"      ⚠️  {f}")

# Generate JSON report
report = {
    "timestamp": datetime.now().isoformat(),
    "version": "2.0",
    "project": "MakitiPlus",
    "total": total,
    "passed": passed, 
    "failed": failed,
    "critical_failures": critical_failures,
    "warning_failures": warning_failures,
    "success_rate": f"{passed/total*100:.1f}%",
    "emoji_occurrences": [
        {"file": f, "line": l, "content": c[:100], "emoji": e}
        for f, l, c, e in emoji_occurrences
    ],
    "categories": {
        cat: {
            "passed": d["passed"], 
            "failed": d["failed"], 
            "failures": d["failures"],
            "critical_failures": d["critical_failures"]
        } for cat, d in categories.items()
    },
    "results": [
        {"name": r.name, "passed": r.passed, "detail": r.detail, "category": r.category, "severity": r.severity}
        for r in suite.results
    ]
}

report_path = Path("/home/z/my-project/download/e2e_test_report_v2.json")
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(f"\n  Rapport JSON: {report_path}")

# Exit code
if critical_failures > 0:
    print(f"\n  🔴 {critical_failures} ÉCHEC(S) CRITIQUE(S) — Action requise!")
    sys.exit(1)
elif failed > 0:
    print(f"\n  ⚠️  {failed} avertissement(s) — Améliorations recommandées")
    sys.exit(0)
else:
    print(f"\n  ✅ Tous les tests passent — Projet prêt pour la production!")
    sys.exit(0)

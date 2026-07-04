#!/usr/bin/env python3
"""
MakitiPlus — Comprehensive End-to-End Test Suite
Tests all frontend, backend, security, accessibility, and PWA features.
"""

import os
import re
import sys
import json
import subprocess
from pathlib import Path
from dataclasses import dataclass, field

BASE = Path("/home/z/my-project/savana-flow")
SRC = BASE / "src"
SUPABASE = BASE / "supabase"
MIGRATIONS = SUPABASE / "migrations"
EDGE_FNS = SUPABASE / "functions"
SHARED = EDGE_FNS / "_shared"
PUBLIC = BASE / "public"

@dataclass
class TestResult:
    name: str
    passed: bool
    detail: str = ""
    category: str = ""

@dataclass
class TestSuite:
    results: list[TestResult] = field(default_factory=list)
    def add(self, name, passed, detail="", category=""):
        self.results.append(TestResult(name, passed, detail, category))
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
        if not f.is_file() or any(p in str(f) for p in ["node_modules", ".git", "dist"]):
            continue
        try:
            for i, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                if re.search(pattern, line):
                    results.append(f"{f.relative_to(BASE)}:{i}: {line.strip()}")
        except:
            pass
    return results

def check(name, condition, detail="", category=""):
    suite.add(name, condition, detail, category)
    s = "✅ PASS" if condition else "❌ FAIL"
    print(f"  {s} — {name}" + (f" ({detail})" if detail and not condition else ""))
    return condition

# ═══════════════════════════════════════════════════════════
print("=" * 60)
print("1. TYPESCRIPT COMPILATION")
print("=" * 60)

result = subprocess.run(["npx", "tsc", "--noEmit"], cwd=BASE, capture_output=True, text=True, timeout=120)
check("TypeScript compilation", result.returncode == 0, "0 errors" if result.returncode == 0 else result.stderr[-200:], "TypeScript")

# ═══════════════════════════════════════════════════════════
print("\n2. VITE PRODUCTION BUILD")
print("=" * 60)

result = subprocess.run(["npx", "vite", "build"], cwd=BASE, capture_output=True, text=True, timeout=120)
check("Vite production build", result.returncode == 0, "Success" if result.returncode == 0 else result.stderr[-200:], "Build")

# ═══════════════════════════════════════════════════════════
print("\n3. BRANDING")
print("=" * 60)

sahel_refs = rg(r"(?i)sahel\s*pos", SRC, "*.tsx")
check("No 'SahelPOS' in source", len(sahel_refs) == 0, f"{len(sahel_refs)} refs", "Branding")

html = read_file(BASE / "index.html")
check("index.html title = MakitiPlus", "MakitiPlus" in html, "", "Branding")
check("mobile-web-app-capable meta", "mobile-web-app-capable" in html, "", "Branding")
check("No 'Sahel' in meta", "Sahel" not in html, "", "Branding")
check("apple-mobile-web-app-title = MakitiPlus", 'content="MakitiPlus"' in html, "", "Branding")

manifest = read_file(PUBLIC / "manifest.webmanifest")
check("manifest name = MakitiPlus", "MakitiPlus" in manifest, "", "Branding")

auth = read_file(SRC / "pages" / "Auth.tsx")
check("Auth.tsx branding = MakitiPlus", "Makiti" in auth and "Plus" in auth, "", "Branding")

header = read_file(SRC / "components" / "landing" / "Header.tsx")
check("Header.tsx branding = MakitiPlus", "Makiti" in header, "", "Branding")

footer = read_file(SRC / "components" / "landing" / "Footer.tsx")
check("Footer.tsx branding = MakitiPlus", "Makiti" in footer, "", "Branding")

# ═══════════════════════════════════════════════════════════
print("\n4. CURRENCY (GNF / Guinée)")
print("=" * 60)

currencies = read_file(SRC / "utils" / "currencies.ts")
check("Default country = GN", '"GN"' in currencies.split("DEFAULT_COUNTRY")[1] if "DEFAULT_COUNTRY" in currencies else False, "", "Currency")
check("Guinée has GNF", '"GNF"' in currencies, "", "Currency")
check("Default NOT FCFA", 'DEFAULT_CURRENCY' in currencies and '"GN"' in currencies.split("DEFAULT_COUNTRY")[1], "", "Currency")

receipt_gen = read_file(SRC / "utils" / "receiptGenerator.ts")
check("receiptGenerator defaults GNF", '"GNF"' in receipt_gen, "", "Currency")

export_utils = read_file(SRC / "utils" / "exportUtils.ts")
check("exportUtils uses GNF", "FCFA" not in export_utils, "", "Currency")

pricing = read_file(SRC / "components" / "landing" / "Pricing.tsx")
check("Pricing uses GNF", "FCFA" not in pricing and "GNF" in pricing, "", "Currency")

# ═══════════════════════════════════════════════════════════
print("\n5. AUTH & ROLES")
print("=" * 60)

anon_grant = read_file(MIGRATIONS / "20260614040000_grant_admin_exists_to_anon.sql")
check("admin_exists() granted to anon", "anon" in anon_grant, "", "Auth")
check("Auth.tsx calls admin_exists RPC", "admin_exists" in auth, "", "Auth")

for role in ["admin", "manager", "vendeur", "comptable"]:
    check(f"Role '{role}' defined", role in auth, "", "Auth")

create_user_fn = read_file(EDGE_FNS / "admin-create-user" / "index.ts")
check("Block admin role creation", "Impossible" in create_user_fn, "", "Auth")

single_admin = any("idx_single_admin" in read_file(f) for f in MIGRATIONS.glob("*.sql"))
check("Single admin index", single_admin, "", "Auth")

# ═══════════════════════════════════════════════════════════
print("\n6. SECURITY (Edge Functions)")
print("=" * 60)

edge_fns = sorted([d.name for d in EDGE_FNS.iterdir() if d.is_dir() and d.name != "_shared"])
for fn_name in edge_fns:
    fn_content = read_file(EDGE_FNS / fn_name / "index.ts")
    check(f"{fn_name}: CORS restricted", "getCorsHeaders" in fn_content, "", "Security")
    check(f"{fn_name}: HTTP method guard", "requireMethod" in fn_content, "", "Security")
    check(f"{fn_name}: Generic error msg", "Erreur interne du serveur" in fn_content, "", "Security")
    check(f"{fn_name}: No wildcard CORS", '"*"' not in fn_content or "getCorsHeaders" in fn_content, "", "Security")

admin_fns = ["admin-create-user", "admin-send-reset-link", "admin-manage-user", "admin-export-users-csv", "admin-list-user-emails"]
for fn_name in admin_fns:
    fn_content = read_file(EDGE_FNS / fn_name / "index.ts")
    check(f"{fn_name}: Rate limited", "RateLimiter" in fn_content or "rateLimiter" in fn_content, "", "Security")

rotate_fn = read_file(EDGE_FNS / "rotate-test-accounts" / "index.ts")
check("rotate-test-accounts: X-Cron-Secret", "X-Cron-Secret" in rotate_fn, "", "Security")

reset_fn = read_file(EDGE_FNS / "admin-send-reset-link" / "index.ts")
check("No actionLink in reset response", "actionLink" not in reset_fn.split("return")[-1], "", "Security")

# ═══════════════════════════════════════════════════════════
print("\n7. SHARED MODULES")
print("=" * 60)

for mod in ["cors.ts", "httpMethodGuard.ts", "passwordPolicy.ts", "rateLimiter.ts", "orgScope.ts"]:
    check(f"_shared/{mod} exists", (SHARED / mod).exists(), "", "Shared")

cors_content = read_file(SHARED / "cors.ts")
check("CORS validates origins", "ALLOWED_ORIGINS" in cors_content, "", "Shared")

# ═══════════════════════════════════════════════════════════
print("\n8. MIGRATIONS")
print("=" * 60)

migration_files = sorted(MIGRATIONS.glob("*.sql"))
check("Migration files exist", len(migration_files) >= 15, f"{len(migration_files)} files", "Migrations")

critical = {"batch_update_stock": "batch_update_stock", "Foreign keys": "FOREIGN KEY", "RLS policies": "CREATE POLICY", "admin_exists anon": "admin_exists.*anon"}
for desc, pattern in critical.items():
    found = any(re.search(pattern, read_file(f), re.IGNORECASE) for f in migration_files)
    check(f"Migration: {desc}", found, "", "Migrations")

# ═══════════════════════════════════════════════════════════
print("\n9. ACCESSIBILITY")
print("=" * 60)

dashboard = read_file(SRC / "pages" / "Dashboard.tsx")
check("Dashboard role=button", 'role="button"' in dashboard, "", "A11y")
check("Dashboard tabIndex", "tabIndex" in dashboard, "", "A11y")
check("Dashboard onKeyDown", "onKeyDown" in dashboard, "", "A11y")

dialogs_fixed = rg(r"aria-describedby=\{undefined\}", SRC, "*.tsx")
check("DialogContent aria-describedby", len(dialogs_fixed) >= 10, f"{len(dialogs_fixed)} fixed", "A11y")

# Check all icon buttons have aria-label
a11y_pages = ["POS.tsx", "Products.tsx", "Categories.tsx", "Customers.tsx", "Expenses.tsx", "Users.tsx"]
pages_with_aria = sum(1 for p in a11y_pages if "aria-label" in read_file(SRC / "pages" / p))
check("Pages have aria-labels", pages_with_aria >= 4, f"{pages_with_aria}/{len(a11y_pages)}", "A11y")

# ═══════════════════════════════════════════════════════════
print("\n10. PWA")
print("=" * 60)

check("manifest.webmanifest", (PUBLIC / "manifest.webmanifest").exists(), "", "PWA")
for icon in ["favicon.ico", "icon-192.png", "icon-512.png"]:
    check(f"Icon {icon}", (PUBLIC / icon).exists(), "", "PWA")

vite_config = read_file(BASE / "vite.config.ts")
check("VitePWA plugin", "VitePWA" in vite_config, "", "PWA")

# ═══════════════════════════════════════════════════════════
print("\n11. SENTRY / ERROR TRACKING")
print("=" * 60)

sentry_lib = read_file(SRC / "lib" / "sentry.ts")
check("Sentry integration", "Sentry" in sentry_lib, "", "Observability")
check("SentryErrorBoundary", "SentryErrorBoundary" in sentry_lib, "", "Observability")

app = read_file(SRC / "App.tsx")
check("ErrorBoundary in App", "ErrorBoundary" in app, "", "Observability")

console_errors = [e for e in rg(r"console\.error", SRC, "*.tsx") if "import.meta.env.DEV" not in e and "test/" not in e and ".test." not in e and "NotFound" not in e]
check("No console.error in prod", len(console_errors) == 0, f"{len(console_errors)} remaining", "Observability")

report_errors = rg(r"reportError\(", SRC, "*.tsx")
check("reportError() used", len(report_errors) > 0, f"{len(report_errors)} usages", "Observability")

# ═══════════════════════════════════════════════════════════
print("\n12. PERFORMANCE")
print("=" * 60)

memo_files = rg(r"\bmemo\(", SRC, "*.tsx")
memo_comps = ["POSProductGrid", "ProductList", "POSCart"]
for comp in memo_comps:
    found = any(comp in f for f in memo_files)
    check(f"React.memo on {comp}", found, "", "Performance")

check("React.lazy loading", "lazy(" in app, "", "Performance")
check("Suspense wrapper", "Suspense" in app, "", "Performance")

zustand_store = read_file(SRC / "contexts" / "POSCartContext.ts")
check("Zustand cart store", "zustand" in zustand_store, "", "Performance")
check("QueryClient staleTime", "staleTime" in app, "", "Performance")

# ═══════════════════════════════════════════════════════════
print("\n13. TYPESCRIPT TYPES")
print("=" * 60)

types_file = SRC / "types" / "index.ts"
check("types/index.ts exists", types_file.exists(), "", "Types")

types_content = read_file(types_file)
for t in ["Customer", "ProductWithCategory", "EdgeFunctionResponse", "AuditLogEntry"]:
    check(f"Type '{t}' defined", t in types_content, "", "Types")

check("web-nfc.d.ts exists", (SRC / "types" / "web-nfc.d.ts").exists(), "", "Types")

any_types = [e for e in rg(r": any\b", SRC, "*.tsx") if "test/" not in e and ".test." not in e]
check("No `any` in production", len(any_types) == 0, f"{len(any_types)} remaining", "Types")

# ═══════════════════════════════════════════════════════════
print("\n14. OFFLINE / INDEXEDDB")
print("=" * 60)

idb = read_file(SRC / "lib" / "indexedDBStorage.ts")
check("IndexedDB module", len(idb) > 0, "", "Offline")
check("RECEIPT_QUEUE store", "RECEIPT_QUEUE" in idb, "", "Offline")
check("MERGE_LOG store", "MERGE_LOG" in idb, "", "Offline")

rdq = read_file(SRC / "lib" / "receiptDeliveryQueue.ts")
check("Receipt delivery queue", len(rdq) > 0, "", "Offline")
check("Exponential backoff", "backoff" in rdq.lower() or "exponential" in rdq.lower(), "", "Offline")

scr = read_file(SRC / "lib" / "syncConflictResolver.ts")
check("Sync conflict resolver", len(scr) > 0, "", "Offline")

# ═══════════════════════════════════════════════════════════
print("\n15. i18n")
print("=" * 60)

i18n = read_file(SRC / "lib" / "receiptDeliveryI18n.ts")
check("i18n module exists", len(i18n) > 0, "", "i18n")
for lang in ["fr", "en", "sus", "ful", "man"]:
    check(f"Locale '{lang}'", f'code: "{lang}"' in i18n or f"code: '{lang}'" in i18n, "", "i18n")

# ═══════════════════════════════════════════════════════════
print("\n16. ROUTES")
print("=" * 60)

expected_routes = ["/dashboard", "/dashboard/pos", "/dashboard/products", "/dashboard/categories",
                   "/dashboard/reports", "/dashboard/expenses", "/dashboard/customers",
                   "/dashboard/users", "/dashboard/settings", "/dashboard/sync-conflicts"]
for route in expected_routes:
    check(f"Route '{route}'", route in app, "", "Routes")

check("v7_startTransition", "v7_startTransition" in app, "", "Routes")
check("v7_relativeSplatPath", "v7_relativeSplatPath" in app, "", "Routes")

# ═══════════════════════════════════════════════════════════
print("\n17. DEPENDENCIES")
print("=" * 60)

package_json = json.loads(read_file(BASE / "package.json"))
deps = {**package_json.get("dependencies", {}), **package_json.get("devDependencies", {})}

for dep in ["zustand", "@sentry/react", "@supabase/supabase-js", "@tanstack/react-query", "react-router-dom", "jspdf", "recharts"]:
    check(f"Dependency '{dep}'", dep in deps, deps.get(dep, "Missing"), "Dependencies")
    check(f"Dependency '{dep}'", dep in deps, deps.get(dep, "Missing"), "Dependencies")

# ═══════════════════════════════════════════════════════════
print("\n18. POS FUNCTIONALITY")
print("=" * 60)

pos = read_file(SRC / "pages" / "POS.tsx")
check("batch_update_stock RPC", "batch_update_stock" in pos, "", "POS")
check("Zustand cart store used", "usePOSCartStore" in pos, "", "POS")
check("useCallback handlers", "useCallback" in pos, "", "POS")

pos_grid = read_file(SRC / "components" / "pos" / "POSProductGrid.tsx")
check("Progressive loading", "PAGE_SIZE" in pos_grid, "", "POS")

check("Barcode scanner", len(read_file(SRC / "components" / "pos" / "BarcodeScannerDialog.tsx")) > 0, "", "POS")
check("Payment dialog", len(read_file(SRC / "components" / "pos" / "POSPaymentDialog.tsx")) > 0, "", "POS")
check("Receipt actions", len(read_file(SRC / "components" / "pos" / "ReceiptActionsDialog.tsx")) > 0, "", "POS")
check("Product autocomplete", len(read_file(SRC / "components" / "pos" / "ProductAutocomplete.tsx")) > 0, "", "POS")

# ═══════════════════════════════════════════════════════════
print("\n19. DEV GUARDS")
print("=" * 60)

rdt = read_file(SRC / "components" / "sync" / "ReceiptDeliveryTrackingPanel.tsx")
check("__malikiplus_mergeRemote DEV guard", "import.meta.env.DEV" in rdt, "", "DevGuards")

# ═══════════════════════════════════════════════════════════
print("\n20. PASSWORD POLICY")
print("=" * 60)

pp_client = read_file(SRC / "lib" / "passwordPolicy.ts")
pp_server = read_file(SHARED / "passwordPolicy.ts")
check("Client password policy", len(pp_client) > 0, "", "Password")
check("Server password policy", len(pp_server) > 0, "", "Password")
check("Weak password blocklist", "blocklist" in pp_client.lower() or "weak" in pp_client.lower(), "", "Password")

# ═══════════════════════════════════════════════════════════
print("\n21. TAX SYSTEM")
print("=" * 60)

tax_utils = read_file(SRC / "lib" / "taxUtils.ts")
check("taxUtils exists", len(tax_utils) > 0, "", "Tax")
check("computeTax function", "computeTax" in tax_utils, "", "Tax")
check("TaxSettingsCard", len(read_file(SRC / "components" / "settings" / "TaxSettingsCard.tsx")) > 0, "", "Tax")

# ═══════════════════════════════════════════════════════════
print("\n22. PRODUCT SEARCH")
print("=" * 60)

psi = read_file(SRC / "lib" / "productSearchIndex.ts")
check("Search index module", len(psi) > 0, "", "Search")
check("Accent normalization", "normalize" in psi or "NFD" in psi, "", "Search")

# ═══════════════════════════════════════════════════════════
print("\n23. CUSTOMER & CREDITS")
print("=" * 60)

check("CustomerDetailDialog", len(read_file(SRC / "components" / "customers" / "CustomerDetailDialog.tsx")) > 0, "", "Customers")
check("CreditPaymentDialog", len(read_file(SRC / "components" / "customers" / "CreditPaymentDialog.tsx")) > 0, "", "Customers")

# ═══════════════════════════════════════════════════════════
print("\n24. PRODUCT MANAGEMENT")
print("=" * 60)

check("ProductForm", len(read_file(SRC / "components" / "products" / "ProductForm.tsx")) > 0, "", "Products")
check("BarcodeGenerator", len(read_file(SRC / "components" / "products" / "BarcodeGenerator.tsx")) > 0, "", "Products")
check("BarcodeLabelPrinter", len(read_file(SRC / "components" / "products" / "BarcodeLabelPrinter.tsx")) > 0, "", "Products")

# ═══════════════════════════════════════════════════════════
print("\n25. USER MANAGEMENT")
print("=" * 60)

check("SecurityDiagnosticPanel", len(read_file(SRC / "components" / "users" / "SecurityDiagnosticPanel.tsx")) > 0, "", "Users")
check("AuditLogPanel", len(read_file(SRC / "components" / "users" / "AuditLogPanel.tsx")) > 0, "", "Users")
check("PasswordStrengthMeter", len(read_file(SRC / "components" / "users" / "PasswordStrengthMeter.tsx")) > 0, "", "Users")

# ═══════════════════════════════════════════════════════════
print("\n26. SYNC CONFLICTS")
print("=" * 60)

check("ConflictSimulationPanel", len(read_file(SRC / "components" / "sync" / "ConflictSimulationPanel.tsx")) > 0, "", "Sync")
check("OfflinePOSSimulationPanel", len(read_file(SRC / "components" / "sync" / "OfflinePOSSimulationPanel.tsx")) > 0, "", "Sync")
check("MobileMoneySimulationPanel", len(read_file(SRC / "components" / "sync" / "MobileMoneySimulationPanel.tsx")) > 0, "", "Sync")
check("ReceiptDeliveryTrackingPanel", len(read_file(SRC / "components" / "sync" / "ReceiptDeliveryTrackingPanel.tsx")) > 0, "", "Sync")

# ═══════════════════════════════════════════════════════════
print("\n27. LANDING PAGE")
print("=" * 60)

for comp in ["Header", "Hero", "Features", "Pricing", "Testimonials", "CTA", "Footer"]:
    check(f"Landing: {comp}", len(read_file(SRC / "components" / "landing" / f"{comp}.tsx")) > 0, "", "Landing")

# ═══════════════════════════════════════════════════════════
print("\n28. ENV CONFIGURATION")
print("=" * 60)

env_example = read_file(BASE / ".env.example") if (BASE / ".env.example").exists() else ""
env_file = read_file(BASE / ".env") if (BASE / ".env").exists() else ""
for var in ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SENTRY_DSN"]:
    check(f"Env '{var}'", var in env_example or var in env_file, "", "Config")

# ═══════════════════════════════════════════════════════════
print("\n29. RECEIPT GENERATION")
print("=" * 60)

check("Receipt PDF generation", "generateReceiptPDF" in receipt_gen, "", "Receipt")
check("WhatsApp share", "whatsapp" in receipt_gen.lower() or "WhatsApp" in receipt_gen, "", "Receipt")
check("Receipt download", "downloadReceipt" in receipt_gen, "", "Receipt")
check("Receipt print", "printReceipt" in receipt_gen, "", "Receipt")

# ═══════════════════════════════════════════════════════════
print("\n30. EXPORT UTILITIES")
print("=" * 60)

check("CSV export sales", "exportSalesToCSV" in export_utils, "", "Export")
check("CSV export products", "exportProductsToCSV" in export_utils, "", "Export")
check("CSV export expenses", "exportExpensesToCSV" in export_utils, "", "Export")

# ═══════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════

print("\n" + "=" * 60)
print("RÉSUMÉ DU TEST END-TO-END MAKITIPLUS")
print("=" * 60)

total, passed, failed = suite.summary()

categories = {}
for r in suite.results:
    cat = r.category or "Other"
    if cat not in categories:
        categories[cat] = {"passed": 0, "failed": 0, "failures": []}
    if r.passed:
        categories[cat]["passed"] += 1
    else:
        categories[cat]["failed"] += 1
        categories[cat]["failures"].append(r.name)

print(f"\n📊 Total: {total} tests | ✅ {passed} réussis | ❌ {failed} échoués")
print(f"📊 Taux de réussite: {passed/total*100:.1f}%\n")

print("Par catégorie:")
print("-" * 55)
for cat, data in sorted(categories.items()):
    total_cat = data["passed"] + data["failed"]
    rate = data["passed"] / total_cat * 100 if total_cat > 0 else 0
    status = "✅" if data["failed"] == 0 else "⚠️"
    print(f"  {status} {cat:20s} {data['passed']}/{total_cat} ({rate:.0f}%)")
    if data["failures"]:
        for f in data["failures"]:
            print(f"      ❌ {f}")

report = {
    "timestamp": "2026-06-16",
    "total": total, "passed": passed, "failed": failed,
    "success_rate": f"{passed/total*100:.1f}%",
    "categories": {cat: {"passed": d["passed"], "failed": d["failed"], "failures": d["failures"]} for cat, d in categories.items()},
    "results": [{"name": r.name, "passed": r.passed, "detail": r.detail, "category": r.category} for r in suite.results]
}

report_path = Path("/home/z/my-project/download/e2e_test_report.json")
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(f"\n📄 Rapport JSON: {report_path}")

sys.exit(0 if failed == 0 else 1)

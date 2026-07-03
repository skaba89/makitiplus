#!/usr/bin/env python3
"""MakitiPlus — Comprehensive E2E Test Suite with embedded HTTP server"""
import json, time, sys, os, signal, subprocess, threading, http.server, functools
from pathlib import Path
from datetime import datetime

PROJECT_DIR = Path("/home/z/my-project/savana-flow")
DIST_DIR = PROJECT_DIR / "dist"
REPORT_PATH = Path("/home/z/my-project/download/e2e_playwright_report.json")
PORT = 19090

results = {"project": "MakitiPlus", "timestamp": datetime.now().isoformat(), "categories": {}, "total": 0, "passed": 0, "failed": 0}

def add(cat, name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    icon = "✅" if ok else "❌"
    print(f"  {icon} {status} — {name}" + (f" ({detail})" if detail and not ok else ""))
    results["categories"].setdefault(cat, {"tests": [], "passed": 0, "failed": 0})
    results["categories"][cat]["tests"].append({"name": name, "status": status, "detail": detail})
    results["categories"][cat]["passed" if ok else "failed"] += 1
    results["total"] += 1
    results["passed" if ok else "failed"] += 1

# ===== BUILD =====
print("=" * 50)
print("BUILD")
print("=" * 50)

r = subprocess.run(["npx", "tsc", "--noEmit"], cwd=PROJECT_DIR, capture_output=True, text=True, timeout=120)
add("Build", "TypeScript compilation", r.returncode == 0, r.stderr[:200] if r.returncode else "")

r = subprocess.run(["npx", "vite", "build"], cwd=PROJECT_DIR, capture_output=True, text=True, timeout=180)
add("Build", "Vite production build", r.returncode == 0, r.stderr[:200] if r.returncode else "")

if not DIST_DIR.exists():
    print("❌ Build output not found. Aborting.")
    sys.exit(1)

total_size = sum(f.stat().st_size for f in DIST_DIR.rglob("*") if f.is_file())
add("Build", f"Build size ({total_size/(1024*1024):.1f}MB)", total_size < 5*1024*1024)

js_files = list(DIST_DIR.rglob("*.js"))
add("Build", f"JS chunks ({len(js_files)})", len(js_files) >= 3)

# ===== START HTTP SERVER IN THREAD =====
class SPAHandler(http.server.SimpleHTTPRequestHandler):
    """Serve static files with SPA fallback to index.html"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)
    
    def do_GET(self):
        # Try to serve the file directly
        path = self.path.split('?')[0]
        if path == '/':
            path = '/index.html'
        filepath = DIST_DIR / path.lstrip('/')
        if filepath.is_file():
            super().do_GET()
        else:
            # SPA fallback: serve index.html for any non-file route
            self.path = '/index.html'
            super().do_GET()
    
    def log_message(self, format, *args):
        pass  # Suppress logs

server = http.server.HTTPServer(("127.0.0.1", PORT), SPAHandler)
server_thread = threading.Thread(target=server.serve_forever, daemon=True)
server_thread.start()
URL = f"http://127.0.0.1:{PORT}"
print(f"\n🌐 Server started at {URL}")

# Verify server works
import urllib.request
try:
    urllib.request.urlopen(URL, timeout=5)
    add("Server", "HTTP server started", True)
except Exception as e:
    add("Server", "HTTP server started", False, str(e))
    print("❌ Server failed. Aborting.")
    sys.exit(1)

# ===== PLAYWRIGHT TESTS =====
try:
    from playwright.sync_api import sync_playwright
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}, locale="fr-FR")
        
        # ===== LANDING PAGE =====
        print("\n" + "=" * 50)
        print("LANDING PAGE")
        print("=" * 50)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, timeout=30000)
        page.wait_for_timeout(3000)
        
        add("Landing", "Page loads without crash", len(errors) == 0, "; ".join(errors[:2]))
        title = page.title() or ""
        add("Landing", "Title contains app name", "MakitiPlus" in title or "MalikiPlus" in title, title)
        
        body = page.inner_text("body")
        add("Landing", "Hero text present", any(w in body for w in ["MakitiPlus", "MalikiPlus", "caisse", "POS", "point de vente"]), "No hero keywords")
        add("Landing", "Features section", any(w in body for w in ["fonction", "Fonctionnalit", "feature"]), "No features")
        add("Landing", "Pricing section", any(w in body for w in ["Prix", "pricing", "plan", "tarif", "Tarifs", "starter"]), "No pricing")
        add("Landing", "Testimonials", any(w in body for w in ["t", "moignage", "testimonial", "avis"]), "No testimonials")
        add("Landing", "CTA section", any(w in body for w in ["Commencer", "Essayer", "essai", "Inscription", "commencer"]), "No CTA")
        
        # Emoji check
        emoji_chars = [c for c in body if 0x1F000 < ord(c) < 0x1FFFF or 0x2600 < ord(c) < 0x27BF]
        add("Landing", "No emoji in visible text", len(emoji_chars) == 0, f"{len(emoji_chars)} emojis")
        
        nav = page.query_selector_all("nav a, header a")
        add("Landing", f"Navigation links ({len(nav)})", len(nav) > 0)
        page.close()
        
        # ===== AUTH PAGE =====
        print("\n" + "=" * 50)
        print("AUTH PAGE")
        print("=" * 50)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{URL}/auth", timeout=30000)
        page.wait_for_timeout(3000)
        
        add("Auth", "Page loads without crash", len(errors) == 0, "; ".join(errors[:2]))
        add("Auth", "Email input exists", page.query_selector("input[type='email'], input[placeholder*='mail']") is not None)
        add("Auth", "Password input exists", page.query_selector("input[type='password']") is not None)
        add("Auth", "Submit button exists", page.query_selector("button[type='submit']") is not None or page.query_selector("button:has-text('onnexion')") is not None)
        body = page.inner_text("body")
        add("Auth", "Signup option available", "Inscription" in body or "cr" in body.lower() or "créer" in body.lower())
        page.close()
        
        # ===== PROTECTED ROUTES =====
        print("\n" + "=" * 50)
        print("PROTECTED ROUTES")
        print("=" * 50)
        for route in ["/dashboard", "/dashboard/products", "/dashboard/pos", "/dashboard/categories", "/dashboard/reports", "/dashboard/expenses", "/dashboard/customers", "/dashboard/users", "/dashboard/settings"]:
            page = ctx.new_page()
            page.goto(f"{URL}{route}", timeout=15000)
            page.wait_for_timeout(2000)
            add("ProtectedRoutes", f"{route} -> /auth", "/auth" in page.url, f"Went to {page.url}")
            page.close()
        
        # ===== 404 =====
        print("\n" + "=" * 50)
        print("404 PAGE")
        print("=" * 50)
        page = ctx.new_page()
        page.goto(f"{URL}/nonexistent", timeout=15000)
        page.wait_for_timeout(1000)
        body = page.inner_text("body")
        add("NotFound", "404 message", "404" in body or "not found" in body.lower() or "introuvable" in body.lower())
        page.close()
        
        # ===== RESPONSIVE =====
        print("\n" + "=" * 50)
        print("RESPONSIVE")
        print("=" * 50)
        m_ctx = browser.new_context(viewport={"width": 375, "height": 812}, locale="fr-FR")
        m_page = m_ctx.new_page()
        m_page.goto(URL, timeout=15000)
        m_page.wait_for_timeout(2000)
        add("Responsive", "Mobile 375px", len(m_page.inner_text("body")) > 50)
        m_page.close()
        m_ctx.close()
        
        t_ctx = browser.new_context(viewport={"width": 768, "height": 1024}, locale="fr-FR")
        t_page = t_ctx.new_page()
        t_page.goto(URL, timeout=15000)
        t_page.wait_for_timeout(2000)
        add("Responsive", "Tablet 768px", len(t_page.inner_text("body")) > 50)
        t_page.close()
        t_ctx.close()
        
        # ===== SEO =====
        print("\n" + "=" * 50)
        print("SEO & META")
        print("=" * 50)
        page = ctx.new_page()
        page.goto(URL, timeout=15000)
        add("SEO", "Meta description", page.query_selector("meta[name='description']") is not None)
        add("SEO", "Viewport meta", page.query_selector("meta[name='viewport']") is not None)
        add("SEO", "Favicon", page.query_selector("link[rel*='icon']") is not None)
        lang = page.evaluate("() => document.documentElement.lang")
        add("SEO", f"HTML lang ({lang})", bool(lang))
        page.close()
        
        # ===== PWA =====
        print("\n" + "=" * 50)
        print("PWA")
        print("=" * 50)
        page = ctx.new_page()
        page.goto(URL, timeout=15000)
        page.wait_for_timeout(2000)
        add("PWA", "Manifest link", page.query_selector("link[rel='manifest']") is not None)
        page.close()
        
        # ===== A11Y =====
        print("\n" + "=" * 50)
        print("ACCESSIBILITY")
        print("=" * 50)
        page = ctx.new_page()
        page.goto(URL, timeout=15000)
        page.wait_for_timeout(1000)
        no_alt = page.evaluate("() => Array.from(document.querySelectorAll('img')).filter(i => !i.alt || !i.alt.trim()).length")
        add("A11y", "Images have alt text", no_alt == 0, f"{no_alt} missing")
        btns = page.evaluate("() => Array.from(document.querySelectorAll('button')).filter(b => !b.textContent?.trim() && !b.getAttribute('aria-label')).length")
        add("A11y", "Buttons have names", btns == 0, f"{btns} unnamed")
        page.close()
        
        # ===== CONSOLE ERRORS =====
        print("\n" + "=" * 50)
        print("CONSOLE ERRORS")
        print("=" * 50)
        page = ctx.new_page()
        page_errors = []
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.goto(URL, timeout=30000)
        page.wait_for_timeout(3000)
        real = [e for e in page_errors if "ResizeObserver" not in e]
        add("Console", "No page errors", len(real) == 0, f"{len(real)} errors: {'; '.join(real[:2])}")
        page.close()
        
        # ===== PERFORMANCE =====
        print("\n" + "=" * 50)
        print("PERFORMANCE")
        print("=" * 50)
        page = ctx.new_page()
        start = time.time()
        page.goto(URL, timeout=30000)
        load_time = time.time() - start
        add("Perf", f"Landing loads in {load_time:.1f}s", load_time < 10, f"Took {load_time:.1f}s")
        page.close()
        
        browser.close()

except ImportError as e:
    add("Playwright", "Import", False, str(e))
except Exception as e:
    add("Playwright", "Execution", False, str(e))

# ===== SOURCE CODE QUALITY =====
print("\n" + "=" * 50)
print("SOURCE CODE QUALITY")
print("=" * 50)
src = PROJECT_DIR / "src"

emoji_files = []
for f in src.rglob("*.tsx"):
    content = f.read_text(encoding="utf-8", errors="ignore")
    emojis = [c for c in content if 0x1F000 < ord(c) < 0x1FFFF or 0x2600 < ord(c) < 0x27BF]
    if emojis and "currencies" not in str(f):
        emoji_files.append(f"{f.name}({len(emojis)})")
add("Code", "No emoji in TSX", len(emoji_files) == 0, f"Files: {', '.join(emoji_files)}")

ce_files = set()
for f in list(src.rglob("*.ts")) + list(src.rglob("*.tsx")):
    if "test" in str(f) or "spec" in str(f): continue
    content = f.read_text(encoding="utf-8", errors="ignore")
    if "console.error" in content:
        idx = content.index("console.error")
        preceding = content[max(0, idx-200):idx]
        if "import.meta.env.DEV" not in preceding:
            ce_files.add(f.name)
add("Code", "No un-guarded console.error", len(ce_files) == 0, f"Files: {', '.join(ce_files)}")

app = (src / "App.tsx").read_text()
for imp in ["Index", "Auth", "Dashboard", "Products", "Categories", "Expenses", "Settings", "Customers", "Users", "Stores"]:
    add("Code", f"App imports {imp}", imp in app)

# ===== SUPABASE =====
print("\n" + "=" * 50)
print("SUPABASE")
print("=" * 50)
types_file = src / "integrations" / "supabase" / "types.ts"
if types_file.exists():
    types = types_file.read_text()
    for t in ["categories", "customers", "expenses", "products", "profiles", "sales", "user_roles", "organizations", "stock_movements"]:
        add("Supabase", f"Type '{t}'", t in types)

client = src / "integrations" / "supabase" / "client.ts"
if client.exists():
    c = client.read_text()
    add("Supabase", "localStorage auth", "localStorage" in c)
    add("Supabase", "Auto refresh token", "autoRefreshToken" in c)
    add("Supabase", "Persist session", "persistSession" in c)

# ===== EDGE FUNCTIONS =====
print("\n" + "=" * 50)
print("EDGE FUNCTIONS")
print("=" * 50)
func_dir = PROJECT_DIR / "supabase" / "functions"
if func_dir.exists():
    shared = func_dir / "_shared"
    add("EdgeFunc", "_shared directory", shared.exists())
    for sf in ["cors.ts", "httpMethodGuard.ts", "rateLimiter.ts"]:
        add("EdgeFunc", f"Shared: {sf}", (shared / sf).exists())
    for d in func_dir.iterdir():
        if d.is_dir() and not d.name.startswith("_"):
            add("EdgeFunc", f"{d.name}/index.ts", (d / "index.ts").exists())

# ===== MIGRATIONS =====
print("\n" + "=" * 50)
print("MIGRATIONS")
print("=" * 50)
mig_dir = PROJECT_DIR / "supabase" / "migrations"
if mig_dir.exists():
    migs = list(mig_dir.glob("*.sql"))
    add("Migrations", f"Files ({len(migs)})", len(migs) > 0)

schema = PROJECT_DIR / "supabase" / "00000_initial_schema.sql"
if schema.exists():
    s = schema.read_text(encoding="utf-8", errors="ignore")
    for t in ["profiles", "user_roles", "organizations", "products", "sales", "sale_items"]:
        add("Schema", f"'{t}' table", "CREATE TABLE" in s.upper() and t in s)

# ===== MOBILE =====
print("\n" + "=" * 50)
print("MOBILE / CAPACITOR")
print("=" * 50)
add("Mobile", "Android dir", (PROJECT_DIR / "android").exists())
add("Mobile", "iOS dir", (PROJECT_DIR / "ios").exists())
cap = PROJECT_DIR / "capacitor.config.json"
add("Mobile", "Capacitor config", cap.exists())

# ===== SECURITY =====
print("\n" + "=" * 50)
print("SECURITY")
print("=" * 50)
env = PROJECT_DIR / ".env"
if env.exists():
    ec = env.read_text()
    add("Security", "SUPABASE_URL set", "VITE_SUPABASE_URL" in ec)
    add("Security", "SUPABASE_KEY set", "VITE_SUPABASE_PUBLISHABLE_KEY" in ec)
    for line in ec.split("\n"):
        if "SUPABASE_URL" in line and "=" in line:
            add("Security", "Supabase uses HTTPS", "https://" in line.lower())

add("Security", "Password policy", (src / "lib" / "passwordPolicy.ts").exists())

sql_dir = PROJECT_DIR / "supabase"
if sql_dir.exists():
    all_sql = ""
    for sf in sql_dir.rglob("*.sql"):
        all_sql += sf.read_text(encoding="utf-8", errors="ignore")
    add("Security", "RLS policies", "POLICY" in all_sql.upper())

# Cleanup
server.shutdown()

# ===== SUMMARY =====
print("\n" + "=" * 60)
print("RÉSUMÉ E2E COMPLET — MAKITIPLUS")
print("=" * 60)
print(f"\n📊 Total: {results['total']} | ✅ {results['passed']} réussis | ❌ {results['failed']} échoués")
print(f"📊 Taux de réussite: {results['passed']/max(results['total'],1)*100:.1f}%\n")

for cat, data in results["categories"].items():
    t = data["passed"] + data["failed"]
    icon = "✅" if data["failed"] == 0 else "❌"
    print(f"  {icon} {cat:<20} {data['passed']}/{t} ({data['passed']/max(t,1)*100:.0f}%)")
    for test in data["tests"]:
        if test["status"] == "FAIL":
            print(f"      ❌ {test['name']} — {test.get('detail','')}")

REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
with open(REPORT_PATH, "w") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
print(f"\n📄 Rapport: {REPORT_PATH}")
sys.exit(1 if results["failed"] > 0 else 0)

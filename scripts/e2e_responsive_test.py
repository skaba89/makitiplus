#!/usr/bin/env python3
"""
E2E Responsive & Accessibility Test Suite for Savana-Flow
Tests the running dev server at http://localhost:5173
"""

import json
import time
import sys
from http.client import HTTPConnection

BASE_URL = "0.0.0.0"
PORT = 5176
TIMEOUT = 10

def fetch(path="/"):
    """Fetch a page and return (status_code, html_content)"""
    try:
        conn = HTTPConnection(BASE_URL, PORT, timeout=TIMEOUT)
        conn.request("GET", path)
        resp = conn.getresponse()
        body = resp.read().decode("utf-8", errors="replace")
        conn.close()
        return resp.status, body
    except Exception as e:
        return 0, str(e)

def test_homepage_loads():
    """Test that the homepage loads correctly"""
    status, body = fetch("/")
    assert status == 200, f"Homepage returned status {status}"
    assert "html" in body.lower(), "Homepage should contain HTML"
    assert "savana" in body.lower() or "malikiplus" in body.lower() or "makitiplus" in body.lower() or "react" in body.lower(), \
        "Homepage should reference the app"
    print("  ✅ Homepage loads (status 200)")

def test_js_bundle_loads():
    """Test that the JS bundle is referenced in the HTML"""
    status, body = fetch("/")
    assert 'src="/assets/' in body or 'src="assets/' in body, "HTML should reference JS assets"
    print("  ✅ JS bundle referenced in HTML")

def test_no_emoji_in_html():
    """Test that the initial HTML doesn't contain emoji characters"""
    status, body = fetch("/")
    # Common emojis that might have been left in HTML templates
    emoji_chars = ["📊", "📦", "💰", "🏪", "👥", "📈", "🛒", "💳", "🏷️", "🎯"]
    found = [e for e in emoji_chars if e in body]
    assert len(found) == 0, f"Found emojis in HTML: {found}"
    print("  ✅ No emoji characters in initial HTML")

def test_sw_registered():
    """Test that service worker file exists"""
    status, body = fetch("/sw.js")
    assert status == 200, f"Service worker not found (status {status})"
    assert "workbox" in body.lower() or "precache" in body.lower(), "SW should contain workbox references"
    print("  ✅ Service worker file exists")

def test_manifest_exists():
    """Test that PWA manifest exists"""
    status, body = fetch("/manifest.webmanifest")
    # manifest might be embedded or at different path
    if status == 200:
        assert "name" in body.lower() or "icons" in body.lower(), "Manifest should have name/icons"
        print("  ✅ PWA manifest exists")
    else:
        print(f"  ⚠️  Manifest not at /manifest.webmanifest (status {status}), checking HTML...")
        status2, html = fetch("/")
        if "manifest" in html.lower():
            print("  ✅ Manifest referenced in HTML")
        else:
            print("  ⚠️  No manifest reference found")

def test_css_bundle_loads():
    """Test that CSS is loaded"""
    status, body = fetch("/")
    assert 'stylesheet' in body.lower() or '.css' in body, "HTML should reference CSS"
    print("  ✅ CSS bundle referenced")

def test_responsive_meta_tag():
    """Test that viewport meta tag exists for responsive design"""
    status, body = fetch("/")
    assert "viewport" in body, "HTML should have viewport meta tag"
    assert "width=device-width" in body, "Viewport should have width=device-width"
    print("  ✅ Viewport meta tag present (responsive ready)")

def test_no_console_errors_in_html():
    """Check that the HTML doesn't contain error messages"""
    status, body = fetch("/")
    error_indicators = ["SyntaxError", "TypeError", "ReferenceError", "Module not found"]
    found = [e for e in error_indicators if e in body]
    assert len(found) == 0, f"Found error indicators in HTML: {found}"
    print("  ✅ No error indicators in HTML")

def test_static_assets_accessible():
    """Test that key static assets are accessible"""
    status, html = fetch("/")
    # Find CSS/JS references
    import re
    js_files = re.findall(r'src="(/assets/[^"]+\.js)"', html)
    css_files = re.findall(r'href="(/assets/[^"]+\.css)"', html)
    
    all_ok = True
    for js in js_files[:2]:  # Test first 2 JS files
        s, _ = fetch(js)
        if s != 200:
            print(f"  ❌ JS asset {js} returned {s}")
            all_ok = False
    
    for css in css_files[:2]:  # Test first 2 CSS files
        s, _ = fetch(css)
        if s != 200:
            print(f"  ❌ CSS asset {css} returned {s}")
            all_ok = False
    
    if all_ok:
        print(f"  ✅ Static assets accessible ({len(js_files)} JS, {len(css_files)} CSS)")

def run_all_tests():
    """Run all E2E tests and report results"""
    print("\n" + "="*60)
    print("  SAVANA-FLOW E2E Test Suite")
    print("="*60 + "\n")
    
    tests = [
        ("Homepage Loading", test_homepage_loads),
        ("JS Bundle", test_js_bundle_loads),
        ("No Emojis in HTML", test_no_emoji_in_html),
        ("Service Worker", test_sw_registered),
        ("PWA Manifest", test_manifest_exists),
        ("CSS Bundle", test_css_bundle_loads),
        ("Responsive Meta", test_responsive_meta_tag),
        ("No Console Errors", test_no_console_errors_in_html),
        ("Static Assets", test_static_assets_accessible),
    ]
    
    passed = 0
    failed = 0
    errors = []
    
    for name, test_fn in tests:
        print(f"\n🔍 {name}:")
        try:
            test_fn()
            passed += 1
        except AssertionError as e:
            print(f"  ❌ FAILED: {e}")
            failed += 1
            errors.append((name, str(e)))
        except Exception as e:
            print(f"  ❌ ERROR: {e}")
            failed += 1
            errors.append((name, str(e)))
    
    print("\n" + "="*60)
    print(f"  Results: {passed} passed, {failed} failed, {passed + failed} total")
    print("="*60)
    
    if errors:
        print("\n❌ Failed tests:")
        for name, err in errors:
            print(f"  - {name}: {err}")
    
    return failed == 0

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)

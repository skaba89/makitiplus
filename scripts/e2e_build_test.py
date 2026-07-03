#!/usr/bin/env python3
"""
E2E Build Verification Test Suite for Savana-Flow
Tests the production build output at /home/z/my-project/savana-flow/dist/
"""

import os
import re
import sys

DIST_DIR = "/home/z/my-project/savana-flow/dist"

def read_file(path):
    """Read a file and return its content"""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except FileNotFoundError:
        return None

def test_dist_exists():
    """Test that the dist directory exists"""
    assert os.path.isdir(DIST_DIR), f"Dist directory not found at {DIST_DIR}"
    print("  ✅ dist/ directory exists")

def test_index_html_exists():
    """Test that index.html exists and is valid"""
    html = read_file(os.path.join(DIST_DIR, "index.html"))
    assert html is not None, "index.html not found in dist/"
    assert "doctype" in html.lower(), "index.html should have doctype"
    assert "viewport" in html, "index.html should have viewport meta"
    assert "width=device-width" in html, "Viewport should have width=device-width"
    assert "lang=" in html, "HTML should have lang attribute"
    print("  ✅ index.html exists with viewport meta tag")

def test_js_bundles_exist():
    """Test that JS bundles are referenced and exist"""
    html = read_file(os.path.join(DIST_DIR, "index.html"))
    js_refs = re.findall(r'src="(/assets/[^"]+\.js)"', html)
    assert len(js_refs) > 0, "No JS bundles referenced in index.html"
    
    for js in js_refs:
        path = os.path.join(DIST_DIR, js.lstrip("/"))
        assert os.path.isfile(path), f"JS bundle not found: {js}"
    print(f"  ✅ {len(js_refs)} JS bundle(s) referenced and exist")

def test_css_bundles_exist():
    """Test that CSS bundles are referenced and exist"""
    html = read_file(os.path.join(DIST_DIR, "index.html"))
    css_refs = re.findall(r'href="(/assets/[^"]+\.css)"', html)
    assert len(css_refs) > 0, "No CSS bundles referenced in index.html"
    
    for css in css_refs:
        path = os.path.join(DIST_DIR, css.lstrip("/"))
        assert os.path.isfile(path), f"CSS bundle not found: {css}"
    print(f"  ✅ {len(css_refs)} CSS bundle(s) referenced and exist")

def test_no_emoji_in_html():
    """Test that the built HTML doesn't contain emoji characters"""
    html = read_file(os.path.join(DIST_DIR, "index.html"))
    emoji_chars = ["📊", "📦", "💰", "🏪", "👥", "📈", "🛒", "💳", "🏷️", "🎯"]
    found = [e for e in emoji_chars if e in html]
    assert len(found) == 0, f"Found emojis in HTML: {found}"
    print("  ✅ No emoji characters in built HTML")

def test_no_emoji_in_js():
    """Test that the JS bundles don't contain emoji characters"""
    emoji_chars = ["📊", "📦", "💰", "🏪", "👥", "📈", "🛒", "💳", "🏷️", "🎯"]
    
    html = read_file(os.path.join(DIST_DIR, "index.html"))
    js_refs = re.findall(r'src="(/assets/[^"]+\.js)"', html)
    
    found_any = []
    for js in js_refs:
        path = os.path.join(DIST_DIR, js.lstrip("/"))
        content = read_file(path)
        if content:
            found = [e for e in emoji_chars if e in content]
            if found:
                found_any.extend(found)
    
    assert len(found_any) == 0, f"Found emojis in JS: {found_any}"
    print("  ✅ No emoji characters in JS bundles")

def test_sw_exists():
    """Test that service worker exists"""
    sw = read_file(os.path.join(DIST_DIR, "sw.js"))
    assert sw is not None, "sw.js not found in dist/"
    assert "precache" in sw.lower() or "workbox" in sw.lower(), "SW should reference workbox/precache"
    print("  ✅ Service worker file exists")

def test_manifest_exists():
    """Test that PWA manifest exists"""
    # Check HTML for manifest link
    html = read_file(os.path.join(DIST_DIR, "index.html"))
    assert "manifest" in html.lower(), "HTML should reference manifest"
    
    # Try to find manifest file
    manifest_path = os.path.join(DIST_DIR, "manifest.webmanifest")
    if not os.path.isfile(manifest_path):
        # Check for .json manifest
        for root, dirs, files in os.walk(DIST_DIR):
            for f in files:
                if "manifest" in f:
                    manifest_path = os.path.join(root, f)
                    break
    
    if os.path.isfile(manifest_path):
        content = read_file(manifest_path)
        assert "name" in content or "icons" in content, "Manifest should have name/icons"
        print("  ✅ PWA manifest exists and is valid")
    else:
        print("  ⚠️  Manifest referenced but file not found (may be inline)")

def test_responsive_classes_in_css():
    """Test that CSS contains responsive media queries"""
    html = read_file(os.path.join(DIST_DIR, "index.html"))
    css_refs = re.findall(r'href="(/assets/[^"]+\.css)"', html)
    
    has_media_queries = False
    for css in css_refs:
        path = os.path.join(DIST_DIR, css.lstrip("/"))
        content = read_file(path)
        if content and ("@media" in content or "breakpoint" in content.lower()):
            has_media_queries = True
            break
    
    assert has_media_queries, "CSS should contain @media queries for responsive design"
    print("  ✅ CSS contains responsive media queries")

def test_no_build_errors():
    """Test that the build output doesn't contain error markers"""
    html = read_file(os.path.join(DIST_DIR, "index.html"))
    error_indicators = ["SyntaxError", "TypeError", "Module not found", "Build error"]
    found = [e for e in error_indicators if e in html]
    assert len(found) == 0, f"Found error indicators: {found}"
    print("  ✅ No build error markers in HTML")

def test_responsive_source_code():
    """Test that source files use responsive patterns"""
    src_dir = "/home/z/my-project/savana-flow/src"
    
    # Check for responsive Tailwind classes in key pages
    pages_to_check = [
        "pages/POS.tsx",
        "pages/Dashboard.tsx", 
        "pages/Customers.tsx",
        "pages/Stores.tsx",
        "pages/Users.tsx",
    ]
    
    responsive_patterns = ["sm:", "md:", "lg:", "xl:"]
    all_ok = True
    
    for page in pages_to_check:
        path = os.path.join(src_dir, page)
        content = read_file(path)
        if content:
            has_responsive = any(p in content for p in responsive_patterns)
            if not has_responsive:
                print(f"  ⚠️  {page} has no responsive classes")
                all_ok = False
    
    if all_ok:
        print("  ✅ All key pages use responsive Tailwind classes")

def test_no_hardcoded_widths():
    """Test that source files don't use hardcoded pixel widths in layout"""
    src_dir = "/home/z/my-project/savana-flow/src/pages"
    
    # This is a soft check - look for common anti-patterns
    problematic_patterns = [
        r'w-\[\d+px\]',  # w-[300px] etc - but some are OK like w-[200px] for max-width
    ]
    
    issues = []
    for root, dirs, files in os.walk(src_dir):
        for f in files:
            if f.endswith(".tsx"):
                content = read_file(os.path.join(root, f))
                # Only flag very large fixed widths (not max-w constraints)
                if content and "w-[800px]" in content or "w-[1000px]" in content:
                    issues.append(f)
    
    if not issues:
        print("  ✅ No problematic hardcoded widths in pages")
    else:
        print(f"  ⚠️  Some hardcoded widths found in: {issues}")

def run_all_tests():
    """Run all E2E build verification tests"""
    print("\n" + "="*60)
    print("  SAVANA-FLOW E2E Build Verification Suite")
    print("="*60 + "\n")
    
    tests = [
        ("Build Output Exists", test_dist_exists),
        ("index.html Valid", test_index_html_exists),
        ("JS Bundles", test_js_bundles_exist),
        ("CSS Bundles", test_css_bundles_exist),
        ("No Emojis in HTML", test_no_emoji_in_html),
        ("No Emojis in JS", test_no_emoji_in_js),
        ("Service Worker", test_sw_exists),
        ("PWA Manifest", test_manifest_exists),
        ("Responsive CSS", test_responsive_classes_in_css),
        ("No Build Errors", test_no_build_errors),
        ("Responsive Source", test_responsive_source_code),
        ("No Hardcoded Widths", test_no_hardcoded_widths),
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

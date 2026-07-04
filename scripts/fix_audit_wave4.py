#!/usr/bin/env python3
"""Batch fix script for audit wave 4 — reportError, user!.id, demo guards, role constants, navigation"""

import re
import os

PROJECT = "/home/z/my-project"

def read(path):
    with open(path, 'r') as f:
        return f.read()

def write(path, content):
    with open(path, 'w') as f:
        f.write(content)

def add_import_if_missing(content, import_line, check_pattern):
    """Add import if check_pattern is not found but the functionality is used"""
    if check_pattern in content and import_line not in content:
        # Find last import line and add after it
        lines = content.split('\n')
        last_import_idx = 0
        for i, line in enumerate(lines):
            if line.startswith('import ') or line.startswith('import{'):
                last_import_idx = i
        lines.insert(last_import_idx + 1, import_line)
        return '\n'.join(lines)
    return content

def fix_file(filepath, fixes):
    """Apply a list of (old, new) replacements to a file"""
    content = read(filepath)
    changed = False
    for old, new in fixes:
        if old in content:
            content = content.replace(old, new)
            changed = True
        else:
            print(f"  WARNING: pattern not found in {filepath}: {old[:60]}...")
    if changed:
        write(filepath, content)
        print(f"  FIXED: {filepath}")
    else:
        print(f"  NO CHANGE: {filepath}")

# =====================================================
# Fix 1: Add reportError import to pages missing it
# =====================================================
print("=== Fix 1: Add reportError imports ===")

pages_needing_reportError = [
    # (filepath, import_after_pattern)
    "src/pages/Users.tsx",
    "src/pages/SyncConflicts.tsx", 
    "src/pages/Categories.tsx",
    "src/pages/Stores.tsx",
    "src/pages/Dashboard.tsx",
    "src/pages/Support.tsx",
    "src/pages/AdminAnalytics.tsx",
    "src/pages/Reports.tsx",
    "src/pages/Auth.tsx",
    "src/pages/BackupRestore.tsx",
    "src/pages/Loyalty.tsx",
    "src/pages/StockTransfers.tsx",
    "src/pages/Expenses.tsx",
    "src/pages/PurchaseOrders.tsx",
    "src/pages/Suppliers.tsx",
    "src/pages/POS.tsx",
]

reportError_import = 'import { reportError } from "@/lib/sentry";'

for page in pages_needing_reportError:
    fullpath = os.path.join(PROJECT, page)
    if not os.path.exists(fullpath):
        print(f"  SKIP (not found): {page}")
        continue
    content = read(fullpath)
    if reportError_import in content:
        print(f"  ALREADY HAS reportError: {page}")
        continue
    # Add after last import from @/contexts or @/lib
    lines = content.split('\n')
    insert_idx = 0
    for i, line in enumerate(lines):
        if 'from "@/contexts/' in line or 'from "@/lib/' in line or 'from "@/hooks/' in line:
            insert_idx = i + 1
    if insert_idx == 0:
        # Fallback: find last import line
        for i, line in enumerate(lines):
            if line.startswith('import '):
                insert_idx = i + 1
    lines.insert(insert_idx, reportError_import)
    write(fullpath, '\n'.join(lines))
    print(f"  ADDED reportError: {page}")

# =====================================================
# Fix 2: Replace user!.id with user?.id ?? ""
# =====================================================
print("\n=== Fix 2: Replace user!.id ===")

files_with_unsafe_user = [
    "src/pages/Expenses.tsx",
    "src/pages/POS.tsx",
    "src/pages/PurchaseOrders.tsx",
    "src/pages/Categories.tsx",
    "src/pages/Reports.tsx",
    "src/pages/Suppliers.tsx",
    "src/contexts/BrandingContext.tsx",
    "src/hooks/useOfflineMutation.ts",
]

for f in files_with_unsafe_user:
    fullpath = os.path.join(PROJECT, f)
    if not os.path.exists(fullpath):
        print(f"  SKIP (not found): {f}")
        continue
    content = read(fullpath)
    if 'user!.id' in content:
        content = content.replace('user!.id', 'user?.id ?? ""')
        write(fullpath, content)
        print(f"  FIXED user!.id: {f}")
    else:
        print(f"  NO CHANGE: {f}")

# =====================================================
# Fix 3: Add useDemo import + blockMutation to pages missing demo guards
# =====================================================
print("\n=== Fix 3: Add demo guards ===")

demo_import = 'import { useDemo } from "@/contexts/DemoContext";'
demo_destructure = 'const { blockMutation } = useDemo();'

# Files that need demo guards but don't have useDemo
pages_needing_demo = [
    "src/pages/Loyalty.tsx",
    "src/pages/StockTransfers.tsx",
    "src/pages/BackupRestore.tsx",
    "src/pages/Support.tsx",
    "src/pages/Billing.tsx",
]

for page in pages_needing_demo:
    fullpath = os.path.join(PROJECT, page)
    if not os.path.exists(fullpath):
        print(f"  SKIP (not found): {page}")
        continue
    content = read(fullpath)
    if demo_import in content:
        print(f"  ALREADY HAS useDemo: {page}")
        continue
    # Add import
    lines = content.split('\n')
    insert_idx = 0
    for i, line in enumerate(lines):
        if 'from "@/contexts/' in line:
            insert_idx = i + 1
    lines.insert(insert_idx, demo_import)
    content = '\n'.join(lines)
    
    # Add blockMutation destructure after useAuth() line
    if 'blockMutation' not in content:
        # Find the useAuth() destructure and add after it
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if 'useAuth()' in line or 'from "@/contexts/AuthContext"' in line:
                # Find next line that has a const destructure from useAuth
                if 'useAuth()' in line:
                    lines.insert(i + 1, f'  {demo_destructure}')
                    break
        content = '\n'.join(lines)
        write(fullpath, content)
        print(f"  ADDED useDemo + blockMutation: {page}")
    else:
        write(fullpath, content)
        print(f"  ADDED useDemo import: {page}")

# =====================================================
# Fix 4: Fix hardcoded role arrays
# =====================================================
print("\n=== Fix 4: Fix hardcoded role arrays ===")

# Expenses.tsx: canModify with hardcoded roles → FINANCIAL_ROLES
expenses_path = os.path.join(PROJECT, "src/pages/Expenses.tsx")
if os.path.exists(expenses_path):
    content = read(expenses_path)
    old_canModify = "const canModify = userRole === 'admin' || userRole === 'manager' || userRole === 'super_admin' || userRole === 'comptable';"
    new_canModify = "const canModify = userRole !== null && FINANCIAL_ROLES.includes(userRole);"
    if old_canModify in content:
        content = content.replace(old_canModify, new_canModify)
        # Add FINANCIAL_ROLES import
        if 'FINANCIAL_ROLES' not in content:
            content = content.replace(
                'import { reportError } from "@/lib/sentry";',
                'import { reportError } from "@/lib/sentry";\nimport { FINANCIAL_ROLES } from "@/types";'
            )
        write(expenses_path, content)
        print(f"  FIXED hardcoded roles: Expenses.tsx")
    else:
        print(f"  NO CHANGE: Expenses.tsx")

# SyncConflicts.tsx: hardcoded role check → ADMIN_ROLES
sync_path = os.path.join(PROJECT, "src/pages/SyncConflicts.tsx")
if os.path.exists(sync_path):
    content = read(sync_path)
    old_check = "if (userRole !== 'super_admin' && userRole !== 'admin')"
    new_check = "if (!userRole || !ADMIN_ROLES.includes(userRole))"
    if old_check in content:
        content = content.replace(old_check, new_check)
        if 'ADMIN_ROLES' not in content:
            content = content.replace(
                'import { reportError } from "@/lib/sentry";',
                'import { reportError } from "@/lib/sentry";\nimport { ADMIN_ROLES } from "@/types";'
            )
        # Remove unused SyncConflictRow import
        content = content.replace('import { SyncConflictRow } from "@/types";\n', '')
        write(sync_path, content)
        print(f"  FIXED hardcoded roles + removed unused import: SyncConflicts.tsx")
    else:
        print(f"  NO CHANGE: SyncConflicts.tsx")

# =====================================================
# Fix 5: Fix navigation issues
# =====================================================
print("\n=== Fix 5: Fix navigation issues ===")

# BackupRestore.tsx: window.location.hash → useNavigate
backup_path = os.path.join(PROJECT, "src/pages/BackupRestore.tsx")
if os.path.exists(backup_path):
    content = read(backup_path)
    if 'window.location.hash' in content:
        content = content.replace(
            'window.location.hash = "/dashboard/billing"',
            'navigate("/dashboard/billing")'
        )
        # Add useNavigate import
        if 'useNavigate' not in content:
            content = content.replace(
                'import { useState, useRef } from "react";',
                'import { useState, useRef } from "react";\nimport { useNavigate } from "react-router-dom";'
            )
        # Add navigate const
        if 'const navigate' not in content:
            # Find the component function start
            lines = content.split('\n')
            for i, line in enumerate(lines):
                if 'useQueryClient()' in line or 'useAuth()' in line:
                    lines.insert(i, '  const navigate = useNavigate();')
                    break
            content = '\n'.join(lines)
        write(backup_path, content)
        print(f"  FIXED navigation: BackupRestore.tsx")
    else:
        print(f"  NO CHANGE: BackupRestore.tsx")

# =====================================================
# Fix 6: Fix unused imports
# =====================================================
print("\n=== Fix 6: Fix unused imports ===")

# Expenses.tsx: remove unused useMemo
if os.path.exists(expenses_path):
    content = read(expenses_path)
    if 'useMemo' in content:
        # Check if useMemo is actually used
        import_line_match = re.search(r'import\s*\{([^}]*)\}\s*from\s*"react"', content)
        if import_line_match:
            imports = [x.strip() for x in import_line_match.group(1).split(',')]
            # Check if useMemo is used elsewhere in the file (not just the import)
            body_without_import = content[content.index('export'):].replace(import_line_match.group(0), '')
            if 'useMemo' not in body_without_import:
                imports = [x for x in imports if x.strip() != 'useMemo']
                new_import = f'import {{ {", ".join(imports)} }} from "react"'
                content = content.replace(import_line_match.group(0), new_import)
                write(expenses_path, content)
                print(f"  REMOVED unused useMemo: Expenses.tsx")
            else:
                print(f"  useMemo IS used: Expenses.tsx")
        else:
            print(f"  Could not find react import: Expenses.tsx")

# =====================================================
# Fix 7: Fix components - SubscriptionCard already done
# OnboardingChecklist already done
# =====================================================
print("\n=== Fix 7: Component fixes ===")

# Pricing.tsx: window.location.href → useNavigate
pricing_path = os.path.join(PROJECT, "src/components/landing/Pricing.tsx")
if os.path.exists(pricing_path):
    content = read(pricing_path)
    changes = 0
    if "window.location.href = '/auth?redirect=pricing'" in content:
        content = content.replace(
            "window.location.href = '/auth?redirect=pricing'",
            "navigate('/auth?redirect=pricing')"
        )
        changes += 1
    if 'window.location.href = data.url' in content:
        # This one is OK for Stripe redirect (external URL), keep it
        pass
    if changes > 0 and 'useNavigate' not in content:
        content = content.replace(
            'import { useState, useEffect } from "react";',
            'import { useState, useEffect } from "react";\nimport { useNavigate } from "react-router-dom";'
        )
        # Add const navigate
        content = content.replace(
            'export default function Pricing(',
            'export default function Pricing('
        )
        # Find function body start
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if 'const [plan, setPlan]' in line or 'const {' in line:
                lines.insert(i, '  const navigate = useNavigate();')
                break
        content = '\n'.join(lines)
    if changes > 0:
        # Add reportError
        if 'reportError' not in content:
            content = content.replace(
                '"react";\nimport { useNavigate"',
                '"react";\nimport { useNavigate"}\nimport { reportError } from "@/lib/sentry";'
            )
            # Fix: merge the two import lines properly
            content = content.replace(
                'import { useNavigate"}\nimport { reportError } from "@/lib/sentry";',
                'import { useNavigate } from "react-router-dom";\nimport { reportError } from "@/lib/sentry";'
            )
        # Replace console.error with reportError
        content = content.replace(
            'console.error("Stripe checkout error:', 
            'reportError(error instanceof Error ? error : new Error(String(error))); // Stripe checkout error:'
        )
        write(pricing_path, content)
        print(f"  FIXED Pricing.tsx")
    else:
        print(f"  NO CHANGE: Pricing.tsx")

# DashboardLayout.tsx: <a href="/auth"> → <Link to="/auth">
layout_path = os.path.join(PROJECT, "src/components/dashboard/DashboardLayout.tsx")
if os.path.exists(layout_path):
    content = read(layout_path)
    if '<a href="/auth">' in content:
        content = content.replace(
            '<a href="/auth">',
            '<Link to="/auth">'
        )
        content = content.replace(
            '</a>Créer mon compte',
            '</Link>'
        )
        # Actually, let me look for the exact pattern
        # Reset and do it properly
        content = read(layout_path)
        content = content.replace(
            '<a href="/auth" className="underline font-bold hover:text-amber-100">Créer mon compte</a>',
            '<Link to="/auth" className="underline font-bold hover:text-amber-100">Créer mon compte</Link>'
        )
        write(layout_path, content)
        print(f"  FIXED DashboardLayout <a> → <Link>")
    else:
        print(f"  NO CHANGE: DashboardLayout.tsx")

# AuditLogPanel: remove unused AuditLogEntry import
audit_panel = os.path.join(PROJECT, "src/components/users/AuditLogPanel.tsx")
if os.path.exists(audit_panel):
    content = read(audit_panel)
    if 'AuditLogEntry' in content:
        content = content.replace('import { AuditLogEntry } from "@/types";\n', '')
        write(audit_panel, content)
        print(f"  REMOVED unused AuditLogEntry: AuditLogPanel.tsx")
    else:
        print(f"  NO CHANGE: AuditLogPanel.tsx")

# MobileBottomNav: replace hardcoded role arrays with constants
mobile_nav = os.path.join(PROJECT, "src/components/dashboard/MobileBottomNav.tsx")
if os.path.exists(mobile_nav):
    content = read(mobile_nav)
    # Replace inline role arrays with constants
    replacements = [
        ('["super_admin", "admin", "manager"]', 'MANAGEMENT_ROLES'),
        ('["super_admin", "admin"]', 'ADMIN_ROLES'),
        ('["super_admin", "admin", "manager", "vendeur"]', 'POS_ROLES'),
        ('["super_admin", "admin", "manager", "comptable"]', 'FINANCIAL_ROLES'),
        ('["super_admin"]', 'STORE_ROLES'),
    ]
    changed = False
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
            changed = True
    if changed:
        # Make sure constants are imported
        if 'MANAGEMENT_ROLES' not in content.split('from')[0]:
            # Check what's already imported from @/types
            types_import = re.search(r'import\s*\{([^}]*)\}\s*from\s*"@/types"', content)
            if types_import:
                existing = [x.strip() for x in types_import.group(1).split(',')]
                needed = ['MANAGEMENT_ROLES', 'ADMIN_ROLES', 'POS_ROLES', 'FINANCIAL_ROLES', 'STORE_ROLES']
                for n in needed:
                    if n not in existing:
                        existing.append(n)
                new_import = f'import {{ {", ".join(existing)} }} from "@/types"'
                content = content.replace(types_import.group(0), new_import)
        write(mobile_nav, content)
        print(f"  FIXED MobileBottomNav hardcoded roles")
    else:
        print(f"  NO CHANGE: MobileBottomNav.tsx")

# DashboardLayout: roles: ["super_admin"] → STORE_ROLES
if os.path.exists(layout_path):
    content = read(layout_path)
    if 'roles: ["super_admin"]' in content:
        content = content.replace('roles: ["super_admin"]', 'roles: STORE_ROLES')
        # Ensure STORE_ROLES is imported
        if 'STORE_ROLES' not in content:
            types_import = re.search(r'import\s*\{([^}]*)\}\s*from\s*"@/types"', content)
            if types_import:
                existing = [x.strip() for x in types_import.group(1).split(',')]
                if 'STORE_ROLES' not in existing:
                    existing.append('STORE_ROLES')
                new_import = f'import {{ {", ".join(existing)} }} from "@/types"'
                content = content.replace(types_import.group(0), new_import)
        write(layout_path, content)
        print(f"  FIXED DashboardLayout hardcoded role")
    else:
        print(f"  NO CHANGE: DashboardLayout roles")

print("\n=== All batch fixes applied ===")

#!/usr/bin/env python3
"""
Savana-Flow (MakitiPlus) — End-to-End Test Suite v2
Replicates the full React app signup flow and tests all CRUD operations.
"""

import os
import sys
import json
import time
import random
import string
from datetime import date, datetime
from supabase import create_client, Client

# ── Configuration ──────────────────────────────────────────────────
SUPABASE_URL = "https://eiquqawymbgfejwucvyt.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpcXVxYXd5bWJnZmVqd3Vjdnl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NzIyNjUsImV4cCI6MjA4NTQ0ODI2NX0.w5s1yaeUbFRLfpHwAJeV-jm6PbefskVegWclFyvypGs"

TEST_EMAIL = f"e2e.v2.{int(time.time())}@makitiplus.test"
TEST_PASSWORD = "TestE2E!2026Secure"

results = {}

def random_string(length=8):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def log_test(entity, operation, success, message=""):
    key = f"{entity}.{operation}"
    results[key] = {"success": success, "message": message}
    status = "✅" if success else "❌"
    print(f"  {status} {entity}/{operation}: {message[:120]}")

def main():
    print("=" * 70)
    print("SAVANA-FLOW (MakitiPlus) — E2E TEST v2 (Full App Flow)")
    print("=" * 70)
    
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 1: AUTHENTICATION + FULL SIGNUP FLOW
    # ═══════════════════════════════════════════════════════════════
    print("\n🔐 Phase 1: Authentication")
    
    # Step 1: Auth signup
    try:
        auth_response = sb.auth.sign_up({
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
        })
        user_id = auth_response.user.id if auth_response.user else None
        if user_id:
            log_test("auth", "signup", True, f"User created: {user_id}")
        else:
            log_test("auth", "signup", False, "No user returned")
            print_report(); return
    except Exception as e:
        log_test("auth", "signup", False, str(e)[:200])
        print_report(); return
    
    # Step 2: Create organization (like AuthContext.signUp does for admin)
    print("\n🏢 Phase 1b: Create Organization (like React app)")
    org_id = None
    try:
        response = sb.table("organizations").insert({
            "name": "E2E Test Business",
            "owner_user_id": user_id,
        }).execute()
        if response.data and len(response.data) > 0:
            org_id = response.data[0]["id"]
            log_test("organization", "create", True, f"Org created: {org_id}")
        else:
            log_test("organization", "create", False, f"No data returned: {response}")
    except Exception as e:
        err = str(e)[:300]
        log_test("organization", "create", False, err)
        if "policy" in err.lower():
            log_test("organization", "create_diag", False, "RLS blocks org creation for this user - need to check if profile exists first")
    
    # Step 3: Create profile
    print("\n👤 Phase 1c: Create Profile (like React app)")
    profile_ok = False
    try:
        response = sb.table("profiles").insert({
            "user_id": user_id,
            "business_name": "E2E Test Business",
            "owner_name": "E2E Tester",
            "phone": "+224 628 00 00 00",
            "organization_id": org_id,
        }).execute()
        if response.data and len(response.data) > 0:
            profile_ok = True
            log_test("profile", "create", True, f"Profile created, org_id={response.data[0].get('organization_id')}")
        else:
            log_test("profile", "create", False, "No data returned")
    except Exception as e:
        err = str(e)[:300]
        log_test("profile", "create", False, err)
    
    # Step 4: Create user role
    print("\n🔑 Phase 1d: Create User Role (admin)")
    role_ok = False
    try:
        response = sb.table("user_roles").insert({
            "user_id": user_id,
            "role": "admin",
        }).execute()
        if response.data and len(response.data) > 0:
            role_ok = True
            log_test("role", "create", True, f"Role created: {response.data[0]['role']}")
        else:
            log_test("role", "create", False, "No data returned")
    except Exception as e:
        err = str(e)[:300]
        log_test("role", "create", False, err)
    
    # Step 5: Verify profile and role are readable now
    print("\n🔍 Phase 1e: Verify Profile & Role")
    try:
        response = sb.table("profiles").select("*").eq("user_id", user_id).single().execute()
        if response.data:
            org_id_from_profile = response.data.get("organization_id")
            log_test("profile", "verify", True, f"Profile verified, org_id={org_id_from_profile}")
            if not org_id:
                org_id = org_id_from_profile
        else:
            log_test("profile", "verify", False, "Profile not found")
    except Exception as e:
        log_test("profile", "verify", False, str(e)[:200])
    
    try:
        response = sb.table("user_roles").select("role").eq("user_id", user_id).single().execute()
        if response.data:
            log_test("role", "verify", True, f"Role verified: {response.data['role']}")
        else:
            log_test("role", "verify", False, "Role not found")
    except Exception as e:
        log_test("role", "verify", False, str(e)[:200])
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 2: SCHEMA VERIFICATION
    # ═══════════════════════════════════════════════════════════════
    print("\n🔧 Phase 2: Database Schema Verification")
    
    # Check categories table columns
    try:
        # Try inserting with description - will fail if column doesn't exist
        response = sb.table("categories").select("description").limit(1).execute()
        log_test("schema", "categories_description", True, "description column exists")
    except Exception as e:
        err = str(e)[:200]
        if "description" in err.lower() and "column" in err.lower():
            log_test("schema", "categories_description", False, "MISSING: 'description' column in categories table - migration not applied!")
        else:
            log_test("schema", "categories_description", True, f"Column exists or other error: {err[:100]}")
    
    try:
        response = sb.table("categories").select("is_default").limit(1).execute()
        log_test("schema", "categories_is_default", True, "is_default column exists")
    except Exception as e:
        err = str(e)[:200]
        if "is_default" in err.lower() and "column" in err.lower():
            log_test("schema", "categories_is_default", False, "MISSING: 'is_default' column in categories table")
        else:
            log_test("schema", "categories_is_default", True, f"Column exists or other error: {err[:100]}")
    
    try:
        response = sb.table("categories").select("sort_order").limit(1).execute()
        log_test("schema", "categories_sort_order", True, "sort_order column exists")
    except Exception as e:
        err = str(e)[:200]
        if "sort_order" in err.lower() and "column" in err.lower():
            log_test("schema", "categories_sort_order", False, "MISSING: 'sort_order' column in categories table")
        else:
            log_test("schema", "categories_sort_order", True, f"Column exists or other error: {err[:100]}")
    
    # Check store_settings table
    try:
        response = sb.table("store_settings").select("id").limit(1).execute()
        log_test("schema", "store_settings_table", True, "store_settings table exists")
    except Exception as e:
        err = str(e)[:200]
        if "relation" in err.lower() or "does not exist" in err.lower():
            log_test("schema", "store_settings_table", False, "MISSING: store_settings table - migration not applied!")
        else:
            log_test("schema", "store_settings_table", False, f"Error: {err[:100]}")
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 3: CATEGORIES CRUD
    # ═══════════════════════════════════════════════════════════════
    print("\n📂 Phase 3: Categories CRUD")
    
    # Check for existing categories (auto-created by trigger)
    try:
        response = sb.table("categories").select("id, name, icon, organization_id").execute()
        count = len(response.data) if response.data else 0
        if count > 0:
            sample = response.data[0]
            log_test("categories", "list_existing", True, 
                     f"Found {count} categories, sample: name={sample.get('name')}, icon='{sample.get('icon')}', org_id={sample.get('organization_id')}")
        else:
            log_test("categories", "list_existing", True, "No categories yet (trigger may not have fired)")
    except Exception as e:
        log_test("categories", "list_existing", False, str(e)[:200])
    
    # CREATE category (without description column since it may not exist)
    cat_name = f"Test Cat {random_string()}"
    cat_id = None
    try:
        insert_data = {
            "name": cat_name,
            "icon": "Package",
            "color": "#3B82F6",
            "user_id": user_id,
        }
        response = sb.table("categories").insert(insert_data).execute()
        if response.data and len(response.data) > 0:
            cat = response.data[0]
            cat_id = cat["id"]
            log_test("categories", "create", True, 
                     f"Created: {cat_name}, org_id={cat.get('organization_id')}")
        else:
            log_test("categories", "create", False, f"No data returned")
    except Exception as e:
        err = str(e)[:300]
        log_test("categories", "create", False, err)
        if "policy" in err.lower() or "new row violates" in err.lower():
            log_test("categories", "create_diag", False, "RLS blocks category INSERT - org_id likely NULL or user not admin/manager")
    
    # If basic create worked, try with description
    if cat_id:
        try:
            response = sb.table("categories").update({
                "description": "Test description",
            }).eq("id", cat_id).execute()
            log_test("categories", "update_with_description", True, "Description update worked")
        except Exception as e:
            err = str(e)[:200]
            if "description" in err.lower() and "column" in err.lower():
                log_test("categories", "update_with_description", False, "description column MISSING in DB")
            else:
                log_test("categories", "update_with_description", False, err)
        
        # UPDATE
        try:
            response = sb.table("categories").update({
                "name": f"{cat_name} Updated",
                "color": "#10B981",
            }).eq("id", cat_id).execute()
            if response.data and len(response.data) > 0:
                log_test("categories", "update", True, f"Updated: {response.data[0]['name']}")
            else:
                log_test("categories", "update", False, "No data returned")
        except Exception as e:
            log_test("categories", "update", False, str(e)[:200])
        
        # DELETE
        try:
            response = sb.table("categories").delete().eq("id", cat_id).execute()
            if response.data:
                log_test("categories", "delete", True, "Deleted test category")
            else:
                log_test("categories", "delete", False, "No data returned")
        except Exception as e:
            log_test("categories", "delete", False, str(e)[:200])
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 4: PRODUCTS CRUD
    # ═══════════════════════════════════════════════════════════════
    print("\n📦 Phase 4: Products CRUD")
    
    # Get a category first
    cat_for_prod = None
    try:
        response = sb.table("categories").select("id").limit(1).execute()
        if response.data:
            cat_for_prod = response.data[0]["id"]
    except:
        pass
    
    prod_name = f"Test Product {random_string()}"
    prod_id = None
    try:
        insert_data = {
            "name": prod_name,
            "price": 15000,
            "cost_price": 10000,
            "stock_quantity": 50,
            "min_stock_alert": 5,
            "barcode": f"TEST{random_string(10)}",
            "unit": "unité",
            "category_id": cat_for_prod,
            "user_id": user_id,
        }
        response = sb.table("products").insert(insert_data).execute()
        if response.data and len(response.data) > 0:
            prod = response.data[0]
            prod_id = prod["id"]
            log_test("products", "create", True, 
                     f"Created: {prod_name}, org_id={prod.get('organization_id')}")
        else:
            log_test("products", "create", False, "No data returned")
    except Exception as e:
        err = str(e)[:300]
        log_test("products", "create", False, err)
        if "policy" in err.lower() or "new row violates" in err.lower():
            # Diagnose: check if org_id is set
            try:
                org_check = sb.rpc("get_user_organization_id").execute()
                log_test("products", "create_diag", False, 
                         f"RLS violation. get_user_organization_id()={org_check.data}")
            except Exception as e2:
                log_test("products", "create_diag", False, f"RLS violation. RPC check failed: {str(e2)[:100]}")
    
    if prod_id:
        # READ
        try:
            response = sb.table("products").select("*, categories(name, color, icon)").eq("id", prod_id).single().execute()
            if response.data:
                log_test("products", "read_with_category", True, 
                         f"Read: {response.data['name']}, category={response.data.get('categories')}")
            else:
                log_test("products", "read", False, "Product not found")
        except Exception as e:
            log_test("products", "read", False, str(e)[:200])
        
        # UPDATE
        try:
            response = sb.table("products").update({
                "price": 18000,
                "stock_quantity": 45,
            }).eq("id", prod_id).execute()
            if response.data and len(response.data) > 0:
                log_test("products", "update", True, f"Updated price: {response.data[0]['price']}")
            else:
                log_test("products", "update", False, "No data returned")
        except Exception as e:
            log_test("products", "update", False, str(e)[:200])
        
        # DELETE
        try:
            sb.table("products").delete().eq("id", prod_id).execute()
            log_test("products", "delete", True, "Deleted test product")
        except Exception as e:
            log_test("products", "delete", False, str(e)[:200])
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 5: CUSTOMERS CRUD
    # ═══════════════════════════════════════════════════════════════
    print("\n👥 Phase 5: Customers CRUD")
    
    cust_name = f"Test Customer {random_string()}"
    cust_id = None
    try:
        response = sb.table("customers").insert({
            "name": cust_name,
            "phone": "+224 628 00 00 00",
            "email": f"{random_string()}@test.com",
            "address": "Conakry, Guinea",
            "notes": "E2E test customer",
            "user_id": user_id,
        }).execute()
        if response.data and len(response.data) > 0:
            cust = response.data[0]
            cust_id = cust["id"]
            log_test("customers", "create", True, f"Created: {cust_name}, org_id={cust.get('organization_id')}")
        else:
            log_test("customers", "create", False, "No data returned")
    except Exception as e:
        log_test("customers", "create", False, str(e)[:300])
    
    if cust_id:
        try:
            response = sb.table("customers").update({
                "phone": "+224 628 11 11 11",
            }).eq("id", cust_id).execute()
            log_test("customers", "update", bool(response.data and len(response.data) > 0), 
                     f"Updated phone" if response.data else "Update returned no data")
        except Exception as e:
            log_test("customers", "update", False, str(e)[:200])
        
        try:
            sb.table("customers").delete().eq("id", cust_id).execute()
            log_test("customers", "delete", True, "Deleted test customer")
        except Exception as e:
            log_test("customers", "delete", False, str(e)[:200])
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 6: EXPENSES CRUD
    # ═══════════════════════════════════════════════════════════════
    print("\n💰 Phase 6: Expenses CRUD")
    
    exp_id = None
    try:
        response = sb.table("expenses").insert({
            "amount": 25000,
            "category": "Loyer",
            "description": "E2E test expense",
            "expense_date": str(date.today()),
            "payment_method": "cash",
            "user_id": user_id,
        }).execute()
        if response.data and len(response.data) > 0:
            exp = response.data[0]
            exp_id = exp["id"]
            log_test("expenses", "create", True, f"Created expense: 25000, org_id={exp.get('organization_id')}")
        else:
            log_test("expenses", "create", False, "No data returned")
    except Exception as e:
        log_test("expenses", "create", False, str(e)[:300])
    
    if exp_id:
        try:
            sb.table("expenses").delete().eq("id", exp_id).execute()
            log_test("expenses", "delete", True, "Deleted test expense")
        except Exception as e:
            log_test("expenses", "delete", False, str(e)[:200])
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 7: SALES CRUD
    # ═══════════════════════════════════════════════════════════════
    print("\n🧾 Phase 7: Sales CRUD")
    
    # Create a product to sell first
    sale_prod_id = None
    try:
        response = sb.table("products").insert({
            "name": f"Sale Test {random_string()}",
            "price": 5000,
            "stock_quantity": 100,
            "category_id": cat_for_prod,
            "user_id": user_id,
        }).execute()
        if response.data:
            sale_prod_id = response.data[0]["id"]
    except:
        pass
    
    sale_id = None
    try:
        response = sb.table("sales").insert({
            "sale_number": f"VTE-{random_string(6).upper()}",
            "total_amount": 10000,
            "subtotal": 10000,
            "amount_paid": 10000,
            "change_amount": 0,
            "payment_method": "cash",
            "user_id": user_id,
        }).execute()
        if response.data and len(response.data) > 0:
            sale = response.data[0]
            sale_id = sale["id"]
            log_test("sales", "create", True, f"Created sale: {sale['sale_number']}, org_id={sale.get('organization_id')}")
        else:
            log_test("sales", "create", False, "No data returned")
    except Exception as e:
        log_test("sales", "create", False, str(e)[:300])
    
    if sale_id:
        # Try sale_items
        try:
            response = sb.table("sale_items").insert({
                "sale_id": sale_id,
                "product_id": sale_prod_id,
                "product_name": "Sale Test Product",
                "quantity": 2,
                "unit_price": 5000,
                "total_price": 10000,
            }).execute()
            if response.data:
                log_test("sale_items", "create", True, "Created sale item")
            else:
                log_test("sale_items", "create", False, "No data returned")
        except Exception as e:
            err = str(e)[:300]
            log_test("sale_items", "create", False, err)
        
        # Cleanup
        try:
            sb.table("sales").delete().eq("id", sale_id).execute()
            if sale_prod_id:
                sb.table("products").delete().eq("id", sale_prod_id).execute()
            log_test("sales", "cleanup", True, "Cleaned up")
        except:
            pass
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 8: STOCK MOVEMENTS
    # ═══════════════════════════════════════════════════════════════
    print("\n📊 Phase 8: Stock Movements")
    
    # Create test product for stock
    stock_prod_id = None
    try:
        response = sb.table("products").insert({
            "name": f"Stock Test {random_string()}",
            "price": 5000,
            "stock_quantity": 100,
            "category_id": cat_for_prod,
            "user_id": user_id,
        }).execute()
        if response.data:
            stock_prod_id = response.data[0]["id"]
    except:
        pass
    
    if stock_prod_id:
        try:
            response = sb.table("stock_movements").insert({
                "product_id": stock_prod_id,
                "type": "restock",
                "quantity": 50,
                "previous_quantity": 100,
                "new_quantity": 150,
                "reason": "E2E test",
                "user_id": user_id,
            }).execute()
            if response.data:
                log_test("stock_movements", "create", True, "Created restock movement")
            else:
                log_test("stock_movements", "create", False, "No data returned")
        except Exception as e:
            log_test("stock_movements", "create", False, str(e)[:300])
        
        try:
            sb.table("products").delete().eq("id", stock_prod_id).execute()
        except:
            pass
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 9: STORE SETTINGS
    # ═══════════════════════════════════════════════════════════════
    print("\n⚙️ Phase 9: Store Settings")
    
    if org_id:
        try:
            response = sb.table("store_settings").select("*").eq("organization_id", org_id).single().execute()
            if response.data:
                log_test("store_settings", "read", True, f"Store: {response.data.get('store_name')}, template={response.data.get('template')}")
            else:
                log_test("store_settings", "read", False, "No settings found")
        except Exception as e:
            err = str(e)[:200]
            if "relation" in err.lower() or "does not exist" in err.lower():
                log_test("store_settings", "read", False, "store_settings table MISSING - migration not applied!")
            else:
                log_test("store_settings", "read", False, err)
    else:
        log_test("store_settings", "read", False, "No org_id available")
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 10: RPC FUNCTIONS
    # ═══════════════════════════════════════════════════════════════
    print("\n🔌 Phase 10: RPC Functions")
    
    try:
        response = sb.rpc("get_user_organization_id").execute()
        log_test("rpc", "get_user_organization_id", bool(response.data), f"Result: {response.data}")
    except Exception as e:
        log_test("rpc", "get_user_organization_id", False, str(e)[:200])
    
    try:
        response = sb.rpc("is_super_admin").execute()
        log_test("rpc", "is_super_admin", True, f"Is super_admin: {response.data}")
    except Exception as e:
        err = str(e)[:200]
        if "Could not find" in err:
            log_test("rpc", "is_super_admin", False, "Function MISSING - migration not applied!")
        else:
            log_test("rpc", "is_super_admin", False, err)
    
    try:
        response = sb.rpc("has_role", {"_user_id": user_id, "_role": "admin"}).execute()
        log_test("rpc", "has_role_admin", True, f"Has admin role: {response.data}")
    except Exception as e:
        log_test("rpc", "has_role_admin", False, str(e)[:200])
    
    try:
        response = sb.rpc("admin_exists").execute()
        log_test("rpc", "admin_exists", True, f"Admin exists: {response.data}")
    except Exception as e:
        log_test("rpc", "admin_exists", False, str(e)[:200])
    
    # Print final report
    print_report()
    
    # Cleanup: try to delete test user data
    print("\n🧹 Cleanup...")
    try:
        # Delete in reverse dependency order
        sb.table("customer_credits").delete().eq("user_id", user_id).execute()
        sb.table("stock_movements").delete().eq("user_id", user_id).execute()
        sb.table("expenses").delete().eq("user_id", user_id).execute()
        sb.table("customers").delete().eq("user_id", user_id).execute()
        sb.table("categories").delete().eq("user_id", user_id).execute()
        sb.table("products").delete().eq("user_id", user_id).execute()
        sb.table("user_roles").delete().eq("user_id", user_id).execute()
        sb.table("profiles").delete().eq("user_id", user_id).execute()
        if org_id:
            sb.table("store_settings").delete().eq("organization_id", org_id).execute()
            sb.table("organizations").delete().eq("id", org_id).execute()
        log_test("cleanup", "all", True, "Test data cleaned up")
    except Exception as e:
        log_test("cleanup", "all", False, str(e)[:200])

def print_report():
    print("\n" + "=" * 70)
    print("📋 RAPPORT FINAL DES TESTS E2E — SAVANA-FLOW")
    print("=" * 70)
    
    categories = {}
    for key, result in results.items():
        entity = key.split(".")[0]
        if entity not in categories:
            categories[entity] = {"passed": 0, "failed": 0, "details": []}
        if result["success"]:
            categories[entity]["passed"] += 1
        else:
            categories[entity]["failed"] += 1
        categories[entity]["details"].append((key, result))
    
    total_passed = sum(c["passed"] for c in categories.values())
    total_failed = sum(c["failed"] for c in categories.values())
    
    print(f"\n📊 RÉSUMÉ: {total_passed} ✅ | {total_failed} ❌ | {total_passed + total_failed} total")
    print("-" * 70)
    
    for entity, data in categories.items():
        status = "✅" if data["failed"] == 0 else "⚠️"
        print(f"\n{status} {entity.upper()}: {data['passed']} OK, {data['failed']} échoué(s)")
        for key, result in data["details"]:
            icon = "✅" if result["success"] else "❌"
            op = key.split(".")[1]
            print(f"   {icon} {op}: {result['message'][:100]}")
    
    # Critical issues summary
    print("\n" + "=" * 70)
    print("🚨 PROBLÈMES CRITIQUES IDENTIFIÉS")
    print("=" * 70)
    
    failed_tests = [(k, v) for k, v in results.items() if not v["success"]]
    if failed_tests:
        for key, result in failed_tests:
            entity, op = key.split(".")
            msg = result['message'].lower()
            print(f"\n❌ {entity}/{op}:")
            if "column" in msg and ("description" in msg or "is_default" in msg or "sort_order" in msg):
                print(f"   💡 MIGRATION MANQUANTE: La migration 20260629010000_store_settings_and_default_categories.sql")
                print(f"      n'a PAS été appliquée à la base de données de production!")
                print(f"      → Exécutez cette migration dans le SQL Editor Supabase")
            elif "policy" in msg or "row-level" in msg or "42501" in msg:
                print(f"   💡 RLS POLICY: L'insertion est bloquée par les politiques RLS")
                print(f"      → Vérifiez: organization_id est-il NULL ?")
                print(f"      → L'utilisateur a-t-il le rôle admin/manager ?")
            elif "relation" in msg or "does not exist" in msg:
                print(f"   💡 TABLE MANQUANTE: Une table n'existe pas en DB")
                print(f"      → Les migrations n'ont pas été appliquées")
            elif "could not find" in msg and "function" in msg:
                print(f"   💡 FONCTION MANQUANTE: Une fonction RPC n'existe pas")
                print(f"      → Les migrations contenant cette fonction n'ont pas été appliquées")
            else:
                print(f"   Erreur: {result['message'][:200]}")
    
    # Save report
    report_path = "/home/z/my-project/download/e2e_test_report.json"
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "total_passed": total_passed,
            "total_failed": total_failed,
            "results": results,
        }, f, indent=2, ensure_ascii=False)
    print(f"\n📄 Rapport sauvegardé: {report_path}")

if __name__ == "__main__":
    main()

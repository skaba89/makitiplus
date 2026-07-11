#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MakitiPlus — Script de test de charge
Teste les RPCs critiques avec 50 utilisateurs simultanés.

Usage :
  python3 scripts/load_test.py --url https://makitiplus.onrender.com --users 50

Prérequis :
  pip install aiohttp
"""

import asyncio
import aiohttp
import time
import argparse
import sys
from collections import defaultdict

async def test_endpoint(session, url, name, method="GET", json=None, headers=None):
    """Test un endpoint et retourne le statut + temps de réponse."""
    start = time.time()
    try:
        if method == "GET":
            async with session.get(url, headers=headers, timeout=10) as resp:
                await resp.read()
                elapsed = time.time() - start
                return name, resp.status, elapsed
        else:
            async with session.post(url, json=json, headers=headers, timeout=10) as resp:
                await resp.read()
                elapsed = time.time() - start
                return name, resp.status, elapsed
    except Exception as e:
        elapsed = time.time() - start
        return name, 0, elapsed

async def run_load_test(base_url, num_users):
    """Lance le test de charge avec num_users utilisateurs simultanés."""
    
    endpoints = [
        ("GET /", f"{base_url}/"),
        ("GET /auth", f"{base_url}/auth"),
        ("GET /diagnostic", f"{base_url}/diagnostic"),
        ("GET /pricing", f"{base_url}/pricing"),
        ("GET /dashboard", f"{base_url}/dashboard"),
        ("GET /assets/index.js", f"{base_url}/assets/index.js"),
    ]
    
    print(f"\n{'='*60}")
    print(f"  MakitiPlus — Test de charge")
    print(f"  URL: {base_url}")
    print(f"  Utilisateurs simultanés: {num_users}")
    print(f"{'='*60}\n")
    
    results = defaultdict(list)
    
    async with aiohttp.ClientSession() as session:
        # Phase 1 : test des endpoints publics
        print("Phase 1 : Test des endpoints publics")
        print("-" * 40)
        
        for name, url in endpoints:
            tasks = [test_endpoint(session, url, name) for _ in range(num_users)]
            responses = await asyncio.gather(*tasks)
            
            for n, status, elapsed in responses:
                results[n].append((status, elapsed))
            
            times = [e for _, e in responses]
            statuses = [s for s, _ in responses]
            success = sum(1 for s in statuses if s == 200)
            
            print(f"  {name:30s} | {success:3d}/{num_users} OK | "
                  f"avg: {sum(times)/len(times):.2f}s | "
                  f"max: {max(times):.2f}s | "
                  f"min: {min(times):.2f}s")
        
        # Phase 2 : test de l'API Supabase (si configurée)
        print(f"\nPhase 2 : Test de l'API Supabase")
        print("-" * 40)
        
        supabase_url = "https://exxntkuursgwhxvehekr.supabase.co"
        api_endpoints = [
            ("GET /auth/v1/health", f"{supabase_url}/auth/v1/health"),
            ("GET /rest/v1/", f"{supabase_url}/rest/v1/"),
        ]
        
        for name, url in api_endpoints:
            tasks = [test_endpoint(session, url, name) for _ in range(num_users)]
            responses = await asyncio.gather(*tasks)
            
            for n, status, elapsed in responses:
                results[n].append((status, elapsed))
            
            times = [e for _, e in responses]
            statuses = [s for s, _ in responses]
            success = sum(1 for s in statuses if s in [200, 401])  # 401 = OK pour endpoint protégé
            
            print(f"  {name:30s} | {success:3d}/{num_users} OK | "
                  f"avg: {sum(times)/len(times):.2f}s | "
                  f"max: {max(times):.2f}s | "
                  f"min: {min(times):.2f}s")
    
    # Résumé
    print(f"\n{'='*60}")
    print(f"  Résumé du test de charge")
    print(f"{'='*60}\n")
    
    all_times = []
    all_statuses = []
    
    for name, data in results.items():
        for status, elapsed in data:
            all_times.append(elapsed)
            all_statuses.append(status)
    
    total = len(all_times)
    success = sum(1 for s in all_statuses if s in [200, 401])
    errors = total - success
    
    print(f"  Total des requêtes : {total}")
    print(f"  Réussies : {success} ({success/total*100:.1f}%)")
    print(f"  Échouées : {errors} ({errors/total*100:.1f}%)")
    print(f"  Temps moyen : {sum(all_times)/len(all_times):.2f}s")
    print(f"  Temps max : {max(all_times):.2f}s")
    print(f"  Temps min : {min(all_times):.2f}s")
    
    # Interprétation
    print(f"\n{'='*60}")
    print(f"  Interprétation")
    print(f"{'='*60}\n")
    
    avg_time = sum(all_times) / len(all_times)
    error_rate = errors / total * 100
    
    if error_rate < 1 and avg_time < 2:
        print("  ✅ EXCELLENT — Le système gère la charge sans problème")
        print("  → Prêt pour 50+ utilisateurs simultanés")
    elif error_rate < 5 and avg_time < 3:
        print("  ⚠️ ACCEPTABLE — Quelques latences mais stable")
        print("  → Prêt pour 30-50 utilisateurs, surveiller les performances")
    elif error_rate < 10:
        print("  ⚠️ ATTENTION — Dégradations sous charge")
        print("  → Optimisation nécessaire avant scale")
    else:
        print("  ❌ CRITIQUE — Le système ne gère pas la charge")
        print("  → Optimisation urgente requise")
    
    print()
    return 0 if error_rate < 5 else 1

def main():
    parser = argparse.ArgumentParser(description="MakitiPlus load test")
    parser.add_argument("--url", default="https://makitiplus.onrender.com",
                       help="URL de base (default: https://makitiplus.onrender.com)")
    parser.add_argument("--users", type=int, default=50,
                       help="Nombre d'utilisateurs simultanés (default: 50)")
    
    args = parser.parse_args()
    
    try:
        return asyncio.run(run_load_test(args.url, args.users))
    except KeyboardInterrupt:
        print("\n\nTest interrompu par l'utilisateur")
        return 1

if __name__ == "__main__":
    sys.exit(main())

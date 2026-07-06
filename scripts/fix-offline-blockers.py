#!/usr/bin/env python3
"""
Script de vérification post-fix pour les 3 bloqueurs offline.
Vérifie que les fichiers clés ont bien été modifiés.
"""
import os

def check_file_contains(filepath, patterns, label):
    """Check that a file contains all required patterns."""
    if not os.path.exists(filepath):
        print(f"❌ {label}: File not found: {filepath}")
        return False
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    ok = True
    for pattern in patterns:
        if pattern in content:
            print(f"✅ {label}: Found '{pattern[:60]}...'")
        else:
            print(f"❌ {label}: Missing '{pattern[:60]}...'")
            ok = False
    return ok

base = "/home/z/my-project/src"

results = []

# BLOQUEUR 2: IndexedDB unifié
results.append(check_file_contains(
    f"{base}/lib/indexedDBStorage.ts",
    [
        'DB_VERSION = 3',
        'export async function getDB()',
        'MUTATION_QUEUE',
        'POS_CART',
        'CONFLICT_LOG',
        'RPC_QUEUE',
    ],
    "B2-indexedDBStorage"
))

# BLOQUEUR 2: offlineQueue utilise getDB partagé
results.append(check_file_contains(
    f"{base}/lib/offlineQueue.ts",
    [
        'getDB',
        '"RPC"',
        'rpcName',
        'flushRPCQueue',
    ],
    "B2-offlineQueue"
))

# BLOQUEUR 3: POSCart utilise IndexedDB
results.append(check_file_contains(
    f"{base}/contexts/POSCartContext.ts",
    [
        'getDB',
        'POS_CART',
    ],
    "B3-POSCartContext"
))

# BLOQUEUR 1: POS.tsx supporte offline
results.append(check_file_contains(
    f"{base}/pages/POS.tsx",
    [
        'isOnline',
        'useOnlineStatus',
        'enqueueRPCMutation',
        'offline_sale',
    ],
    "B1-POS-offline"
))

# RENFORCEMENT: logConflict local fallback
results.append(check_file_contains(
    f"{base}/lib/syncConflictResolver.ts",
    [
        'CONFLICT_LOG',
        'localConflictFallback',
    ],
    "R5-conflictLog"
))

all_ok = all(results)
print(f"\n{'✅ All checks passed!' if all_ok else '❌ Some checks failed!'}")

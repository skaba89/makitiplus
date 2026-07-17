import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Tests de non-régression pour les 3 bugs critiques corrigés :
 * 1. useState is not defined (import manquant)
 * 2. effectiveOrgId is not defined (hook useOrgSelector manquant)
 * 3. Select.Item value empty string (Radix UI interdit value="")
 *
 * Ces tests vérifient statiquement le code source pour éviter que les bugs
 * réapparaissent lors de futurs refactorings.
 */

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf-8");

// Lister tous les fichiers .tsx dans src/pages/ et src/components/
function listTsxFiles(dir: string): string[] {
  const result: string[] = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      result.push(...listTsxFiles(fullPath));
    } else if (item.name.endsWith(".tsx") || item.name.endsWith(".ts")) {
      result.push(fullPath);
    }
  }
  return result;
}

const srcFiles = [
  ...listTsxFiles(path.join(root, "src/pages")),
  ...listTsxFiles(path.join(root, "src/components")),
  ...listTsxFiles(path.join(root, "src/hooks")),
];

describe("Non-régression — Bug #1: useState is not defined", () => {
  it("aucun fichier .tsx/.ts utilise useState sans l'importer", () => {
    const violations: string[] = [];
    
    for (const file of srcFiles) {
      const content = read(path.relative(root, file));
      
      // Vérifier si useState est utilisé (hors commentaires)
      const lines = content.split("\n");
      const usesState = lines.some((line) => {
        const trimmed = line.trim();
        // Ignorer commentaires et imports
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("import")) {
          return false;
        }
        return /\buseState\b/.test(line);
      });
      
      if (!usesState) continue;
      
      // Vérifier que l'import est présent
      const hasImport = content.includes("useState") && 
        (/import.*useState.*from\s+["']react["']/.test(content) || 
         /import.*from\s+["']react["']/.test(content) && /useState/.test(content));
      
      if (!hasImport) {
        violations.push(path.relative(root, file));
      }
    }
    
    expect(violations).toEqual([]);
  });

  it("aucun fichier utilise useEffect/useCallback/useMemo sans import react", () => {
    const hooks = ["useEffect", "useCallback", "useMemo", "useRef", "useDeferredValue"];
    const violations: string[] = [];
    
    for (const file of srcFiles) {
      const content = read(path.relative(root, file));
      const lines = content.split("\n");
      
      for (const hook of hooks) {
        const usesHook = lines.some((line) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("import")) {
            return false;
          }
          return new RegExp(`\\b${hook}\\b`).test(line);
        });
        
        if (!usesHook) continue;
        
        const hasImport = /import.*from\s+["']react["']/.test(content);
        if (!hasImport) {
          violations.push(`${path.relative(root, file)} (utilise ${hook} sans import react)`);
        }
      }
    }
    
    expect(violations).toEqual([]);
  });
});

describe("Non-régression — Bug #2: effectiveOrgId is not defined", () => {
  it("aucun fichier utilise effectiveOrgId sans importer useOrgSelector", () => {
    const violations: string[] = [];
    
    for (const file of srcFiles) {
      const content = read(path.relative(root, file));
      
      // Ignorer le hook lui-même et le composant OrgSelector
      if (file.includes("useOrgSelector.ts") || file.includes("org-selector.tsx")) {
        continue;
      }
      
      // Vérifier si effectiveOrgId est utilisé (hors commentaires)
      const lines = content.split("\n");
      const usesEffectiveOrgId = lines.some((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("import")) {
          return false;
        }
        return /\beffectiveOrgId\b/.test(line);
      });
      
      if (!usesEffectiveOrgId) continue;
      
      // Vérifier que l'import useOrgSelector est présent
      const hasImport = /import.*useOrgSelector.*from\s+["']@\/hooks\/useOrgSelector["']/.test(content);
      
      if (!hasImport) {
        violations.push(path.relative(root, file));
      }
    }
    
    expect(violations).toEqual([]);
  });

  it("aucun fichier utilise isSuperAdmin sans le déclarer (via hook ou useAuth)", () => {
    const violations: string[] = [];
    
    for (const file of srcFiles) {
      const content = read(path.relative(root, file));
      
      // Ignorer les hooks et composants qui définissent isSuperAdmin
      if (file.includes("useOrgSelector.ts") || file.includes("org-selector.tsx")) {
        continue;
      }
      
      const lines = content.split("\n");
      const usesIsSuperAdmin = lines.some((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("import")) {
          return false;
        }
        return /\bisSuperAdmin\b/.test(line);
      });
      
      if (!usesIsSuperAdmin) continue;
      
      // Vérifier que isSuperAdmin est déclaré (via useOrgSelector ou useAuth ou const local)
      const hasDeclaration = 
        /const\s*\{[^}]*isSuperAdmin[^}]*\}\s*=\s*useOrgSelector/.test(content) ||
        /const\s+isSuperAdmin\s*=/.test(content) ||
        /userRole\s*===\s*["']super_admin["']/.test(content);
      
      if (!hasDeclaration) {
        violations.push(path.relative(root, file));
      }
    }
    
    expect(violations).toEqual([]);
  });
});

describe("Non-régression — Bug #3: Select.Item value empty string", () => {
  it("aucun <SelectItem> n'a value='' (chaîne vide interdite par Radix UI)", () => {
    const violations: string[] = [];
    
    for (const file of srcFiles) {
      const content = read(path.relative(root, file));
      const lines = content.split("\n");
      
      lines.forEach((line, index) => {
        // Chercher <SelectItem value="" ou value={""}
        if (/<SelectItem[^>]*value\s*=\s*["']["']/.test(line) || 
            /<SelectItem[^>]*value\s*=\s*\{["']["']\}/.test(line)) {
          violations.push(`${path.relative(root, file)}:${index + 1} — ${line.trim()}`);
        }
      });
    }
    
    expect(violations).toEqual([]);
  });

  it("tous les SelectItem avec value dynamique utilisent une valeur non-vide", () => {
    // Ce test vérifie qu'aucun SelectItem n'a value={variable} où variable pourrait être ""
    // On vérifie spécifiquement org-selector qui utilise le pattern "all" → ""
    const orgSelector = read("src/components/ui/org-selector.tsx");
    
    // Le composant doit utiliser value="all" (pas value="")
    expect(orgSelector).toContain('value="all"');
    // Et convertir "all" en "" dans onValueChange
    expect(orgSelector).toMatch(/onValueChange.*v\s*===\s*["']all["'].*\?\s*["']["']/);
  });
});

describe("Non-régression — PWA cache conflict", () => {
  it("vite.config.ts ne contient pas additionalManifestEntries pour offline.html", () => {
    const viteConfig = read("vite.config.ts");
    
    // Vérifier qu'il n'y a pas d'entrée offline.html dans additionalManifestEntries
    // (qui causait le conflit add-to-cache-list-conflicting-entries)
    const additionalManifestMatch = viteConfig.match(/additionalManifestEntries\s*:\s*\[([\s\S]*?)\]/);
    if (additionalManifestMatch) {
      const content = additionalManifestMatch[1];
      expect(content).not.toContain("offline.html");
    }
  });

  it("vite.config.ts utilise globPatterns incluant html", () => {
    const viteConfig = read("vite.config.ts");
    // globPatterns doit inclure **/*.html pour que index.html et offline.html soient precachés
    expect(viteConfig).toMatch(/globPatterns.*\*\*\/\*\.\{[^}]*html/);
  });
});

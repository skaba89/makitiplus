#!/usr/bin/env npx tsx
/**
 * convert-font-to-b64.ts
 *
 * Converts TTF font files to base64 TypeScript modules that can be
 * lazy-loaded by jsPDF's Virtual File System (VFS).
 *
 * Usage:
 *   npx tsx scripts/convert-font-to-b64.ts
 *
 * This will:
 *   1. Read the source TTF files
 *   2. Convert to base64
 *   3. Write TypeScript modules to src/utils/fonts/
 *
 * Font sources (Liberation Sans — metric-compatible with Arial/Helvetica,
 * full Latin Extended + African language character support):
 *   - /usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf
 *   - /usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";

// ─── Configuration ──────────────────────────────────────────────────────────

const FONTS = [
  {
    source: "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    vfsName: "LiberationSans-Regular.ttf",
    moduleName: "liberationSansRegular",
    exportName: "LIBERATION_SANS_REGULAR",
  },
  {
    source: "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    vfsName: "LiberationSans-Bold.ttf",
    moduleName: "liberationSansBold",
    exportName: "LIBERATION_SANS_BOLD",
  },
];

const OUTPUT_DIR = join(
  import.meta.dirname ?? __dirname,
  "..",
  "src",
  "utils",
  "fonts"
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function toBase64(filePath: string): string {
  const buffer = readFileSync(filePath);
  return buffer.toString("base64");
}

function writeFontModule(
  outputPath: string,
  exportName: string,
  vfsName: string,
  b64: string
): void {
  // Split the base64 string into chunks of 5000 chars to avoid
  // excessively long lines (better for VCS / diffs / git blame)
  const chunkSize = 5000;
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += chunkSize) {
    chunks.push(b64.slice(i, i + chunkSize));
  }

  const lines = [
    "/**",
    ` * Auto-generated font data module for jsPDF VFS.`,
    ` * Source: ${vfsName}`,
    ` * DO NOT EDIT — regenerate with: npx tsx scripts/convert-font-to-b64.ts`,
    ` *`,
    ` * Base64-encoded TTF font. Loaded lazily by pdfFont.ts only when`,
    ` * generating a PDF, so this module is never included in the initial bundle.`,
    " */",
    "",
    `export const ${exportName} = [`,
    ...chunks.map((c) => `  "${c}",`),
    "].join(\"\");",
    "",
  ].join("\n");

  writeFileSync(outputPath, lines, "utf-8");
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  console.log("🔤 Converting TTF fonts to base64 TypeScript modules...\n");

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Generate index.ts barrel
  const indexExports: string[] = [];

  for (const font of FONTS) {
    if (!existsSync(font.source)) {
      console.error(`  ❌ Source font not found: ${font.source}`);
      console.error(
        `     Install Liberation Sans fonts or update the path in this script.`
      );
      process.exit(1);
    }

    const fileSize = readFileSync(font.source).length;
    console.log(
      `  📖 Reading ${basename(font.source)} (${(fileSize / 1024).toFixed(0)} KB)...`
    );

    const b64 = toBase64(font.source);
    console.log(
      `  📝 Base64 size: ${(b64.length / 1024).toFixed(0)} KB`
    );

    const outputPath = join(OUTPUT_DIR, `${font.moduleName}.ts`);
    writeFontModule(outputPath, font.exportName, font.vfsName, b64);
    console.log(`  ✅ Written: ${outputPath}\n`);

    indexExports.push(
      `export { ${font.exportName} } from "./${font.moduleName}";`
    );
  }

  // Write barrel index
  const indexPath = join(OUTPUT_DIR, "index.ts");
  const indexContent = [
    "/**",
    " * Barrel export for PDF font data modules.",
    " * Each font is in a separate file for lazy loading via dynamic import().",
    " * Auto-generated — regenerate with: npx tsx scripts/convert-font-to-b64.ts",
    " */",
    "",
    ...indexExports,
    "",
  ].join("\n");
  writeFileSync(indexPath, indexContent, "utf-8");
  console.log(`  ✅ Barrel index: ${indexPath}\n`);

  console.log("🎉 Font conversion complete!");
  console.log(
    "\n  Next: Import `ensurePdfFont` from '@/utils/pdfFont' in your PDF generators."
  );
}

main();

/**
 * Parseur CSV minimal, sans dépendance externe.
 *
 * Gère les champs entre guillemets (avec virgules/retours à la ligne internes)
 * et les guillemets échappés (""), contrairement à un simple `split(",")`.
 * RFC 4180, sans support des dialectes exotiques (délimiteur toujours ",").
 */

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  // Retire un BOM UTF-8 éventuel (Excel l'ajoute souvent en export CSV)
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  // Dernière ligne (pas de \n final)
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  // Ignorer les lignes entièrement vides (ex: ligne finale après le dernier \n)
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Échappe un champ pour l'écriture CSV (RFC 4180). */
export function escapeCSVField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCSV(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCSVField).join(",")).join("\r\n");
}

import { describe, expect, it } from "vitest";
import { parseCSV, toCSV, escapeCSVField } from "@/utils/csvParser";

describe("parseCSV", () => {
  it("parse un CSV simple", () => {
    expect(parseCSV("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("gère les champs entre guillemets avec des virgules internes", () => {
    expect(parseCSV('nom,prix\n"Riz, 25kg",350000')).toEqual([
      ["nom", "prix"],
      ["Riz, 25kg", "350000"],
    ]);
  });

  it("gère les guillemets échappés (doublés)", () => {
    expect(parseCSV('nom\n"Le ""meilleur"" riz"')).toEqual([
      ["nom"],
      ['Le "meilleur" riz'],
    ]);
  });

  it("gère les retours à la ligne internes dans un champ entre guillemets", () => {
    expect(parseCSV('nom,description\nRiz,"Ligne 1\nLigne 2"')).toEqual([
      ["nom", "description"],
      ["Riz", "Ligne 1\nLigne 2"],
    ]);
  });

  it("gère les fins de ligne CRLF", () => {
    expect(parseCSV("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("retire un BOM UTF-8 en tête de fichier", () => {
    expect(parseCSV("﻿nom,prix\nRiz,350000")).toEqual([
      ["nom", "prix"],
      ["Riz", "350000"],
    ]);
  });

  it("ignore les lignes vides en fin de fichier", () => {
    expect(parseCSV("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("gère un fichier vide", () => {
    expect(parseCSV("")).toEqual([]);
  });

  it("gère des champs vides", () => {
    expect(parseCSV("a,,c\n1,,3")).toEqual([
      ["a", "", "c"],
      ["1", "", "3"],
    ]);
  });
});

describe("escapeCSVField / toCSV", () => {
  it("échappe un champ contenant une virgule", () => {
    expect(escapeCSVField("Riz, 25kg")).toBe('"Riz, 25kg"');
  });

  it("échappe un champ contenant des guillemets", () => {
    expect(escapeCSVField('Le "meilleur"')).toBe('"Le ""meilleur"""');
  });

  it("ne touche pas un champ simple", () => {
    expect(escapeCSVField("Riz")).toBe("Riz");
  });

  it("round-trip : toCSV puis parseCSV redonne les mêmes données", () => {
    const original = [
      ["nom", "description"],
      ["Riz, 25kg", 'Le "meilleur" riz local'],
    ];
    expect(parseCSV(toCSV(original))).toEqual(original);
  });
});

// CSV « à la française » : séparateur point-virgule et BOM UTF-8 pour qu'Excel l'ouvre correctement

export const CSV_SEPARATOR = ";";

function escapeCell(value: string) {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(header: string[], rows: string[][]) {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(CSV_SEPARATOR));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/**
 * Analyse un CSV (guillemets, retours à la ligne dans les cellules, "" échappés).
 * Le séparateur est détecté sur la première ligne : « ; » ou « , ».
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const firstLine = input.slice(0, input.search(/\r?\n|$/));
  const sep = firstLine.split(";").length >= firstLine.split(",").length ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Ignore les lignes entièrement vides
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

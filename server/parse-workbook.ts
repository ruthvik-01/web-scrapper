import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { unzipSync } from "fflate";
import { IMPORT_LIMITS, type SheetData } from "./import-types.js";

/** Resource-limited child only. Cached cell values/hyperlinks are read; formulas/macros are never executed. */
export async function parseWorkbook(path: string): Promise<SheetData[]> {
  const bytes = await readFile(path);
  if (bytes.length > IMPORT_LIMITS.bytes) throw new Error("The file exceeds the 10 MB limit.");
  // Inspect ZIP central-directory sizes before inflating OpenXML workbooks.
  if (bytes.length >= 4 && [0x04034b50, 0x06054b50].includes(bytes.readUInt32LE(0))) {
    let expanded = 0, entries = 0;
    unzipSync(bytes, { filter: file => {
      expanded += file.originalSize; entries++;
      if (expanded > IMPORT_LIMITS.expandedBytes || entries > 10_000) throw new Error("The expanded workbook is too large. Split it into smaller files.");
      return false; // Inspect metadata only; do not inflate any entry here.
    } });
  }
  const book = XLSX.read(bytes, {
    type: "buffer", raw: true, cellFormula: true, cellHTML: false,
    bookVBA: false, sheetRows: IMPORT_LIMITS.rows + 1,
  });
  if (!book.SheetNames.length) throw new Error("No readable worksheets found.");
  if (book.SheetNames.length > IMPORT_LIMITS.sheets) throw new Error("Use a workbook with at most 20 worksheets.");
  const sheets: SheetData[] = [];
  let totalCells = 0;
  let totalText = 0;
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name]!;
    const ref = sheet["!fullref"] || sheet["!ref"];
    if (!ref) { sheets.push({ name, rows: [], links: {} }); continue; }
    const range = XLSX.utils.decode_range(ref);
    if (range.e.r >= IMPORT_LIMITS.rows || range.e.c >= IMPORT_LIMITS.columns) {
      throw new Error(`Worksheet "${name}" exceeds 10,000 rows or 100 columns. Split or trim the sheet.`);
    }
    totalCells += (range.e.r + 1) * (range.e.c + 1);
    if (totalCells > 500_000) throw new Error("The workbook contains too many cells for an interactive import.");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1, raw: false, defval: "", blankrows: true,
      range: { s: { r: 0, c: 0 }, e: range.e },
    }).map(row => row.map(value => {
      const text = String(value ?? "");
      if (text.length > 64_000) throw new Error("A cell contains too much text for this import.");
      totalText += text.length;
      if (totalText > 20_000_000) throw new Error("The workbook contains too much text. Split it into smaller files.");
      return text;
    }));
    const links: Record<string, string> = {};
    for (let row = 0; row <= range.e.r; row++) {
      for (let col = 0; col <= range.e.c; col++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        // Read a literal HYPERLINK URL as data; never evaluate expressions/cell references.
        const literalLink = typeof cell?.f === "string"
          ? /^\s*=?\s*(?:_xlfn\.)?HYPERLINK\(\s*"((?:[^"]|"")*)"\s*[,;)]/i.exec(cell.f)?.[1]?.replace(/""/g, '"')
          : undefined;
        if (cell?.l?.Target || literalLink) {
          const target = String(cell.l?.Target || literalLink);
          if (target.length > 8192) throw new Error("A hyperlink is too long for this import.");
          links[`${row}:${col}`] = target;
        }
      }
    }
    sheets.push({ name, rows, links });
  }
  return sheets;
}

if (process.argv[2]) {
  parseWorkbook(process.argv[2]).then(sheets => {
    process.send?.({ sheets }, () => process.disconnect?.());
  }).catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    process.send?.({ error: /password|encrypt/i.test(message) ? "Password-protected files are not supported. Save an unprotected copy." : message }, () => process.disconnect?.());
  });
}

export interface SheetData {
  name: string;
  rows: string[][];
  links: Record<string, string>;
}
export interface ImportMapping {
  sheet: number;
  headerRow: number;
  nameColumn: number;
  urlColumn: number;
  websiteColumn?: number;
  apiColumn?: number;
  sitemapColumn?: number;
}
export const IMPORT_LIMITS = { bytes: 10 * 1024 * 1024, rows: 10_000, columns: 100, sheets: 20, expandedBytes: 64 * 1024 * 1024 };

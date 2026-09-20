/** CSV encoding with spreadsheet-formula escaping, matching the project contract. */
export function toCsv(columns: readonly string[], rows: Record<string, string>[]): string {
  const escape = (value: string): string => {
    if (!value) return "";
    const safe = /^[\s]*[=+\-@]/.test(value) || /^[\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return "\uFEFF" + [
    columns.join(","),
    ...rows.map(row => columns.map(column => escape(row[column] ?? "")).join(",")),
  ].join("\r\n") + "\r\n";
}

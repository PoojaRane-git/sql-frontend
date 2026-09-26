export function unionColumns(rows) {
  const seen = new Set();
  rows.forEach((row) => Object.keys(row).forEach((k) => seen.add(k)));
  return Array.from(seen);
}
export function getGroupColors(groups) {
  const colors = {};
  if (groups) {
    const palette = ["#dbeafe", "#dcfce7", "#fef9c3", "#fde2e2", "#ede9fe", "#ffe4e6"];
    Object.keys(groups).forEach((g, i) => { colors[g] = palette[i % palette.length]; });
  }
  return colors;
}

export function rowGroupColor(rowKey, groups, groupColors) {
  if (!groups || !rowKey) return null;
  const found = Object.entries(groups).find(([, keys]) => keys.includes(rowKey));
  return found ? groupColors[found[0]] : null;
}
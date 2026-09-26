export function formatCell(value) {
  if (value === null || value === undefined) return "NULL";
  return String(value);
}

export function findFragmentRange(sqlText, fragment) {
  if (!sqlText || !fragment) return null;
  const exactIdx = sqlText.indexOf(fragment);
  if (exactIdx !== -1) return [exactIdx, exactIdx + fragment.length];

  const map = [];
  let normalized = "";
  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    if (/\s/.test(ch)) continue;
    normalized += ch.toLowerCase();
    map.push(i);
  }

  const tryMatch = (frag) => {
    let normFrag = "";
    for (const ch of frag) {
      if (/\s/.test(ch)) continue;
      normFrag += ch.toLowerCase();
    }
    if (!normFrag) return null;
    const idx = normalized.indexOf(normFrag);
    if (idx === -1) return null;
    return [map[idx], map[idx + normFrag.length - 1] + 1];
  };

  return tryMatch(fragment) || tryMatch(fragment.replace(/;\s*$/, "")) || tryMatch(fragment + ";") || null;
}
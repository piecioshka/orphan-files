import fs from "fs";

// A baseline records the currently-known unused files so CI can fail only on
// NEW unused files while existing ones are tackled incrementally.

export function loadBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
    return Array.isArray(data?.unusedFiles) ? data.unusedFiles : [];
  } catch {
    return [];
  }
}

export function writeBaseline(baselinePath, unusedRelative) {
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        unusedFiles: [...unusedRelative].sort(),
      },
      null,
      2,
    ) + "\n",
  );
}

// Removes baselined entries; returns the files that are newly unused.
export function applyBaseline(unusedRelative, baselineList) {
  const known = new Set(baselineList);
  return unusedRelative.filter((rel) => !known.has(rel));
}

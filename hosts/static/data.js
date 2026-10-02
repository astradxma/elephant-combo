// The fixture vocabulary, mirrored in hosts/blazor/Strains.cs — keep the two in step.
// No randomness: row i is always the same, so tests can name rows.
export const ORGS = [
  ["PA", "Pseudomonas aeruginosa"], ["KP", "Klebsiella pneumoniae"], ["SA", "Staphylococcus aureus"],
  ["EC", "Escherichia coli"], ["AB", "Acinetobacter baumannii"], ["NG", "Neisseria gonorrhoeae"],
  ["EF", "Enterococcus faecium"], ["BS", "Bacillus subtilis"],
];
export const SOURCES = ["ATCC", "DSMZ", "CDC AR Bank", "clinical isolate", "in-house", "NCTC", "BEI"];

export function strains(n) {
  return Array.from({ length: n }, (_, i) => {
    const [code, org] = ORGS[i % ORGS.length];
    const num = String(i + 1).padStart(4, "0");
    return { id: `${code}-${num}`, label: `${code}-${num}`, description: `${org} · ${SOURCES[i % SOURCES.length]}`, atoms: [`${code}${num}`] };
  });
}

// One entry per fixture combo: [id, config, row count].
export const KINDS = [
  ["single", { max: 1, placeholder: "Strain…" }, 1500],
  ["custom", { max: 1, allowCustom: true, placeholder: "Strain or new name…" }, 1200],
  ["multi3", { max: 3, placeholder: "Up to 3…" }, 1000],
  ["tri", { states: ["include", "exclude"], placeholder: "Filter…" }, 1800],
  ["excl", { states: ["exclude"], placeholder: "Exclude…" }, 1000],
];

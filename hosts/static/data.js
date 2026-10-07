// The fixture vocabulary, mirrored in hosts/blazor/Strains.cs — keep the two in step.
// No randomness: row i is always the same, so tests can name rows.
export const ORGS = [
  ["PA", "Pseudomonas aeruginosa"], ["KP", "Klebsiella pneumoniae"], ["SA", "Staphylococcus aureus"],
  ["EC", "Escherichia coli"], ["AB", "Acinetobacter baumannii"], ["NG", "Neisseria gonorrhoeae"],
  ["EF", "Enterococcus faecium"], ["BS", "Bacillus subtilis"],
];
export const SOURCES = ["ATCC", "DSMZ", "CDC AR Bank", "clinical isolate", "in-house", "NCTC", "BEI"];

// `withHref` gives each row a link, as a case source would.
export function strains(n, withHref = false) {
  return Array.from({ length: n }, (_, i) => {
    const [code, org] = ORGS[i % ORGS.length];
    const num = String(i + 1).padStart(4, "0");
    return { id: `${code}-${num}`, label: `${code}-${num}`, description: `${org} · ${SOURCES[i % SOURCES.length]}`, atoms: [`${code}${num}`], ...(withHref ? { href: `/cases/${code}-${num}` } : {}) };
  });
}

// One entry per fixture combo: [id, config, row count].
export const KINDS = [
  ["single", { max: 1, placeholder: "Strain…" }, 1500],
  ["custom", { max: 1, allowCustom: true, placeholder: "Strain or new name…" }, 1200],
  ["multi3", { max: 3, placeholder: "Up to 3…" }, 1000],
  ["tri", { states: ["include", "exclude"], placeholder: "Filter…" }, 1800],
  ["excl", { states: ["exclude"], placeholder: "Exclude…" }, 1000],
  // No inline rows: everything comes from the search route, which also checks
  // that a param already in the URL (caseType) survives the element adding q/limit.
  ["server", { max: 1, search: "/api/options?caseType=strain-lot", placeholder: "Search…" }, 0],
  // A type the route refuses (as Elephant's /cases/options does without summary.search:).
  ["refused", { max: 1, search: "/api/options?caseType=unsearchable", placeholder: "Search…" }, 0],
];

// A route refusal, shaped like Elephant's CaseApiError — or null when the request is fine.
export function searchRefusal(params) {
  const type = params.get("caseType");
  return type === "strain-lot" ? null
    : { status: 400, body: { errors: [`Case type '${type}' declares no summary.search: descriptor.`] } };
}

// What /api/options answers (both hosts): deliberately LOOSE — any token on any
// field — so the tests can see the element narrow it back to token-AND.
export function serverSearch(params) {
  const tokens = (params.get("q") || "").toLowerCase().split(/\s+/).filter(Boolean);
  const limit = Number(params.get("limit") || 50);
  const hits = strains(5000, true).filter((o) =>
    tokens.some((t) => o.label.toLowerCase().includes(t) || o.description.toLowerCase().includes(t)));
  return { options: hits.slice(0, limit), hasMore: hits.length > limit };
}

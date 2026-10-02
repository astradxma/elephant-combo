// Pure-core tests for <elephant-combo>: matching and the selection model.
// Ported from WithDescriptionDropdownInputTests when that component became a
// thin wrapper over the element. Run: node --test tests/js/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOption, normalizeSelection, normalizeConfig,
  indexOptions, filterIndex, clickOption, removeId, stateOf,
} from "../../src/elephant-combo.js";

const items = [
  { id: "EC-001", label: "EC-001", description: "E. coli K12 strain" },
  { id: "EC-002", label: "EC-002", description: "E. coli BL21 strain" },
  { id: "PA-001", label: "PA-001", description: "Pseudomonas aeruginosa PAO1" },
].map(normalizeOption);
const ids = (xs) => xs.map((o) => o.id);
const search = (q, opts = items) => ids(filterIndex(indexOptions(opts), q));

const single = normalizeConfig({ max: 1 });
const multi = normalizeConfig({});
const tri = normalizeConfig({ states: ["include", "exclude"] });

// ── matching ──
test("empty filter returns all", () => assert.deepEqual(search(""), ["EC-001", "EC-002", "PA-001"]));
test("token matches label", () => assert.deepEqual(search("pa-0"), ["PA-001"]));
test("token matches description", () => assert.deepEqual(search("bl21"), ["EC-002"]));
test("tokens AND across label and description", () => assert.deepEqual(search("ec-00 k12"), ["EC-001"]));
test("case-insensitive", () => assert.deepEqual(search("PSEUDOMONAS"), ["PA-001"]));
test("order-insensitive", () => assert.deepEqual(search("strain coli"), ["EC-001", "EC-002"]));
test("no match", () => assert.deepEqual(search("zzz"), []));
test("a token may not straddle two fields", () => {
  assert.deepEqual(search("001 pseudo"), ["PA-001"]); // two tokens, two fields: fine
  assert.deepEqual(search("001e."), []);               // label "EC-001" + description "E. coli"
});
test("atoms are searchable but not labels", () => {
  const lots = [normalizeOption({ id: "cf70", label: "AR lot 1", atoms: ["AR-001", "pseudomonas aeruginosa", "PAO1", "ATCC"] })];
  assert.deepEqual(search("pao1 atcc", lots), ["cf70"]);
  assert.equal(lots[0].label, "AR lot 1");
});

test("badge text is searchable; swatch is not", () => {
  const opts = [normalizeOption({ id: "a", label: "AR-001", swatch: "#f00", badges: ["MDR", { text: "BSL-2", tone: "amber" }] })];
  assert.deepEqual(search("mdr", opts), ["a"]);
  assert.deepEqual(search("bsl-2 ar", opts), ["a"]);
  assert.deepEqual(search("#f00", opts), []);
});

// ── normalisation ──
test("CSV-source {value,label} rows normalise to id + description", () => {
  assert.deepEqual(normalizeOption({ value: "EC-001", label: "E. coli K12" }),
    { id: "EC-001", label: "EC-001", description: "E. coli K12", atoms: [], ghost: false });
  assert.equal(normalizeOption({ value: "X", label: "X" }).description, null);
});
test("formatting fields normalise and pass data through", () => {
  const o = normalizeOption({ id: "a", swatch: "teal", badges: ["x", { text: "y", tone: "red" }], data: { n: 1 } });
  assert.deepEqual(o.badges, [{ text: "x", tone: null }, { text: "y", tone: "red" }]);
  assert.equal(o.swatch, "teal");
  assert.deepEqual(o.data, { n: 1 });
});
test("selection: deduped, include wins over exclude", () => {
  assert.deepEqual(normalizeSelection({ include: ["a", "a", ""], exclude: ["a", "b"] }), { include: ["a"], exclude: ["b"] });
});
test("custom values only in single, single-state mode", () => {
  assert.equal(normalizeConfig({ max: 1, allowCustom: true }).allowCustom, true);
  assert.equal(normalizeConfig({ allowCustom: true }).allowCustom, false);
  assert.equal(normalizeConfig({ states: ["include", "exclude"], max: 1, allowCustom: true }).allowCustom, false);
});

// ── selection model ──
const none = normalizeSelection({});
test("single: a pick replaces", () => {
  assert.deepEqual(clickOption(clickOption(none, "a", single), "b", single), { include: ["b"], exclude: [] });
});
test("single: picking the current value keeps it", () => {
  assert.deepEqual(clickOption({ include: ["a"], exclude: [] }, "a", single), { include: ["a"], exclude: [] });
});
test("multi: click adds, click again removes", () => {
  const one = clickOption(none, "a", multi);
  assert.deepEqual(one.include, ["a"]);
  assert.deepEqual(clickOption(one, "a", multi).include, []);
});
test("multi with max refuses past the cap", () => {
  const cfg = normalizeConfig({ max: 2 });
  const two = clickOption(clickOption(none, "a", cfg), "b", cfg);
  assert.equal(clickOption(two, "c", cfg), two);
});
test("tri-state cycles neutral → include → exclude → neutral", () => {
  const s1 = clickOption(none, "a", tri);
  assert.equal(stateOf(s1, "a"), "include");
  const s2 = clickOption(s1, "a", tri);
  assert.equal(stateOf(s2, "a"), "exclude");
  assert.deepEqual(clickOption(s2, "a", tri), none);
});
test("exclude-only is a valid cycle (negative selection without include)", () => {
  const cfg = normalizeConfig({ states: ["exclude"] });
  const s = clickOption(none, "a", cfg);
  assert.deepEqual(s, { include: [], exclude: ["a"] });
  assert.deepEqual(clickOption(s, "a", cfg), none);
});
test("unknown ids survive in the selection", () => {
  const s = clickOption(none, "not-in-options", tri);
  assert.deepEqual(s.include, ["not-in-options"]);
});
test("removeId clears either state", () => {
  assert.deepEqual(removeId({ include: ["a"], exclude: ["b"] }, "b"), { include: ["a"], exclude: [] });
});

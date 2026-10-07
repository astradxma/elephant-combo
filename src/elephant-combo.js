// <elephant-combo> — the one dropdown, shared by Elephant (Blazor) and external
// surfaces (the wellplate widget loads this file from the host's origin).
//
// Two JSON contracts, and nothing else crosses the boundary:
//
//   options    [{ id, label, description?, atoms?: [string], ghost?: bool,
//                 swatch?: css-colour, badges?: [text | { text, tone? }], href?: url, data?: any }]
//              `id` is what gets selected — a case id, an option guid, a CSV row
//              name. `atoms` are extra search terms that never render (a strain's
//              organism, aliases, vendor lot…). `swatch` and `badges` are the
//              JSON-only formatting (tone: green|red|blue|amber|gray); badge text
//              is searchable, because it is visible. `data` is carried untouched
//              for `renderOption`. `href` makes a picked value openable: the trigger
//              and each chip get a ↗ link (config `linkTarget`, default "_top" so a
//              link inside an embedded surface navigates the whole page; cmd-click
//              still opens a tab). `{ value, label }` rows from the CSV-source
//              endpoint are accepted and normalised.
//
// Custom formatting beyond that is a JS property, not JSON:
//
//   el.renderOption = (option, { state, highlighted }) => Node | string
//              Replaces the row's text block. Called only for the rows on screen
//              (virtualised), so it may be as fancy as it likes — but rows are a
//              fixed 44px high, so it must fit in two lines.
//
//   selection  { include: [id], exclude: [id] }
//              One shape for every mode. Single and multi only ever fill
//              `include`; tri-state uses both. Ids absent from `options` are kept
//              (a custom value, a case not in the current page of results) and
//              render via `labels`, else as the bare id.
//
// The mode is not a switch, it is `config`:
//
//   states       ["include"]            → single / multi
//                ["include", "exclude"] → tri-state (click cycles neutral → … → neutral)
//   max          1 → single: a pick replaces, commits and closes. null → unbounded.
//   allowCustom  single only: a "✚ Use …" row commits the typed text as the id.
//   search       URL or (q, signal) => Promise<{options, hasMore}> for sources too
//                large to inline. Results are filtered by the same token rule.
//   placeholder  trigger text when nothing is selected.
//   linkTarget   target for `href` links (default "_top").
//
// Matching: whitespace-tokenised AND, case-insensitive; each token must be a
// substring of ONE field (label, description or an atom) — never straddling two.
//
// Commit rule (why Elephant owns a dropdown at all): highlight is a preview;
// only Enter or click commits. Emits `combo-change`, detail { selection, items, reason }
// where items = { id: { label, description } } for the selected ids it knows.
//
// The host element IS the trigger (tabindex=0, focus()/click() open it), so page
// scripts that look for a focusable trigger keep working across the shadow root.
// The popup uses the Popover API: it renders in the top layer, which escapes
// transformed and overflow-clipped ancestors without a positioning library.

// ── Pure core (exported for tests; no DOM) ──────────────────────────────────

export function normalizeOption(o) {
  if (o == null) return null;
  if (typeof o === "string") return { id: o, label: o, description: null, atoms: [], ghost: false };
  const looks = {};
  if (o.swatch) looks.swatch = String(o.swatch);
  if (Array.isArray(o.badges) && o.badges.length) {
    looks.badges = o.badges.map((b) => (typeof b === "string" ? { text: b, tone: null } : { text: String(b.text), tone: b.tone ?? null }));
  }
  if (o.href) looks.href = String(o.href);
  if (o.data !== undefined) looks.data = o.data;
  if (o.id == null && o.value != null) {
    // CSV-source row: value = committed name, label = description-or-name.
    const desc = o.description ?? (o.label != null && o.label !== o.value ? o.label : null);
    return { id: String(o.value), label: String(o.value), description: desc, atoms: o.atoms || [], ghost: !!o.ghost, ...looks };
  }
  return {
    id: String(o.id),
    label: o.label != null ? String(o.label) : String(o.id),
    description: o.description ?? null,
    atoms: Array.isArray(o.atoms) ? o.atoms.map(String) : [],
    ghost: !!o.ghost,
    ...looks,
  };
}

export function normalizeSelection(sel) {
  const uniq = (xs) => [...new Set((xs || []).filter((x) => x != null && x !== "").map(String))];
  const include = uniq(sel?.include);
  const inc = new Set(include);
  return { include, exclude: uniq(sel?.exclude).filter((x) => !inc.has(x)) };
}

export function normalizeConfig(cfg) {
  const states = Array.isArray(cfg?.states) && cfg.states.length ? cfg.states : ["include"];
  const max = cfg?.max ?? null;
  return {
    states,
    max,
    allowCustom: !!cfg?.allowCustom && max === 1 && states.length === 1,
    search: cfg?.search ?? null,
    placeholder: cfg?.placeholder ?? "Select...",
    limit: cfg?.limit ?? 50,
    linkTarget: cfg?.linkTarget ?? "_top",
  };
}

export function tokenize(q) {
  return String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
}

// Lower-cased fields, computed once per option set, not per keystroke.
export function indexOptions(options) {
  return options.map((o) => ({
    option: o,
    fields: [o.label, o.description, ...o.atoms, ...(o.badges || []).map((b) => b.text)].filter(Boolean).map((s) => s.toLowerCase()),
  }));
}

export function filterIndex(index, q) {
  const tokens = tokenize(q);
  if (!tokens.length) return index.map((e) => e.option);
  const out = [];
  for (const e of index) {
    if (tokens.every((t) => e.fields.some((f) => f.includes(t)))) out.push(e.option);
  }
  return out;
}

export function stateOf(sel, id) {
  if (sel.include.includes(id)) return "include";
  if (sel.exclude.includes(id)) return "exclude";
  return null;
}

function withState(sel, id, state) {
  const include = sel.include.filter((x) => x !== id);
  const exclude = sel.exclude.filter((x) => x !== id);
  if (state === "include") include.push(id);
  if (state === "exclude") exclude.push(id);
  return { include, exclude };
}

// A click on a row. Single (max 1) always picks — clicking the current value
// re-commits it rather than clearing. Otherwise the row steps through the cycle
// [neutral, ...states]. A new include past `max` is refused (same selection back).
export function clickOption(sel, id, config) {
  if (config.max === 1 && config.states.length === 1) return { include: [id], exclude: [] };
  const cycle = [null, ...config.states];
  const next = cycle[(cycle.indexOf(stateOf(sel, id)) + 1) % cycle.length];
  if (next === "include" && config.max != null && sel.include.length >= config.max) return sel;
  return withState(sel, id, next);
}

export function removeId(sel, id) {
  return withState(sel, id, null);
}

// ── Element ─────────────────────────────────────────────────────────────────

const ROW = 44;
const OVERSCAN = 6;
const LIST_MAX = 320;

const CSS = `
:host { display: inline-block; position: relative; box-sizing: border-box; outline: none;
  min-height: 32px; padding: 4px 28px 4px 8px; cursor: pointer;
  border: 1px solid var(--ec-border, #cbd5e0); border-radius: 4px;
  background: var(--ec-bg, white); color: var(--ec-fg, inherit); font: inherit; }
:host(:focus-visible) { box-shadow: 0 0 0 2px var(--ec-focus, #93c5fd); }
.trigger { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; min-height: 22px; }
.placeholder { color: var(--ec-muted, #999); }
.caret { position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  color: var(--ec-muted, #888); font-size: 12px; pointer-events: none; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; border-radius: 999px;
  font-size: 12px; line-height: 1.4; max-width: 180px; border: 1px solid; }
.chip span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chip button { width: 16px; height: 16px; border-radius: 50%; border: none; padding: 0; cursor: pointer;
  color: inherit; background: currentColor; font-size: 11px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center; }
.chip button::after { content: "×"; color: white; }
.open { color: inherit; text-decoration: none; font-size: 0.9em; opacity: 0.7; padding: 0 2px; }
.open:hover { opacity: 1; }
.chip.include { color: #16a34a; background: #dcfce7; border-color: #16a34a33; }
.chip.exclude { color: #dc2626; background: #fee2e2; border-color: #dc262633; }
.chip.multi { color: #1d4ed8; background: #dbeafe; border-color: #1d4ed833; }
.popup { position: fixed; inset: auto; margin: 0; padding: 0; min-width: 260px; max-width: 600px;
  box-sizing: border-box; /* the min-width includes the border, as on Bootstrap pages */
  background: var(--ec-bg, white); color: var(--ec-fg, inherit);
  border: 1px solid var(--ec-border, #cbd5e0); border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12); flex-direction: column; cursor: default; }
.popup:popover-open { display: flex; }
.filter { border: none; border-bottom: 1px solid var(--ec-rule, #e2e8f0); padding: 8px; outline: none;
  font: inherit; font-size: 14px; background: transparent; color: inherit; }
.list { max-height: ${LIST_MAX}px; overflow-y: auto; position: relative; }
.spacer { position: relative; }
.row { position: absolute; left: 0; right: 0; height: ${ROW}px; box-sizing: border-box; padding: 0 8px;
  display: flex; align-items: center; gap: 8px; cursor: pointer; }
.row.sentinel { position: static; color: var(--ec-muted, #6b7280); }
.row:hover { background: var(--ec-hover, #f8fafc); }
.row.include { background: #f0fff4; }
.row.exclude { background: #fff5f5; }
.row.exclude .label { text-decoration: line-through; }
.row.multi-on { background: #eef6ff; }
.row.highlight { background: var(--ec-highlight, #f1f5f9) !important; }
.mark { width: 16px; text-align: center; font-weight: bold; flex: none; }
.mark.include { color: #28a745; } .mark.exclude { color: #dc3545; } .mark.multi { color: #1d4ed8; font-weight: normal; }
.text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.label { line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.desc { color: var(--ec-muted, #999); font-size: 0.8em; line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.swatch { width: 10px; height: 10px; border-radius: 50%; flex: none; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.15); }
.badges { display: flex; gap: 4px; flex: none; }
.badge { font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 8px; white-space: nowrap;
  color: #374151; background: #f3f4f6; }
.badge.green { color: #166534; background: #dcfce7; } .badge.red { color: #991b1b; background: #fee2e2; }
.badge.blue { color: #1e40af; background: #dbeafe; } .badge.amber { color: #92400e; background: #fef3c7; }
.ghost { color: #c00; margin-left: 4px; font-size: 0.8em; }
.note { padding: 8px 12px; color: var(--ec-muted, #888); font-style: italic; font-size: 0.9em; }
`;

// Node (the unit tests) has no DOM; the pure core above must still import.
const Base = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

export class ElephantCombo extends Base {
  static observedAttributes = ["options", "selection", "config", "placeholder", "labels"];

  constructor() {
    super();
    this._options = [];
    this._index = [];
    this._byId = new Map();
    this._labels = new Map();
    this._sel = { include: [], exclude: [] };
    this._cfg = normalizeConfig({});
    this._open = false;
    this._filter = "";
    this._view = [];
    this._hasMore = false;
    this._highlight = -2; // -1 = custom sentinel, -2 = none, ≥0 = view row
    this._fetchSeq = 0;

    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style>
      <div class="trigger" part="trigger"></div><span class="caret">▾</span>
      <div class="popup" part="popup" popover="manual">
        <input class="filter" part="filter" type="text" placeholder="Type to search..." autocomplete="off" />
        <div class="sentinel-slot"></div>
        <div class="list"><div class="spacer"></div></div>
        <div class="note" hidden></div>
      </div>`;
    this._trigger = root.querySelector(".trigger");
    this._popup = root.querySelector(".popup");
    this._input = root.querySelector(".filter");
    this._sentinelSlot = root.querySelector(".sentinel-slot");
    this._list = root.querySelector(".list");
    this._spacer = root.querySelector(".spacer");
    this._note = root.querySelector(".note");

    this.addEventListener("click", (e) => {
      if (this._popup.contains(e.composedPath()[0])) return;
      this._open ? this.close() : this.open();
    });
    this.addEventListener("keydown", (e) => this._onHostKey(e));
    this._input.addEventListener("input", () => { this._filter = this._input.value; this._refilter(true); });
    this._input.addEventListener("keydown", (e) => this._onPopupKey(e));
    this._list.addEventListener("scroll", () => this._renderRows());
    // mousedown, not click: keep focus in the filter input while picking.
    this._popup.addEventListener("mousedown", (e) => {
      const row = e.composedPath().find((n) => n.classList?.contains("row"));
      if (!row) return;
      e.preventDefault();
      if (row.classList.contains("sentinel")) this._commitCustom();
      else this._pick(Number(row.dataset.i));
    });
    this._popup.addEventListener("mousemove", (e) => {
      const row = e.composedPath().find((n) => n.classList?.contains("row"));
      if (!row) return;
      const i = row.classList.contains("sentinel") ? -1 : Number(row.dataset.i);
      if (i !== this._highlight) { this._highlight = i; this._renderRows(); }
    });
    this._onDocDown = (e) => { if (!e.composedPath().includes(this)) this.close(); };
    this._onReflow = () => this._place();
  }

  connectedCallback() {
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    if (!this.hasAttribute("role")) this.setAttribute("role", "combobox");
    this.setAttribute("aria-expanded", "false");
    this._renderTrigger();
  }

  disconnectedCallback() { this.close(); }

  attributeChangedCallback(name, _old, value) {
    if (value == null) return;
    if (name === "placeholder") { this.config = { ...this._rawCfg, placeholder: value }; return; }
    try { this[name] = JSON.parse(value); }
    catch (err) { console.error(`elephant-combo: bad JSON in [${name}]`, err); }
  }

  get options() { return this._options; }
  set options(list) {
    this._options = (list || []).map(normalizeOption).filter(Boolean);
    this._index = indexOptions(this._options);
    this._byId = new Map(this._options.map((o) => [o.id, o]));
    if (this._open) this._refilter(false);
    this._renderTrigger();
  }

  get selection() { return { include: [...this._sel.include], exclude: [...this._sel.exclude] }; }
  set selection(sel) {
    this._sel = normalizeSelection(sel);
    this._renderTrigger();
    if (this._open) this._renderRows();
  }

  get config() { return this._rawCfg || {}; }
  set config(cfg) {
    this._rawCfg = cfg || {};
    this._cfg = normalizeConfig(this._rawCfg);
    this._renderTrigger();
    if (this._open) this._refilter(false);
  }

  // Display for ids that are selected but not among `options` (a case outside the
  // current search page, a custom value). { id: label | {label, description} }.
  set labels(map) {
    for (const [id, v] of Object.entries(map || {})) {
      this._labels.set(id, typeof v === "string" ? { label: v, description: null } : v);
    }
    this._renderTrigger();
  }

  // ── open / close ──
  open(seed = "") {
    if (this._open) return;
    this._open = true;
    this.setAttribute("aria-expanded", "true");
    this._filter = seed;
    this._input.value = seed;
    this._popup.showPopover();
    this._place();
    this._refilter(true);
    this._input.focus({ preventScroll: true });
    document.addEventListener("mousedown", this._onDocDown, true);
    window.addEventListener("scroll", this._onReflow, true);
    window.addEventListener("resize", this._onReflow);
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this.setAttribute("aria-expanded", "false");
    this._fetchSeq++;
    clearTimeout(this._fetchTimer);
    try { this._popup.hidePopover(); } catch { /* already hidden */ }
    document.removeEventListener("mousedown", this._onDocDown, true);
    window.removeEventListener("scroll", this._onReflow, true);
    window.removeEventListener("resize", this._onReflow);
    this._filter = "";
    if (this.isConnected && this.shadowRoot.activeElement) this.focus({ preventScroll: true });
  }

  _place() {
    if (!this._open) return;
    const r = this.getBoundingClientRect();
    const vh = window.innerHeight, vw = window.innerWidth;
    const p = this._popup;
    p.style.minWidth = `${Math.max(260, r.width)}px`;
    const h = p.offsetHeight;
    const below = vh - r.bottom, above = r.top;
    const top = below < h + 4 && above > below ? Math.max(4, r.top - h - 2) : r.bottom + 2;
    const left = Math.max(4, Math.min(r.left, vw - p.offsetWidth - 4));
    // Whole pixels: a fractional top blurs 1px borders and text.
    p.style.top = `${Math.round(top)}px`;
    p.style.left = `${Math.round(left)}px`;
  }

  // ── filtering ──
  _refilter(resetHighlight) {
    const { search } = this._cfg;
    if (search && this._filter.trim()) {
      this._view = filterIndex(this._index, this._filter); // inline rows answer at once
      this._fetchRemote();
    } else {
      this._view = filterIndex(this._index, this._filter);
      this._hasMore = false;
    }
    if (resetHighlight) {
      this._highlight = this._cfg.allowCustom ? -1 : (this._view.length ? 0 : -2);
      this._list.scrollTop = 0;
    }
    this._renderRows();
  }

  _fetchRemote() {
    clearTimeout(this._fetchTimer);
    const seq = ++this._fetchSeq;
    const q = this._filter.trim();
    this._fetchTimer = setTimeout(async () => {
      let res;
      try {
        // A newer keystroke aborts the request in flight; the sequence check below
        // still guards hosts whose search function ignores the signal.
        this._abort?.abort();
        const { signal } = (this._abort = new AbortController());
        const s = this._cfg.search;
        if (typeof s === "function") res = await s(q, signal);
        else {
          const sep = s.includes("?") ? "&" : "?";
          const r = await fetch(`${s}${sep}q=${encodeURIComponent(q)}&limit=${this._cfg.limit}`, { signal });
          res = r.ok ? await r.json() : { options: [] };
        }
      } catch { res = { options: [] }; }
      if (seq !== this._fetchSeq || !this._open) return;
      const remote = (Array.isArray(res) ? res : res.options || []).map(normalizeOption).filter(Boolean);
      for (const o of remote) if (!this._labels.has(o.id)) this._labels.set(o.id, o);
      // Same token rule on what the server returned, so both paths agree.
      const known = new Set(this._view.map((o) => o.id));
      this._view = this._view.concat(filterIndex(indexOptions(remote), q).filter((o) => !known.has(o.id)));
      this._hasMore = !!res.hasMore;
      if (this._highlight === -2 && this._view.length) this._highlight = 0;
      this._renderRows();
    }, 150);
  }

  // ── rendering ──
  _display(id) {
    return this._byId.get(id) || this._labels.get(id) || { label: id, description: null };
  }

  _renderTrigger() {
    const t = this._trigger;
    t.textContent = "";
    const { include, exclude } = this._sel;
    const single = this._cfg.max === 1;
    if (!include.length && !exclude.length) {
      const ph = document.createElement("span");
      ph.className = "placeholder";
      ph.textContent = this._cfg.placeholder;
      t.append(ph);
      return;
    }
    // A ↗ link for a value with an href. Its click must not toggle the popup.
    const link = (id) => {
      const href = this._display(id).href;
      if (!href) return [];
      const a = document.createElement("a");
      a.className = "open";
      a.setAttribute("part", "link");
      a.href = href;
      a.target = this._cfg.linkTarget;
      a.title = "Open";
      a.textContent = "↗";
      a.addEventListener("click", (e) => e.stopPropagation());
      return [a];
    };
    if (single) {
      const s = document.createElement("span");
      s.className = "value";
      s.setAttribute("part", "value");
      s.textContent = this._display(include[0]).label;
      t.append(s, ...link(include[0]));
      return;
    }
    const tri = this._cfg.states.includes("exclude");
    const chip = (id, kind) => {
      const c = document.createElement("span");
      c.className = `chip ${kind}`;
      if (kind === "exclude") { const n = document.createElement("b"); n.textContent = "¬"; c.append(n); }
      const l = document.createElement("span");
      l.textContent = this._display(id).label;
      const b = document.createElement("button");
      b.type = "button";
      b.title = "Remove";
      b.addEventListener("click", (e) => { e.stopPropagation(); this._commit(removeId(this._sel, id), "remove"); });
      c.append(l, ...link(id), b);
      t.append(c);
    };
    for (const id of include) chip(id, tri ? "include" : "multi");
    for (const id of exclude) chip(id, "exclude");
  }

  _renderRows() {
    if (!this._open) return;
    const cfg = this._cfg;
    // Custom-value sentinel sits above the virtual list.
    this._sentinelSlot.textContent = "";
    if (cfg.allowCustom) {
      const s = document.createElement("div");
      s.className = `row sentinel${this._highlight === -1 ? " highlight" : ""}`;
      s.textContent = this._filter ? `✚ Use "${this._filter}"` : "✚ Type to add a new value";
      this._sentinelSlot.append(s);
    }
    // A selected custom value that is not in the source still shows as a row.
    let view = this._view;
    if (cfg.allowCustom && this._sel.include.length && !this._filter) {
      const v = this._sel.include[0];
      if (!view.some((o) => o.id === v)) view = view.concat([{ ...this._display(v), id: v, atoms: [], ghost: false }]);
    }
    this._rendered = view;

    this._spacer.style.height = `${view.length * ROW}px`;
    const top = this._list.scrollTop;
    const first = Math.max(0, Math.floor(top / ROW) - OVERSCAN);
    const last = Math.min(view.length, Math.ceil((top + LIST_MAX) / ROW) + OVERSCAN);
    const frag = document.createDocumentFragment();
    const tri = cfg.states.includes("exclude");
    const multi = !tri && cfg.max !== 1;
    for (let i = first; i < last; i++) {
      const o = view[i];
      const st = stateOf(this._sel, o.id);
      const row = document.createElement("div");
      row.dataset.i = String(i);
      row.style.top = `${i * ROW}px`;
      row.className = "row"
        + (tri && st ? ` ${st}` : "")
        + (multi && st === "include" ? " multi-on" : "")
        + (i === this._highlight ? " highlight" : "");
      row.setAttribute("part", "row");
      if (tri || multi) {
        const m = document.createElement("span");
        m.className = `mark ${tri ? (st || "") : "multi"}`;
        m.textContent = tri ? (st === "include" ? "+" : st === "exclude" ? "−" : "") : (st ? "✓" : "");
        row.append(m);
      }
      if (o.swatch) { const w = document.createElement("span"); w.className = "swatch"; w.style.background = o.swatch; row.append(w); }
      const text = document.createElement("div");
      text.className = "text";
      const custom = this.renderOption?.(o, { state: st, highlighted: i === this._highlight });
      if (custom != null) text.append(custom);
      else {
        const label = document.createElement("span");
        label.className = "label";
        label.setAttribute("part", "label");
        label.textContent = o.label;
        if (o.ghost) { const g = document.createElement("small"); g.className = "ghost"; g.textContent = "(no longer in source)"; label.append(g); }
        text.append(label);
        if (o.description) { const d = document.createElement("small"); d.className = "desc"; d.setAttribute("part", "desc"); d.textContent = o.description; text.append(d); }
      }
      row.append(text);
      if (o.badges) {
        const bs = document.createElement("span");
        bs.className = "badges";
        for (const b of o.badges) { const e = document.createElement("span"); e.className = `badge ${b.tone || ""}`; e.textContent = b.text; bs.append(e); }
        row.append(bs);
      }
      frag.append(row);
    }
    this._spacer.replaceChildren(frag);

    const note = !view.length && !cfg.allowCustom ? "No matches"
      : this._hasMore ? "More matches — keep typing to narrow" : "";
    this._note.hidden = !note;
    this._note.textContent = note;
    this._place();
  }

  _scrollToHighlight() {
    if (this._highlight < 0) return;
    const y = this._highlight * ROW, l = this._list;
    if (y < l.scrollTop) l.scrollTop = y;
    else if (y + ROW > l.scrollTop + l.clientHeight) l.scrollTop = y + ROW - l.clientHeight;
  }

  // ── commits ──
  _commit(sel, reason) {
    this._sel = normalizeSelection(sel);
    this._renderTrigger();
    this._renderRows();
    this.dispatchEvent(new CustomEvent("combo-change", {
      bubbles: true, composed: true,
      detail: { selection: this.selection, items: this._itemsFor(this._sel), reason },
    }));
  }

  // Display of each selected id this element knows (from options, labels or a
  // search result) — a remote pick is otherwise unknown to the page.
  _itemsFor(sel) {
    const out = {};
    for (const id of [...sel.include, ...sel.exclude]) {
      const o = this._byId.get(id) || this._labels.get(id);
      if (o) out[id] = { label: o.label, description: o.description ?? null, ...(o.href ? { href: o.href } : {}) };
    }
    return out;
  }

  _pick(i) {
    const o = (this._rendered || [])[i];
    if (!o) return;
    if (!this._byId.has(o.id)) this._labels.set(o.id, o);
    const next = clickOption(this._sel, o.id, this._cfg);
    if (next === this._sel) return; // refused (max reached)
    this._commit(next, "pick");
    if (this._cfg.max === 1) this.close();
  }

  _commitCustom() {
    const text = this._filter;
    if (!this._cfg.allowCustom || !text) return;
    this._commit({ include: [text], exclude: [] }, "custom");
    this.close();
  }

  // ── keyboard ──
  _onHostKey(e) {
    if (this._open || e.composedPath()[0] !== this) return;
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); this.open(); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); this.open(e.key); }
  }

  _onPopupKey(e) {
    const n = (this._rendered || []).length;
    const min = this._cfg.allowCustom ? -1 : 0;
    const move = (to) => { this._highlight = to; this._scrollToHighlight(); this._renderRows(); };
    switch (e.key) {
      // An open popup owns Escape: close it and stop there, so the dialog or row
      // editor around us is not dismissed too (Radzen's own popups behave the same).
      // With the popup closed, Escape on the trigger bubbles as usual.
      case "Escape": e.stopPropagation(); this.close(); return;
      case "ArrowDown": e.preventDefault(); if (n || min < 0) move(this._highlight >= n - 1 || this._highlight < min ? min : this._highlight + 1); return;
      case "ArrowUp": e.preventDefault(); if (n || min < 0) move(this._highlight <= min ? Math.max(min, n - 1) : this._highlight - 1); return;
      case "Home": e.preventDefault(); move(min); return;
      case "End": e.preventDefault(); move(n ? n - 1 : -2); return;
      case "Tab": e.preventDefault(); return; // focus stays in the popup until Esc / commit
      case "Enter":
        e.preventDefault();
        if (this._highlight === -1) this._commitCustom();
        else if (this._highlight >= 0) this._pick(this._highlight);
        return;
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("elephant-combo")) {
  customElements.define("elephant-combo", ElephantCombo);
}

// ── Blazor glue ─────────────────────────────────────────────────────────────
// WithDescriptionDropdownInput imports this module and drives the element through
// these two calls; commits come back through OnComboChange on the .NET ref.

export function mount(el, dotNetRef, state) {
  update(el, state);
  el.addEventListener("combo-change", (e) => {
    dotNetRef.invokeMethodAsync("OnComboChange", e.detail).catch(() => { /* circuit gone */ });
  });
}

export function update(el, state) {
  if (!el || !state) return;
  if (state.config) el.config = state.config;
  if (state.options) el.options = state.options;
  if (state.selection) el.selection = state.selection;
  if (state.labels) el.labels = state.labels;
}

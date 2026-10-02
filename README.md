# elephant-combo

One dropdown, every host. `<elephant-combo>` is a framework-free web component —
a single ES module, no build step, no dependencies — for picking from long lists:

- **single**, **multi** (optionally capped), **include + exclude**, or **exclude-only** — one element, the mode is config;
- **virtualised**: ~14 rows in the DOM whether the list has 50 rows or 50,000;
- **token-AND search**: `pseudo mdr` finds rows where *each* word matches *some* field (label, description, badge, or hidden search atoms);
- **commit, don't preview**: arrowing through rows highlights; only Enter or a click commits;
- **top-layer popup** (Popover API): escapes `overflow: hidden`, `transform`ed ancestors, dialogs and grids;
- **plain JSON in, plain JSON out**, so a Blazor app, a Svelte widget and a static page all drive it the same way.

Open the demo (`npm run demo` → <http://127.0.0.1:8765/demo/>) to see every variant over 1,000–2,000 made-up rows.

## The contract

Two JSON shapes cross the boundary, and nothing else:

```js
el.options = [
  { id: "PA-0001", label: "PA-0001", description: "Pseudomonas aeruginosa · ATCC",
    atoms: ["PA0001"],                       // searchable, never shown
    swatch: "#16a34a",                       // optional colour dot
    badges: ["MDR", { text: "BSL-2", tone: "amber" }],  // optional pills (searchable)
    ghost: false,                            // "no longer in source" marker
    data: { anything: "for renderOption" } },
];
el.selection = { include: ["PA-0001"], exclude: [] };   // the same shape in every mode
```

`{ value, label }` rows (a CSV-source shape) are accepted too.

The mode is `config`, not a component swap:

| You want | `config` |
|---|---|
| single select | `{ max: 1 }` |
| single + "use what I typed" | `{ max: 1, allowCustom: true }` |
| multi select | `{}` |
| multi, at most 3 | `{ max: 3 }` |
| include + exclude (click cycles neutral → + → − → neutral) | `{ states: ["include", "exclude"] }` |
| exclude only ("everything except…") | `{ states: ["exclude"] }` |
| server-side search for huge sources | `{ search: "/api/options" }` or `{ search: (q, signal) => Promise<{ options, hasMore }> }` |

Commits fire `combo-change` with `detail: { selection, items, reason }` — `items` maps the
selected ids to `{ label, description }`, `reason` is `pick`, `remove` or `custom`.

### Custom rows

JSON formatting (`swatch`, `badges`) works from any host. For anything more, a JS hook replaces
the row's text block:

```js
el.renderOption = (option, { state, highlighted }) => node;
```

It is called only for the rows on screen, so it can be as elaborate as you like — but rows are a
fixed 44 px (that is what makes virtualisation cheap), so keep it to two lines.

## Hosts

### Plain HTML / Svelte / anything

```html
<script type="module" src="/js/elephant-combo.js"></script>
<elephant-combo id="strain"></elephant-combo>
<script type="module">
  const el = document.getElementById("strain");
  el.config = { max: 1, placeholder: "Strain…" };
  el.options = await (await fetch("/strains.json")).json();
  el.addEventListener("combo-change", (e) => console.log(e.detail.selection));
</script>
```

### Blazor

`blazor/ElephantCombo.razor` + `blazor/ComboTypes.cs` wrap the element with typed records:

```razor
<ElephantCombo Options="_strains" Config="ComboConfig.TriState"
               Selection="_filter" OnChange="c => _filter = c.Selection" />
```

Small state (config, selection, the selected ids' labels) goes down as **attributes**, so a
prerendered page shows the right trigger before the circuit exists and Blazor's diffing carries
changes. Options go over JS interop, once per new list instance. Also load the module at page level
(`<script type="module" src="js/elephant-combo.js">`) so the element upgrades during prerender.

## Tests

```bash
npm install && npx playwright install chromium
npm test                 # unit (node:test) + e2e (Playwright)
```

The e2e suite is **one behaviour spec run against every host** — each a deployment condition the
element has to survive:

| Host | What it proves |
|---|---|
| `static-plain` | the baseline |
| `static-clipped` | inside a `transform` + `overflow: hidden` box (Radzen's `.rz-body` trap) |
| `static-iframe` | inside a short same-origin iframe, as an embedded surface |
| `blazor-page` | Blazor Server + Radzen layout, prerendered, every commit round-tripped through .NET |
| `blazor-dialog` | inside a `RadzenDialog` — and Escape/Enter don't leak into the dialog |
| `blazor-grid` | inside a `RadzenDataGrid` cell |

The Blazor host (`hosts/blazor`) pins **net9.0 + Radzen.Blazor 5.9.9** to match the app that uses
it; bump them together. In the Blazor hosts the `[data-out]` text the tests assert on is rendered by
.NET, so it only changes once a commit has crossed the circuit and back.

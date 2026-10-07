import { test, expect } from "./hosts.mjs";

const combo = (scope, id) => scope.locator(`elephant-combo#${id}`);
const out = (scope, id) => scope.locator(`[data-out="${id}"]`);
const rows = (c) => c.locator(".spacer .row");
const row = (c, text) => c.locator(".spacer .row", { hasText: text });
const popupOpen = (c) => c.locator(".popup:popover-open");
const sel = (include = [], exclude = []) => JSON.stringify({ include, exclude });

async function openAndType(c, text) {
  await c.click();
  await expect(popupOpen(c)).toHaveCount(1);
  if (text) await c.locator(".filter").fill(text);
}

// The row is really on screen and really clickable at its centre: nothing — a
// clipping ancestor, a dialog, a grid — sits on top of it.
async function expectHittable(locator) {
  const hit = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const inView = x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight;
    const top = el.getRootNode().elementFromPoint(x, y);
    return { inView, hits: !!top && el.contains(top) };
  });
  expect(hit).toEqual({ inView: true, hits: true });
}

test.describe("matching", () => {
  test("tokens AND across label and description", async ({ scope }) => {
    const c = combo(scope, "single");
    await openAndType(c, "pseudo 0009");
    await expect(rows(c)).toHaveCount(1);
    await expect(rows(c).first()).toContainText("PA-0009");
  });

  test("hidden atoms are searchable", async ({ scope }) => {
    const c = combo(scope, "single");
    await openAndType(c, "KP0002");
    await expect(rows(c)).toHaveCount(1);
    await expect(rows(c).first()).toContainText("KP-0002");
  });

  test("only the visible window of a long list is in the DOM", async ({ scope }) => {
    const c = combo(scope, "tri"); // 1,800 rows
    await openAndType(c);
    await expect(rows(c).first()).toBeVisible();
    expect(await rows(c).count()).toBeLessThan(30);
  });
});

test.describe("single", () => {
  test("shows its placeholder before anything is picked", async ({ scope }) => {
    await expect(combo(scope, "single").locator(".trigger")).toHaveText("Strain…");
  });

  test("keyboard: arrow + Enter commits and closes", async ({ scope }) => {
    const c = combo(scope, "single");
    await openAndType(c, "kleb 0002");
    await c.locator(".filter").press("ArrowDown");
    await c.locator(".filter").press("Enter");
    await expect(out(scope, "single")).toHaveText(sel(["KP-0002"]));
    await expect(popupOpen(c)).toHaveCount(0);
    await expect(c.locator(".trigger .value")).toHaveText("KP-0002");
  });

  test("after a mouse click, typing goes straight into the filter", async ({ scope, page }) => {
    const c = combo(scope, "single");
    await c.click();
    await expect(popupOpen(c)).toHaveCount(1);
    await page.waitForTimeout(150); // past the next frame, where a host page could steal focus
    await page.keyboard.type("kleb 0002");
    await expect(c.locator(".filter")).toHaveValue("kleb 0002");
    await expect(rows(c)).toHaveCount(1);
  });

  test("highlight alone does not commit", async ({ scope }) => {
    const c = combo(scope, "single");
    await openAndType(c, "kleb 0002");
    await c.locator(".filter").press("ArrowDown");
    await c.locator(".filter").press("Escape");
    await expect(out(scope, "single")).toHaveText(sel());
  });

  test("click commits", async ({ scope }) => {
    const c = combo(scope, "single");
    await openAndType(c, "PA-0017");
    await row(c, "PA-0017").click();
    await expect(out(scope, "single")).toHaveText(sel(["PA-0017"]));
  });

  test("custom value commits the typed text", async ({ scope }) => {
    const c = combo(scope, "custom");
    await openAndType(c, "MY-NEW-STRAIN");
    await c.locator(".row.sentinel").click();
    await expect(out(scope, "custom")).toHaveText(sel(["MY-NEW-STRAIN"]));
    await expect(c.locator(".trigger .value")).toHaveText("MY-NEW-STRAIN");
  });
});

test.describe("multi", () => {
  test("max 3 refuses a fourth pick", async ({ scope }) => {
    const c = combo(scope, "multi3");
    await openAndType(c, "PA-00");
    for (const id of ["PA-0001", "PA-0009", "PA-0017", "PA-0025"]) await row(c, id).click();
    await expect(out(scope, "multi3")).toHaveText(sel(["PA-0001", "PA-0009", "PA-0017"]));
  });

  test("a chip's × removes it without opening the popup", async ({ scope }) => {
    const c = combo(scope, "multi3");
    await openAndType(c, "PA-00");
    await row(c, "PA-0001").click();
    await row(c, "PA-0009").click();
    await c.locator(".filter").press("Escape");
    await expect(out(scope, "multi3")).toHaveText(sel(["PA-0001", "PA-0009"]));
    await c.locator(".chip", { hasText: "PA-0001" }).locator("button").click();
    await expect(out(scope, "multi3")).toHaveText(sel(["PA-0009"]));
    await expect(popupOpen(c)).toHaveCount(0);
  });
});

test.describe("include / exclude", () => {
  test("a row click cycles neutral → include → exclude → neutral", async ({ scope }) => {
    const c = combo(scope, "tri");
    await openAndType(c, "PA-0001");
    await row(c, "PA-0001").click();
    await expect(out(scope, "tri")).toHaveText(sel(["PA-0001"]));
    await row(c, "PA-0001").click();
    await expect(out(scope, "tri")).toHaveText(sel([], ["PA-0001"]));
    await row(c, "PA-0001").click();
    await expect(out(scope, "tri")).toHaveText(sel());
  });

  test("exclude-only goes straight to exclude", async ({ scope }) => {
    const c = combo(scope, "excl");
    await openAndType(c, "SA-0003");
    await row(c, "SA-0003").click();
    await expect(out(scope, "excl")).toHaveText(sel([], ["SA-0003"]));
    await expect(c.locator(".chip.exclude")).toContainText("SA-0003");
  });
});

test.describe("placement", () => {
  for (const id of ["single", "custom", "multi3", "tri", "excl"]) {
    test(`${id}: popup rows are on screen and not covered`, async ({ scope }) => {
      const c = combo(scope, id);
      await openAndType(c);
      await expectHittable(rows(c).first());
      await expectHittable(c.locator(".filter"));
    });
  }

  test("an outside click closes the popup", async ({ scope, page, hostInfo }) => {
    const c = combo(scope, "single");
    await openAndType(c);
    // Somewhere that is page, not combo (and, in a dialog, still inside the dialog).
    const target = hostInfo.dialog ? page.locator(".rz-dialog-titlebar") : scope.locator("body");
    await target.click({ position: { x: 5, y: 5 } });
    await expect(popupOpen(c)).toHaveCount(0);
  });
});

test.describe("server search", () => {
  test("a loose server answer is narrowed to token-AND, and the url's own params survive", async ({ scope }) => {
    const c = combo(scope, "server");
    await openAndType(c, "kleb 0002");      // the server matches "kleb" OR "0002": hundreds of rows
    await expect(rows(c)).toHaveCount(1);   // the element keeps only rows matching both
    await row(c, "KP-0002").click();
    await expect(out(scope, "server")).toHaveText(sel(["KP-0002"]));
    await expect(c.locator(".trigger .value")).toHaveText("KP-0002");
    await expect(c.locator(".trigger a.open")).toHaveAttribute("href", "/cases/KP-0002");
  });

  test("more than the limit says so", async ({ scope }) => {
    const c = combo(scope, "server");
    await openAndType(c, "pseudo");
    await expect(rows(c).first()).toBeVisible();
    await expect(c.locator(".note")).toHaveText(/keep typing/i);
  });
});

test.describe("search failures", () => {
  test("a refused search shows the endpoint's reason, not \"No matches\"", async ({ scope }) => {
    const c = combo(scope, "refused");
    await openAndType(c, "kleb");
    const note = c.locator(".note");
    await expect(note).toHaveText("Search failed: Case type 'unsearchable' declares no summary.search: descriptor.");
    await expect(note).toHaveClass(/error/);
    await expect(note).toHaveAttribute("role", "alert");
  });

  test("an empty answer from a working search still says No matches", async ({ scope }) => {
    const c = combo(scope, "server");
    await openAndType(c, "zzzz");
    await expect(c.locator(".note")).toHaveText("No matches");
    await expect(c.locator(".note")).not.toHaveClass(/error/);
  });

  test("clearing the filter clears the failure", async ({ scope }) => {
    const c = combo(scope, "refused");
    await openAndType(c, "kleb");
    await expect(c.locator(".note")).toHaveClass(/error/);
    await c.locator(".filter").fill("");
    await expect(c.locator(".note.error")).toHaveCount(0);
  });
});

test.describe("links", () => {
  test("a picked value with an href gets a ↗ link that does not open the popup", async ({ scope }) => {
    const c = combo(scope, "single");
    await openAndType(c, "PA-0017");
    await row(c, "PA-0017").click();
    const a = c.locator(".trigger a.open");
    await expect(a).toHaveAttribute("href", "/cases/PA-0017");
    await expect(a).toHaveAttribute("target", "_top");
    // Cancel the navigation; the click must still not reach the trigger.
    await a.evaluate((el) => el.addEventListener("click", (e) => e.preventDefault()));
    await a.click();
    await expect(popupOpen(c)).toHaveCount(0);
  });

  test("each chip with an href gets its own link", async ({ scope }) => {
    const c = combo(scope, "multi3");
    await openAndType(c, "PA-00");
    await row(c, "PA-0001").click();
    await row(c, "PA-0009").click();
    await c.locator(".filter").press("Escape");
    await expect(c.locator(".chip a.open")).toHaveCount(2);
    await expect(c.locator(".chip", { hasText: "PA-0009" }).locator("a.open")).toHaveAttribute("href", "/cases/PA-0009");
  });

  test("no href, no link", async ({ scope }) => {
    const c = combo(scope, "tri");
    await openAndType(c, "PA-0001");
    await row(c, "PA-0001").click();
    await c.locator(".filter").press("Escape");
    await expect(c.locator(".chip")).toHaveCount(1);
    await expect(c.locator("a.open")).toHaveCount(0);
  });
});

test.describe("host integration", () => {
  test("the host can set the selection", async ({ scope }) => {
    await scope.locator('[data-set="single"]').click();
    await expect(combo(scope, "single").locator(".trigger .value")).toHaveText("PA-0001");
  });

  test("the host can replace the options", async ({ scope }) => {
    await scope.locator('[data-replace="single"]').click();
    const c = combo(scope, "single");
    await openAndType(c);
    await expect(rows(c)).toHaveCount(10);
  });

  test("a host re-render keeps the committed pick", async ({ scope, hostInfo }) => {
    test.skip(!hostInfo.blazor, "re-render is a framework concern");
    const c = combo(scope, "single");
    await openAndType(c, "PA-0017");
    await row(c, "PA-0017").click();
    await expect(out(scope, "single")).toHaveText(sel(["PA-0017"]));
    await scope.locator('[data-bump="single"]').click();
    await scope.locator('[data-bump="single"]').click();
    await expect(scope.locator('[data-bump="single"]')).toHaveText("bump 2");
    await expect(c.locator(".trigger .value")).toHaveText("PA-0017");
    await expect(out(scope, "single")).toHaveText(sel(["PA-0017"]));
  });

  test("Escape closes the popup, not the dialog around it", async ({ scope, page, hostInfo }) => {
    test.skip(!hostInfo.dialog, "dialog host only");
    const c = combo(scope, "single");
    await openAndType(c);
    await c.locator(".filter").press("Escape");
    await expect(popupOpen(c)).toHaveCount(0);
    await page.waitForTimeout(500); // a dialog close would be async; give it the chance
    await expect(page.locator(".rz-dialog")).toBeVisible();
    await expect(page.locator("#dialog-closed")).toHaveText("");
  });

  test("Enter commits the pick, not the dialog around it", async ({ scope, page, hostInfo }) => {
    test.skip(!hostInfo.dialog, "dialog host only");
    const c = combo(scope, "single");
    await openAndType(c, "PA-0017");
    await c.locator(".filter").press("ArrowDown");
    await c.locator(".filter").press("Enter");
    await expect(out(scope, "single")).toHaveText(sel(["PA-0017"]));
    await expect(page.locator(".rz-dialog")).toBeVisible();
  });
});

test.describe("performance", () => {
  test("a keystroke filters 1,800 rows inside one frame", async ({ scope }, info) => {
    const c = combo(scope, "tri");
    await openAndType(c);
    const ms = await c.evaluate((el) => {
      const input = el.shadowRoot.querySelector(".filter");
      const times = [];
      for (const q of ["p", "ps", "pse", "pseu", "pseudo", "pseudo a", "pseudo at", "pseudo atc", "pseudo atcc"]) {
        const t = performance.now();
        input.value = q; input.dispatchEvent(new Event("input"));
        times.push(performance.now() - t);
      }
      times.sort((a, b) => a - b);
      return { median: times[times.length >> 1], max: times[times.length - 1] };
    });
    info.annotations.push({ type: "keystroke ms", description: `median ${ms.median.toFixed(2)}, max ${ms.max.toFixed(2)}` });
    expect(ms.median).toBeLessThan(16);
  });
});

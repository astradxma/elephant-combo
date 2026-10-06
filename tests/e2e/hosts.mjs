// Deployment conditions. Each returns a `scope` (a Page or a FrameLocator) holding
// the five fixture combos — single, custom, multi3, tri, excl — each with a
// `[data-out=<id>]` showing the selection as the HOST sees it. In the Blazor
// hosts that text is rendered by .NET, so it only changes after a commit has
// round-tripped through the circuit.
import { test as base, expect } from "@playwright/test";

const HOSTS = {
  "static-plain":   { blazor: false, open: (p, u) => p.goto(`${u.staticURL}/hosts/static/fixture.html?layout=plain`) },
  "static-clipped": { blazor: false, open: (p, u) => p.goto(`${u.staticURL}/hosts/static/fixture.html?layout=clipped`) },
  "static-iframe":  { blazor: false, frame: "#frame", open: (p, u) => p.goto(`${u.staticURL}/hosts/static/iframe.html`) },
  "blazor-page":    { blazor: true, open: (p, u) => p.goto(`${u.blazorURL}/`) },
  "blazor-dialog":  { blazor: true, dialog: true, open: async (p, u) => {
    await p.goto(`${u.blazorURL}/dialog`);
    // A click on the prerendered button is a no-op until the circuit is up.
    await expect(async () => {
      await p.locator("#open-dialog").click();
      await expect(p.locator(".rz-dialog")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    // Radzen arms the dialog's close-on-Escape in a 500 ms setTimeout after opening.
    // Before that, Escape cannot close the dialog, so a test would pass for free.
    await p.waitForTimeout(700);
  } },
  "blazor-grid":    { blazor: true, open: (p, u) => p.goto(`${u.blazorURL}/grid`) },
};

// Interactive once the circuit has delivered options to the five inline combos
// (options only ever arrive over JS interop, after the prerendered HTML; the
// server-search combo has none by design).
async function waitForCircuit(scope) {
  await expect.poll(() => scope.locator("elephant-combo").evaluateAll((els) =>
    els.filter((e) => e.options.length > 0).length), { timeout: 30_000 }).toBe(5);
}

export const test = base.extend({
  host: ["static-plain", { option: true }],
  staticURL: ["", { option: true }],
  blazorURL: ["", { option: true }],
  hostInfo: async ({ host }, use) => use({ name: host, ...HOSTS[host] }),
  scope: async ({ page, hostInfo, staticURL, blazorURL }, use) => {
    await hostInfo.open(page, { staticURL, blazorURL });
    const scope = hostInfo.frame ? page.frameLocator(hostInfo.frame) : page;
    await waitForCircuit(scope);
    await use(scope);
  },
});
export { expect };

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
  } },
  "blazor-grid":    { blazor: true, open: (p, u) => p.goto(`${u.blazorURL}/grid`) },
};

// Interactive once the circuit has delivered options to every combo (options
// only ever arrive over JS interop, after the prerendered HTML).
async function waitForCircuit(scope, n) {
  await expect.poll(() => scope.locator("elephant-combo").evaluateAll((els) =>
    els.length && els.every((e) => e.options.length > 0) ? els.length : 0), { timeout: 30_000 }).toBeGreaterThan(n ?? 0);
}

export const test = base.extend({
  host: ["static-plain", { option: true }],
  staticURL: ["", { option: true }],
  blazorURL: ["", { option: true }],
  hostInfo: async ({ host }, use) => use({ name: host, ...HOSTS[host] }),
  scope: async ({ page, hostInfo, staticURL, blazorURL }, use) => {
    await hostInfo.open(page, { staticURL, blazorURL });
    const scope = hostInfo.frame ? page.frameLocator(hostInfo.frame) : page;
    await waitForCircuit(scope, 4);
    await use(scope);
  },
});
export { expect };

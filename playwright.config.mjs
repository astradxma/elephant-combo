import { defineConfig } from "@playwright/test";

// One behaviour suite (tests/e2e/combo.spec.mjs), run once per host. A host is a
// deployment condition the element must survive — see tests/e2e/hosts.mjs.
const STATIC = "http://127.0.0.1:8765";
const BLAZOR = "http://127.0.0.1:5077";
const hosts = ["static-plain", "static-clipped", "static-iframe", "blazor-page", "blazor-dialog", "blazor-grid"];

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
  projects: hosts.map((host) => ({ name: host, use: { host, staticURL: STATIC, blazorURL: BLAZOR } })),
  webServer: [
    { command: "node hosts/static/serve.mjs", url: `${STATIC}/demo/`, reuseExistingServer: !process.env.CI, env: { PORT: "8765" } },
    {
      command: "dotnet run --project hosts/blazor --no-launch-profile",
      url: BLAZOR, reuseExistingServer: !process.env.CI, timeout: 180_000,
      env: { ASPNETCORE_URLS: BLAZOR, ASPNETCORE_ENVIRONMENT: "Development" },
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/ui",
    testMatch: "**/*.spec.ts",
    timeout: 30_000,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    outputDir: "./test-results",
    reporter: process.env.CI ? "github" : "list",
    use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4173",
        serviceWorkers: "block",
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE == null
            ? {}
            : {
                  launchOptions: {
                      executablePath:
                          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
                  },
              }),
    },
    webServer: {
        command: "node tests/ui/server.mjs",
        url: "http://127.0.0.1:4173/tests/ui/index.html",
        reuseExistingServer: !process.env.CI,
    },
});

/**
 * Invariant 16 (Tier B+C): Zero console errors AND warnings on every page
 * in every mode with effects toggling.
 *
 * Genuinely unfixable third-party messages may be added to ALLOWLIST with justification.
 */
import { test, expect, type Page } from "@playwright/test";
import { setAccentMode } from "../helpers/e2eThemeAssertions";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

const PAGES = [
  { name: "Overview", path: "/" },
  { name: "GPU", path: "/gpu" },
  { name: "CPU", path: "/cpu" },
  { name: "LlamaCpp", path: "/llama-cpp" },
  { name: "AI", path: "/ai" },
  { name: "Settings", path: "/settings" },
  { name: "Theme", path: "/theme" },
];

const MODES = ["solid", "rainbow-wave", "spectrum"] as const;

/**
 * Messages that are genuinely third-party and cannot be fixed in this codebase.
 * Each entry must have a written justification.
 */
const ALLOWLIST: RegExp[] = [
  // Recharts may emit resize observer loop warnings in test environments;
  // this is a known upstream issue with ResizeObserver in headless Chrome.
  /ResizeObserver loop/i,
];

function isAllowlisted(msg: string): boolean {
  return ALLOWLIST.some((re) => re.test(msg));
}

async function collectConsoleProblems(
  page: Page,
  path: string,
  mode: string,
): Promise<string[]> {
  const problems: string[] = [];

  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning" || type === "warn") {
      const text = msg.text();
      if (!isAllowlisted(text)) {
        problems.push(`[${type}] ${text}`);
      }
    }
  });

  page.on("pageerror", (err) => {
    problems.push(`[pageerror] ${err.message}`);
  });

  await page.goto(`${BASE_URL}${path}`);
  await page.waitForSelector("main, .app-root", { timeout: 10000 });
  await setAccentMode(page, mode);
  await page.waitForTimeout(500);

  return problems;
}

for (const { name, path } of PAGES) {
  for (const mode of MODES) {
    test(`Invariant 16: ${name} in ${mode} — zero console errors/warnings`, async ({
      page,
    }) => {
      const problems = await collectConsoleProblems(page, path, mode);
      expect(
        problems,
        `${name} (${mode}): console errors/warnings:\n${problems.join("\n")}`,
      ).toHaveLength(0);
    });
  }
}

// Additional test: effects toggling produces no errors
test("Invariant 16: toggling glow + pulse on Overview produces no console errors", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning" || type === "warn") {
      const text = msg.text();
      if (!isAllowlisted(text)) problems.push(`[${type}] ${text}`);
    }
  });
  page.on("pageerror", (err) => {
    problems.push(`[pageerror] ${err.message}`);
  });

  await page.goto(`${BASE_URL}/`);
  await page.waitForSelector("[data-accent-el]", { timeout: 10000 });

  // Toggle glow on
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-glow", "neon"),
  );
  await page.waitForTimeout(200);

  // Toggle pulse on
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-pulse", "on"),
  );
  await page.waitForTimeout(200);

  // Switch modes
  await setAccentMode(page, "rainbow-wave");
  await page.waitForTimeout(400);
  await setAccentMode(page, "spectrum");
  await page.waitForTimeout(400);
  await setAccentMode(page, "solid");
  await page.waitForTimeout(200);

  // Toggle effects off
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-glow");
    document.documentElement.removeAttribute("data-pulse");
  });
  await page.waitForTimeout(200);

  expect(
    problems,
    `Effect toggling produced console errors/warnings:\n${problems.join("\n")}`,
  ).toHaveLength(0);
});

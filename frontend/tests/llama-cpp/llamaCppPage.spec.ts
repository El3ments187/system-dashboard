import { test, expect } from "@playwright/test";
import { expectNoInvalidCssValues } from "../helpers/e2eThemeAssertions";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

// Wait for the page to fully load with all three async data sources.
// Seeds localStorage before navigation so useLlamaCppManagement can resolve
// dirPath and fetch build/repo info. Uses waitForResponse for the metrics API
// (registered before navigation) to guarantee data is in React state.
async function goToLlamaCpp(page: import("@playwright/test").Page) {
  // Runs before the page's own scripts on every navigation — useState lazy
  // initializers will read these values on first render.
  await page.addInitScript(() => {
    localStorage.setItem(
      "llama_cpp_dir",
      "/home/gamer/Documents/AI/llama.cpp/git/llama.cpp",
    );
    localStorage.setItem(
      "llama_scan_dir",
      "/home/gamer/Documents/AI/Start_Scripts",
    );
    localStorage.setItem("llama_cpp_github_repo", "ggml-org/llama.cpp");
    localStorage.setItem("llama_cpp_tag_prefix", "b");
  });

  // The repo-info endpoint fetches latest_build_tag from GitHub, which may be
  // unreachable in test environments. Intercept it and inject a fallback so
  // the Update button renders (requires latest_build_tag != null && behind > 0).
  await page.route("**/api/llama/repo-info**", async (route) => {
    const real = await route.fetch();
    const json = await real.json();
    if (!json.data?.latest_build_tag) {
      json.data = { ...json.data, latest_build_tag: "b9999" };
    }
    await route.fulfill({ json });
  });

  // Register BEFORE goto() so we catch the very first page-load request.
  const metricsResponse = page.waitForResponse(
    (r) => r.url().includes("/api/ai/metrics") && r.status() === 200,
    { timeout: 60000 },
  );

  await page.goto(`${BASE_URL}/llama-cpp`);
  await expect(page.getByText("ACTIVE MODEL").first()).toBeVisible({
    timeout: 15000,
  });

  // Confirm the metrics API responded so gguf_size_gib etc. are in state.
  await metricsResponse;
  // One tick for React to flush the state update to the DOM.
  await page.waitForTimeout(300);

  // Management API: build string (b####) appears once gitInfo loads.
  await expect(page.locator("text=/b\\d{4,5}/").first()).toBeVisible({
    timeout: 20000,
  });
  // Launch profiles: Running/Stopped appears once profile list loads.
  await expect(page.locator("text=/Running|Stopped/").first()).toBeVisible({
    timeout: 20000,
  });
}

// ─── Navigation ────────────────────────────────────────────────────────────────

test.describe("LlamaCppPage - navigation", () => {
  test("loads via direct URL /llama-cpp", async ({ page }) => {
    await page.goto(`${BASE_URL}/llama-cpp`);
    await expect(page.getByText("ACTIVE MODEL").first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("loads via tab button click from overview", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByRole("button", { name: "llama.cpp" }).click();
    await expect(page.getByText("ACTIVE MODEL").first()).toBeVisible({
      timeout: 15000,
    });
  });
});

// ─── Top row: Active Model card ────────────────────────────────────────────────

test.describe("LlamaCppPage - Active Model card", () => {
  test.beforeEach(async ({ page }) => {
    await goToLlamaCpp(page);
  });

  test("card header is visible", async ({ page }) => {
    await expect(page.getByText("ACTIVE MODEL").first()).toBeVisible();
  });

  test("model name hero text is visible", async ({ page }) => {
    await expect(
      page.locator("text=/Qwen|gemma|llama|mistral/i").first(),
    ).toBeVisible();
  });

  test("GB size badge is visible", async ({ page }) => {
    await expect(page.locator("text=/GB/").first()).toBeVisible();
  });

  test("capability pills row is visible", async ({ page }) => {
    await expect(page.getByText("Metrics").first()).toBeVisible();
    await expect(page.getByText("WebUI").first()).toBeVisible();
    await expect(page.getByText("Vision").first()).toBeVisible();
    await expect(page.getByText("Audio").first()).toBeVisible();
    await expect(page.getByText("Video").first()).toBeVisible();
  });

  test("sampling tiles are all present", async ({ page }) => {
    await expect(
      page.locator('[data-testid="sampling-temperature"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="sampling-top-k"]')).toBeVisible();
    await expect(page.locator('[data-testid="sampling-top-p"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="sampling-repeat-penalty"]'),
    ).toBeVisible();
  });

  test("sampling tile values are numeric", async ({ page }) => {
    // Temperature is a decimal like 0.20; at least one decimal value must appear
    await expect(page.locator("text=/0\\.[0-9]+/").first()).toBeVisible();
  });

  test("status indicator shows running or offline", async ({ page }) => {
    await expect(
      page.locator("text=/Running|Offline|Loading/i").first(),
    ).toBeVisible();
  });
});

// ─── Top row: Throughput card ──────────────────────────────────────────────────

test.describe("LlamaCppPage - Throughput card", () => {
  test.beforeEach(async ({ page }) => {
    await goToLlamaCpp(page);
  });

  test("card header THROUGHPUT is visible", async ({ page }) => {
    await expect(page.getByText("THROUGHPUT").first()).toBeVisible();
  });

  test("Generation Speed section label is visible", async ({ page }) => {
    await expect(page.getByText("Generation Speed").first()).toBeVisible();
  });

  test("Prompt Speed section label is visible", async ({ page }) => {
    await expect(page.getByText("Prompt Speed").first()).toBeVisible();
  });

  test("Prompt Tokens tile is visible", async ({ page }) => {
    await expect(page.getByText("Prompt Tokens").first()).toBeVisible();
  });

  test("Generated tile is visible", async ({ page }) => {
    await expect(page.getByText("Generated").first()).toBeVisible();
  });
});

// ─── Top row: Context card ─────────────────────────────────────────────────────

test.describe("LlamaCppPage - Context card", () => {
  test.beforeEach(async ({ page }) => {
    await goToLlamaCpp(page);
  });

  test("card header CONTEXT is visible", async ({ page }) => {
    await expect(page.getByText("CONTEXT").first()).toBeVisible();
  });

  test("radial gauge SVG is rendered", async ({ page }) => {
    await expect(page.locator("svg circle").first()).toBeVisible();
  });

  test("Current tile is visible", async ({ page }) => {
    await expect(page.locator('[data-testid="ctx-current"]')).toBeVisible();
  });

  test("Max tile is visible", async ({ page }) => {
    await expect(page.locator('[data-testid="ctx-max"]')).toBeVisible();
  });

  test("Remaining tile is visible", async ({ page }) => {
    await expect(page.locator('[data-testid="ctx-remaining"]')).toBeVisible();
  });

  test("Cache Hits tile is visible", async ({ page }) => {
    await expect(page.locator('[data-testid="ctx-cache-hits"]')).toBeVisible();
  });

  test("Largest Seen tile is visible", async ({ page }) => {
    await expect(
      page.locator('[data-testid="ctx-largest-seen"]'),
    ).toBeVisible();
  });

  test("Generation Progress section is visible", async ({ page }) => {
    // Rendered only when slot0 && slotCtx != null (confirmed by goToLlamaCpp GiB wait)
    await expect(page.getByText("Generation Progress").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("context gauge label shows a numeric value or placeholder", async ({
    page,
  }) => {
    await expect(page.locator('[data-testid="ctx-gauge-label"]')).toContainText(
      /\d|—/,
    );
  });
});

// ─── Left rail: Runtime card ───────────────────────────────────────────────────

test.describe("LlamaCppPage - Runtime card", () => {
  test.beforeEach(async ({ page }) => {
    await goToLlamaCpp(page);
  });

  test("RUNTIME card header is visible", async ({ page }) => {
    await expect(page.getByText("RUNTIME").first()).toBeVisible();
  });

  test("Server row shows Online when server is up", async ({ page }) => {
    await expect(page.getByText("Server").first()).toBeVisible();
    await expect(page.getByText("Online").first()).toBeVisible();
  });

  test("Uptime row is visible with a time value", async ({ page }) => {
    await expect(page.getByText("Uptime").first()).toBeVisible();
    await expect(
      page.locator("text=/\\d+h \\d+m|\\d+m \\d+s|\\d+s/").first(),
    ).toBeVisible();
  });

  test("Load Time row is visible", async ({ page }) => {
    await expect(page.getByText("Load Time").first()).toBeVisible();
  });

  test("PID row is visible with a numeric value", async ({ page }) => {
    await expect(page.getByText("PID").first()).toBeVisible();
    // PID value is a 4-6 digit number rendered in its own element
    await expect(page.locator("text=/\\d{4,6}/").first()).toBeVisible();
  });

  test("runtime-server testid shows Online when server is up", async ({
    page,
  }) => {
    await expect(page.locator('[data-testid="runtime-server"]')).toContainText(
      "Online",
    );
  });

  test("runtime-uptime testid has a formatted time value", async ({ page }) => {
    await expect(page.locator('[data-testid="runtime-uptime"]')).toContainText(
      /\d/,
    );
  });

  test("runtime-pid testid shows a numeric PID", async ({ page }) => {
    await expect(page.locator('[data-testid="runtime-pid"]')).toContainText(
      /\d+/,
    );
  });

  test("runtime-load-time testid is visible", async ({ page }) => {
    await expect(
      page.locator('[data-testid="runtime-load-time"]'),
    ).toBeVisible();
  });

  test("runtime-port testid shows a port number", async ({ page }) => {
    await expect(page.locator('[data-testid="runtime-port"]')).toContainText(
      /\d+/,
    );
  });

  test("runtime-memory testid is visible", async ({ page }) => {
    await expect(page.locator('[data-testid="runtime-memory"]')).toBeVisible();
  });

  test("runtime-cpu testid is visible", async ({ page }) => {
    await expect(page.locator('[data-testid="runtime-cpu"]')).toBeVisible();
  });

  test("runtime-context testid is visible", async ({ page }) => {
    await expect(page.locator('[data-testid="runtime-context"]')).toBeVisible();
  });

  test("runtime-gpu-layers testid is visible", async ({ page }) => {
    await expect(
      page.locator('[data-testid="runtime-gpu-layers"]'),
    ).toBeVisible();
  });

  test("runtime-cpu-layers testid is visible", async ({ page }) => {
    await expect(
      page.locator('[data-testid="runtime-cpu-layers"]'),
    ).toBeVisible();
  });

  test("runtime-draft-layers testid is visible", async ({ page }) => {
    await expect(
      page.locator('[data-testid="runtime-draft-layers"]'),
    ).toBeVisible();
  });

  test("runtime-speculative testid is visible", async ({ page }) => {
    await expect(
      page.locator('[data-testid="runtime-speculative"]'),
    ).toBeVisible();
  });

  test("runtime-tokens-cached testid is visible", async ({ page }) => {
    await expect(
      page.locator('[data-testid="runtime-tokens-cached"]'),
    ).toBeVisible();
  });
});

// ─── Left rail: llama.cpp card ─────────────────────────────────────────────────

test.describe("LlamaCppPage - llama.cpp card", () => {
  test.beforeEach(async ({ page }) => {
    await goToLlamaCpp(page);
  });

  test("LLAMA.CPP card header is visible", async ({ page }) => {
    await expect(page.getByText("LLAMA.CPP").first()).toBeVisible();
  });

  test("Current build label is visible", async ({ page }) => {
    await expect(page.getByText("Current").first()).toBeVisible();
  });

  test("Latest build label is visible", async ({ page }) => {
    await expect(page.getByText("Latest").first()).toBeVisible();
  });

  test("Update button is visible", async ({ page }) => {
    // Conditionally rendered when buildsBehind > 0. goToLlamaCpp waits for
    // gitInfo (current build), but repoInfo (latest build) loads separately.
    // Give extra time for the second API call to complete and buildsBehind
    // to be computed before the button renders.
    await expect(page.getByText("Update", { exact: true }).first()).toBeVisible(
      { timeout: 20000 },
    );
  });

  test("Terminal button is visible", async ({ page }) => {
    await expect(
      page.getByText("Terminal", { exact: true }).first(),
    ).toBeVisible();
  });

  test("Readme button is visible", async ({ page }) => {
    await expect(
      page.getByText("Readme", { exact: true }).first(),
    ).toBeVisible();
  });

  test("Release link is visible", async ({ page }) => {
    await expect(
      page.getByText("Release", { exact: true }).first(),
    ).toBeVisible();
  });

  test("Release link points to github", async ({ page }) => {
    await expect(
      page.locator("a", { hasText: "Release" }).first(),
    ).toHaveAttribute("href", /github\.com/);
  });
});

// ─── Throughput summary tiles ──────────────────────────────────────────────────

test.describe("LlamaCppPage - Throughput summary tiles", () => {
  test.beforeEach(async ({ page }) => {
    await goToLlamaCpp(page);
  });

  test("Total Sent tile is visible", async ({ page }) => {
    await expect(
      page.locator('[data-testid="thrpt-total-sent"]'),
    ).toBeVisible();
  });

  test("Active Req tile is visible", async ({ page }) => {
    await expect(
      page.locator('[data-testid="thrpt-active-req"]'),
    ).toBeVisible();
  });
});

// ─── Run Models table ──────────────────────────────────────────────────────────

test.describe("LlamaCppPage - Run Models table", () => {
  test.beforeEach(async ({ page }) => {
    await goToLlamaCpp(page);
  });

  test("RUN MODELS header is visible", async ({ page }) => {
    await expect(page.getByText("Run Models").first()).toBeVisible();
  });

  test("table shows column headers", async ({ page }) => {
    await expect(page.getByText("MODEL").first()).toBeVisible();
    await expect(page.getByText("PARAMS").first()).toBeVisible();
    await expect(page.getByText("QUANT").first()).toBeVisible();
    await expect(page.getByText("CTX").first()).toBeVisible();
    await expect(page.getByText("VRAM").first()).toBeVisible();
  });

  test("at least one model row is visible", async ({ page }) => {
    await expect(page.locator("text=/Running|Stopped/").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("running model has a Stop button", async ({ page }) => {
    await expect(page.locator("text=Running").first()).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.locator("button").filter({ hasText: "Stop" }).first(),
    ).toBeVisible();
  });

  test("stopped model has a Run button", async ({ page }) => {
    await expect(
      page.locator("button").filter({ hasText: "Run" }).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("quant cells show known quant tokens from real profiles", async ({
    page,
  }) => {
    await expect(
      page.locator("text=/Q[0-9]_K_[MSXL]+|IQ[0-9]_[A-Z]+|BF16|F16/").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Refresh button is visible", async ({ page }) => {
    // Refresh is disabled while profiles are loading; just verify it exists
    await expect(
      page.getByRole("button", { name: /Refresh/i }).first(),
    ).toBeVisible();
  });

  test("clicking a column header sorts the table and toggles direction", async ({
    page,
  }) => {
    const modelBtn = page.getByRole("button", { name: "MODEL" }).first();
    await modelBtn.click();
    await expect(modelBtn).toHaveAttribute("aria-sort", /ascending|descending/);
    await modelBtn.click();
    await expect(modelBtn).toHaveAttribute("aria-sort", /ascending|descending/);
  });
});

// ─── Console ───────────────────────────────────────────────────────────────────

test.describe("LlamaCppPage - Console", () => {
  test.beforeEach(async ({ page }) => {
    await goToLlamaCpp(page);
  });

  test("LLAMA.CPP CONSOLE header is visible", async ({ page }) => {
    await expect(page.getByText("LLAMA.CPP CONSOLE").first()).toBeVisible();
  });

  test("log-console wrapper testid is present", async ({ page }) => {
    await expect(page.locator('[data-testid="log-console"]')).toBeVisible();
  });

  test("filter buttons INFO/WARN/ERROR/DEBUG/STATS are all visible", async ({
    page,
  }) => {
    await expect(
      page.getByRole("button", { name: "INFO" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "WARN" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ERROR" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "DEBUG" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "STATS" }).first(),
    ).toBeVisible();
  });

  test("Pause button is visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Pause/i }).first(),
    ).toBeVisible();
  });

  test("Clear button is visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Clear/i }).first(),
    ).toBeVisible();
  });

  test("Copy button is visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Copy/i }).first(),
    ).toBeVisible();
  });

  test("Save button is visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Save/i }).first(),
    ).toBeVisible();
  });

  test("Wrap button toggles without crash", async ({ page }) => {
    const wrap = page.getByRole("button", { name: /^Wrap$/i });
    if ((await wrap.count()) > 0) {
      await wrap.click();
      await expect(page.getByText("LLAMA.CPP CONSOLE").first()).toBeVisible();
      await wrap.click();
      await expect(page.getByText("LLAMA.CPP CONSOLE").first()).toBeVisible();
    }
  });

  test("Hide Idle button toggles title attribute", async ({ page }) => {
    const btn = page.getByRole("button", { name: /Hide Idle/i });
    if ((await btn.count()) > 0) {
      const before = await btn.getAttribute("title");
      await btn.click();
      const after = await btn.getAttribute("title");
      expect(before).not.toBe(after);
    }
  });

  test("search input is present", async ({ page }) => {
    await expect(
      page
        .locator('input[placeholder*="Search"], input[type="search"]')
        .first(),
    ).toBeVisible();
  });

  test("clicking a filter button does not crash the page", async ({ page }) => {
    await page.getByRole("button", { name: "WARN" }).first().click();
    await expect(page.getByText("LLAMA.CPP CONSOLE").first()).toBeVisible();
    await page.getByRole("button", { name: "WARN" }).first().click();
  });

  test("preset chips Draft/Spec, Timings, Cache, Errors are all visible", async ({
    page,
  }) => {
    await expect(
      page.getByRole("button", { name: "Draft/Spec" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Timings" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cache" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Errors" }).first(),
    ).toBeVisible();
  });

  test("Filter and Highlight mode buttons are visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Filter" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Highlight" }).first(),
    ).toBeVisible();
  });

  test("clicking Draft/Spec preset does not crash the page", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Draft/Spec" }).first().click();
    await expect(page.getByText("LLAMA.CPP CONSOLE").first()).toBeVisible();
    await page.getByRole("button", { name: "Draft/Spec" }).first().click();
  });

  test("switching to Highlight mode does not crash the page", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Highlight" }).first().click();
    await expect(page.getByText("LLAMA.CPP CONSOLE").first()).toBeVisible();
    await page.getByRole("button", { name: "Filter" }).first().click();
    await expect(page.getByText("LLAMA.CPP CONSOLE").first()).toBeVisible();
  });

  test("console-status testid is visible", async ({ page }) => {
    await expect(page.locator('[data-testid="console-status"]')).toBeVisible();
  });

  test("jump-to-latest button appears when log area is scrolled up", async ({
    page,
  }) => {
    const logArea = page.locator('[data-testid="log-area"]');
    await expect(logArea).toBeVisible();
    // Force scroll to top — button renders when not already at bottom
    await logArea.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(400);
    const btn = page.locator('[data-testid="jump-to-latest"]');
    if (await btn.isVisible()) {
      await btn.click();
      await expect(btn).not.toBeVisible({ timeout: 2000 });
    }
  });
});

// ─── Hardware footer ───────────────────────────────────────────────────────────

test.describe("LlamaCppPage - Hardware footer", () => {
  test.beforeEach(async ({ page }) => {
    await goToLlamaCpp(page);
  });

  test("CPU metric is visible", async ({ page }) => {
    await expect(page.getByText("CPU").first()).toBeVisible();
  });

  test("RAM metric is visible", async ({ page }) => {
    await expect(page.getByText("RAM").first()).toBeVisible();
  });

  test("GPU metric is visible", async ({ page }) => {
    await expect(page.getByText("GPU").first()).toBeVisible();
  });

  test("VRAM metric is visible", async ({ page }) => {
    await expect(page.getByText("VRAM").first()).toBeVisible();
  });

  test("GPU TEMP metric is visible", async ({ page }) => {
    await expect(page.getByText("GPU TEMP").first()).toBeVisible();
  });

  test("CPU percentage value is shown", async ({ page }) => {
    // cpuPct renders as "4.4%" — match any decimal percentage
    await expect(page.locator("text=/\\d+\\.\\d+%/").first()).toBeVisible({
      timeout: 10000,
    });
  });
});

// ─── CSS correctness ───────────────────────────────────────────────────────────

test.describe("LlamaCppPage - CSS correctness", () => {
  test("no undefined/NaN/null values in inline styles", async ({ page }) => {
    await goToLlamaCpp(page);
    await expectNoInvalidCssValues(page);
  });
});

// ─── Data binding sanity ───────────────────────────────────────────────────────

test.describe("LlamaCppPage - data binding sanity", () => {
  test.beforeEach(async ({ page }) => {
    await goToLlamaCpp(page);
  });

  test("max context 131,072 from API matches context card MAX tile", async ({
    page,
  }) => {
    await expect(page.locator("text=131,072").first()).toBeVisible();
  });

  test('model alias "coder" appears in meta row', async ({ page }) => {
    await expect(page.getByText("coder").first()).toBeVisible();
  });

  test("temperature 0.20 appears in sampling tiles", async ({ page }) => {
    await expect(page.getByText("0.20").first()).toBeVisible();
  });

  test("repeat penalty 1.10 appears in sampling tiles", async ({ page }) => {
    await expect(page.getByText("1.10").first()).toBeVisible();
  });

  test("build info b9833 appears in llama.cpp card", async ({ page }) => {
    await expect(page.locator("text=/b9833/").first()).toBeVisible();
  });
});

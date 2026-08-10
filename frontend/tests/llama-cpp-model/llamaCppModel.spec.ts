// Slow-tier tests: require a real Qwen model to be running via llama.cpp.
// Run with: npm run test:slow
// globalSetup ensures the model is active before any test executes.

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const LLAMA_URL = process.env.LLAMA_SERVER_URL ?? "http://localhost:8081";

// Mirror of the fast-test helper; seeds localStorage so the page resolves
// dirPath immediately and waits for metrics + gitInfo + profiles.
async function goToLlamaCpp(
  page: import("@playwright/test").Page,
): Promise<void> {
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

  await page.route("**/api/llama/repo-info**", async (route) => {
    const real = await route.fetch();
    const json = await real.json();
    if (!json.data?.latest_build_tag) {
      json.data = { ...json.data, latest_build_tag: "b9999" };
    }
    await route.fulfill({ json });
  });

  const metricsResponse = page.waitForResponse(
    (r) => r.url().includes("/api/ai/metrics") && r.status() === 200,
    { timeout: 60000 },
  );

  await page.goto(`${BASE_URL}/llama-cpp`);
  await expect(page.getByText("ACTIVE MODEL").first()).toBeVisible({
    timeout: 15000,
  });
  await metricsResponse;
  await page.waitForTimeout(300);

  await expect(page.locator("text=/b\\d{4,5}/").first()).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator("text=/Running|Stopped/").first()).toBeVisible({
    timeout: 20000,
  });
}

// POST a streaming chat completion to the llama.cpp server and drain the
// response body. Returns once generation is fully complete.
async function generate(prompt: string, maxTokens = 200): Promise<void> {
  const res = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "default",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      stream: true,
    }),
  });
  if (!res.ok)
    throw new Error(`llama.cpp /v1/chat/completions returned ${res.status}`);
  const reader = res.body!.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

// ─── Steady state ─────────────────────────────────────────────────────────────
// Tests that pass with the model loaded but not actively generating.

test.describe("LlamaCppModel - steady state", () => {
  test.beforeEach(async ({ page }) => {
    await goToLlamaCpp(page);
  });

  test("server shows Online", async ({ page }) => {
    await expect(page.locator('[data-testid="runtime-server"]')).toContainText(
      "Online",
    );
  });

  test("gen-status-badge is visible and shows a known state", async ({
    page,
  }) => {
    const badge = page.locator('[data-testid="gen-status-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/Idle|Generating/);
  });

  test("Context Max tile contains a numeric token count", async ({ page }) => {
    await expect(page.locator('[data-testid="ctx-max"]')).toContainText(
      /[\d,]+/,
    );
  });

  test("Context Current tile is visible", async ({ page }) => {
    await expect(page.locator('[data-testid="ctx-current"]')).toBeVisible();
  });

  test("model name contains Qwen", async ({ page }) => {
    await expect(page.locator("text=/Qwen/i").first()).toBeVisible();
  });

  test("console has log lines from server startup", async ({ page }) => {
    // With a real model running, the log area should not be in the empty state.
    await expect(
      page.locator('[data-testid="console-empty-state"]'),
    ).not.toBeVisible({ timeout: 10000 });
  });

  test("Gen Speed banner is visible", async ({ page }) => {
    await expect(page.locator('[data-testid="thrpt-gen-tps"]')).toBeVisible();
  });

  test("Prompt Speed banner is visible", async ({ page }) => {
    await expect(
      page.locator('[data-testid="thrpt-prompt-tps"]'),
    ).toBeVisible();
  });

  test("runtime PID shows a numeric process ID", async ({ page }) => {
    await expect(page.locator('[data-testid="runtime-pid"]')).toContainText(
      /\d+/,
    );
  });

  test("console-status shows Live when model is connected", async ({
    page,
  }) => {
    await expect(page.locator('[data-testid="console-status"]')).toContainText(
      /Live/,
    );
  });

  test("jump-to-latest button appears and dismisses when log area has content", async ({
    page,
  }) => {
    const logArea = page.locator('[data-testid="log-area"]');
    await expect(logArea).toBeVisible();
    // With a real model, log area has content — scroll to top to expose the button
    await logArea.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(500);
    const btn = page.locator('[data-testid="jump-to-latest"]');
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();
    await expect(btn).not.toBeVisible({ timeout: 3000 });
  });
});

// ─── Live generation ──────────────────────────────────────────────────────────
// Tests that trigger an actual completion and verify the dashboard updates.

test.describe("LlamaCppModel - live generation", () => {
  test.beforeEach(async ({ page }) => {
    await goToLlamaCpp(page);
  });

  test("gen badge shows Generating during active completion", async ({
    page,
  }) => {
    // Long prompt to ensure generation spans several dashboard poll cycles.
    const genPromise = generate(
      "Count from 1 to 50, writing each number on its own line.",
      400,
    );
    try {
      await expect(page.locator('[data-testid="gen-status-badge"]')).toHaveText(
        "Generating",
        { timeout: 20000 },
      );
    } finally {
      await genPromise;
    }
  });

  test("Context Current tile updates to a non-zero value during generation", async ({
    page,
  }) => {
    const genPromise = generate(
      "List the planets of the solar system and one fact about each.",
      300,
    );
    try {
      // During generation the current token count should be populated.
      await expect(
        page.locator('[data-testid="ctx-current"]'),
      ).not.toContainText("—", { timeout: 20000 });
    } finally {
      await genPromise;
    }
  });

  test("Gen Speed tile shows a t/s value after completion", async ({
    page,
  }) => {
    await generate("What is 7 times 8?", 50);
    // After generation ends the last gen TPS value should be visible.
    await expect(page.locator('[data-testid="thrpt-gen-tps"]')).toContainText(
      /\d/,
      { timeout: 10000 },
    );
  });

  test("Prompt Speed tile shows a t/s value after completion", async ({
    page,
  }) => {
    await generate("What is the capital of France?", 50);
    await expect(
      page.locator('[data-testid="thrpt-prompt-tps"]'),
    ).toContainText(/\d/, { timeout: 10000 });
  });

  test("Generated tile increments after a completion", async ({ page }) => {
    const tile = page.locator('[data-testid="thrpt-generated"]');
    const before = parseInt(
      (await tile.innerText()).replace(/\D/g, "") || "0",
      10,
    );

    await generate("Name three colours.", 60);

    await expect(async () => {
      const text = await tile.innerText();
      const after = parseInt(text.replace(/\D/g, "") || "0", 10);
      expect(after).toBeGreaterThan(before);
    }).toPass({ timeout: 15000 });
  });
});

// ─── Cache hits ───────────────────────────────────────────────────────────────
// Sending the same prompt twice should produce a KV-cache hit on the second pass.

test.describe("LlamaCppModel - cache hits", () => {
  test.beforeEach(async ({ page }) => {
    await goToLlamaCpp(page);
  });

  test("Cache Hits tile increments after a repeated prompt", async ({
    page,
  }) => {
    const cacheTile = page.locator('[data-testid="ctx-cache-hits"]');
    const before = parseInt(
      (await cacheTile.innerText()).replace(/\D/g, "") || "0",
      10,
    );

    const prompt = "What is the speed of light?";
    await generate(prompt, 40);
    await generate(prompt, 40);

    await expect(async () => {
      const text = await cacheTile.innerText();
      const after = parseInt(text.replace(/\D/g, "") || "0", 10);
      expect(after).toBeGreaterThan(before);
    }).toPass({ timeout: 20000 });
  });
});

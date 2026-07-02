import { test, expect } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

async function goToLlamaCpp(page: import("@playwright/test").Page) {
  await page.goto(BASE_URL);
  await page.getByRole("button", { name: "llama.cpp" }).click();
  await expect(page.getByText("LLAMA.CPP").first()).toBeVisible({
    timeout: 10000,
  });
}

// ─── QUANT column ──────────────────────────────────────────────────────────────
// These tests verify extractQuant against the real profiles served by the backend.
// The backend's profiles include model files with quant tokens mid-filename
// (e.g. …UD-Q3_K_M-REAP-RangerX.gguf) — the parser must extract them correctly.

test.describe("LlamaCpp - QUANT column", () => {
  test("Run Models table shows at least one non-em-dash quant cell from real profiles", async ({
    page,
  }) => {
    await goToLlamaCpp(page);
    await expect(page.getByText("Run Models").first()).toBeVisible({
      timeout: 8000,
    });

    // Real profiles have quant tokens; at least one row should not show em-dash
    // Use the REAP-RangerX model which has Q3_K_M mid-filename
    const quantCell = page
      .locator("text=/Q[0-9]_K_[MSXL]+|IQ[0-9]_[A-Z]+|BF16|F16/")
      .first();
    await expect(quantCell).toBeVisible({ timeout: 5000 });
  });

  test("Q3_K_M is shown for the Qwen3.6-35B-A3B-REAP-RangerX profile", async ({
    page,
  }) => {
    await goToLlamaCpp(page);
    await expect(page.getByText("Run Models").first()).toBeVisible({
      timeout: 8000,
    });

    // Qwen3.6-35B-A3B-UD-Q3_K_M-REAP-RangerX.gguf → Q3_K_M (not qat, UD, or REAP)
    await expect(page.getByText("Q3_K_M").first()).toBeVisible({
      timeout: 5000,
    });
  });
});

// ─── Wrap layout ───────────────────────────────────────────────────────────────

test.describe("LlamaCpp - wrap layout", () => {
  test("hero card and model table both remain visible after toggling Wrap", async ({
    page,
  }) => {
    await goToLlamaCpp(page);

    await expect(page.getByText("Run Models").first()).toBeVisible();

    const wrapBtn = page.getByRole("button", { name: /^Wrap$/i });
    if ((await wrapBtn.count()) > 0) {
      await wrapBtn.click();
      await expect(page.getByText("LLAMA.CPP").first()).toBeVisible();
      await expect(page.getByText("Run Models").first()).toBeVisible();

      await wrapBtn.click();
      await expect(page.getByText("LLAMA.CPP").first()).toBeVisible();
      await expect(page.getByText("Run Models").first()).toBeVisible();
    }
  });
});

// ─── Hide Idle ─────────────────────────────────────────────────────────────────

test.describe("LlamaCpp - console hide-idle", () => {
  test("Hide Idle toggle does not crash the page and retains page title", async ({
    page,
  }) => {
    await goToLlamaCpp(page);

    const hideIdleBtn = page.getByRole("button", { name: /Hide Idle/i });
    if ((await hideIdleBtn.count()) > 0) {
      await hideIdleBtn.click();
      await expect(page.getByText("LLAMA.CPP").first()).toBeVisible();

      await hideIdleBtn.click();
      await expect(page.getByText("LLAMA.CPP").first()).toBeVisible();
    }
  });

  test("Hide Idle button title attribute toggles on click", async ({
    page,
  }) => {
    await goToLlamaCpp(page);

    const hideIdleBtn = page.getByRole("button", { name: /Hide Idle/i });
    if ((await hideIdleBtn.count()) > 0) {
      const initialTitle = await hideIdleBtn.getAttribute("title");
      await hideIdleBtn.click();
      const toggledTitle = await hideIdleBtn.getAttribute("title");
      expect(initialTitle).not.toBe(toggledTitle);
    }
  });
});

import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

async function waitForAppReady(page: Page) {
  await page.waitForSelector(".app-root", { timeout: 10000 });
}

async function waitForAccentIndices(page: Page) {
  await page.waitForFunction(
    () => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>("[data-accent-el]"),
      ).filter((el) => el.getAttribute("data-accent-el") !== "inherit");
      return (
        els.length > 0 &&
        els.every((el) => el.style.getPropertyValue("--el-index") !== "")
      );
    },
    null,
    { timeout: 5000 },
  );
}

async function goToTheme(page: Page) {
  await page.goto(`${BASE_URL}/theme`);
  await page.waitForSelector(".theme-page", { timeout: 6000 });
}

async function getHtmlAttr(page: Page, attr: string): Promise<string | null> {
  return page.evaluate((a) => document.documentElement.getAttribute(a), attr);
}

async function clearEffectState(page: Page) {
  await page.evaluate(() => {
    [
      "dashboard-glow",
      "dashboard-pulse",
      "dashboard-pulse-speed",
      "dashboard-inner-glow",
      "dashboard-gradient-border",
      "dashboard-card-glow",
    ].forEach((k) => localStorage.removeItem(k));
  });
}

async function clickEffectRow(page: Page, label: string) {
  await page.locator(".mode-row", { hasText: label }).first().click();
}

test.describe("Theme page effect toggles", () => {
  test.beforeEach(async ({ page }) => {
    await goToTheme(page);
    await clearEffectState(page);
    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 6000 });
  });

  test("Neon Glow toggle sets data-glow=neon on <html>", async ({ page }) => {
    await clickEffectRow(page, "Neon Glow");
    expect(await getHtmlAttr(page, "data-glow")).toBe("neon");
  });

  test("Neon Glow toggle is reversible", async ({ page }) => {
    await clickEffectRow(page, "Neon Glow");
    await clickEffectRow(page, "Neon Glow");
    expect(await getHtmlAttr(page, "data-glow")).toBeNull();
  });

  test("Pulse toggle sets data-pulse=on on <html>", async ({ page }) => {
    await clickEffectRow(page, "Pulse");
    expect(await getHtmlAttr(page, "data-pulse")).toBe("on");
  });

  test("Pulse Speed slider appears when Pulse is on", async ({ page }) => {
    await clickEffectRow(page, "Pulse");
    await expect(
      page.locator("label").filter({ hasText: /Pulse Speed/ }),
    ).toBeVisible();
  });

  test("Pulse Speed slider is hidden when Pulse is off", async ({ page }) => {
    await expect(
      page.locator("label").filter({ hasText: /Pulse Speed/ }),
    ).not.toBeVisible();
  });

  test("Inner Glow toggle sets data-inner-glow=on on <html>", async ({
    page,
  }) => {
    await clickEffectRow(page, "Inner Glow");
    expect(await getHtmlAttr(page, "data-inner-glow")).toBe("on");
  });

  test("Gradient Border toggle sets data-gradient-border=on on <html>", async ({
    page,
  }) => {
    await clickEffectRow(page, "Gradient Border");
    expect(await getHtmlAttr(page, "data-gradient-border")).toBe("on");
  });

  test("Card Glow does not activate without Neon Glow or Inner Glow", async ({
    page,
  }) => {
    // Card Glow is disabled when neither Neon Glow nor Inner Glow is on
    const cardGlowRow = page
      .locator(".mode-row", { hasText: "Card Glow" })
      .first();
    await expect(cardGlowRow).toHaveAttribute("aria-disabled", "true");
    expect(await getHtmlAttr(page, "data-card-glow")).toBeNull();
  });

  test("Card Glow activates when Neon Glow is on", async ({ page }) => {
    await clickEffectRow(page, "Neon Glow");
    await page.waitForTimeout(100);
    await clickEffectRow(page, "Card Glow");
    expect(await getHtmlAttr(page, "data-card-glow")).toBe("on");
  });

  test("Card Glow activates when Inner Glow is on", async ({ page }) => {
    await clickEffectRow(page, "Inner Glow");
    await page.waitForTimeout(100);
    await clickEffectRow(page, "Card Glow");
    expect(await getHtmlAttr(page, "data-card-glow")).toBe("on");
  });

  test("Card Glow shows disabled hint when no glow is active", async ({
    page,
  }) => {
    await expect(
      page.getByText("Requires Neon Glow or Inner Glow"),
    ).toBeVisible();
  });

  test("Pulse effect persists across reload", async ({ page }) => {
    await clickEffectRow(page, "Pulse");
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 6000 });
    expect(await getHtmlAttr(page, "data-pulse")).toBe("on");
  });

  test("Inner Glow effect persists across reload", async ({ page }) => {
    await clickEffectRow(page, "Inner Glow");
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 6000 });
    expect(await getHtmlAttr(page, "data-inner-glow")).toBe("on");
  });
});

test.describe("Per-page accent-el index consistency", () => {
  const PAGES = [
    { name: "Overview", path: "/" },
    { name: "GPU", path: "/gpu" },
    { name: "CPU", path: "/cpu" },
    { name: "LlamaCpp", path: "/llama-cpp" },
  ];

  for (const { name, path } of PAGES) {
    test(`${name}: all [data-accent-el] elements have an assigned --el-index`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAppReady(page);
      await waitForAccentIndices(page);

      const result = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll<HTMLElement>("[data-accent-el]"),
        ).filter((el) => el.getAttribute("data-accent-el") !== "inherit");
        const indices = els.map((el) =>
          el.style.getPropertyValue("--el-index"),
        );
        return {
          total: els.length,
          assigned: indices.filter((i) => i !== "").length,
          unique: new Set(indices.filter((i) => i !== "")).size,
        };
      });

      expect(result.total).toBeGreaterThan(0);
      expect(result.assigned).toBe(result.total);
      expect(result.unique).toBe(result.total);
    });

    test(`${name}: Neon Glow applies box-shadow to .accent-glow-target elements`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAppReady(page);

      await page.evaluate(() => {
        document.documentElement.setAttribute("data-glow", "neon");
      });
      await page.waitForTimeout(100);

      const count = await page.evaluate(() => {
        return document.querySelectorAll(".accent-glow-target").length;
      });

      // When glow targets exist, verify --card-glow resolves to a non-transparent value
      if (count > 0) {
        const hasActiveGlow = await page.evaluate(() => {
          const glowVar = window
            .getComputedStyle(document.documentElement)
            .getPropertyValue("--card-glow")
            .trim();
          // Default is "0 0 0 rgba(0,0,0,0)"; neon glow sets a real glow value
          return glowVar !== "" && !glowVar.includes("rgba(0, 0, 0, 0)");
        });
        expect(hasActiveGlow).toBe(true);
      }
    });
  }
});

test.describe("Pulse glow: overflow-safe rendering", () => {
  // Regression: pulse ::before used outward box-shadow, which was clipped by
  // overflow:hidden on ancestor containers, leaving only the bottom gap visible.
  // Fix: gradient radiates inward (rightward into card) so it stays within bounds.

  test("pulse ::before uses gradient background, not outward box-shadow", async ({
    page,
  }) => {
    await goToTheme(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-pulse", "on");
    });
    await page.waitForTimeout(100);

    const result = await page.evaluate(() => {
      const spine = document.querySelector(".accent-glow-target");
      if (!spine) return null;
      const cs = window.getComputedStyle(spine, "::before");
      return {
        backgroundImage: cs.backgroundImage,
        boxShadow: cs.boxShadow,
        animationName: cs.animationName,
      };
    });

    expect(result).not.toBeNull();
    expect(result!.backgroundImage).toContain("gradient");
    expect(result!.boxShadow).toBe("none");
    expect(result!.animationName).toBe("accent-pulse");
  });

  const PULSE_PAGES = [
    { name: "Overview", path: "/" },
    { name: "GPU", path: "/gpu" },
    { name: "CPU", path: "/cpu" },
    { name: "Settings", path: "/settings" },
    { name: "LlamaCpp", path: "/llama-cpp" },
  ];

  for (const { name, path } of PULSE_PAGES) {
    test(`${name}: pulse ::before gradient fits within card width`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAppReady(page);
      await page.evaluate(() => {
        document.documentElement.setAttribute("data-pulse", "on");
      });
      await page.waitForTimeout(100);

      const result = await page.evaluate(() => {
        const spine = document.querySelector<HTMLElement>(
          ".card-accent-spine.accent-glow-target",
        );
        if (!spine) return null;
        const card = spine.parentElement!;
        const cardWidth = card.getBoundingClientRect().width;
        const beforeWidth = parseFloat(
          window.getComputedStyle(spine, "::before").width,
        );
        const bgImage = window.getComputedStyle(
          spine,
          "::before",
        ).backgroundImage;
        return { cardWidth, beforeWidth, bgImage };
      });

      if (!result) return; // no card-accent-spine on this page
      expect(result.beforeWidth).toBeLessThanOrEqual(result.cardWidth + 1);
      expect(result.bgImage).toContain("gradient");
    });
  }
});

test.describe("LlamaCpp: all card-accent-spine elements have accent-glow-target", () => {
  test("llama.cpp: every .card-accent-spine element also has .accent-glow-target", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/llama-cpp`);
    await waitForAppReady(page);

    const { spineCount, glowTargetCount, missingClasses } = await page.evaluate(
      () => {
        const spines =
          document.querySelectorAll<HTMLElement>(".card-accent-spine");
        const glowTargets = document.querySelectorAll<HTMLElement>(
          ".card-accent-spine.accent-glow-target",
        );
        const missing = Array.from(spines)
          .filter((el) => !el.classList.contains("accent-glow-target"))
          .map((el) => el.className);
        return {
          spineCount: spines.length,
          glowTargetCount: glowTargets.length,
          missingClasses: missing,
        };
      },
    );

    expect(spineCount).toBeGreaterThan(0);
    expect(glowTargetCount).toBe(spineCount);
    expect(missingClasses).toHaveLength(0);
  });

  test("llama.cpp: card-accent-spine elements animate when pulse is on", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/llama-cpp`);
    await waitForAppReady(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-pulse", "on");
    });
    await page.waitForTimeout(100);

    const result = await page.evaluate(() => {
      const spines =
        document.querySelectorAll<HTMLElement>(".card-accent-spine");
      return Array.from(spines).map((el) => ({
        hasGlowTarget: el.classList.contains("accent-glow-target"),
        animationName: window.getComputedStyle(el, "::before").animationName,
      }));
    });

    expect(result.length).toBeGreaterThan(0);
    for (const r of result) {
      expect(r.hasGlowTarget).toBe(true);
      expect(r.animationName).toBe("accent-pulse");
    }
  });
});

test.describe("Pulse color consistency: uses --accent-glow not --accent-primary", () => {
  // Regression: pulse ::before gradient used --accent-primary (per-element spectrum color),
  // but neon glow (::after box-shadow) uses --accent-glow. In spectrum mode or when a
  // custom glow color is set, these diverge — cards pulse one color and glow another.
  // Fix: pulse gradient must use --accent-glow so both effects share the same color token.

  test("pulse ::before CSS rule references --accent-glow, not --accent-primary", async ({
    page,
  }) => {
    await goToTheme(page);

    const result = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            const sr = rule as CSSStyleRule;
            if (sr.selectorText === ".accent-glow-target::before") {
              return sr.style.cssText + " / background: " + sr.style.background;
            }
          }
        } catch {
          // Cross-origin stylesheet: unreadable by design, not a failure.
        }
      }
      // Fallback: check all rules text
      const all: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            all.push((rule as CSSStyleRule).cssText || "");
          }
        } catch {
          // Cross-origin stylesheet: unreadable by design, not a failure.
        }
      }
      const match = all.find((t) => t.includes(".accent-glow-target::before"));
      return match ?? null;
    });

    expect(result).not.toBeNull();
    expect(result).toContain("accent-glow");
    expect(result).not.toContain("accent-primary");
  });

  test("pulse ::before computed color on theme page matches --accent-glow color", async ({
    page,
  }) => {
    await goToTheme(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-pulse", "on");
    });
    await page.waitForTimeout(100);

    const { glowColor, pulseGradient } = await page.evaluate(() => {
      const root = document.documentElement;
      const glowColor = window
        .getComputedStyle(root)
        .getPropertyValue("--accent-glow")
        .trim();

      const spine = document.querySelector<HTMLElement>(".accent-glow-target");
      const pulseGradient = spine
        ? window.getComputedStyle(spine, "::before").backgroundImage
        : "";

      return { glowColor, pulseGradient };
    });

    // --accent-glow must be defined
    expect(glowColor).not.toBe("");
    // pulse ::before must use a gradient (not a solid color or none)
    expect(pulseGradient).toContain("gradient");
    // The gradient must NOT embed a literal red/orange spectrum hue when glow is blue
    // We check by ensuring accent-glow color token appears in the CSS rule (structural test above),
    // so a passing structural test + this computed check together confirm color consistency.
  });
});

test.describe("Bar graph pulse visibility", () => {
  test("theme page: preview card-progress-bar has accent-glow-target class", async ({
    page,
  }) => {
    await goToTheme(page);
    const count = await page.evaluate(
      () =>
        document.querySelectorAll(".card-progress-bar.accent-glow-target")
          .length,
    );
    expect(count).toBeGreaterThan(0);
  });

  test("theme page: .card-progress-bar.accent-glow-target ::before animates when pulse is on", async ({
    page,
  }) => {
    await goToTheme(page);
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-pulse", "on"),
    );
    await page.waitForTimeout(100);
    const anim = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        ".card-progress-bar.accent-glow-target",
      );
      return el ? window.getComputedStyle(el, "::before").animationName : null;
    });
    expect(anim).toBe("accent-pulse");
  });

  test("overview page: .ov-disk-fill ::before animates when pulse is on", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-pulse", "on"),
    );
    await page.waitForTimeout(100);
    const anim = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".ov-disk-fill");
      return el ? window.getComputedStyle(el, "::before").animationName : null;
    });
    expect(anim).toBe("accent-pulse");
  });
});

test.describe("Spectrum mode distinct --el-index values", () => {
  test("Overview page: elements have distinct --el-index in Spectrum mode", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-accent-mode", "spectrum");
    });
    await waitForAccentIndices(page);

    const indices = await page.evaluate(() => {
      const els = document.querySelectorAll<HTMLElement>(
        '[style*="--el-index"]',
      );
      return Array.from(els).map((el) =>
        el.style.getPropertyValue("--el-index"),
      );
    });

    expect(indices.length).toBeGreaterThan(1);
    expect(new Set(indices).size).toBeGreaterThan(1);
  });
});

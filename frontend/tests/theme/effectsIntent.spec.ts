/**
 * Effects INTENT layer — the test kind whose absence let four theme bugs
 * ship: invisible Pulse (accent-on-accent), the Surge/Breathe base wash
 * (missing opacity:0), one-hue rainbow charts, and undetectable
 * frozen-rainbow. jsdom cannot see resolved styles; screenshots canonize
 * whatever existed at baseline time. This layer asserts computed styles and
 * ANIMATION LIVENESS in a real browser — deterministic, no pixel diffing.
 *
 * REQUIRES the pulse-visibility CSS fixes (white shine + base opacity:0).
 * Expected matrix — BEFORE that patch: 1 FAIL, 2 FAIL, 3 PASS, 4 PASS
 * (1–2 red is CORRECT: they are the patch's automated acceptance).
 * AFTER the patch: 4/4 PASS. Any other combination = investigate, don't
 * loosen. Every test first asserts its driving DOM attribute actually
 * landed, so no test can pass vacuously against a page that never entered
 * the intended state. Reduced-motion is pinned to no-preference so OS
 * accessibility settings on a CI box cannot invert tests 3–4.
 * Authored + typechecked, not executed here: run once before trusting in CI.
 */
import { test, expect, Page } from "@playwright/test";

const boot = (kv: Record<string, string>) => (page: Page) =>
  page.addInitScript((entries: [string, string][]) => {
    for (const [k, v] of entries) localStorage.setItem(k, v);
  }, Object.entries(kv));

test("pulse ON: card shine pseudo resolves to a WHITE gradient (not accent)", async ({ page }) => {
  await boot({ "dashboard-pulse": "on", "dashboard-accent-mode": "solid" })(page);
  await page.goto("/");
  await page.waitForSelector(".accent-glow-target", { timeout: 30_000 });
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.getAttribute("data-pulse")))
    .toBe("on"); // anti-vacuity: the driving attribute must actually land
  const bg = await page.evaluate(() => {
    const el = document.querySelector(".accent-glow-target")!;
    return getComputedStyle(el, "::before").backgroundImage;
  });
  // Chromium serializes color-mix(white ...) as color(srgb 1 1 1 ...) in computed styles
  expect(bg, "pulse shine must be white-family; accent-on-accent is invisible").toMatch(/white|255,\s*255,\s*255|srgb 1 1 1/);
});

test("effects OFF: surge/breathe base spans are fully transparent (no wash)", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".bright-surge", { timeout: 30_000 });
  const opacities = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".bright-surge, .bright-breathe"))
      .slice(0, 8)
      .map((el) => getComputedStyle(el).opacity),
  );
  expect(opacities.length).toBeGreaterThan(0);
  for (const o of opacities) {
    expect(o, "base spans must be invisible when effects are off — the 15% white wash bug").toBe("0");
  }
});

test("rainbow-wave: hue-spin is genuinely RUNNING (frozen rainbow is detectable)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // dashboard-fx-safe must be explicitly off: Playwright is software-rendered,
  // so isSoftwareRendering() auto-engages fx-safe, which kills hue-spin.
  await boot({ "dashboard-accent-mode": "rainbow-wave", "dashboard-fx-safe": "off" })(page);
  await page.goto("/");
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.getAttribute("data-accent-mode")))
    .toBe("rainbow-wave"); // anti-vacuity: mode landed
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.getAttribute("data-fx-safe")))
    .not.toBe("on"); // anti-vacuity: fx-safe must not suppress the animation
  await page.waitForTimeout(1000);
  const anim = await page.evaluate(() => {
    // document.getAnimations() is more reliable than documentElement.getAnimations()
    // in Playwright's Chromium for root-element animations
    const a = document.getAnimations()
      .find((x: any) => x.animationName === "hue-spin");
    return a ? { state: a.playState } : null;
  });
  expect(anim, "rainbow-wave must have a hue-spin animation on <html>").not.toBeNull();
  expect(anim!.state, "hue-spin must be running, not paused/idle").toBe("running");
});

test("fx-safe ON: hue-spin is suppressed (the freeze is intentional and detectable)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await boot({ "dashboard-accent-mode": "rainbow-wave", "dashboard-fx-safe": "on" })(page);
  await page.goto("/");
  // Anti-vacuity BOTH ways: this only proves suppression if the page really
  // is in rainbow mode AND fx-safe really engaged.
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.getAttribute("data-accent-mode")))
    .toBe("rainbow-wave");
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.getAttribute("data-fx-safe")))
    .toBe("on");
  await page.waitForTimeout(1000);
  const running = await page.evaluate(() =>
    document.getAnimations()
      .some((x: any) => x.animationName === "hue-spin" && x.playState === "running"),
  );
  expect(running, "fx-safe must stop hue-spin — and this pins the OTHER direction of the freeze").toBe(false);
});

test("surge ON: fx-surge is genuinely RUNNING on a span", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await boot({ "dashboard-surge": "on", "dashboard-fx-safe": "off" })(page);
  await page.goto("/");
  await expect.poll(async () => page.evaluate(() =>
    document.documentElement.getAttribute("data-surge"))).toBe("on");
  await page.waitForSelector(".accent-glow-target .bright-surge", { timeout: 30_000 });
  const running = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".accent-glow-target .bright-surge")).slice(0, 8)
      .some((el) => el.getAnimations().some((a: any) =>
        a.animationName === "fx-surge" && a.playState === "running")));
  expect(running, "surge-on must run fx-surge on at least one span").toBe(true);
});

test("breathe + inner-glow: the existing inner glow breathes on its own layer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await boot({ "dashboard-breathe": "on", "dashboard-inner-glow": "on", "dashboard-fx-safe": "off" })(page);
  await page.goto("/");
  await expect.poll(async () => page.evaluate(() =>
    document.documentElement.getAttribute("data-breathe"))).toBe("on");
  await expect.poll(async () => page.evaluate(() =>
    document.documentElement.getAttribute("data-inner-glow"))).toBe("on");
  // Cards render after first SSE data arrives — wait for the spine to be present.
  await page.waitForSelector(".card-accent-spine", { timeout: 30_000 });
  const r = await page.evaluate(() => {
    const card = document.querySelector('[data-accent-el]:has(> .card-accent-spine)') as HTMLElement | null;
    const layer = card?.querySelector(":scope > .inner-glow-breathe") as HTMLElement | null;
    if (!card) return { missing: "card" };
    if (!layer) return { missing: "layer" };
    return {
      cardBg: getComputedStyle(card).backgroundImage,
      layerBg: getComputedStyle(layer).backgroundImage,
      anim: layer.getAnimations().some((a: any) =>
        a.animationName === "fx-breathe-glow" && a.playState === "running"),
    };
  });
  expect((r as any).missing, "layer must exist as the card's direct child").toBeUndefined();
  expect((r as any).cardBg, "card hands off its static gradient while breathing").toBe("none");
  expect((r as any).layerBg, "layer carries the SAME inner-glow gradient").toContain("linear-gradient");
  expect((r as any).anim, "layer breathes on fx-breathe-glow").toBe(true);
});

test("breathe + card-glow: the card's outer bloom breathes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await boot({ "dashboard-breathe": "on", "dashboard-card-glow": "on", "dashboard-fx-safe": "off" })(page);
  await page.goto("/");
  await expect.poll(async () => page.evaluate(() =>
    document.documentElement.getAttribute("data-breathe"))).toBe("on");
  await expect.poll(async () => page.evaluate(() =>
    document.documentElement.getAttribute("data-card-glow"))).toBe("on");
  // Cards render after first SSE data arrives — wait for the spine to be present.
  await page.waitForSelector(".card-accent-spine", { timeout: 30_000 });
  const r = await page.evaluate(() => {
    const card = document.querySelector(
      '[data-accent-el]:not(.accent-spine):not(.accent-fill):not(.accent-glow-target)') as HTMLElement | null;
    if (!card) return { missing: "card" };
    const mult = parseFloat(getComputedStyle(card).getPropertyValue("--breathe-halo-mult") || "NaN");
    return {
      anim: card.getAnimations().some((a: any) =>
        a.animationName === "fx-breathe-halo" && a.playState === "running"),
      mult,
    };
  });
  expect((r as any).missing, "a bloom-carrying card must exist").toBeUndefined();
  expect((r as any).anim, "the card must run fx-breathe-halo").toBe(true);
  expect((r as any).mult, "multiplier mid-animation stays in the halo's range")
    .toBeGreaterThanOrEqual(0.35);
  expect((r as any).mult).toBeLessThanOrEqual(1.01);
});

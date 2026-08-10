/**
 * Invariant 12 (Tier C): Reduced motion — ALL animations off when
 * prefers-reduced-motion: reduce is active.
 * Effects still render statically (not removed), but no animation runs.
 */
import { test, expect } from "@playwright/test";
import { setAccentMode } from "../helpers/e2eThemeAssertions";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

const PAGES = [
  { name: "Overview", path: "/" },
  { name: "CPU", path: "/cpu" },
];

const MODES = ["rainbow-wave", "spectrum"] as const;

for (const { name, path } of PAGES) {
  for (const mode of MODES) {
    test(`Invariant 12 reduced-motion: ${name} in ${mode} — no running animations`, async ({
      page,
    }) => {
      // Emulate reduced-motion preference
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForSelector("[data-accent-el]", { timeout: 10000 });
      await setAccentMode(page, mode);
      await page.waitForTimeout(300);

      const runningAnimations = await page.evaluate(() => {
        const animated: string[] = [];
        for (const el of Array.from(document.querySelectorAll("*"))) {
          const cs = getComputedStyle(el);
          const animName = cs.animationName;
          const animState = cs.animationPlayState;
          // If the element has a named animation that is running, flag it
          if (
            animName &&
            animName !== "none" &&
            animState === "running"
          ) {
            animated.push(
              `${el.tagName}.${el.className} animation="${animName}"`,
            );
          }
        }
        return animated;
      });

      expect(
        runningAnimations,
        `${name} in ${mode}: found running animations under reduced-motion:\n` +
          runningAnimations.join("\n"),
      ).toHaveLength(0);
    });
  }
}

test("Invariant 12 reduced-motion: rainbow-wave --accent-spin does not animate", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${BASE_URL}/`);
  await page.waitForSelector("[data-accent-el]", { timeout: 10000 });
  await setAccentMode(page, "rainbow-wave");
  await page.waitForTimeout(300);

  const spin0 = await page.evaluate(() =>
    parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-spin")
        .trim(),
    ) || 0,
  );
  await page.waitForTimeout(1200);
  const spin1200 = await page.evaluate(() =>
    parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-spin")
        .trim(),
    ) || 0,
  );

  expect(
    spin0,
    `--accent-spin changed under reduced-motion: ${spin0} → ${spin1200}`,
  ).toBe(spin1200);
});

test("Invariant 12 reduced-motion: pulse animation does not run", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${BASE_URL}/`);
  await page.waitForSelector(".app-root", { timeout: 10000 });

  // Enable pulse via data attribute
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-pulse", "on");
  });
  await page.waitForTimeout(200);

  const pulseRunning = await page.evaluate(() => {
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(".accent-glow-target"),
    );
    return targets.some((el) => {
      const cs = getComputedStyle(el, "::before");
      return cs.animationName !== "none" && cs.animationPlayState === "running";
    });
  });

  expect(
    pulseRunning,
    "Pulse animation is running despite reduced-motion preference",
  ).toBe(false);
});

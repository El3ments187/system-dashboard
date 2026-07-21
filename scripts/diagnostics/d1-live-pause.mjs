/**
 * D1 — Live-pause differential, self-contained.
 *
 * Run: node d1-live-pause.mjs           (from frontend/, dev server on :5173)
 * Requires a display (headed). Total runtime ≈ 7 minutes. Prints a verdict.
 *
 * Methodology note (why headed Playwright with CDP attached is VALID here):
 * the no-DevTools rule protected the BASELINE characterization, when CDP
 * attachment was itself a candidate cause. D1 is a within-run SLOPE
 * differential: CDP overhead is constant across phases, so "does the slope
 * change when Live is toggled" is unaffected. RSS is read via `ps` (OS
 * truth), never via CDP metrics.
 *
 * Selector is verified against Header.tsx: the Live chip carries
 * title="Pause live updates" while live and title="Resume live updates"
 * while paused — the title flip confirms each click actually took effect.
 */
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";

const URL = process.env.DASH_URL ?? "http://localhost:5173/";
const WARMUP_MS = 60_000;
const SAMPLE_MS = 30_000;
const PER_PHASE = 4; // 4 samples/phase; at ~160 MB/30s the signal dwarfs noise

const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findRendererPid(profileDir) {
  // The renderer's cmdline contains the profile dir; take the largest one.
  const out = sh(
    `ps -eo pid,rss,args | grep -- '--type=renderer' | grep -F '${profileDir}' | grep -v grep | sort -k2 -n | tail -1 | awk '{print $1}' || true`,
  );
  const pid = parseInt(out, 10);
  if (!Number.isFinite(pid)) throw new Error("renderer PID not found");
  return pid;
}
const rssMb = (pid) => Math.round(parseInt(sh(`ps -o rss= -p ${pid}`), 10) / 1024);

async function samplePhase(name, pid, n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) await sleep(SAMPLE_MS);
    const mb = rssMb(pid);
    rows.push(mb);
    console.log(`[${name}] ${new Date().toTimeString().slice(0, 8)}  ${mb} MB`);
  }
  const perMin = ((rows[rows.length - 1] - rows[0]) / ((n - 1) * SAMPLE_MS)) * 60_000;
  return { rows, perMin: Math.round(perMin) };
}

const profileDir = `/tmp/d1-live-pause-${Date.now()}`;
const browser = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1440, height: 900 },
});
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto(URL);
await page.waitForSelector("text.recharts-cartesian-axis-tick-value", { timeout: 30_000 });
console.log(`warm-up ${WARMUP_MS / 1000}s on Overview…`);
await sleep(WARMUP_MS);

const pid = findRendererPid(profileDir);
console.log(`renderer PID ${pid}`);

const live = await samplePhase("LIVE  ", pid, PER_PHASE);

const pauseBtn = page.getByTitle("Pause live updates");
await pauseBtn.click();
await page.getByTitle("Resume live updates").waitFor({ timeout: 5_000 }); // click verified
console.log(">>> Live PAUSED (verified by title flip)");
const paused = await samplePhase("PAUSED", pid, PER_PHASE);

await page.getByTitle("Resume live updates").click();
await page.getByTitle("Pause live updates").waitFor({ timeout: 5_000 });
console.log(">>> Live RESUMED (verified)");
const resumed = await samplePhase("RESUME", pid, 3);

console.log("\n=== D1 RESULT ===");
console.log(`live   slope: ~${live.perMin} MB/min   (${live.rows.join(" → ")})`);
console.log(`paused slope: ~${paused.perMin} MB/min (${paused.rows.join(" → ")})`);
console.log(`resume slope: ~${resumed.perMin} MB/min (${resumed.rows.join(" → ")})`);

const FLAT = 50; // MB/min threshold, matches the prompt's definition
let verdict;
if (live.perMin >= FLAT && paused.perMin < FLAT && resumed.perMin >= FLAT) {
  verdict = "D1 = FLAT while paused, slope returns on resume → PER-POLL RETENTION → Branch B1";
} else if (paused.perMin >= FLAT) {
  verdict = "D1 = STILL CLIMBING with polls paused → data path innocent → proceed to D2 (/settings)";
} else {
  verdict = `D1 = AMBIGUOUS (live ${live.perMin}, paused ${paused.perMin}, resume ${resumed.perMin} MB/min) → report raw numbers, do not pick a branch`;
}
console.log(verdict);
await browser.close();

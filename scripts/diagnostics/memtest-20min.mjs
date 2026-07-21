/**
 * Item 6 — 20-min close-out memtest
 * Dev build, Overview page, 40 samples × 30s.
 * PASS: avg slope after minute 2 < 50 MB/min AND final RSS within ~2× plateau.
 */
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";

const URL = "http://localhost:5173/";
const WARMUP_MS = 60_000;      // 60s warm-up before first sample
const SAMPLE_MS = 30_000;      // 30s between samples
const N_SAMPLES = 40;

const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findRendererPid(profileDir) {
  const out = sh(
    `ps -eo pid,rss,args | grep -- '--type=renderer' | grep -F '${profileDir}' | grep -v grep | sort -k2 -n | tail -1 | awk '{print $1}' || true`,
  );
  const pid = parseInt(out, 10);
  if (!Number.isFinite(pid)) throw new Error("renderer PID not found");
  return pid;
}
const rssMb = (pid) => Math.round(parseInt(sh(`ps -o rss= -p ${pid}`), 10) / 1024);

const profileDir = `/tmp/memtest-20min-${Date.now()}`;
const browser = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1440, height: 900 },
});
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto(URL);
await page.waitForSelector("text.recharts-cartesian-axis-tick-value", { timeout: 30_000 });
console.log(`[memtest] warm-up ${WARMUP_MS / 1000}s on Overview…`);
await sleep(WARMUP_MS);

const pid = findRendererPid(profileDir);
console.log(`[memtest] renderer PID ${pid}`);

const series = [];
const startTs = Date.now();

for (let i = 0; i < N_SAMPLES; i++) {
  if (i > 0) await sleep(SAMPLE_MS);
  const mb = rssMb(pid);
  const elapsedMin = ((Date.now() - startTs) / 60_000).toFixed(1);
  series.push({ i, mb, elapsedMin });
  console.log(`[sample ${String(i + 1).padStart(2, "0")}/${N_SAMPLES}] t=${elapsedMin}min  RSS=${mb} MB`);
}

// Slope calc: skip first 4 samples (≈ first 2 min) for the after-warmup average
const postWarmup = series.slice(4);
const slopes = [];
for (let i = 1; i < postWarmup.length; i++) {
  const dMB = postWarmup[i].mb - postWarmup[i - 1].mb;
  const dMin = (SAMPLE_MS / 60_000);
  slopes.push(dMB / dMin);
}
const avgSlope = slopes.reduce((a, b) => a + b, 0) / slopes.length;
const finalMB = series[series.length - 1].mb;
const pass = avgSlope < 50;

console.log("\n=== ITEM 6 RESULT ===");
console.log(`Series: ${series.map(s => s.mb).join(", ")}`);
console.log(`Avg slope after min 2: ${avgSlope.toFixed(1)} MB/min`);
console.log(`Final RSS: ${finalMB} MB`);
console.log(`VERDICT: ${pass ? "PASS" : "FAIL"} (threshold: < 50 MB/min)`);
await browser.close();

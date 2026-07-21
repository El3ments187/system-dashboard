/**
 * D3 — Production build memtest, 6 minutes.
 * Run: node d3-prod-memtest.mjs  (from frontend/, prod preview on :4173)
 */
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";

const URL = process.env.DASH_URL ?? "http://localhost:4173/";
const WARMUP_MS = 30_000;
const SAMPLE_MS = 30_000;
const SAMPLES = 12;

const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rssMb = (pid) =>
  Math.round(parseInt(sh(`ps -o rss= -p ${pid}`), 10) / 1024);

function findRendererPid(profileDir) {
  const out = sh(
    `ps -eo pid,rss,args | grep -- '--type=renderer' | grep -F '${profileDir}' | grep -v grep | sort -k2 -n | tail -1 | awk '{print $1}' || true`,
  );
  const pid = parseInt(out, 10);
  if (!Number.isFinite(pid)) throw new Error("renderer PID not found");
  return pid;
}

const profileDir = `/tmp/d3-prod-${Date.now()}`;
const browser = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1440, height: 900 },
});
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto(URL);
await page.waitForSelector("text.recharts-cartesian-axis-tick-value", {
  timeout: 30_000,
});
console.log(`warm-up ${WARMUP_MS / 1000}s on Overview (PROD build)…`);
await sleep(WARMUP_MS);

const pid = findRendererPid(profileDir);
console.log(`renderer PID ${pid}`);

const rows = [];
for (let i = 0; i < SAMPLES; i++) {
  if (i > 0) await sleep(SAMPLE_MS);
  const mb = rssMb(pid);
  rows.push(mb);
  console.log(`[PROD] ${new Date().toTimeString().slice(0, 8)}  ${mb} MB`);
}

const perMin =
  ((rows[rows.length - 1] - rows[0]) / ((SAMPLES - 1) * SAMPLE_MS)) * 60_000;
console.log(`\n=== D3 RESULT ===`);
console.log(`samples: ${rows.join(" → ")}`);
console.log(`slope: ~${Math.round(perMin)} MB/min`);

const FLAT = 50;
if (Math.abs(perMin) < FLAT) {
  console.log(
    "D3 = FLAT in production → dev-tooling-only leak → Branch B3",
  );
} else if (perMin >= FLAT) {
  console.log(
    `D3 = CLIMBING in production (~${Math.round(perMin)} MB/min) → real user-facing leak → proceed to D4`,
  );
} else {
  console.log(`D3 = DECLINING (GC) — measure again if needed`);
}
await browser.close();

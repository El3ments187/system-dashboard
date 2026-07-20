/**
 * E2E leak detector — symptom level, real Chromium.
 *
 * Watches BOTH leak classes this app has actually exhibited:
 *
 *  1. Detached-DOM growth: CDP `Memory.getDOMCounters` returns the renderer's
 *     live DOM node count INCLUDING detached-but-retained nodes (what the
 *     DevTools Detached Elements panel shows). The original axis-<tspan> leak
 *     detached ~1 node per tick per chart per poll and climbed here steadily.
 *
 *  2. Native/RSS growth with flat DOM: the class that detection missed first
 *     time around — raster buffers, canvas backing stores, allocator growth.
 *     Invisible to DOM counters AND to JS heap snapshots. We sample the
 *     renderer process's OS-level RSS (via CDP SystemInfo.getProcessInfo for
 *     the pid + `ps` for RSS) alongside JS heap, so "DOM flat, heap flat, RSS
 *     climbing" fails loudly instead of passing silently.
 *
 * Strategy: warm up, sample all three signals over an observation window,
 * assert bounded growth AND a second-half plateau (so slow leaks can't hide
 * under an absolute cap). Thresholds carry ~5x headroom over benign jitter
 * while sitting well below the magnitudes both real leaks showed.
 *
 * Requires: chromium project (CDP is Chromium-only), dev server on
 * baseURL (http://localhost:5173 per playwright.config.ts), and a POSIX `ps`
 * for the RSS samples (RSS assertions auto-skip on win32).
 *
 * RSS assertions auto-skip when the browser's WebGL renderer is SwiftShader /
 * llvmpipe / softpipe (software rasterization). In those environments headless
 * Chromium accumulates raster buffers for SVG repaints at ~5–6 MB/s regardless
 * of app behaviour — the threshold of 150 MB would always fail and the signal
 * is meaningless. The DOM-node and JS-heap assertions still run. To get a
 * meaningful RSS reading, run against a headless Chromium with hardware GPU
 * passthrough (or in the actual browser via Chrome Task Manager).
 *
 * NOTE: authored from measured leak magnitudes + CDP docs; run once locally
 * to confirm thresholds before trusting in CI. If your poll cadence differs,
 * scale OBSERVE_MS rather than loosening the growth caps.
 */
import { test, expect, chromium } from "@playwright/test";
import { execSync } from "node:child_process";

const WARMUP_MS = 10_000; // lazy recharts import, fonts, first paints
const OBSERVE_MS = 60_000;
const SAMPLE_EVERY_MS = 5_000;
// Original tspan leak: thousands of nodes per minute. Benign jitter: <300.
const MAX_NODE_GROWTH = 1_500;
// Original native climb: hundreds of MB per minute toward 2-10 GB. Benign
// jitter (GC timing, raster cache warmup after WARMUP_MS): tens of MB.
const MAX_RSS_GROWTH_KB = 150_000; // 150 MB over the window
const MAX_HEAP_GROWTH_BYTES = 75 * 1024 * 1024;

function rssKb(pid: number): number | null {
  try {
    const out = execSync(`ps -o rss= -p ${pid}`, { encoding: "utf8" }).trim();
    const kb = parseInt(out, 10);
    return Number.isFinite(kb) ? kb : null;
  } catch {
    return null; // process gone or ps unavailable
  }
}

test.describe("Overview leak detector (detached DOM + native RSS, CDP)", () => {
  test("DOM nodes, JS heap, and renderer RSS all stay flat while Overview polls", async ({
    baseURL,
  }) => {
    test.setTimeout(WARMUP_MS + OBSERVE_MS + 90_000);

    const browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");

    await page.goto(baseURL ?? "http://localhost:5173/");
    await page.waitForSelector("text.recharts-cartesian-axis-tick-value", {
      timeout: 30_000,
    });

    // Probe the WebGL renderer so we can skip RSS assertions under software
    // rasterization (SwiftShader/llvmpipe), where raster-buffer overhead is
    // ~5–6 MB/s regardless of app behaviour and the 150 MB threshold is meaningless.
    const webglRenderer = await page.evaluate((): string => {
      const canvas = document.createElement("canvas");
      const gl =
        (canvas.getContext("webgl") as WebGLRenderingContext | null) ??
        (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
      if (!gl) return "no-webgl";
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (!ext) return "no-ext";
      return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
    });
    const isSoftwareRenderer =
      /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(webglRenderer);

    // Identify this page's renderer pid via a browser-level CDP session:
    // with a single page open, the renderer-type process with the highest
    // RSS is the tab under test.
    const browserCdp = await browser.newBrowserCDPSession();
    const { processInfo } = (await browserCdp.send(
      "SystemInfo.getProcessInfo",
    )) as { processInfo: Array<{ type: string; id: number }> };
    const rendererPids = processInfo
      .filter((p) => p.type === "renderer")
      .map((p) => p.id);
    const canSampleRss =
      process.platform !== "win32" &&
      rendererPids.length > 0 &&
      rendererPids.some((pid) => rssKb(pid) !== null);
    const rendererPid = canSampleRss
      ? rendererPids.reduce((a, b) => ((rssKb(a) ?? 0) >= (rssKb(b) ?? 0) ? a : b))
      : -1;

    await page.waitForTimeout(WARMUP_MS);

    const readSample = async () => {
      const { nodes } = (await cdp.send("Memory.getDOMCounters")) as {
        nodes: number;
      };
      const perf = (await cdp.send("Performance.getMetrics")) as {
        metrics: Array<{ name: string; value: number }>;
      };
      const heap =
        perf.metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0;
      const rss = canSampleRss ? rssKb(rendererPid) : null;
      return { nodes, heap, rss };
    };

    const samples = [await readSample()];
    for (let i = 0; i < Math.floor(OBSERVE_MS / SAMPLE_EVERY_MS); i++) {
      await page.waitForTimeout(SAMPLE_EVERY_MS);
      samples.push(await readSample());
    }

    const first = samples[0];
    const mid = samples[Math.floor(samples.length / 2)];
    const last = samples[samples.length - 1];

    test.info().annotations.push({
      type: "leak-samples",
      description:
        `renderer=${webglRenderer} software=${isSoftwareRenderer} | ` +
        samples
          .map((s) => `nodes=${s.nodes} heapMB=${(s.heap / 1048576).toFixed(1)} rssKB=${s.rss ?? "n/a"}`)
          .join(" | "),
    });

    // --- Class 1: detached DOM ---
    const nodeGrowth = last.nodes - first.nodes;
    expect(
      nodeGrowth,
      `DOM node count grew by ${nodeGrowth} over ${OBSERVE_MS / 1000}s of idle polling — ` +
        `detached nodes are being retained (the axis <tspan> pattern). Check ` +
        `DevTools → Memory → Detached Elements; confirm every axis uses AxisTick.`,
    ).toBeLessThan(MAX_NODE_GROWTH);
    expect(
      last.nodes - mid.nodes,
      "node count still climbing in the second half of the window — not plateauing",
    ).toBeLessThan(MAX_NODE_GROWTH / 2);

    // --- Class 2: native / RSS (the blind spot of DOM-only detection) ---
    // Skipped under software renderers (SwiftShader/llvmpipe): raster-buffer
    // overhead from SVG repaints dominates regardless of app behaviour.
    if (canSampleRss && !isSoftwareRenderer && first.rss != null && last.rss != null) {
      const rssGrowth = last.rss - first.rss;
      expect(
        rssGrowth,
        `renderer RSS grew ${(rssGrowth / 1024).toFixed(0)} MB with DOM nodes ` +
          `${nodeGrowth >= 0 ? "+" : ""}${nodeGrowth} — native-memory growth ` +
          `(raster/canvas/allocator), not detached DOM. Suspects: animated FX ` +
          `under software compositing (check fxSafe engaged), canvas backing ` +
          `stores, recharts internals. JS heap over window: ` +
          `${(first.heap / 1048576).toFixed(1)} → ${(last.heap / 1048576).toFixed(1)} MB.`,
      ).toBeLessThan(MAX_RSS_GROWTH_KB);
      if (mid.rss != null) {
        expect(
          last.rss - mid.rss,
          "renderer RSS still climbing in the second half of the window",
        ).toBeLessThan(MAX_RSS_GROWTH_KB / 2);
      }
    }

    // --- JS heap (attribution aid; also catches plain JS leaks) ---
    expect(
      last.heap - first.heap,
      `JS heap grew ${((last.heap - first.heap) / 1048576).toFixed(1)} MB over the window`,
    ).toBeLessThan(MAX_HEAP_GROWTH_BYTES);

    await browser.close();
  });
});

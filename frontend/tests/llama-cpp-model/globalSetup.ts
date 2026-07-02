// Waits for the llama.cpp model to be active before any slow tests run.
// Polls the dashboard backend (port 3001) which proxies llama.cpp health.

const DASHBOARD_API = process.env.DASHBOARD_API_URL ?? "http://localhost:3001";
const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 120_000;

export default async function globalSetup(): Promise<void> {
  console.log("[globalSetup] Waiting for llama.cpp model to be active...");
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${DASHBOARD_API}/api/ai/metrics`);
      if (res.ok) {
        const json = (await res.json()) as {
          data?: {
            llama_server?: { available?: boolean; model_path?: string };
          };
        };
        const ls = json.data?.llama_server;
        if (ls?.available === true && ls.model_path) {
          console.log(`[globalSetup] Model ready: ${ls.model_path}`);
          return;
        }
      }
    } catch {
      // backend not reachable yet
    }
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(
    `[globalSetup] Timed out after ${TIMEOUT_MS}ms waiting for llama.cpp model`,
  );
}

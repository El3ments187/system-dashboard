# Engineering Rules

## Investigation

* Use measurements, logs, tests, scripts, and source data as the source of truth.
* Prefer execution over speculation.
* A claim is **verified** only if checked against source, git, or a measurement — anything inferred is a
  **hypothesis**. Verify load-bearing claims before building on them; refining a wrong premise cannot
  fix it.
* Do not re-analyze **verified** conclusions without new evidence. Do re-check hypotheses.
* If an investigation repeats twice, stop reasoning and create a script, test, or measurement.
* If the user says something "used to work", it is a regression: check git history first.

## Git

* Check `git status` and `git diff` before making changes.
* Use Git history when investigating regressions.
* Review recent changes before modifying related code.
* Never run `git add`, `git commit`, `git push`, `git reset`, `git rebase`, or force-push without approval.
* To undo part of a commit, reverse-apply the hunk (`git show <sha> -- <paths> | git apply -R`).
  Never `git revert <sha>` — it undoes the rest of that commit too.

## Project Workflow

* Use project scripts when available instead of inventing new commands.
* Start the dashboard using `scripts/start-dashboard.sh`.
* Stop the dashboard using `scripts/stop-dashboard.sh`.
* Preserve existing workflows and scripts.
* If a script fails, fix the script rather than bypassing it.

## Implementation

* Prefer the smallest effective change.
* Reuse existing code and architecture.
* Avoid new abstractions unless necessary.
* Avoid unrelated refactoring.
* Do not change project structure or file extensions without approval.
* DRY/consolidation must not delete behavior. If deduplicating leaves a call site uncovered, that is a
  regression, not cleanup.
* Never blanket-reformat. Run Prettier only on files you changed — reformatting has broken
  source-asserting tests here.

## Tests

* **Never delete functionality to make a test pass.** If a test and the code disagree, work out which is
  wrong and report it.

  > Commit `8e4baf6` added `spineSingleSource.test.ts` **and** stripped the CPU/GPU bar glow in the same
  > commit — *"remove bright-breathe/surge from data fill bars"* → *"gate now GREEN"*. The new gate
  > encoded a wrong rule; the code was right. The glow stayed dead for weeks.

* Before writing an invariant, enumerate every legitimate user of what it forbids. An over-broad
  invariant gets satisfied by deleting valid code.
* A test may encode the **wrong rule** — fixing it is then correct, but state what it asserted, why it
  was wrong, and what still guards the behavior. Never quietly loosen a test so your change lands.
* **A new guard must fail against the broken code before you trust it.** Run pre-fix, confirm red, then
  fix. Report both runs.
* Assert **behavior**, not source text. Grepping a file for a string proves nothing runs and breaks on
  reformatting.
* Prefer completeness over existence: `count > 0` stays green while nearly everything is broken.
* For every toggle, assert **both** states — on renders it, off removes it. The absence test is the one
  usually missing.
* Mark known-broken tests `test.fixme()` **in their own spec** with a one-line reason. Never track
  failures in prose or in this file — a list rots and a stale entry hides real regressions.
* Never dismiss a red test as "pre-existing" without checking git. Unmarked red = real until proven
  otherwise.

### Tiers

* Fast: `npm test` (vitest), `npm run test:e2e`. Slow: `npm run test:slow` (`tests/llama-cpp-model/`,
  needs a real model via `globalSetup`).
* Fast-tier tests must not depend on a live model or backend — mock, or assert something
  model-independent.
* CI runs the **frontend only** (`npm ci`, `tsc --noEmit`, `npm test`, `knip`). `cargo` never runs in
  CI — run `cargo fmt --check`, `clippy --all-targets -- -D warnings`, `build`, `test` locally before
  claiming the backend is green.

## Verification

* Build and test after changes.
* Restart affected services when necessary for verification.
* Verify fixes in the running application.
* Reproduce bugs before fixing them when possible.
* Reproduce the issue after the fix to confirm it is resolved.
* Check for regressions in related functionality.
* Do not claim success based solely on code inspection — including tests that only inspect code.
* Do not claim success without verification.
* Report failures instead of silently changing behavior.

## Visual, CSS & Effects

* Source correctness ≠ rendered output. A CSS rule existing does not mean it paints.
* Verify visuals with **computed styles in a real browser** (Playwright: `getComputedStyle(el,
  "::after")`, CSS var values). jsdom cannot compute cascades, pseudo-elements, or paint — never assert
  visual behavior there.
* Inline styles bypass CSS gating (attribute selectors cannot reach them). Anything that must respond to
  a toggle belongs in gated CSS, not a `style={{}}` prop.
* Keep **accent** and **semantic** colours separate (`--success`, `--warning`, `--danger`,
  `--metric-*`). Theme effects apply to accent elements only; semantic colours encode meaning.
* An invalid `var()`/`calc()`/`color-mix()` silently drops the whole declaration — an unguarded `NaN`
  from a restored setting kills an effect with nothing in the console. Clamp values read from
  `localStorage`.
* Rule out the environment before concluding an app bug: browser flags, GPU/driver, media queries. The
  `@media (prefers-reduced-motion: reduce)` block zeroes `--card-glow`, disabling Neon Glow regardless
  of the toggle.

## Dependencies & Lockfiles

* Never use `--legacy-peer-deps` or `--force`. They build a tree the package manager considers invalid,
  which `npm ci` then rejects in CI.
* Fix the real cause of a peer conflict (remove the unused package, or upgrade it). Report it if neither
  is possible.
* Regenerate lockfiles with the package manager (`npm install`, `cargo build`); never hand-edit them.
* Prefer `npm uninstall <pkg>` over deleting a lockfile — a full regen re-resolves every transitive
  package and turns a one-line fix into an unreviewable diff.

## Metrics & Dashboard Validation

* Never assume metrics are correct.
* Validate against source data and system tools.
* Use real workloads when testing performance metrics.

For dashboards, verify:

Raw source → API → history buffer → chart → tooltip → card

All displayed values must match within expected precision.

## Storage Metrics

Validate storage metrics against:

* `iostat`
* `/proc/diskstats`
* `/sys/block/*/stat`

Use real read/write workloads.

Verify:

* Throughput
* IOPS
* Utilization
* Latency

Do not consider a metric correct simply because a chart renders.

## Stalled Progress

If progress stalls:

1. Summarize findings.
2. Identify the blocker.
3. Choose the most likely path.
4. Proceed or ask for guidance if risk is high.

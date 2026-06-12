# Engineering Rules

## Investigation

* Use measurements, logs, tests, scripts, and source data as the source of truth.
* Prefer execution over speculation.
* Do not re-analyze verified conclusions without new evidence.
* If an investigation repeats twice, stop reasoning and create a script, test, or measurement.

## Git

* Check `git status` and `git diff` before making changes.
* Use Git history when investigating regressions.
* Review recent changes before modifying related code.
* Never run `git add`, `git commit`, `git push`, `git reset`, `git rebase`, or force-push without approval.

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

## Verification

* Build and test after changes.
* Restart affected services when necessary for verification.
* Verify fixes in the running application.
* Reproduce bugs before fixing them when possible.
* Reproduce the issue after the fix to confirm it is resolved.
* Check for regressions in related functionality.
* Do not claim success based solely on code inspection.
* Do not claim success without verification.
* Report failures instead of silently changing behavior.

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


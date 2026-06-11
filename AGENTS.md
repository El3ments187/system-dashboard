# Investigation Rules

Use evidence, measurements, logs, tests, and scripts as the source of truth.

Do not repeatedly analyze the same issue.

If the same investigation step has been performed twice:

1. Stop reasoning.
2. Create a script, test, query, or measurement to obtain the answer.
3. Continue using the measured result.

Do not manually parse structured formats when tooling can verify the answer.

Examples:

* /proc files
* JSON
* APIs
* CSV
* Database schemas
* Log formats

Use scripts and validation instead.

# Progress Rules

Do not remain in investigation mode indefinitely.

After identifying a likely root cause:

1. Validate it.
2. Implement the smallest effective fix.
3. Verify the result.

Avoid repeatedly restating findings, plans, or observations.

Avoid re-analyzing previously verified conclusions.

# Context Management

As context grows:

* Reduce summaries.
* Reduce repeated explanations.
* Focus on execution.
* Reference prior conclusions instead of re-deriving them.

Do not revisit previously completed investigations unless new evidence contradicts them.

# Decision Making

When multiple solutions exist:

1. Prefer the smallest change.
2. Prefer reuse of existing code.
3. Prefer consistency with existing architecture.
4. Avoid introducing new abstractions unless necessary.

# Verification Requirements

For metrics, performance data, system information, and hardware statistics:

Never assume values are correct.

Verify against source data.

Where possible compare dashboard values against:

* System tools
* Raw measurements
* Source APIs
* Direct device statistics

Use actual workloads to validate behavior.

# Stalled Investigation Rule

If progress stalls or reasoning begins repeating:

1. Summarize current findings.
2. Identify the blocker.
3. Choose the most likely path and proceed.
4. If the choice is high risk, ask for guidance.

Do not continue repeating the same investigation.

# Storage Dashboard Rule

When validating storage metrics:

Use real read and write workloads.

Verify:

* Throughput
* IOPS
* Utilization
* Latency

Compare dashboard values against raw system measurements.

Do not consider a metric correct simply because a chart renders.


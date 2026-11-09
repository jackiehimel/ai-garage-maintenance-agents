# Maintenance agents and standalone application

The proposed next phase is [manager report readiness](docs/plans/2026-11-08-1821-feat-manager-report-readiness-plan.md). The customer report improvements described below are implemented; the proposed evidence-seeking investigation round remains unimplemented. Neither that proposal nor a local report establishes deployment readiness. The bounded assessment contract below remains the executable behavior.

## Outcome and authority

By November 5, 2026, deliver three independently callable maintenance agents and a standalone Solvd interface that runs them against an entered public URL. This repository is the implementation home. AI Garage remains the catalog and can link here later; changing or deploying it is not a prerequisite.

This specification incorporates Jackie's November 4 execution write-up and supersedes the earlier single-page Lighthouse score-plus-summary proposal. The catalog entries `seo-ai-search`, `accessibility` and `performance` in AI Garage's `data/maintenance-agents.json` supply the intended maintenance scope. Existing prototypes and earlier research are reference material, not current verification.

**Outcome:** actual independent agents, useful first-run findings, compatible repeat comparisons and an operational standalone interface.
**Scope:** this repository's shared runtime, three agents, CLI/API, report exports and website.
**Constraints:** preserve the catalog meaning; bounded public inputs; no mocked AI fallback, fabricated evidence, purchases, access-control changes, or unrelated Garage edits.
**Proof:** per-agent live runs on Solvd and another eligible public page, fresh independent invocation, known-change fixtures, comparison and failure checks, live grounded AI, repository checks, rendered desktop/mobile review, exported-report parity and deployed-commit/reviewer-access verification.

## Global Constraints

- The website and programmatic entry points call the same agent implementations. No agent depends on another.
- Public-page mode requires only an eligible URL. Missing optional client data remains explicitly absent.
- First runs provide useful observations and establish a baseline; they do not invent regressions.
- Baseline comparison requires the same agent, relevant scope/configuration, browser/engine versions and sampling profile. Incompatible or incomplete coverage must never create false resolved findings.
- Preserve stable evidence identifiers, affected pages/states/elements and provenance. Distinguish measured observations, comparison results, AI interpretation, proposed actions and missing coverage.
- Unknown indexing intent produces review-needed observations, not claims that intentional exclusion is a defect.
- Automated accessibility checks do not establish WCAG conformance or completed human screen-reader testing.
- Navigation lab measurements are not real-user data. TBT is not INP. Noise and missing samples may make a change inconclusive. Correlation does not establish root cause or improvement.
- Use a live bounded AI assessment with validated structured output and references to evidence actually sent. Model failure preserves measured evidence and visibly marks assessment unavailable. There is no live-to-mock fallback.
- Validate public URLs and every connection/redirect. Reject credentials, unsafe schemes, IP literals, internal names and non-public DNS results. Pin validated DNS addresses for outbound sockets. Protect browser subresources and redirect targets as well as the starting URL.
- Bound input sizes, pages, states, actions, requests, HTTP/model decoded response bodies, browser transferred bytes and lifetime, samples and AI calls. Browser-layer request counters must supplement opaque CONNECT connection counts; no per-resource decoded-browser-memory guarantee is claimed. Keep secrets server-side, escape text and never execute model-supplied actions.
- Baseline evidence must be retained or exportable. Local filesystem storage is not described as durable unless a persistent volume is actually configured and verified.
- Keep SPEC.md and issue #1 current. Do not create competing planning/handoff documents or include implementation time estimates.
- Do not label delivery complete until the required live and deployed checks actually pass. Record exact blockers and continue independent authorized work.

## Required capabilities

### Technical SEO & Discoverability

Inspect the entered page and up to two additional same-origin pages selected from the sitemap by default. Explicit configured pages or `pageDiscovery: configured-only` preserve the chosen scope; configured inputs are never silently replaced. Record the actual sampled URLs and selection policy. Assess observed title/description presence, generic or duplicate content and structured-data validity/types, distinguishing quality heuristics from search-engine outcomes. Retain HTTP status/redirect chains, robots.txt observations and relevant user-agent rules, HTML and HTTP indexing directives, source/rendered canonicals, sitemap observations and structured-data parse/type observations. Preserve source/rendered differences. Bound auxiliary robots/sitemap requests; disclose incomplete parsing, inaccessible files and sampled rather than exhaustive sitemap coverage.

Accept intended indexable/excluded page rules and release/template context. Compare compatible accepted baselines. Show intentional exclusions separately from unintended barriers and unknown intent. Report affected URLs, evidence and specific investigation/correction/recheck guidance. Optional supplied Search Console data must retain its source, coverage/window and supplied-data label. Never infer actual indexing, rankings, traffic or AI visibility from crawl success.

### Accessibility Regression

Use maintained axe-core browser integration on selected pages and configured states. Retain violations, affected selectors/elements, criteria/help references, passes/inapplicable summaries and incomplete/manual-review findings. Record a state/component coverage manifest.

Support bounded configured keyboard paths and focus/state assertions with actual observed focus and assertion results. State setup must be explicit and read-only in public mode; no submitting forms, arbitrary scripts or unbounded clicks. Distinguish scripted checks from supplied human keyboard/screen-reader review records.

Compare compatible findings as new, persistent and resolved only when the same state was successfully exercised. Group repeated findings by an explicitly supplied component mapping or other defensible evidence, preserving every instance and distinct impact. Provide proposed repair priorities, reproduction/recheck steps and remaining human evaluation. Owner priorities, when supplied, remain distinguishable from suggested priorities.

### Performance Regression

Run repeated Lighthouse navigation measurements in an exclusive browser lane under declared desktop, mobile or combined profiles. The interface defaults to mobile and desktop; existing API callers retain the desktop default. Keep each device’s samples, medians, findings and comparisons separate. Default to three samples, permit a bounded three-to-five sample policy and at most three pages. Retain individual raw measurement results, runtime/engine versions, sampling configuration, diagnostics and available asset/trace references.

Accept an explicit compatible baseline and release context. Compute supported metric deltas from repeat distributions, show spread and declared meaningful-change thresholds, and classify noisy/incomplete data as inconclusive. Never silently drop failed samples from the reported denominator.

Preserve optional supplied field measurements with population, collection window, metric and provenance separately from lab results. Support separately configured interaction evidence through a typed, provenance-bearing input; do not claim the navigation runner collected it. The initial executable collection mode is navigation/page load, consistent with the catalog's stated first slice. Never synthesize INP from navigation TBT.

## Implementation decisions and interfaces

Use TypeScript on Node with the already-used Playwright, axe-core, Lighthouse, chrome-launcher, node-html-parser and Anthropic SDK packages. Reuse reviewed portions of the prototypes, not fixed Garage routes or their orchestration/mocked runtime. A small Node server serves the standalone static interface and invokes the same exported functions used by the CLI. No generic plugin engine or separate service per agent.

Browser-backed agents require a real Chromium-capable Node host. The standalone server runs locally by default. An optional GitHub Actions worker can run the collectors on a Chromium-capable runner and return their evidence to the local server for report assembly and assessment. Verify hosted reviewer access separately through an existing authorized account. A Cloudflare Worker-only or score API-only deployment does not satisfy these collectors.

File ownership:
- `src/core/types.ts`: request, evidence, finding, coverage, comparison and report contracts.
- `src/core/input.ts`, `network.ts`, `browser.ts`: bounds, public-target policy, DNS-pinned HTTP/browser egress and lifecycle.
- `src/core/evidence.ts`, `baseline.ts`, `store.ts`: stable identifiers, compatibility, export/import and raw-artifact retention.
- `src/core/assessment.ts`: bounded live Anthropic assessment and evidence-reference validation.
- `src/agents/seo.ts`, `accessibility.ts`, `performance.ts`: independent collectors/evaluators.
- `src/run.ts`, `src/cli.ts`: public programmatic entry and CLI.
- `src/server.ts`, `src/report.ts`, `public/`: bounded API, standalone UI and escaped offline HTML.
- `src/core/remote.ts`, `src/worker.ts`, `.github/workflows/collect.yml`: optional GitHub Actions collector dispatch and artifact return.
- `tests/`: meaningful offline unit/contract tests and explicitly separated browser/live acceptance commands.
- `README.md`: local and optional remote startup commands.

The stable public entry point is `runAgent(request, options?)`, accepting exactly one `agentId` and target URL plus optional explicit page/state/intent/profile/baseline inputs. The same result contains immutable measured evidence, comparison, coverage and assessment sections. Named agent functions remain independently importable. CLI accepts an agent ID, URL, optional JSON configuration/baseline and output destination.

Use a JSON report suitable for baseline export/import and a self-contained escaped HTML report from the same run object. Preserve raw scanner artifacts separately with safe generated IDs and export access; never interpret client-controlled file paths. The technical app/JSON retain run IDs, timestamps, selectors, scope/configuration and source attribution. The customer summary and PDF lead with evidence-based ratings, plain-language findings, interpreted measurements, positives and grouped Solvd follow-up. Keep limitations to a short statement after results; omit raw internal errors and configuration diagnostics. A PDF built without AI interpretation remains an automated evidence review and must never imply that AI or manual review succeeded. Baseline imports must be schema/size validated; report comparison must not trust arbitrary incompatible imported data.

Public mode accepts HTTPS URLs including bounded queries and fragments (no userinfo or arbitrary ports) and prohibits configured destructive actions or form submission. Configured pages stay within the accepted origin; a deliberate initial www/apex canonical redirect may be accepted and disclosed after public-network validation. Other main-document cross-origin changes are incomplete/rejected. Public resources on other public hosts can load through the bounded egress policy. Browser local network access, service workers and unbounded popups must be prevented. Preserve end-to-end TLS through a DNS-pinned, bounded CONNECT proxy; do not introduce TLS interception or certificate infrastructure. Playwright can additionally restrict request methods; Lighthouse navigation can generate ordinary page-script requests and must not be described as universal GET-only execution. A separate explicit test-only fixture mechanism must be unavailable through the hosted API.

Run/report retention is explicit: exported report JSON is portable across sessions; local run storage works on a configured writable filesystem. If storage fails, report that failure without claiming a saved baseline. A remote serverless temporary directory is not durable.

AI receives a bounded typed fact ledger and complete supporting evidence records, with relevant findings prioritized and omitted records disclosed. Whole-report counts and the factual assessment summary derive from all collected findings and coverage, independently of the sample. Use a stable provider output schema with local fact-reference validation, a 45-second timeout and 2200 output tokens per call. Permit one bounded format-only repair after an explicit text shape/length failure; semantic/reference failures and provider errors do not trigger that repair. At most two calls are allowed and the parent run deadline still applies. Include the calculated comparison and applicable release context with provenance. The model generates a fact-linked interpretation and at most three specific investigations or correction proposals, with generated rationale, priority, concrete verification and optional explicitly labelled hypotheses/missing evidence. This preserves new reasoning and investigations beyond collector guidance; it does not implement a tool-using investigation loop.

Validate exact shapes, field lengths, duplicate values, sent fact references, disposition/classification/coverage gates and measured parameters. Derive evidence references server-side from cited facts. Scanner coverage failures cannot authorize a site correction or site-cause classification; review-needed, unknown-intent, best-practice-only and coverage-only targets require investigation at medium priority or below. Critical requires a supported critical finding. Missing accessible name does not establish failed dismissal. Numerical/color guards protect the supported measurement forms; they are not general natural-language entailment validation. Recorded facts are checked against collected evidence; AI explanations and proposed investigations require verification. Render generated prose as an unverified draft and retain historical report readability. Scores and measurements cannot be overwritten by model output. Record actual model and usage; do not invent pricing. Assessment failure preserves measured JSON and HTML without replacement AI.

The interface uses restrained Solvd branding, three independent agent choices plus a Run all three option, URL input, optional configuration/baseline import, actual execution stages, current findings, comparison status, evidence-linked actions, incomplete coverage, HTML/JSON/raw-evidence exports and repeat run. It must not imply reviewer approval or complete conformance from an automated report.

The Run all three option sends the same entered URL and configured inputs to each agent sequentially. Performance sampling remains isolated. A selected portable baseline applies only to its matching agent; the others are first runs. The combined view retains successful results and identifies missing agents. Its PDF export summarizes saved reports for the same submitted URL, separates automatic flags from human-review items and AI proposals, shows each collection date and comparison status, and preserves access to full per-agent reports. It does not turn limited or failed collection into a pass.

### Customer report acceptance

The combined customer UI and PDF use one shared view model. Each agent has a first-page verdict, with a real Lighthouse performance score and qualitative SEO/accessibility ratings tied to observed evidence rather than collection completion. Findings identify understandable elements, user impact, a proposed owner, an effort category and verification. Repeated manual checks become grouped follow-up that Solvd can perform; proposed review is not described as already completed. Actual retained screenshots and sample-score charts support the narrative. Internal evidence remains accessible through detailed reports.

UI performance runs default to mobile and desktop, with separate repeated samples, device-specific measurements, noise-aware comparisons and resource rows. Existing programmatic desktop defaults remain supported. Estimated resource savings are labelled estimates and zero/absent savings are never invented. Lab values may be compared with published metric bands but do not prove real-user Core Web Vitals results. The separately discussed two-second page-load goal is not redefined as Google's LCP threshold.

## Execution tasks

The shared contracts came first. The three full collectors and the standalone interface were then developed in parallel against those contracts, with browser/provider verification proceeding alongside implementation. Integrate and verify the full scope through the normal entry points. The tasks below describe ownership and acceptance criteria, and issue #1 tracks delivery status.

### Task 1: Shared runtime contracts and safety

Own package/build/test configuration and `src/core/{types,input,network,browser,evidence,baseline,store}.ts` with their focused tests. Establish interfaces before agents are implemented. Use cached dependencies where available; do not bypass network restrictions.

Implement validated request/portable-baseline contracts; deterministic evidence/finding IDs; explicit coverage/status; compatible baseline logic; safe persisted/generated report/artifact paths; bounded HTTP fetch with manual redirects and DNS-pinned sockets. Browser collection must enforce equivalent network policy through a scoped egress proxy or comparably complete mechanism, including subresources. Keep DNS rebinding and redirect-to-private tests meaningful. Reject missing engine/browser/runtime prerequisites explicitly.

Choose concrete types for page/state/keyboard configuration and collector result composition. Provide stable helpers for the agent and interface work. Browser/runtime versions must be available for baseline compatibility. Test offline safety, bounds, comparison and retention failures. Track live provider and browser verification separately from offline checks.

### Task 2: SEO agent

Own `src/agents/seo.ts`, SEO-specific helpers if needed and SEO tests/fixtures. Consume the shared contracts unchanged unless an explicit integration defect is identified to the controller.

Implement the complete SEO capability above using actual input URLs and explicit configured pages, with current/source/rendered evidence, intent-aware findings, sitemap/robots observations and compatible comparisons. Adapt useful prototype parsing only after verifying behavior. Include controlled known-change/unknown-intent/intentional-exclusion/incomplete cases and assertions that no Garage routes are substituted. Keep optional supplied search evidence separate.

### Task 3: Accessibility agent

Own `src/agents/accessibility.ts` and accessibility tests/fixtures. Consume shared contracts.

Implement maintained axe integration, selected page/state execution, bounded keyboard assertions with focus evidence, criteria and affected instances, explicit incomplete/manual results, defensible component grouping, compatible new/persistent/resolved comparisons and repair/recheck guidance. Verify known-change and missing-state comparisons with controlled evidence; separate tests requiring an actual browser and accurately record whether they ran.

### Task 4: Performance agent

Own `src/agents/performance.ts` and performance tests/fixtures. Consume shared contracts.

Implement actual repeated Lighthouse navigation collection with secure bounded browser egress, retained per-sample artifacts and profile, exclusive browser lane, declared thresholds and distribution/noise-aware baseline deltas. Include incomplete samples, missing metrics, incompatible versions/configuration and noisy comparisons. Keep supplied field/interaction evidence separate. Tests must not claim mocked metric records are live runs.

### Task 5: Live assessment, entry points and standalone interface

Own `src/core/assessment.ts`, `src/run.ts`, `src/cli.ts`, `src/server.ts`, `src/report.ts`, `public/` and their tests. Use the actual three agents through common entry points; no separate demo implementations.

Implement one bounded Anthropic assessment with strict schema and sent-evidence reference checks, explicit unavailable state and no mocked fallback. Implement programmatic and CLI invocation, request cancellation/timeouts, concurrency/size limits, disabled-by-default hosted execution until explicitly configured, same-origin/API protections and clear failures. Serve a polished responsive Solvd interface with all requested controls and exports. No new accounts system; preserve deployment protections. HTML/JSON exports must match the run; escape collected/model text. Test failure paths, stale response protection, independent agent dispatch and exports.

### Task 6: Integration, real verification and deployment

Own integration fixes agreed with prior task owners, README, runtime packaging and acceptance commands. Run lint, typecheck, tests and build. Independently verify report claims against evidence and inspect the rendered desktop/mobile UI where execution is available.

For each agent verify fresh independent invocation, live Solvd and another eligible public page, a repeat baseline, a controlled known change, incomplete/incompatible/provider failure, and a successful live AI assessment with valid evidence references. Preserve truthful distinctions among offline, fixture, live and unrun checks.

Verify an existing authorized deployment path compatible with the browser runtime; deploy the reviewed source only when runtime and access are supported. Verify the exact deployed commit and intended reviewer access. No purchase, credentials exposure or weakened access control. If an environment requirement is blocked, record it in issue #1 and continue remaining independent authorized work; never silently substitute a different scope.

## Verification and status

The recovery branch contains the three collectors, the CLI and programmatic entry point, the standalone interface, the report exports and the optional browser worker. Follow [README.md](README.md) for installation and startup. Repository verification uses `npm run typecheck`, `npm test` and `npm run build`. Successful build or health checks are separate from browser and provider execution.

Protected Chromium startup is blocked in the managed macOS environment. Local collection requires a host that permits the protected browser to launch. The GitHub Actions collection workflow registered and accepted a dispatch on the recovery branch. Review the returned collector coverage separately from workflow status. [Workflow dispatch](https://github.com/jackiehimel/ai-garage-maintenance-agents/actions/runs/41954209953)

Record browser and provider results, controlled repeats, UI and export checks, deployed commit and reviewer access independently in [issue #1](https://github.com/jackiehimel/ai-garage-maintenance-agents/issues/1). Report each criterion only when there is direct evidence for it.

## Reference and attribution

Reviewed reuse sources: AI Garage's three current catalog entries and `.ua/maintenance-integrated` prototypes. Earlier research remains in `jackiehimel/maintenance-agent-library`. Verify installed package documentation and licensing for reused measurement tools. Do not import old reports as current results or copy external agent implementations verbatim.

> Repository decision, November 4, 2026: the user selected a fresh private repository, `jackiehimel/ai-garage-maintenance-agents`, as the canonical home for this build. Agent implementations, shared runtime and tests belong here. AI Garage remains the catalog and user-facing integration surface. The plan below was written before that repository decision: its existing-code references and Next.js file paths describe the separate `jackiehimel/ai-garage-web` checkout, not files already present here. During U1, establish and verify the smallest deployable integration between the two repositories, then update the affected file map in this same specification before coding. Do not maintain duplicate agent implementations or interpret repository creation as completed runtime integration. Product scope, deadline and acceptance criteria below remain unchanged.

# Three Maintenance Agents by November 5

## Goal Capsule

**Objective:** By November 5, Venu can open each of the SEO, accessibility and performance agents in AI Garage, enter a public webpage URL, run it independently and receive a readable report based on that page.

**Scope:** Three on-demand, single-page checks with live measurements, a category-specific AI assessment and a downloadable report.

**Constraints:** Reuse AI Garage, its design system and its existing Anthropic SDK. No repository access, new accounts system, workflow engine, browser hosting project or prerequisite agent run. Preserve the existing maintenance catalog and broader agent specifications.

**Proof:** Each of the three agents completes real runs on two public pages in the delivered preview. Scanner values match the source evidence, the live model assessment references that evidence, and Venu can access the same interface. Unit tests alone do not establish completion.

## Product Contract

### Product summary and instruction basis

Venu asked for modular capabilities that someone can try by entering a website address, similar to the existing AI Espresso entry point. The latest instruction requires all three working capabilities by tomorrow. It supersedes the earlier sequence of one initial agent by Friday. The initial demonstration needs no client repository, credentials or combined maintenance workflow.

The November 4 meeting transcripts, supplied as `Pasted text(2).txt` and `Pasted text(3).txt`, establish the URL-to-report direction. The latest user message establishes the three-agent deadline. The internal rehearsal target is November 5 at 3 PM Eastern, leaving time before the previously discussed late-afternoon meeting window; that is a planning assumption, not a newly confirmed appointment.

The existing nine-agent prototype and presentation do not establish this acceptance result. The separate Solvd SEO report used a live public capture and offline evaluation of selected checks. It did not prove a complete hosted agent run with live AI assessment. Existing fixture results and mocked AI output must not be reused as proof of tomorrow's functionality.

### Required experience

1. Open an existing maintenance agent page and select **Try**. Its overview, research and technical approach remain available.
2. See the selected agent, a public URL input, a **Run check** button and a short explanation that this checks one page in a mobile browser profile.
3. Enter a URL. Show the accepted target and running state while the check executes. There is no fabricated percentage or suggestion that a different agent must run first.
4. Receive the report: exact page tested, time, named measurement source, measured result, issues needing attention, AI interpretation, proposed actions and coverage limitations.
5. Download the same report as a self-contained HTML file or run another page. Each of the other two agents is directly accessible and independent.

### Requirements

| ID | Requirement | Acceptance example |
| --- | --- | --- |
| R1 | Independent entry and execution for the three existing agent identities. | Accessibility can run first from a fresh browser session without a prior SEO or performance result. |
| R2 | A user-supplied public HTTPS page is the actual target. | Changing the accepted URL changes the provider request. Show both submitted and tested URL, disclosing permitted canonical redirects; no Garage route list is silently substituted. |
| R3 | Report deterministic measurements with their provenance and incomplete states. | A missing category score appears as unavailable, never as zero or a pass. |
| R4 | Add a live, category-specific, evidence-linked AI assessment. | Recommendations reference audit IDs that exist in this run. Model failure is visible and does not erase valid measurements. |
| R5 | Present and export a clear, professional report. | The offline HTML matches the on-screen run and contains no API key, external assets or raw executable page content. |
| R6 | Bound access, data sent to providers, execution time and spend. | Unsupported targets fail before provider calls; the production API remains disabled while the capability is approved only for the controlled preview. |
| R7 | Preserve existing Garage behavior and the catalog's broader scope. | Espresso still works; no maintenance agent is renamed, removed or promoted to customer-ready status by this change. |
| R8 | Demonstrate actual end-to-end operation before claiming completion. | Six live runs, failure-path checks, repository checks and access verification are recorded against the delivered commit. |

### Exact capability of each agent

| Existing catalog agent | Tomorrow's implementation | AI assessment | Required boundary |
| --- | --- | --- | --- |
| **Technical SEO & Discoverability** (`seo-ai-search`) | Run Lighthouse's SEO category on the submitted page. Show the score, failed technical checks and available evidence about discoverability signals. | Explain the most important observed issues, their likely significance, proposed corrections and how to verify them. Treat indexing directives as observations; establish intent before recommending that `noindex` be removed. | Technical signals for one page. No claim about actual Google indexing, rankings, AI citations, whole-site crawl coverage or complete robots/sitemap validation. |
| **Accessibility Regression** (`accessibility`) | Run Lighthouse's accessibility category. Show the score, failed automated rules and available element/selector evidence. Separate manual, not-applicable and incomplete checks. | Explain who may be affected, suggest concrete remediation and identify necessary manual checks. | Automated snapshot of the loaded page. No WCAG conformance claim, complete keyboard/screen-reader assessment or regression claim without a baseline. |
| **Performance Regression** (`performance`) | Run Lighthouse's performance category. Show the lab score, available FCP, LCP, CLS, TBT and Speed Index, plus relevant diagnostics and estimated savings. | Prioritize observed bottlenecks, explain likely implications, propose investigations or changes and specify a remeasurement step. | One mobile lab sample. No real-user performance claim, INP substitution, confirmed backend root cause, guaranteed gain or regression claim without a comparable baseline. |

### Scope boundaries

The initial input is one publicly accessible HTTPS page without a login, submitted form or credential-bearing URL. Fix the device profile to **mobile** for this delivery and show the actual provider configuration. A desktop selector is unnecessary for tomorrow.

Exclude repository analysis, authenticated pages, whole-site crawling, schedules, history, baseline comparisons, automated repairs, deployment actions, multi-agent orchestration, all-nine integration, new customer accounts and billing. These exclusions do not change the existing catalog specifications. Label the new capability **Single-page check** beside the run control and in its report.

### Product decisions

- **PD1: Three independent checks.** Session-settled: user-directed. Governs R1–R2. Reject the prerequisite combined-workflow explanation.
- **PD2: Real evidence before readiness claims.** Session-settled: user-directed. Governs R3–R5 and R8. Reject replaying saved reports as if they were new runs.
- **PD3: Shared implementation, distinct assessments.** Proposed implementation choice, not a claim that Venu specified an architecture. Governs R1–R7. Share collection and reporting code while each specialist interprets its own category.

## Planning Contract

### Current code and reuse

- `app/maintenance/[agentId]/page.tsx` already renders the three existing agent pages. Add Try here instead of creating another portal.
- `data/maintenance-agents.json` supplies the existing IDs, titles and broader specifications. Preserve them.
- `app/api/try/route.ts` demonstrates the installed Anthropic SDK pattern. Its static fallback means a successful Espresso HTTP response is not proof that a live model call succeeded.
- `lib/rate-limit.ts` provides an in-memory rate helper. It is per process, not a durable deployment-wide quota.
- `.ua/maintenance-integrated` contains prototype collectors and prompts. SEO and accessibility use fixed Garage route lists, and performance uses a multi-route sampling/baseline contract. The runtime can fall back to mock AI when a key is missing. Do not import this gitignored tree into the deployed application or expose those behaviors through a new URL field.

Reuse concepts and small compatible validators after inspection. Implement the three public-page modes in tracked Garage source. Do not copy an external agent implementation verbatim. Attribute the scanner and preserve normal dependency licensing.

### Key technical decisions

**KTD1: Google PageSpeed Insights for collection.** Use its fixed v5 HTTPS endpoint, selecting only the chosen Lighthouse category and `strategy=mobile`. This service documents performance, accessibility and SEO categories. It removes the need to package and operate Chromium within the deadline. The decision is conditional on U1 proving actual responses, latency and quota from the intended runtime. This is a new collection mode with narrower coverage, not evidence that the existing collectors have been deployed. Governs R2–R3 and R6.

**KTD2: One bounded Anthropic assessment per successful scan.** Reuse the installed SDK and existing server-side configuration pattern. Validate the actual model in Preview during U1; do not assume the production key is present there. Use category-specific instructions, no tools, maximum 1,800 output tokens and no automatic retries. Request structured JSON and validate it at runtime. Up to five recommendations each contain priority, audit IDs, explanation, proposed action and verification step. A valid clean result can explain that no automated issue was found and list the remaining manual checks. Governs R4.

**KTD3: One synchronous Node route, no queue or database.** `POST /api/maintenance/run` receives `{agentId, url}`. Allow only the three exact IDs. Map them server-side to provider categories. Use a 150-second function cap, a 120-second application deadline, at most 90 seconds for collection and 25 seconds for assessment; the client waits up to 135 seconds. U1 must verify that the deployed environment supports this budget. Return `Cache-Control: no-store`. No automatic resubmission. Governs R1–R6.

**KTD4: Scanner evidence is authoritative.** Normalize the selected category's `auditRefs` joined to the actual audit records. Preserve finite scores including zero, score display modes, units, warnings and incomplete checks. A missing/null category score, runtime error or known blocked/error page cannot produce a successful category report. Separate `scanStatus` from `assessmentStatus`. When AI fails, retain the measured report with **AI assessment unavailable**; that run does not meet live-agent acceptance. Governs R3–R4 and R8.

**KTD5: Controlled preview and public data only.** Use an isolated branch and the existing Vercel project. Verify deployment-specific access for Venu or an equivalent non-owner session, including the POST route. Keep the new API disabled unless server-side `MAINTENANCE_DEMO_ENABLED=true` is configured for the approved deployment; hiding the button is insufficient. Do not weaken project-wide protection or build new authentication. The target page goes to Google; a bounded subset of audit evidence goes to Anthropic. State this briefly beside the form. Governs R6–R8.

**KTD6: Shared, immutable report.** The displayed and downloaded HTML derive from the same normalized run object. Use existing design tokens and centered page titles. Render all page/model strings as escaped text. Export no scripts, remote assets or credentials. Do not persist reports server-side. Governs R3–R5.

### Input, provider and report contract

Accept a domain or HTTPS URL, explicitly displaying the normalized HTTPS URL. Reject credentials, non-HTTPS schemes, nonstandard ports, IP literals, localhost/single-label/internal names, query strings and fragments with a clear explanation. Limit the URL to 2,048 characters and the POST body to 4 KiB. The first version supports public origin/path URLs; do not silently remove a query or fragment and audit a different page.

The application contacts only the fixed Google API origin and the configured model provider. It does not fetch, HEAD or resolve the submitted target itself. Disable application-side redirect following for the API call. Google controls its own page rendering and redirects; do not claim application-side validation controls that network. Validate the provider's reported final URL against the same public-URL policy, disclose requested versus tested URL, and suppress interpretation if the result is a known error/login/blocked state or an unsafe final URL. A legitimate public canonical redirect is allowed and prominently shown. If the returned evidence raises an unresolved question about whether the intended page or an interstitial/error state was tested, preserve measurements in a visibly partial report, withhold page-specific AI recommendations and exclude the run from successful acceptance. Apply the same label in the export.

Use deployment protection and an owned provider key with quota controls where available; Google documents keyless requests, but this plan does not assume anonymous quota is reliable. Apply an audit-specific combined rate limit of 12 submissions per client per hour across all three agents, plus one in-flight request in the UI. The in-memory helper is a secondary control, not a global spending guarantee. Verify provider budget/quota access in U1 and record observed token use; do not invent dollar cost when pricing is unverified.

Bound decoded provider responses to 8 MiB and normalized client reports to 250 KiB. Cap audit strings and representative detail rows, show truncation counts, and omit screenshots, raw HTML, raw page prose and full Lighthouse JSON from the user report. Send at most 24,000 characters of selected structured evidence to the model, giving failed relevant audits priority. Treat this evidence as untrusted data. Validate that all returned evidence IDs exist; scores, measured values, timestamps and source URLs always come from deterministic fields, never from model output. Keep hypotheses visibly qualified. Log stage/error codes and timing, not keys, target URLs, prompts or payload bodies.

The normalized report contains: run ID; agent ID; requested and tested URL; requested/completed and provider timestamps; Lighthouse version; actual device settings; category score; audit evidence with IDs and statuses; selected metrics with units; run warnings; coverage limits; assessment status; validated recommendations; and model/usage metadata where available. Never call the provider's top-level result ID an HTML canonical tag. Check actual payload field names in U1 rather than assuming a particular Lighthouse version.

### Screen specification

- **Before run:** existing agent identity, brief purpose, URL field, Run check, single-page/mobile note and provider data note. Pre-fill `https://solvd.com/` without automatically submitting it.
- **During run:** disable duplicate submission, show agent and accepted target, announce progress accessibly. Hide the previous result or label it clearly as previous. A late response cannot replace a newer run.
- **Result:** named Lighthouse score; key measurements or automated issue count; concise AI summary; prioritized actions expandable to evidence; tested page/time/device; coverage and incomplete checks; Download report and Run again.
- **Failure:** distinguish invalid input, access/rate limit, scan failure/timeout and assessment unavailable. Offer a retry or changed URL; show no saved replacement result as current.

## Implementation Units

All paths below are relative to the repository. Read the relevant installed Next.js documentation in `node_modules/next/dist/docs/` before implementation. Preserve unrelated working-tree changes. Keep a lightweight execution ledger outside this plan.

### U1: Prove the deployment and providers first

**Depends on:** nothing. **Budget:** 30–45 minutes. **Governs:** R2, R4, R6, R8; KTD1–KTD5.

**Files:** a disposable probe in the isolated branch if necessary; record sanitized results in ignored `docs/handoff-session-maintenance-three-agent-execution.md`. No permanent debug endpoint.

**Work:** Verify authorized branch/deployment access, supported function duration, Preview environment variables and Venu's access route. From the intended execution environment, call each selected PageSpeed category on Solvd, inspect actual payload/provenance/error shapes and latency, and obtain a real Anthropic response matching the planned assessment schema. If Solvd specifically blocks the provider, record the failed target and use the second public page to distinguish that target restriction from a provider/runtime failure. Check quota and budget controls without exposing key values. Inspect existing code and environment before requesting anything from Jackie.

**Proof:** three usable scanner responses, a valid live assessment, an accessible protected preview and a successful authenticated same-origin POST from a non-owner-equivalent browser session. This is an execution gate, not a claim that those checks have already passed.

**Stop condition:** If credentials, quota, deployment or permitted network access prevents U1, report the exact failed step immediately. Do not spend hours on UI first or bypass environment restrictions. A local/screen-share run is a separately labeled contingency; it does not silently replace the agreed hosted result. Do not build a second hosting stack overnight.

### U2: Implement the shared collection and API path

**Depends on:** U1. **Budget:** 90 minutes. **Governs:** R1–R3, R6–R7; KTD1, KTD3–KTD5.

**Create:** `lib/maintenance-audit-types.ts`, `lib/maintenance-audit.ts`, `app/api/maintenance/run/route.ts`, `tests/maintenance-audit.test.ts`, `tests/maintenance-run.test.ts`.

**Work:** Implement strict input validation, category mapping, fixed-origin PageSpeed request, response bounds, actual-payload normalization, explicit statuses, provenance and audit-specific rate limiting. Reuse `lib/rate-limit.ts`. Keep API types small; do not create a generic plugin framework.

**Test scenarios:** each ID maps independently; submitted URLs reach the provider unchanged after declared normalization; zero versus null scores; manual/N/A/informative audits; missing category; runtime/HTTP errors; unsafe/changed final URL; timeouts/429; oversized input/upstream result; disabled deployment rejects before provider work. Use sanitized response fixtures captured in U1 and targeted malformed variants.

### U3: Implement the three specialist assessments

**Depends on:** U2. **Budget:** 60–90 minutes. **Governs:** R3–R4, R6; KTD2, KTD4.

**Create:** `lib/maintenance-assessment.ts`, `tests/maintenance-assessment.test.ts`. **Modify:** the run route to attach assessment to valid measurements.

**Work:** Define three short specialist instruction profiles over the shared report contract. Validate bounded JSON, allowed priorities, string lengths and evidence references. Keep model retries disabled. Preserve valid scan evidence when the assessment fails. Do not use the prototype's live-to-mock fallback.

**Test scenarios:** relevant assessment for each category; no failed findings; unknown evidence IDs; malformed/truncated response; prompt-like content inside evidence; model refusal, timeout and provider error. Verify that the model cannot overwrite scores or provenance. Complete a real assessment for each category before closing this unit.

### U4: Add Try, readable results and HTML export

**Depends on:** U2–U3. **Budget:** 90 minutes. **Governs:** R1, R5–R7; KTD5–KTD6.

**Create:** `components/maintenance-agent-demo.tsx`, `lib/maintenance-report.ts`, `tests/maintenance-report.test.ts`. **Modify:** `app/maintenance/[agentId]/page.tsx`, `app/globals.css`.

**Work:** Add the shared Try surface to only the three selected pages. Preserve all existing sections and catalog titles. Implement the defined loading/result/error states, accessible form feedback, native expandable evidence and HTML download. Keep score and AI interpretation visually distinct. No dashboard navigation redesign or separate product branding.

**Proof:** inspect rendered pages at desktop and mobile widths; verify keyboard operation, readable evidence and loading/error states. Export opens offline and matches the displayed run. Test escaping of URL, selector and model text, and prevention of stale result replacement.

### U5: Verify and deliver the actual preview

**Depends on:** U1–U4. **Budget:** 90–120 minutes plus repair buffer. **Governs:** R1–R8.

**Files:** affected source/tests above and the ignored execution ledger. No unrelated repo cleanup.

**Work:** Run the repository gates; use the project's prescribed commit method and identity, with no added authorship trailers. Push the isolated feature branch and verify the deployed commit. Complete the live acceptance matrix and a short rehearsal from the same UI Venu will use. Remove disposable probes. Verify production remains unaffected. Record direct agent links, source commit, six run IDs, timestamps, evidence and remaining limitations.

**Proof:** all criteria in the Verification Contract and Definition of Done. Give Jackie working links and one representative downloadable report per agent. Explain any actual incomplete item plainly rather than presenting a broader readiness claim.

### Execution ownership and timing

Use subagent-driven development: a fresh implementer owns one bounded unit; the lead integrates and verifies; an independent reviewer checks requirements and code before the next unit closes. Avoid simultaneous edits to the shared API, report types or page. Parallelize independent evidence review and UI review where they save time.

This is approximately 6–8 focused engineering hours if U1 passes, followed by contingency time. It is an estimate, not verified delivery capacity. Complete the provider proof and shared execution path first, then assessments and UI, then the live rehearsal. If time tightens, reduce visual embellishment and report formatting complexity. Do not cut real execution, truthful status, evidence, basic input/access controls or verification. Work on all three category profiles through one path rather than finishing an elaborate SEO product before starting the other two.

## Verification Contract

### Repository gates

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` before committing, as required by the repository. These are implementation-phase checks; they have not been run as part of authoring this plan. Follow the current Next.js guide and strict TypeScript conventions. Keep test fixtures isolated from live-provider calls in the ordinary test suite.

### Live acceptance matrix

| Agent | First public page (Solvd by default) | Second public page | Required observation |
| --- | --- | --- | --- |
| SEO | Fresh live run | Fresh live run | Actual selected SEO category, grounded interpretation, working HTML export. |
| Accessibility | Fresh live run | Fresh live run | Actual automated results and manual/incomplete boundaries, grounded interpretation, working export. |
| Performance | Fresh live run | Fresh live run | Actual lab metrics with units/profile, grounded interpretation, working export. |

Use `https://solvd.com/` and a second reachable public page selected during U1, defaulting to `https://example.com/`. If a target is blocked, record that honestly and use another reachable public page for the successful-run criterion; do not count the blocked page as scanned. Use offline known-failing fixtures to verify finding rendering without promising a real target must contain defects.

For all six runs: compare displayed values with the captured provider response; verify actual provider timestamps, requested/tested URL and category; resolve any flagged uncertainty about the tested page state; validate evidence references; confirm live model success and usage; save normalized report evidence. A partial or unresolved page-state result does not count. No requirement that a page must fail an audit. A clean result is valid, with coverage limits intact.

Also verify fresh-session independent invocation, invalid URL, timeout/429, model-unavailable behavior, mobile layout, report escaping, stale-result handling and preview access from an equivalent non-owner session. Report latency as observed; never promise an instantaneous scan. Timestamped manual browser evidence proves the flow; unit tests prove normalization and failure handling.

## Definition of Done

- All three existing maintenance pages expose a functioning Try surface in the delivered preview.
- Each accepts an eligible public URL and completes its own scan and live evidence-linked assessment without another agent running first.
- All six real acceptance runs pass and at least one report per agent is available to Jackie.
- No score, audit result or AI success is mocked, substituted or inferred from old reports.
- Reports state one-page scope, exact tested page, provider, time, device, evidence and limitations; failures and partial assessment states are visible.
- Exports work offline and match the displayed result.
- Repository checks pass; independent review findings that affect delivery are resolved; the feature branch and deployed commit are recorded.
- Venu can access the delivered preview and run the POST flow through the approved access mechanism.

Completion means **three working on-demand public-page capabilities**. It does not mean the nine-agent maintenance system, ongoing regression monitoring or a customer production service is complete.

## Sources and remaining execution dependencies

Primary technical references checked for this plan:

- Google, [PageSpeed Insights v5: Get started](https://developers.google.com/speed/docs/insights/v5/get-started): supported audit categories, API-key guidance and limitations of the evolving field-data response.
- Google, [runPagespeed reference](https://developers.google.com/speed/docs/insights/rest/v5/pagespeedapi/runpagespeed): category/strategy inputs and Lighthouse result provenance.
- Vercel, [Function limits](https://vercel.com/docs/functions/limitations): deployment duration and payload constraints; confirm actual project settings in U1.
- W3C WAI, [Selecting web accessibility evaluation tools](https://www.w3.org/WAI/test-evaluate/tools/selecting/): automated testing cannot establish complete accessibility.
- Local code entries named above, inspected during planning, and the user's November 4 meeting transcripts and latest deadline instruction.

**Unverified prerequisites owned by the execution lead:** permitted deployment/network access, Preview model credentials, usable PSI quota/key, actual latency and response shapes, and non-owner access. U1 resolves these before deeper work. No production code was changed and no live-provider success is claimed by this planning document.

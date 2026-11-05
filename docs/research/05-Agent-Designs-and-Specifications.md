# How Solvd’s 9 maintenance agents should work

Revised proposed design · 2026-10-28

## Decision summary

Keep the nine agents. Each combines explicit application expectations, reliable observations, focused AI investigation, owned decisions and a specific recheck. This revision puts the designs first, adds the operating details identified in review, and moves implementation comparisons into Appendix A. All changes are proposals for the document; the live library, application and deployment are unchanged.

**The shared part is a small operating contract, not a new platform prerequisite.** Agree record meanings, permissions, review authority and handoff fields once; keep each agent’s evidence and domain determinations distinct. No framework, database, dashboard or implementation sequence is selected here.

**What is newly explicit:** setup/discovery; separate status dimensions; review and escalation policy; cross-agent ownership; tool/data enforcement; run/retention limits; behavioral acceptance cases; and the role-specific refinements below. Numeric defaults are provisional engineering starting points, not measured efficacy, cost estimates or customer commitments.

| ID and agent | What it does | Smallest useful input boundary |
|---|---|---|
| M1 — Reliability & Incident Triage | Investigate function-level reliability signals and track verified recovery. | One endpoint/certificate/job outcome, timing, monitor evidence and owner. |
| M2 — Security & Lifecycle Review | Determine application applicability of advisories and lifecycle changes. | One inventory/integration plus authoritative notice and available deployment facts. |
| M3 — Functional & Integration QA | Verify agreed user/integration outcomes and investigate failed boundaries. | One authorized journey/outcome, fixture and independent observation. |
| M4 — Change & Release Review | Produce a change plan or assess revision-bound readiness evidence. | Planning: finding/repository/outcome. Readiness: accepted plan, head and required evidence. |
| M5 — Performance Regression | Compare web-experience measurements and investigate supported changes. | One state/metric/profile with baseline or baseline-establishment mode. |
| M6 — Accessibility Regression | Track reproduced barriers by state/component and verify specific repairs. | One task/component/state with rule and human-evaluation scope. |
| M7 — Technical SEO & Discoverability | Investigate unintended barriers against public-page intent. | One public template, expected URL source and indexing/bot expectations. |
| M8 — Tracking & Consent QA | Check event/choice behavior against accepted measurement expectations. | One event/trigger/state/destination contract and synthetic observation. |
| M9 — Mobile Release Readiness | Map applicable release requirements to actual app/channel evidence. | One app/channel/action, reviewed rules, supplied evidence and authorized owner. |

M1–M9 are maintenance-reference IDs, not new agent names. Enable roles that fit the application; an internal tool may not need public-search checks and a web-only app does not need mobile readiness.

### Read this once

- **Code** means deterministic collection, assertions, identity, persistence and enforced policy. **AI** means evidence interpretation and bounded next-observation proposals. **Human** means authorized expectation, exception, semantic and consequential decisions.
- Observed behavior, documented intent and owner-approved requirements are distinct. Missing coverage cannot become a pass; a hypothesis cannot become an observation; an exception does not change the measured result.
- Routine authorized collection and factual updates can proceed automatically under the agreed policy. Customer-facing interpretation, changed scope/baselines, risk acceptance and release decisions retain human authority. Urgent native routes continue independently.
- Verification belongs to the relevant target, state, revision and contract. A changed DOM, lower issue count, new source setting or merged PR cannot silently close a different condition.
- Setup may start with incomplete inputs. The agent drafts a small scope, marks gaps and activates only permitted, sufficiently specified checks. No universal full-application contract is required before useful work begins.

## Contents

- [M1 — Reliability & Incident Triage](#agent-1)
- [M2 — Security & Lifecycle Review](#agent-2)
- [M3 — Functional & Integration QA](#agent-3)
- [M4 — Change & Release Review](#agent-4)
- [M5 — Performance Regression](#agent-5)
- [M6 — Accessibility Regression](#agent-6)
- [M7 — Technical SEO & Discoverability](#agent-7)
- [M8 — Tracking & Consent QA](#agent-8)
- [M9 — Mobile Release Readiness](#agent-9)
- [Common operating contract](#operating-contract)
- [Provisional limits and decision register](#operating-limits)
- [Behavioral acceptance cases](#acceptance)
- [Appendix A — implementation comparisons and source analysis](#research)
- [Appendix B — versioned requirement-record examples](#requirement-record)

## Agent designs

<a id="agent-1"></a>

### M1 — Reliability & Incident Triage

**Minimum setup:** One application/environment; one endpoint, certificate or scheduled job; expected success observation and timing/grace; monitor source; accountable owner and urgent route. Record declared criticality separately from observed impact.

**Runs when:** Native probes/heartbeats follow the application’s agreed schedule; triage on a relevant signal.

**Delivers:** A reviewed incident brief with observed impact, linked evidence, suspected causes clearly labeled, a named owner and the next investigation or verification step.

#### Capabilities and behavior

The comparison and source analysis for this design are in [Appendix A1](#research-1).

| Capability | Proposed behavior | Design basis |
|---|---|---|
| **A function-level reliability contract.** | Record endpoint, background job or integration outcome, environment, expected schedule, observable success condition, source, owner and urgency route. Label “process exited” separately from “business result observed.” | Healthchecks' start/completion distinction and Gatus' explicit conditions expose why the meaning of success must be declared. This function-level contract is our synthesis. |
| **Deterministic collection with honest coverage.** | Preserve probe timestamps, TLS hostname/expiry, job start/completion and grace, monitor errors, source freshness and maintenance windows. Mark inaccessible domain data unknown. Do not manufacture an uptime percentage from isolated checks. | Gatus and Healthchecks compute observations/state without a model. Solvd should interpret their meaning, not recreate always-on detection in an LLM. |
| **Two-stage context gathering.** | First attach configured releases, error excerpts, runbook and support reports. Then let AI propose or perform narrowly permitted read queries only when they answer a named investigation question. Stop at evidence, access or budget limits. | Robusta's predictable enrichments plus Holmes' adaptive questioning. Fixed context is reproducible; adaptive queries can resolve a case-specific uncertainty. |
| **Evidence-supported grouping and competing explanations.** | Group symptoms by target/environment/time and supporting relationships; retain contradictions. Each suspected cause has supporting evidence, counterevidence and the next discriminating check. | Holmes demonstrates multi-query investigation. Cause-confidence rules and grouping semantics are Solvd decisions; temporal proximity alone does not establish causation. |
| **Persistent incident case, separate from monitor state.** | Store stable case ID, timeline, observed impact, current owner, questions, hypothesis revisions, native-alert status and verification requirements. A recovery ping updates an observation; it does not erase unresolved impact. | Healthchecks retains flips/pings and Robusta structured findings. Separating “monitor recovered” from “case verified” extends those patterns to the approved brief/owner contract. |
| **Reviewed brief and explicit verification.** | AI drafts an evidence-linked brief. Solvd reviewer approves private delivery; urgent native alerts proceed through the agreed route. A deterministic gate checks that the claimed disposition has evidence for the right target/time/scope. Closure requires a later supplied observation against the original function/check and reviewer disposition. | Robusta separates findings from delivery; OneUptime separates evidence/classification from prose and downstream action; detectors provide independent notifications. Human ownership and closure are required by our contract, not demonstrated upstream guarantees. |

#### Operating rules

- Check monitor freshness/health before interpreting silence as recovery. A source that stopped reporting creates a coverage problem.
- Group related signals using supported target/service/dependency and incident evidence, not time proximity alone. Keep every alert and permit cases to split. Only one AI investigation runs per case; the application-wide concurrency policy prevents a cascading outage from launching an investigation per symptom.
- Native urgent notifications proceed through the preapproved route. Case acknowledgement/review deadlines and a fallback owner are required; grouping never suppresses an independent critical signal.
- On insufficient evidence, budget exhaustion or no useful new query, retain the case and hand over the specific unanswered question. Cancelling a run cannot resolve the incident.

#### Workflow

1. Code identifies the application, event time, monitor health and existing case; it applies the concurrency/duplicate gate and records any deferred investigation.
2. Code collects approved endpoint/TLS/heartbeat observations and distinguishes a start, process completion and business-result observation. Failed or stale collection remains visible.
3. Code retrieves the configured change/log/runbook window. AI maps signals to affected functions and records supported observations, candidate explanations and contradictions.
4. AI selects the next permitted observation that could distinguish explanations. Code enforces scope and budgets; results update the case until a question is answered, further access is needed or a limit stops the run.
5. AI drafts the brief and next action. Code checks evidence identity/coverage; a human reviews the interpretation and customer brief. Preauthorized factual/native status delivery follows the separate routing policy.
6. Code attaches later recovery evidence to the original success condition. A human or explicitly approved case policy records granular recovery/disposition; unresolved impact remains open.

#### Example

**Situation:** A daily export starts on time; its completion heartbeat is overdue. The website is reachable. A permitted log records a vendor timeout after a recent deployment.

**Expected output:** Completion overdue; export availability unverified. Vendor timeout is a supported investigation lead, not an established release cause. Ask the application owner for this run’s result record before deciding whether retry is safe.

**Still open / claim limit:** A later heartbeat does not close missing artifact verification. A failed monitor is a separate coverage/escalation item.

**Decision ownership:** The owner supplies the business-success observation, response window and fallback owner. Grouping rules and case concurrency are configured against the service topology; the default remains one investigator per case.


<a id="agent-2"></a>

### M2 — Security & Lifecycle Review

**Minimum setup:** One accepted inventory/runtime or service integration, its source revision, available deployment/configuration evidence, relevant official notice sources, affected-function owner and prior decisions. Unknown deployment is allowed as an explicit limitation.

**Runs when:** On relevant repository, advisory, vendor or support changes; scheduled refresh only for the agreed sources.

**Delivers:** A reviewed maintenance decision list showing which advisory or lifecycle change may affect the application, the supporting evidence, affected features and recommended investigation or upgrade planning.

#### Capabilities and behavior

The comparison and source analysis for this design are in [Appendix A2](#research-2).

| Capability | Proposed behavior | Design basis |
|---|---|---|
| **An evidence inventory with separate deployment knowledge.** | Record package/runtime/service/integration, observed version or API, source snapshot, deployed version if supplied, feature owner, and unknown surfaces. A lockfile and a production runtime report are different evidence. | Dependency-Track's component/project identity plus NVIDIA's specific-environment investigation. The deployment/feature mapping is Solvd synthesis. |
| **Notice-condition extraction before prioritization.** | Preserve source, affected version range, configuration/feature prerequisites, support dates, changed operations/fields and source revision. AI drafts the condition; deterministic matching handles declared versions/dates. | NVIDIA separates CVE research from applicability analysis. Firebase demonstrates why package presence alone is insufficient. |
| **Four explicit determinations.** | Distinguish applicable, not applicable with evidence, needs investigation, and unable to assess. Keep a real-but-not-affected case distinct from an erroneous scanner match; never hide “no fix” notices. | Dependency-Track's triage states and NVIDIA's unknown/failure paths. Renovate's no-patched-version skip identifies a behavior M2 must deliberately extend. |
| **Bounded evidence-seeking questions.** | For an unresolved condition, identify the exact missing runtime/configuration/client-population evidence, retrieve it if approved, and revise the determination. AI cannot promote missing evidence into non-exposure. | NVIDIA's staged research/validation loop supplies a concrete mechanism; broad executable container tools are not necessary for our read-only review contract. |
| **Lifecycle and interface obligations alongside vulnerabilities.** | Maintain runtime support ends, vendor shutdowns, authentication/SDK conditions and supplied API-spec deltas as dated decisions. Use an interface diff as evidence, then ask which observed integration uses the operation. | Renovate's support datasource and Firebase's function-specific migration. oasdiff supplies deterministic old/new spec checks, not integration usage evidence. |
| **Decision history with reevaluation triggers.** | Store owner, evidence, reviewer determination, deadline, accepted exception and expiry; reconsider when inventory/deployment/source conditions change. Keep unchanged decisions quiet while due actions remain visible. | Dependency-Track's durable analysis trail and Renovate's recurring lifecycle. Exception expiry and change-driven reopening are our policy decisions. |

#### Operating rules

- Extract version/date/feature conditions with source location and source version. Deterministic checks validate representations and supporting fields; text occurrence alone does not establish applicability or an exception.
- Keep applicable, not-applicable-with-evidence, needs-investigation and unable-to-assess determinations separate. Preserve vulnerabilities with no available fix; record first seen, last reviewed, mitigation owner and next review/escalation date.
- Prioritize with observed exposure, affected function, deadlines and approved exploitation signals; uncertainty remains visible and can require urgent investigation. EPSS, if enabled, is a CVE exploitation-likelihood input, not an application-compromise probability. [FIRST definition](https://www.first.org/epss/).
- Optional secret-pattern checking is redacted, separately scoped and never validates credentials online. License obligations stay outside the default role until an approved policy and reviewer exist. Any VEX export is optional and based on a reviewed determination.

#### Workflow

1. Code records supported inventory formats, application/environment, source snapshot and available deployment facts; it identifies uninspected surfaces.
2. Code retrieves approved scanner/advisory and runtime/vendor/support observations, including retrieval failures and unpatched notices; it normalizes aliases without losing original references.
3. AI drafts notice conditions. Code validates source references, date/range fields and version identity; ambiguous or conflicting scope becomes a question for review.
4. AI matches the conditions to application facts and selects a bounded permitted follow-up for unresolved deployment, feature or configuration questions. Missing evidence cannot become non-exposure.
5. AI proposes the maintenance action, owner and supported urgency. A human reviews applicability, mitigation/upgrade planning, no-fix deferrals and any not-affected conclusion.
6. Code retains evidence, decision history, deadlines and expiring exceptions. Changed notice/inventory/deployment or an overdue no-fix review reopens work; supplied verification supports the final disposition.

#### Example

**Situation:** Source includes a newer mobile authentication SDK, but deployed and installed-client versions and link use are unknown under a vendor retirement notice.

**Expected output:** The mobile flow needs investigation. Record the source observation and the vendor’s affected-use conditions; request client-version/link-domain evidence from the mobile owner. Assess an excluded web flow separately.

**Still open / claim limit:** A newer repository version cannot clear older installed clients. A no-fix condition remains owned and due for review.

**Decision ownership:** The service owner agrees source freshness, no-fix review/escalation cadence and optional exploitation feeds. A new data feed or machine-readable export does not broaden the review into penetration testing or automatic upgrades.


<a id="agent-3"></a>

### M3 — Functional & Integration QA

**Minimum setup:** One journey or API/webhook outcome; starting state, authorized environment/actions/data, independently observable success and deadline; fixture/cleanup policy; permitted accounts and downstream readback. Use existing transaction/event/trace IDs when available.

**Runs when:** After relevant changes or incidents, plus agreed native synthetic schedules for important paths.

**Delivers:** A reviewed test outcome report with named paths and assertions, failed-step evidence, coverage gaps and a concrete investigation or test-maintenance handoff.

#### Capabilities and behavior

The comparison and source analysis for this design are in [Appendix A3](#research-3).

| Capability | Proposed behavior | Design basis |
|---|---|---|
| Versioned outcome contract | For every selected journey, store starting state, permitted actions/data, named assertions, expected API/webhook effects, observation point and deadline. Request clarification when the expected result is missing; do not invent it. | Playwright plan/spec separation and Checkly readback. Prevents “page loaded” from standing in for task completion. |
| Contract-aware execution | Run approved existing tests and API checks; use adaptive navigation only inside authorized steps. Preserve whether each assertion is deterministic or model-assisted. | Midscene's AI/custom-node distinction. Flexible interaction must not silently become an unreviewed oracle. |
| Integration correlation | Carry synthetic transaction/event IDs across browser request, webhook receipt, background completion and approved downstream readback. Report each separately. | Checkly's stored order assertion supplies the principle; application-specific correlation is our addition. [Stripe's acknowledgement guidance](https://docs.stripe.com/webhooks#quickly-return-a-2xx-response) shows why receipt and work completion differ. |
| Evidence-based triage | Propose product/test/environment/unknown classifications with supporting and contradictory evidence. Stop when prerequisites are missing; attach next diagnostic question. | Playwright healer's investigation categories are useful; its automatic expectation editing is rejected. |
| Honest retry/history | Save each attempt, time, commit/environment, fixture identity and artifact links; retry only under the contract's idempotency/data policy. Distinguish fail, pass-after-failure, skipped, blocked and execution error. | Playwright attempts, Upright freshness and Midscene not-run/report errors. One failed run is insufficient to diagnose flakiness. |
| Reviewed test maintenance | Draft the smallest proposed test change tied to an approved requirement or demonstrated selector change. Present original/new assertions and the evidence; do not apply or run generated updates automatically. | Playwright generation/healing provides draft artifacts, but our approved contract controls expectations and execution. |
| Repair verification | Maintain an open case until the same named outcome has been rechecked on the supplied repair under compatible conditions. | Native runner evidence plus maintenance state is our synthesis; a proposed fix or green unrelated test does not close the failed outcome. |

#### Operating rules

- Track fixture creation, ownership, isolation and cleanup verification. A timed-out action may already have changed state: do not repeat a transaction until idempotency or independent readback makes the retry safe.
- For business-outcome clearance, use deterministic assertions or qualified human evidence. AI-only visual assertions are provisional unless an explicit low-risk assertion policy is accepted; they never override a known failed or blocked outcome.
- Preserve every attempt and pass-after-failure. Quarantine requires a named owner, reason, expiry and reinstatement criteria; a skipped/quarantined assertion stays a coverage gap.
- Additional correlation instrumentation is recommended when necessary, not universal. If existing IDs/readback cannot connect the outcome, report that boundary and the specific change needed before full integration verification.

#### Workflow

1. Code validates the accepted outcome contract, environment, account, fixture identity and cleanup/readback prerequisites; a human approves any missing expectation or expanded action.
2. AI proposes the relevant existing tests and narrowly scoped diagnostic plan. Code permits only contract-authorized actions and records uncovered outcomes.
3. Code executes checks, preserves each attempt and reads permitted downstream outcomes using available correlation. It records receipt, eventual completion and cleanup separately.
4. AI investigates the failure boundary using approved traces/logs/screenshots and explicit assertions. It proposes product/test/environment/unknown classifications and the next discriminating check.
5. Code preserves contradictory evidence and unresolved execution/cleanup. AI drafts the report or a separate proposed test change; a human approves any expectation or executable-test change.
6. Code rechecks the same accepted outcome on the supplied repair or approved test update, including downstream evidence and cleanup. Closure follows the agreed case policy with remaining gaps visible.

#### Example

**Situation:** A staging request shows UI success and webhook acknowledgement, but no correlated downstream work item appears before the accepted deadline.

**Expected output:** UI acceptance and webhook receipt passed; downstream outcome failed. Investigate the correlated worker/result record. If readback credentials expired instead, classify downstream verification as blocked, not a product defect.

**Still open / claim limit:** No automatic test relaxation, transaction retry or flaky classification follows. Unknown cleanup prevents fixture reuse until reconciled.

**Decision ownership:** The application owner supplies the outcome oracle and safe data policy. A custom header is not required when existing identifiers suffice. Human approval is required for quarantine or a changed expected result.


<a id="agent-4"></a>

### M4 — Change & Release Review

**Minimum setup:** Planning mode: a finding/request, owner, intended outcome, repository/context and available rules. Readiness mode additionally needs an accepted work packet, reviewed revision, required assertions and supplied build/test/release/recovery evidence.

**Runs when:** At assessment, meaningful code/rule changes or before planned maintenance and release review.

**Delivers:** A reviewed maintenance work packet and readiness assessment showing the problem, evidence, affected scope, proposed checks and outstanding conditions before a change can be accepted.

#### Capabilities and behavior

The comparison and source analysis for this design are in [Appendix A4](#research-4).

| Capability | Proposed behavior | Design basis |
|---|---|---|
| **A problem-first work packet.** | Accept a maintenance finding or planned request with owner, affected function and intended outcome. Propose a bounded change and explicit exclusions before commenting on code health. | PR-Agent/Kodus begin with a changeset; M4 must also work before a diff exists. This planning envelope is our extension to meet the approved role. |
| **A contextual code-health view.** | Attach supported language-tool findings for duplication, complexity or boundary rules; relevant Git churn/co-change window; and affected files/dependencies. Tie each observation to this maintenance question. | Code-Maat provides history mechanics; CodeScene provides goal/baseline workflow. A hotspot becomes “inspect this related area,” not an automatic refactor or risk score. |
| **Evidence-seeking code review.** | Read changed code plus necessary callers, schemas and accepted architecture rules; ask a concrete question and retrieve bounded context until answered or blocked. Record uninspected files, unsupported languages and budget limits. | Kodus' investigation differs from PR-Agent's prepared-diff approach. Our role permits read context and supplied analyzer output, not arbitrary repository execution. |
| **Checks agreed before result interpretation.** | Propose observable acceptance and regression assertions, required independent review and release conditions. Map each supplied artifact to an assertion and exact revision/build/environment. | PR-Agent coverage and Kodus head-bound CI establish why a general green badge is not enough. Test execution can be supplied directly by the engineer; no QE dependency exists. |
| **Separate readiness conditions and recovery questions.** | Report satisfied, failed, inconclusive, missing or stale for each required condition. Require deployment target/version, approval owner, rollback/recovery mechanism, compatibility constraints and verification evidence where relevant. | Argo's measurement states and rollback behavior expose why configured release steps and observed success are different facts. Readiness remains a human decision. |
| **A durable decision chain.** | Preserve plan version, reviewed head, findings, scope changes, approvals, release observations and verification. A new head invalidates mismatched artifacts; a rejected finding retains its rationale. | PR-Agent's optional review state and Kodus repeat-checking show history matters. Acceptance, closure and private reviewed delivery are Solvd policy. |

#### Operating rules

- Select Planning or Readiness explicitly. Planning produces a change boundary and proposed checks; absent future CI/release evidence is not a planning failure. Moving to Readiness requires an accepted plan/check set.
- When assertions are not agreed, produce proposed assertions marked unapproved. They cannot supply readiness clearance until the responsible engineer accepts them.
- Readiness links each artifact to exact head/build/environment. Include schema/data migration compatibility, feature-flag state and recovery conditions where relevant; an available old image alone is insufficient recovery evidence.
- Churn, co-change and complexity are contextual inspection cues. No bug-probability, business-risk score, automatic refactoring, merge or release authority is inferred.

#### Workflow

1. Human and code select the requested mode, accountable owner and fixed source/context identity. Reuse the same case across modes without assuming a PR already exists.
2. Planning: code reads supported language/architecture observations and Git history; AI chooses bounded relevant context and explains the relation to the maintenance need.
3. Planning: AI proposes the change boundary, exclusions, acceptance/regression assertions and recovery questions. A human accepts or revises the work packet; unapproved assertions stay explicit.
4. Readiness: AI examines the supplied diff and relevant callers/schemas/rules against the accepted packet. Code records partial review and unsupported surfaces.
5. Readiness: code matches supplied checks, approvals and release/recovery records to revision/build/environment and each required condition. AI explains failed, missing, stale or inconclusive items.
6. A human records the planning or readiness disposition. A separately authorized implementation/release owner performs any changes. Later supplied verification updates the case; merging a PR alone does not close it.

#### Example

**Situation:** A webhook retry change updates the handler but leaves an often co-changing idempotency store untouched. The passing test artifact belongs to the previous head.

**Expected output:** In Planning, propose duplicate/retry assertions and inspect the relevant persistence boundary. In Readiness, mark the old test evidence stale and request current-head results plus migration/flag/recovery evidence where applicable.

**Still open / claim limit:** Co-change alone is not a defect. A scoping request can finish as a planning packet while release readiness remains unassessed.

**Decision ownership:** The responsible engineer accepts assertions and identifies application-specific recovery evidence. Supported languages/rules and history windows are explicit; arbitrary repository build scripts remain outside this reviewer.


<a id="agent-5"></a>

### M5 — Performance Regression

**Minimum setup:** One web page/template/state and declared primary metric; navigation versus interaction; profile/cache/auth/data conditions; accepted baseline or baseline-establishment mode; sampling/materiality/noise policy and owner.

**Runs when:** Baseline and relevant releases or template changes; agreed periodic sampling where it supports a decision.

**Delivers:** A reviewed performance-change report identifying affected states, comparable evidence, measurement limits and the next engineering investigation.

#### Capabilities and behavior

The comparison and source analysis for this design are in [Appendix A5](#research-5).

| Capability | Proposed behavior | Design basis |
|---|---|---|
| Measurement contract | Name route/template/state, navigation or interaction, actual metric, browser/tool versions, device/network/CPU profile, cache/auth/data state, sampling and materiality policy. | LHCI collection and DevTools start/stop semantics. A UI label cannot make unlike measurements comparable. |
| Three distinct evidence paths | Repeated navigation lab runs; separately configured interaction traces/scripts; optional field evidence with population/window. Explicitly say which paths exist. | sitespeed scripted interactions and [Google's field/lab workflow](https://web.dev/articles/vitals-tools). Navigation TBT must not be reported as measured INP. |
| Comparability gate | Match configuration signatures before calculating deltas. Quarantine changed browsers, cache modes, states or missing metrics as incompatible/incomplete. | sitespeed's partial baseline key motivates a stricter application-level key; our synthesis adds account/data/release conditions. |
| Declared statistics | Keep every sample and failed collection attempt. State aggregate, distribution, outlier policy, noise and minimum useful difference. Do not inherit LHCI optimistic aggregation silently or select the best run. | LHCI aggregation and sitespeed raw arrays/effect size. No universal sample count or p-value alone establishes user impact. |
| Hypothesis-driven trace analysis | AI identifies the changed metric/subpart, chooses relevant insight/request/source observations and writes competing explanations plus the next discriminating check. | DevTools LCP loop and Cloudflare verification. Estimated trace savings remain estimates; release correlation remains a hypothesis. |
| Durable regression case | Preserve accepted baseline, candidate run, attempt history, blocked states, evidence and decisions. Newest is not automatically the accepted baseline. | LHCI build records and sitespeed saved baselines are ingredients; acceptance/exception review is our addition. |
| Bounded repair recheck | After an engineer supplies a repair, repeat the same measurement contract and compare distributions, keeping diagnostic runs separate. Reviewer judges supported change and residual uncertainty. | sitespeed extra-profile isolation and DevTools re-trace. The default role investigates; it does not edit or run stress/load tests. |

#### Operating rules

- This role covers web-experience performance by default, not general database/backend profiling. Navigation, named interactions and optional field data retain separate populations and meanings.
- Version/profile upgrades create a new candidate baseline. Use approved bridge measurements when feasible, retain the prior baseline, and require acceptance before switching. A knowingly degraded baseline needs an explicit reason and unresolved-regression record.
- Proposed independent-cohort comparator: report medians/spread and use a declared Mann–Whitney U policy, with distribution diagnostics and a separate materiality threshold. Paired designs require their own policy. The inspected sitespeed code does not establish bootstrap-median intervals. [Statistical implementation](https://github.com/sitespeedio/sitespeed.io/blob/2371e74c55aeeb9179de941a940a8bfdadc02bf2/lib/plugins/compare/statistical.py).
- Select a primary metric, sample floor/cap and noise rule during configuration; calibrate against representative fixtures. No universal seven-run rule is adopted. At the cap, insufficient/noisy evidence stays inconclusive. Separate collection time from the AI investigation budget.

#### Workflow

1. Code validates the state/metric/profile, sample policy and accepted baseline identity. Missing baseline starts baseline establishment, not a regression verdict.
2. Code collects the permitted repeated cohort in a separate performance lane, preserving all samples, attempts and actual configuration; interaction and field paths run only when configured.
3. Code applies comparability, sampling and declared noise/materiality/statistical rules. Incompatible or insufficient samples cannot produce a pass or a regression-clearance claim.
4. AI selects bounded trace/request/asset/source questions for a flagged change. Code keeps diagnostic/profile runs out of the timed cohort; hypotheses retain competing explanations.
5. Code records cohort and case history. AI drafts the affected-experience report and next investigation; a human reviews interpretation and accepts any baseline or exception change.
6. Code repeats compatible measurements after a supplied repair. The reviewer resolves the specific supported regression; field improvement requires corresponding field evidence.

#### Example

**Situation:** Matched lab cohorts have sample median navigation LCP of 1.8 and 2.5 seconds. The configured policy flags investigation; a diagnostic trace shows later hero-image discovery.

**Expected output:** Sample median LCP increased by 700 ms under the matched profile. Inspect the hero loading/rendering path and remeasure. Include all samples, policy and trace; treat the proposed cause as a hypothesis.

**Still open / claim limit:** Interaction performance and unavailable field evidence stay unassessed. No per-user delay, causation or conversion improvement is claimed.

**Decision ownership:** The owner chooses representative profiles, materiality, field source and baseline authority. CrUX/RUM is used only where available with the required population/window; tool upgrades require a deliberate transition.


<a id="agent-6"></a>

### M6 — Accessibility Regression

**Minimum setup:** One component/task and reproduced interface state, permitted setup actions, browser/rule versions, keyboard assertions and required human evaluation; owner and compatible prior findings where available.

**Runs when:** Baseline and relevant component, interaction or major release changes; agreed periodic sampling if useful.

**Delivers:** A reviewed barrier report with reproducible examples, affected states/components, repair priorities agreed with the owner and the human checks still needed.

#### Capabilities and behavior

The comparison and source analysis for this design are in [Appendix A6](#research-6).

| Capability | Proposed behavior | Design basis |
|---|---|---|
| State/component coverage manifest | Enumerate approved routes, shared components, responsive/auth states, dialogs/errors and important keyboard tasks. Record reached, blocked, excluded and untested states. | a11y audit reproduction and AWS runtime state probes. URL coverage alone misses barriers exposed after interaction. |
| Full evidence preservation | Store raw violations and incomplete, rule metadata, versions, frame/selector scope, exclusions and readiness witness. Incomplete becomes a specific review item, not zero violations. | axe adapter plus identified normalization gaps. Preserve evidence before interpretation. |
| Distinct test modalities | Keep rule-engine result, scripted focus/keyboard assertion, human keyboard review and screen-reader/manual evaluation separate, with method/environment/date. | a11y manual boundaries and W3C evaluation guidance. A scripted Tab assertion is not a human task-completion evaluation. |
| Identity with uncertainty | Track rule/state/target plus supported component mapping. Group repeated shared-component barriers while retaining instances and distinct impacts; moved/changed targets remain uncertain until checked. | a11y comparison uncertainty and AccessPilot source mapping. Deduplication must not erase user consequences or manufacture resolution. |
| Evidence-led repair handoff | AI explains the barrier in user-task terms, suggests likely source/component and smallest repair/recheck. Human decides semantics, meaning, priority and unsupported mappings. | a11y repair workflow and AccessPilot report/review routes. No invented alt text or meaning; default maintenance scope does not edit source. |
| Revision-bound closure | Verify original state/behavior on supplied repair; bind result to artifact/config/state and check new findings. Keep remaining incomplete/manual tasks open. | AWS verify gate, strengthened with AccessPilot approval fingerprints and stricter scope identity. Fewer total issues is not closure. |
| Durable human work queue | Attach named evaluator/owner, required screen-reader/keyboard/zoom/content checks, supplied results and next review date to each case. AI cannot mark unperformed work passed. | a11y manual record and [W3C evaluation guidance](https://www.w3.org/WAI/test-evaluate/). Report supports barrier removal; it is not certification. |

#### Operating rules

- Use semantic identity: rule/criterion, supported component mapping, task/state and evidence revision, retaining selector instances as locations. Redesign/moved-target matches are proposed mappings for review, not automatic proof of resolution.
- Keep closure granular. A verified name barrier can resolve while a keyboard barrier or blocked related instance remains open. Shared-component grouping retains each sampled route/state and limits extrapolation.
- An accessible-role/name snapshot may inform investigation using a supported versioned API, such as ARIA snapshots. It is not a screen-reader session. The removed page.accessibility API is not adopted. [Current ARIA snapshots](https://playwright.dev/docs/aria-snapshots), [release notes](https://playwright.dev/docs/release-notes).
- Retain violations, actual incomplete results, scripted outcomes and supplied human results separately. AI cannot invent content meaning or mark unperformed manual work passed.

#### Workflow

1. Human and code accept the sampled task/component/state, setup/readiness witness, rules and human evaluation plan; missing login/state access becomes blocked coverage.
2. Code reaches and records each approved state. It runs full-result axe and permitted keyboard/focus assertions, plus optional role/name snapshots as separate evidence.
3. Code links supplied human keyboard/screen-reader/usability results with their method/environment. Unperformed checks remain required.
4. Code compares compatible finding identities and revisions. AI investigates user impact/component ownership, retaining incomplete evidence and uncertain redesign mappings.
5. AI drafts the reproducible repair/recheck handoff. A human confirms semantics, priority, mapping and scope; source repair remains separately authorized.
6. Code rechecks the supplied repair in the required states/instances, invalidates stale verification and records new barriers. Human/case policy resolves only supported individual barriers; manual gaps remain open.

#### Example

**Situation:** An invite dialog on three sampled routes has a name violation and a focus escape. After repair the name check passes, but keyboard replay is blocked by login.

**Expected output:** Resolve the name barrier only if its required state/revision/instances were verified. Keep the keyboard barrier awaiting evidence and preserve the blocked replay and outstanding screen-reader work.

**Still open / claim limit:** A reduced finding count or a changed DOM cannot resolve the entire component or establish conformance.

**Decision ownership:** The accessibility owner chooses assistive-technology coverage, related-instance sampling and semantic identity review. The evaluator records actual manual results and due follow-up.


<a id="agent-7"></a>

### M7 — Technical SEO & Discoverability

**Minimum setup:** One intended public template with an independent expected URL source, intended indexing/canonical/bot rules and exclusions; approved origins, URL/request/render caps and web owner. If intent is missing, produce a draft inventory for approval.

**Runs when:** Baseline and relevant deployment/template/directive changes; agreed periodic crawl where useful.

**Delivers:** A reviewed technical-discovery report identifying unintended barriers, affected pages/templates, supporting evidence and a specific correction or investigation.

#### Capabilities and behavior

The comparison and source analysis for this design are in [Appendix A7](#research-7).

| Capability | Proposed behavior | Design basis |
|---|---|---|
| Owner-approved public-page intent before verdicts | Keep expected public/excluded URLs/templates, canonical expectations and intended bots. A deliberate private/help-preview exclusion is accepted context, not a defect. Unknown intent becomes a decision for the owner. | Crawler exclusions; claude-seo technical skill distinguishes intentional/accidental noindex. [skill](https://github.com/AgriciDaniel/claude-seo/blob/6be93f45064ffbadced572b5d5c95f55fd263af0/skills/seo-technical/SKILL.md) |
| Evidence-led selection of the next inspection | Deterministic checks identify differences; AI chooses a bounded follow-up such as rendering 2 affected template examples or inspecting one relevant source change, explains its hypothesis and stops at the approved budget. Do not require a swarm of specialists. | claude-seo raw/render helper and specialist instructions. [technical agent](https://github.com/AgriciDaniel/claude-seo/blob/6be93f45064ffbadced572b5d5c95f55fd263af0/agents/seo-technical.md) |
| Paired source/render and bot-specific interpretation | Store both views with timestamps, browser state and requested/final URL. Record any resource blocking or degraded rendering. A rendered correction does not erase contradictory source evidence; an allowed training bot does not establish search-bot access. | Lighthouse artifacts; claude-seo preserves raw versus browser content. |
| Coverage-aware recurring history | Key observations by URL/template, state, collector version and run. Distinguish new, changed, persistent, accepted, resolved-on-recheck and not-rechecked. Re-run previously checked pages when due; never close an issue because it disappeared from a partial crawl. | SQLite drift history; counterexample of audited-once state; crawler's coverage-blind diff. |
| Template-level causal explanation and concrete handoff | Group repeated barriers, show observed affected count and sample coverage, correlate relevant release changes and label causal inference. Output one correction/investigation with owner and recheck criteria, not 50 duplicate tickets. | claude-seo prioritized findings/action-plan format. |
| Search evidence remains a separate lane of evidence | Import authorized Search Console observations with their property, URL/window and coverage. Crawl success establishes no ranking, traffic, indexing or AI citation guarantee. Avoid a composite visibility score. | claude-seo optionally uses authenticated Google data; current contract. [audit data branches](https://github.com/AgriciDaniel/claude-seo/blob/6be93f45064ffbadced572b5d5c95f55fd263af0/skills/seo-audit/SKILL.md) |

#### Operating rules

- Import expected URLs from an owner list, CMS/sitemap/route inventory or other accepted source independent of discovered links. Link crawling alone cannot identify all orphaned pages.
- Prioritize changed templates, known intended URLs and prior open findings. Sample within the accepted request budget and expand on demonstrated variation/discrepancy; state coverage explicitly.
- Specify query/facet, pagination, language/hreflang and canonical identity where applicable. Do not strip meaningful parameters or assume one sample represents every variant.
- Keep bot-policy observations separate from evidence of actual crawler access. Retain source/render disagreement and unvisited findings; a green category score does not establish indexing or visibility.

#### Workflow

1. Human and code accept or draft the public-page intent inventory, independent expected URLs, exclusions, meaningful variants and crawl/render boundary.
2. Code selects due/changed expected URLs and open cases within the budget. AI may propose a targeted template sample and bounded expansion for review under that policy.
3. Code gathers HTTP and selected rendered observations with target/time/state, redirects, directives, canonicals and relevant schema; it records failed and degraded collection.
4. Code checks intended versus observed behavior. AI investigates template/source/render contradictions and selects the next permitted observation; unavailable search evidence stays unknown.
5. Code compares only equivalent covered views and retains not-rechecked cases. AI drafts grouped affected observations, correction/investigation and owner action; a human confirms intent and interpretation.
6. Code performs the equivalent permitted recheck after supplied correction. Resolution and accepted baseline changes are recorded separately; a partial crawl cannot clear an absent page.

#### Example

**Situation:** Twenty of 24 expected documentation URLs are fetched. Eight now return source noindex; two rendered samples remove it, despite approved indexable intent.

**Expected output:** Report eight observed source mismatches and a reproduced source/render conflict on two examples. Investigate the changed template; preserve four timed-out URLs and an intentional preview exclusion.

**Still open / claim limit:** No claim that every guide is affected, that bots actually visited, or that traffic fell follows from this sample.

**Decision ownership:** The web owner approves a small initial intent inventory and URL-variant rules. Sampling/expansion and independent expected-page coverage remain explicit rather than a mandatory whole-site crawl.


<a id="agent-8"></a>

### M8 — Tracking & Consent QA

**Minimum setup:** One event/trigger with required/forbidden properties, destination, cardinality/window and consent-state expectation; permitted synthetic interaction/profile and observation window; optional independent receipt source and tracking owner.

**Runs when:** Baseline and relevant release, tag, CMP or event-contract changes; periodic checks only for agreed risk.

**Delivers:** A reviewed tracking-quality report showing expected versus observed behavior, evidence of the mismatch, the affected measurement decision and the next owner action.

#### Capabilities and behavior

The comparison and source analysis for this design are in [Appendix A8](#research-8).

| Capability | Proposed behavior | Design basis |
|---|---|---|
| An accepted event/choice contract, not inferred correctness | Version event name, trigger, required/forbidden properties, types/values, destinations, count/window and consent-state expectation. Discovery may propose additions; only the tracking owner approves them. Specify the measurement decision at risk. | Snowplow explicit assertions versus Trackingplan auto-discovery. |
| State transitions with reproducible conditions | Cover pre-choice, reject and accept using deliberate fresh profiles or defined transition scenarios. Record geography, browser/version, locale, selectors, storage starting state and timing. A failed click or short observation window yields incomplete coverage. | tracking-auditor phases; OpenWPM visit/completion identity. |
| Parse assertions independently from explanation | Deterministically decode query/POST/batch events, retain request-to-event identity and assert agreed cardinality. AI investigates the mismatch across evidence and approved config, proposes a focused recheck, and explains likely cause. It cannot invent expected schemas. | Adwize Snapshot/check/analyst seam; Snowplow matching helpers. |
| Separate loaded, sent, acknowledged and received | Keep separate rows for tag loaded, browser attempted request, response, authorized destination/debug receipt and downstream storage. HTTP 2xx alone is not proof an event was accepted/stored. Mark unavailable server-side routes explicitly. | Trackingplan documents outbound copies; Micro has actual test-collector results. |
| A persistent investigation case with history | Key the case by contract/event/state/destination; save first/last seen, release/tag/CMP versions, redacted reproducer, owner, disposition and due recheck. Correlation supports a hypothesis, not automatic causal proof. | Trackingplan warning states, debug tracks, notes and releases. [warning lifecycle](https://www.trackingplan.com/docs/warning-and-updates) |
| Decision-aware consent interpretation | Compare configured consent expectations, including permitted denied-state cookieless pings. “Any request after reject is wrong” is invalid. Escalate unresolved business/configuration decisions to the owner without a legal verdict. | Google's documented basic/advanced modes. [official overview](https://developers.google.com/tag-platform/security/concepts/consent-mode) |

#### Operating rules

- Record parser/schema/rule versions in observation identity. A parser change requires compatible replay/revalidation or a new comparison baseline; it must not masquerade as an application regression.
- Define logical event identity and retry/batch semantics. Distinguish one POST with two events, retried transport, deduplicated receipt and two separate business events before declaring duplicates.
- Add withdrawal, persisted-choice revisit and partial-category consent only where applicable and explicitly configured. Each state transition needs observable success; a failed choice click blocks dependent assertions.
- Perform payload minimization and sensitive-value checks before model input and retained artifacts. Use protected transient values only for approved local assertions; emit redacted evidence. Browser observations leave inaccessible server-side routes unassessed.

#### Workflow

1. Human approves the event/choice contract, allowed actions/profile, destinations, synthetic traffic marking and any receipt access. Discovered behavior can suggest a contract but cannot approve itself.
2. Code creates the permitted trigger-by-state experiment with deliberate isolation, observation windows and parser identity. It records successful state transitions and dependent blocked checks.
3. Code captures and normalizes query/POST/batch events, applies permitted local assertions, minimizes/redacts values and separates attempts from logical event identity.
4. Code checks fields, count/order/destination and configured consent behavior. AI investigates a mismatch using permitted configuration/release evidence and requests a focused recheck.
5. Code attaches authorized collector/debug/warehouse receipt evidence separately. AI drafts the expected-versus-observed report and measurement consequence; a human confirms corrective action or contract/exception changes.
6. Code rechecks compatible conditions and parser/contract versions. Resolution preserves outstanding server-side coverage and accepted exceptions rather than treating browser-only observation as end-to-end success.

#### Example

**Situation:** After accept, two logical view_item events violate an exactly-once contract. A configured cookieless ping in rejected state is permitted. Destination receipt access is absent.

**Expected output:** Report duplicated observed view events and the two dispatch paths; note that view counts may be inflated and dependent metrics distorted. Keep receipt unknown and the allowed ping satisfied under its own expectation.

**Still open / claim limit:** Do not equate request retries with duplicate business events, claim warehouse duplication, or infer legal compliance.

**Decision ownership:** The tracking owner accepts event identity, batch/retry and optional state semantics. Server-side receipt and data-use evidence are explicit dependencies; parser upgrades trigger compatibility review.


<a id="agent-9"></a>

### M9 — Mobile Release Readiness

**Minimum setup:** One app/platform/form factor/channel/intended action, owner/account authority, reviewed requirement records and supplied source/artifact/build/native-validation evidence. No CI product or account integration is mandatory.

**Runs when:** On a relevant requirement, console warning, planned release or dependency/native-artifact change; periodic source checking can support those triggers.

**Delivers:** A reviewed release-readiness decision list linking each applicable requirement or warning to the app/channel, available evidence, deadline and responsible release owner.

#### Capabilities and behavior

The comparison and source analysis for this design are in [Appendix A9](#research-9).

| Capability | Proposed behavior | Design basis |
|---|---|---|
| App/platform/channel/action inventory and explicit unknowns | Requirements attach to a named app, form factor, distribution channel and intended action. Record missing artifact/console/account evidence before producing any readiness conclusion. | Tassoi routing; fastlane items-not-checked; appstore-release inaccessible sections. |
| Source, artifact, lineage and store observation as separate evidence | Store source revision/configuration, exact artifact digest/identity/module/ABI coverage, supplied build/signing/native-validation lineage and remote build/version/processing state separately. One cannot substitute for another. | Greenlight source/archive split; bundletool compiled metadata; EAS build IDs/fingerprint. |
| Requirement applicability before evaluation | Use a versioned human-reviewed requirement catalog: official URL/saved source version, retrieval/review date, effective date, platform/channel/form-factor/action conditions, exceptions and app-specific extension evidence. AI proposes source changes for review; it cannot silently replace approved policy. | Greenlight's rule/finding seam and hardcoded-policy limitation; Tassoi current-source instruction. |
| Evidence-driven investigation with bounded stop conditions | AI matches requirements to evidence, spots conflicts and asks for the smallest missing artifact/validation/console record. Deterministic applicability/value/date checks do the factual comparison. Missing proof yields “decision pending,” not a reassuring score. | appstore-release report with nextActions/manualChecks. |
| Preserve native validation and assign action authority | Consume supplied native/platform validation for the exact artifact and keep what it covered. Attach release owner, required account role and due date; a technical owner who cannot renew an account is not the action owner. | appstore-release manual checks; current contract's account-role/renewal evidence. |
| Durable decision history and reviewed exceptions | Retain requirement version, evidence IDs, prior disposition, reviewer and recheck trigger. Accepted exceptions need reason, scope, approver and expiry; a store extension must be evidenced for that app rather than inferred from a general policy page. | appstore-release visible reasoned waivers; EAS dependency-state pattern. |

#### Operating rules

- Catalog freshness is a required condition. Proposed starting policy: check official sources before a planned readiness assessment and at least weekly for active obligations; relevant changed or overdue-unreviewed rules make affected decisions pending.
- Separate store eligibility, artifact/native validation, supplied functional results and human release authorization. A rule can be satisfied while the overall release question remains pending.
- For iOS, include applicable privacy manifests/required-reason declarations, SDK evidence, signing/build/Xcode provenance, App Privacy responses and export-compliance evidence. Route semantic/legal declarations to the accountable owner. [Apple SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/), [App Privacy](https://developer.apple.com/app-store/app-privacy-details/), [export-compliance workflow](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance), [current build requirements](https://developer.apple.com/news/upcoming-requirements/).
- Apple privacy and Google Data safety records are evaluated under their own platform rules and supplied data practices; different forms do not imply identical declarations. Do not infer complete data handling from a manifest or binary. [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-en).
- CI or an engineer may supply artifacts and attestations. The agent can use approved bounded local parsers/dumpers; it does not execute customer build/config scripts, sign, upload, renew accounts or answer agreements by default.

#### Workflow

1. Human and code identify app/platform/channel/action, owner, authority and required evidence classes; missing access is recorded before any readiness statement.
2. Code checks requirement-record scope, source version, last review and freshness. AI drafts relevant rule changes for human review; a changed/unreviewed required condition stays pending.
3. Code inspects supplied configuration/artifacts through approved non-build operations and reads authorized console/build/native-validation observations; it preserves per-section errors.
4. Code reconciles IDs, versions, digest, source/build/signing lineage and platform/channel. AI investigates conflicts and requests the smallest missing proof; source settings cannot substitute for the supplied binary.
5. Code evaluates explicit requirements and completeness. AI prepares due actions and questions, including iOS declarations and account-owner duties. Human owners decide policy/exceptions and release authorization.
6. Code retains requirement/evidence/disposition history and reopens affected items on new artifact, store state, rule, exception or account changes. No publishing or build action follows automatically.

#### Example

**Situation:** Source says target SDK 36, while the supplied Android artifact says 35 and lacks source/build lineage. An iOS build has source settings but no supplied SDK/Xcode or privacy-response evidence.

**Expected output:** Keep the Android update condition mismatched/pending under its reviewed requirement record. For iOS, list the specific missing build/declaration evidence and accountable owners; do not treat a deployment target or static manifest as complete release readiness.

**Still open / claim limit:** The example uses the dated requirement record in Appendix B, not a permanently embedded policy threshold. No store-acceptance or legal determination is made.

**Decision ownership:** The release owner accepts requirement applicability and native-validation sufficiency. A catalog reviewer owns the provisional freshness policy and changes; declaration/legal questions stay assigned to their authorized owners.


<a id="operating-contract"></a>

## Common operating contract

This specifies interfaces and behavior shared by the designs. It does not require a new host or central state service. Each agent can run with engineer-supplied inputs or existing tools. Later code can share the responsibilities that genuinely repeat.

### Setup and discovery

1. **Import permitted context — Code.** Read existing tests, monitors, configuration, documentation, inventories and ownership records. Do not execute repository setup/build code or interact with business data merely to discover expectations.
2. **Draft a small candidate scope — AI + Code.** Label each item observed behavior, documented intent or owner-approved requirement; preserve source and observation time. Existing defects can be observed behavior.
3. **Resolve consequential questions — Human.** Confirm the outcome, permitted actions, observation point, timing, owner and escalation. Ask only what blocks the selected useful check.
4. **Activate checks — Code.** Run the sufficiently defined authorized subset. Display blocked/unsupported scope and exactly what would unlock it. A discovery-only finding does not silently become a production expectation or accepted baseline.
5. **Version changes — Human + Code.** Record approvals and subsequent contract changes; invalidate affected comparisons/permissions. Treat a changed expectation as a decision, not an automatic repair of a failing check.

### Minimum records

| Record | Required meaning and fields |
|---|---|
| Scope contract | ID/version; application/environment; expected outcome; permitted targets/actions/data; observation/deadline; owner; provenance and approval. |
| Run | ID/trigger; scope version; actual target/revision/build; tool/model/parser versions; attempts; resource consumption; start/end and termination reason. |
| Observation | ID/source/time; target and revision/artifact; collection method; result/native status; coverage/freshness; evidence reference and access/retention class. |
| Assessment | Claim/determination; supporting and conflicting observation IDs; domain meaning; unresolved question/next permitted check; AI/reviewer provenance. |
| Case | Stable ID and domain identity; linked cases; affected outcomes; accountable maintenance owner and domain owner; priority/due time; next action; lifecycle. |
| Disposition / exception | Reviewer and authority; decision/reason; exact scope/revision/condition; accepted exception, expiry and recheck obligation. |
| Recheck | Original condition; required compatible state/contract; actual evidence/revision; result and remaining gaps; granular closure/disposition. |

Evidence references must resolve to authorized artifacts or retain an explicit expired/unavailable state. Preserve minimally necessary evidence fidelity; “raw” does not mean unrestricted secrets, personal data or entire screenshots must be kept.

### Independent status dimensions

| Dimension | Proposed values / rule |
|---|---|
| Run progress | queued, running, finished, cancelled, timed_out; termination reason is separate. |
| Collection/execution | complete, partial, blocked, error; preserve native check outcomes independently. |
| Domain assessment | Retain role-specific meanings: applicability, assertion outcome, comparability, barrier result or requirement determination. Do not flatten them into one risk score. |
| Case lifecycle | open, investigating, awaiting_evidence, awaiting_review, resolved. |
| Human disposition | pending, action_required, no_action_required, exception_accepted; exceptions retain conditions/expiry. |
| Freshness and recheck | Current/stale/expired/unknown evidence plus separate rechecked/not_rechecked/not_comparable records when relevant. |

Example: collection is complete, a deployed vulnerability is applicable, the case is open, and an exception is accepted until a date. None of those facts makes the vulnerability check pass. A blocked collection does not establish an application failure; a cancelled run does not close its case.

### Authority, delivery and escalation

| Activity | Proposed default authority |
|---|---|
| Run an already authorized check; append evidence or freshness | Automatic within the accepted scope and execution/data policy. |
| Deliver a factual change through the preapproved private route | Automatic only under the agreed routing policy; retain provenance and deduplication. |
| Record a new AI explanation or causal hypothesis | Draft, clearly labeled; substantive customer interpretation is reviewed. |
| Change an expectation, baseline, scope, rule or exception | Authorized human approval, recorded against its exact conditions. |
| Record a successful original assertion on recheck | Automatic observation. Granular case closure requires its accepted policy; unresolved conditions remain open. |
| Accept risk, authorize release or change customer systems | Accountable human authority; these agents do not obtain that power from a report or handoff. |

Set acknowledgement/review due times and a fallback owner before activation. Proposed nonurgent review default: the next agreed business-day queue; the actual operating hours and service commitment must be accepted. Urgent native alerts never wait for a narrative reviewer. An overdue review or imminent obligation escalates through the configured route rather than becoming silent backlog.

Proposed routing distinguishes (a) logs for unchanged healthy observations and accepted conditions still within scope, (b) digests for meaningful nonurgent changes/due actions, and (c) immediate agreed routing for supported urgent failures or urgent evidence gaps. Uncertainty is recorded alongside urgency; it is not a reason to hide a potentially critical condition. Each priority states observed impact, declared business criticality, deadline, recurrence/age and evidence basis. No universal 0–100 score or unvalidated 30-day cutoff is adopted.

### Ownership and handoff

Related cases share an accountable maintenance owner while retaining specialist responsibilities. For a vendor retirement: M2 owns applicability/deadline; M3 owns integration-outcome evidence; M1 owns an active incident; M4 owns the change/acceptance packet. Resolving one does not automatically resolve the others. Correlation is a proposed link with evidence; it must not erase distinct causes or verification conditions.

A handoff carries: origin case/finding and agent; required decision; application/environment/revision and contract; supporting/conflicting/missing evidence; accountable/domain owners; priority/due time; next action; verification condition; linked cases. It can go to a person or an existing work system. Another Solvd agent need not be installed, and an inferred code change cannot automatically fan out into new browser or system actions.

### Execution and evidence boundary

- Enforce allowed tools, methods, targets, redirects, subresources, actions and budgets in code/credentials outside the model. Classify passive retrieval, browser interaction, synthetic write, execution and publication separately; a GET label or read credential is not proof of no effects.
- Treat pages, logs, support text, diffs, comments, notices and payloads as untrusted evidence. Content cannot grant permissions, change the contract or instruct the agent to add tools/destinations. Record attempted scope changes as rejected input, not task authority.
- Isolate untrusted repository/archive/HTML parsing and constrain archive size, traversal, resource use and outbound access. Approved static parsers are distinct from customer build/configuration execution.
- Minimize and validate model inputs. Prefer allowed fields/structured extracts; redact secrets/personal values before model access and retained evidence. Protective filters do not guarantee complete detection; unsupported or unreviewed data handling blocks that exposure. Preserve approved local assertions without leaking raw sensitive values into the report.
- Scope credentials per connector/customer; keep raw secrets out of context; audit tool calls and denials. Enforce tenant/environment access and artifact permissions. Model-provider retention and allowed data classes require a separate deployment decision.
- Make replay deliberate. Store action/attempt identity and reconcile unknown outcomes before retrying writes. Resuming a case must not repeat a synthetic transaction or report delivery by accident.

These boundaries implement the proposed behavior. A prompt or checkpoint feature alone does not implement them. Sources on task-focused tool returns and checkpoint/interrupt semantics remain in Appendix A10.

<a id="operating-limits"></a>

## Provisional limits and decision register

### Investigation caps

The following are **proposed initial guardrails**, not observed requirements or performance claims. They cover all model calls, including classifier/repair retries, and model-selected tool invocations for one case investigation. Automatic collectors have their own mandatory target/request/sample/concurrency/time limits in the scope contract. A collector's internal fan-out cannot bypass those limits.

| Agent | Maximum model calls | Maximum investigative tool calls | Investigation wall-clock cap | On exhaustion |
|---|---:|---:|---|---|
| M1 | 6 | 16 | 5 minutes | Save partial brief/questions; route urgent facts independently and hand off unresolved investigation. |
| M2 | 6 | 16 | 10 minutes | Keep unresolved applicability, notice/deadline and next missing evidence; do not clear a finding. |
| M3 | 6 | 16 | 10 minutes | Keep native attempts/outcomes and unknown execution/cleanup; do not silently retry or relax assertions. |
| M4 | 8 | 24 | 10 minutes | Preserve partial reviewed coverage or planning packet; mark outstanding readiness evidence. |
| M5 | 4 | 12 | 5 minutes | Keep measured cohort/policy result; mark diagnosis incomplete. Collection has a separate sampling budget. |
| M6 | 4 | 12 | 5 minutes | Keep barriers/incomplete/manual work; unresolved mappings or rechecks stay open. |
| M7 | 4 | 12 | 5 minutes | Preserve covered URLs and unanswered template question; missed pages remain not rechecked. |
| M8 | 5 | 16 | 10 minutes | Keep the event/state assertion matrix and receipt limits; no invented cause or clearance. |
| M9 | 5 | 16 | 10 minutes | Keep the requirement/evidence matrix and pending owner actions; no broad ready verdict. |

The configured case also requires a numeric monetary/token cap under the selected model/pricing; unset limits disable optional AI interpretation while retaining permitted deterministic results. Reserve capacity for a bounded partial report and stop initiating new work at the first applicable limit. These caps need calibration on representative cases and approval before expansion. Record actual spend, calls, elapsed collection/investigation/reviewer time, attempts and termination cause; do not infer future cost from the historical single dependency run.

Default concurrency policy: one investigator per case, with an explicit application-wide cap and a separate performance measurement lane. Queue/defer lower-priority work visibly. Expired queued observations are not current checks; collect again only under the accepted policy.

### Proposed evidence-retention profile

| Class | Starting policy for approval | Consequence |
|---|---|---|
| Unredacted sensitive payloads/traces or source secrets | Transient protected processing only; no durable/model exposure by default. | Keep approved minimized assertions/extracts; unsupported handling blocks collection/exposure. |
| Approved minimized run evidence | 30 days, unless a customer policy changes it. | Retain the reference, expiry and relevant non-sensitive results; expiration is visible. |
| Case/decision/run metadata | 180 days, subject to customer policy. | Keep owner decisions and history without retaining unnecessary raw personal data. |
| Active accepted baseline evidence | While active, then 30 days after replacement, subject to approved artifact policy. | A required expired baseline makes comparison unavailable until restored or re-established. |
| Supplied mobile binaries / large customer archives | Inspect transiently; retain digest and approved metadata or an authorized customer-store reference. | Persistent binary retention requires explicit purpose/access/expiry. |

These are proposed settings, not an active deletion job or regulatory assurance. A customer/model-provider policy may require stricter handling. Missing policy blocks customer-sensitive collection before it starts.

### Decision register

| Decision | Proposed default / unresolved choice | Decision owner | Needed before |
|---|---|---|---|
| Scope and expectations | Draft from evidence; activate only approved meaningful subset. | Application/domain owner | The affected check executes. |
| Tool/actions/network and model data | Code-enforced boundaries; finite caps and allowed data/provider policy. | Engineering + security/customer owner | Target interaction or model exposure. |
| Budget numbers and monetary/token cap | Seed caps above; numeric spend cap configured for selected model. | Engineering + service owner | AI investigation; tune after evidence. |
| Retention/access | Proposed class profile above, customer-specific approval. | Security/data/customer owner | Sensitive collection or retention. |
| Review/routing/acknowledgement | Routine fact versus reviewed interpretation; fallback and due times. | Service/application owner | Private delivery and recurring work. |
| Domain baselines, identity and rechecks | Named accepted baseline; explicit compatibility and granular closure. | Domain owner + responsible engineer | Recurring comparison or closure. |
| Performance sampling/statistics | Primary metric, sample floor/cap, materiality/noise and comparison design. | Performance owner | Regression verdict. |
| Mobile rule freshness | Pre-assessment source check and proposed weekly review for active obligations. | Release/catalog reviewer | Requirement-based readiness conclusion. |
| Optional connectors / formats | Add only to answer a supported role question; no forced VEX, new header or CI stack. | Domain owner + engineering | That capability is enabled. |

<a id="acceptance"></a>

## Behavioral acceptance cases

The examples below define expected behavior for the designs; no tests have been implemented or run by this document revision. Seed fixtures should include ordinary pass, real mismatch, partial/contradictory evidence, stale artifact, unavailable connector, injected instructions and retry/resume cases where relevant. Judge supported findings, consequential misses, false reassurance, useful next checks, scope adherence and retained history; free-text wording agreement is not the oracle.

| Agent | Seed case | Required result / forbidden shortcut |
|---|---|---|
| M1 | Healthy endpoint, overdue job completion, stale monitor source and related alert burst. | Preserve each observation; separate source-health gap from business outcome; bound/group investigations without hiding independent urgency. A ping alone cannot close an absent artifact. |
| M2 | Advisory with no patch, uncertain deployment and an owner exception; changed source conditions later arrive. | Keep owned no-fix work and uncertainty, retain exception scope/expiry and reopen on changed applicability. Missing evidence cannot become not-affected. |
| M3 | UI/webhook succeeds, downstream observation fails or is unavailable; first transaction times out. | Distinguish failed/blocked outcome and unknown execution, reconcile before retry, preserve cleanup/quarantine gaps. Do not edit expected success or resend blindly. |
| M4 | Planning-only request, then patch B with tests from A and an unapproved assertion. | Produce useful planning without demanding future release artifacts; Readiness marks stale/unapproved checks and missing migration/recovery evidence. No automatic approval. |
| M5 | Changed browser or noisy/bimodal runs, followed by a proposed degraded baseline. | Reject incompatible comparison, retain inconclusive noise and require an explicit new-baseline decision. No best-run selection, universal sample sufficiency or field-effect claim. |
| M6 | Name barrier fixed, focus barrier blocked, DOM/component redesigned. | Resolve only verified granular condition; preserve blocked/manual work and uncertain identity mapping. Do not close by lower count or vanished selector. |
| M7 | Partial rerun omits a prior issue; expected orphan URL and intentional exclusion exist. | Keep omitted finding not rechecked, represent expected-page coverage and preserve approved exclusion. No visibility loss inferred from crawl alone. |
| M8 | Two events per batch/retry, allowed rejected-state ping, parser change and hidden server route. | Count under accepted logical identity, preserve parser comparability and receipt limits, redact before AI. Do not call every request illegal or browser-only success end-to-end. |
| M9 | Conflicting source/artifact, stale rule and unread console section; iOS declaration evidence absent. | Keep affected requirement pending/mismatched with owner action; separate evidence classes and rule freshness. No ready verdict from an empty error list, manifest or source setting alone. |

Use a small representative seed set and grow it with material reviewer corrections and missed cases; no fixed “10–20 cases” count establishes quality. Before any deployment claim, set the applicable pass criteria and test incomplete/adversarial behavior. Unsupported clearances/closure or unauthorized actions fail the relevant acceptance case even if the prose is persuasive. Report reviewer overrides/time, accepted useful actions, duplicate notifications, blocked setup, cost and latency separately; low alert volume alone is not success.

<a id="research"></a>

## Appendix A — implementation comparisons and source analysis

This is the evidence behind the design, not a commitment to adopt a project verbatim. **Implemented workflow** denotes inspected control/state/tool code; **deterministic pipeline** does not require an LLM; **prompt/MCP** denotes host instructions or callable capabilities; **product documentation** describes observable first-party behavior with uninspected internals. Representative approaches were selected for distinct mechanisms, not repository-count targets. Pinned code behavior may differ from published releases. Tests were read, not executed, and no comparative accuracy, savings or production readiness was established.

<a id="research-1"></a>

### A1. Reliability & Incident Triage

| Implementation and evidence type | Inputs → workflow → outputs | Design contribution and limit |
| --- | --- | --- |
| **HolmesGPT: implemented tool-using investigation workflow.** | Alert/question and available context → assemble investigation prompts → model chooses configured tools, reads results and requests further evidence until completion or step limit → diagnosis narrative and tool-result trace. The entry invokes the shared tool-calling engine; its loop disables tools on the final step. [Entry](https://github.com/HolmesGPT/holmesgpt/blob/49804bde566633d4e945952e01c6bf99df6df7ab/holmes/main.py#L163-L189), [bounded loop](https://github.com/HolmesGPT/holmesgpt/blob/49804bde566633d4e945952e01c6bf99df6df7ab/holmes/core/tool_calling_llm.py#L1266-L1305). | An investigator can adapt its next question to the evidence rather than summarize a fixed alert bundle. The configured toolset determines coverage; this does not establish an application's important outcomes, an accountable owner, or verified incident closure. |
| **Robusta: implemented event/playbook/enrichment workflow; AI is optional.** | Incoming event and matching playbook → invoke registered actions → accumulate findings/enrichments → deliver to configured sinks; synchronous responses serialize findings and evidence. [Finding response](https://github.com/robusta-dev/robusta/blob/ebb6267546b94e7578e51f8191113f2376d9fc7a/src/robusta/core/playbooks/playbooks_event_handler_impl.py#L90-L131), [actions and routing](https://github.com/robusta-dev/robusta/blob/ebb6267546b94e7578e51f8191113f2376d9fc7a/src/robusta/core/playbooks/playbooks_event_handler_impl.py#L230-L332). | Repeatable event-specific enrichment can precede interpretation. Its Kubernetes-oriented event/actions environment does not constitute a general small-application maintenance case workflow; some actions and sinks perform writes. |
| **OneUptime AI SRE: implemented incident-triggered investigation and case-delivery workflow.** | Eligible incident → queued investigation → project-scoped observability assistant → structured confidence/evidence evaluation → analysis posted to the incident timeline. [Queue](https://github.com/OneUptime/oneuptime/blob/a94f9f81b31a9b5d29891be505f6d1aa16d8a5b3/packages/Common/Server/Utils/AI/SRE/IncidentInvestigationRunner.ts#L225-L313), [result evaluation/delivery](https://github.com/OneUptime/oneuptime/blob/a94f9f81b31a9b5d29891be505f6d1aa16d8a5b3/packages/Common/Server/Utils/AI/SRE/AIInvestigationEngine.ts#L901-L980). | Extends investigation into durable case delivery and a structured decision separate from prose. A citation floor is not factual verification; optional code-fix lanes exceed M1. Read-only/security claims in product docs were not treated as a runtime certification. |
| **Healthchecks: complete deterministic heartbeat workflow, not an AI investigator.** | Configured schedule/time zone, grace and start/success/failure pings → calculate next expected completion and running duration → persist status transitions and ping history → alert or recovery notification. Start pings do not replace last completion. [Schedule/state calculation](https://github.com/healthchecks/healthchecks/blob/f6c46b594dec66c92bca7dd56db58fbd1e4ce9fe/hc/api/models.py#L300-L380), [ping transitions](https://github.com/healthchecks/healthchecks/blob/f6c46b594dec66c92bca7dd56db58fbd1e4ce9fe/hc/api/models.py#L493-L565). | Models missing work, late work and explicit failure, unlike a reachable endpoint. A completion ping proves only the condition the application wired it to; it cannot independently prove a correct exported file, delivered email or restored backup. |
| **Gatus: complete deterministic probe/history/alert workflow, not an AI investigator.** | Configured endpoint and conditions → periodic health evaluation → store result → trigger/resolve alerts subject to maintenance windows and thresholds. TLS certificates provide expiration observations; optional RDAP lookup supplies available domain-expiry data. [Probe loop and persistence](https://github.com/TwiN/gatus/blob/d255d0cd4d69ce818574cfdb3a7e82407e6559d7/watchdog/endpoint.go#L15-L78), [TLS](https://github.com/TwiN/gatus/blob/d255d0cd4d69ce818574cfdb3a7e82407e6559d7/config/endpoint/endpoint.go#L450-L480), [RDAP failure behavior](https://github.com/TwiN/gatus/blob/d255d0cd4d69ce818574cfdb3a7e82407e6559d7/client/client.go#L545-L566). | Gives the incident investigator concrete dated observations and independent native routing. Probe success is limited to configured assertions; RDAP can lack an expiration event and does not establish renewal/payment arrangements. |

These approaches answer different questions. Gatus asks whether a declared external condition currently holds; Healthchecks asks whether an expected signal arrived on time; Robusta attaches known useful context to an event; Holmes selects additional queries. Solvd's role should connect those observations to an application function and a decision. Copying an investigator alone would omit missed-job detection; copying a detector alone would omit the investigation.

OneUptime adds a useful distinction between a report and a downstream decision. Its confidence code stops a no-evidence result before invoking a classifier, parses a structured disposition, and applies different failure policies to notifying a human and permitting automatic code-fix work. Solvd can preserve human notification while withholding an unsupported conclusion. Its instructions also ask for recurrence checks; that is requested behavior, not enforcement. Default limits are 100 model calls, 300 tool calls and no wall-clock ceiling unless configured, a counterexample to copy cautiously: Solvd should set explicit role-specific budgets and retain a partial result. [Evidence gate and consumer policies](https://github.com/OneUptime/oneuptime/blob/a94f9f81b31a9b5d29891be505f6d1aa16d8a5b3/packages/Common/Server/Utils/AI/SRE/ConfidenceSignal.ts#L153-L327), [defaults](https://github.com/OneUptime/oneuptime/blob/a94f9f81b31a9b5d29891be505f6d1aa16d8a5b3/packages/Common/Types/AI/AIAgentRunLimits.ts#L1-L45). [OneUptime confidence tests](https://github.com/OneUptime/oneuptime/blob/a94f9f81b31a9b5d29891be505f6d1aa16d8a5b3/packages/Common/Tests/Server/Utils/AI/AIConfidenceSignal.test.ts#L51-L165) exercise its evidence floor and classification behavior.

Holmes retains previous tool calls and checks repeated queries before invocation. That supports a bounded “what new evidence would distinguish these explanations?” loop, rather than unlimited retries. Its registered toolsets are an implementation boundary, not proof that every enabled tool is read-only. [Repeated-call handling](https://github.com/HolmesGPT/holmesgpt/blob/49804bde566633d4e945952e01c6bf99df6df7ab/holmes/core/tool_calling_llm.py#L993-L1060), [tool registration](https://github.com/HolmesGPT/holmesgpt/blob/49804bde566633d4e945952e01c6bf99df6df7ab/holmes/core/tools_utils/tool_executor.py#L60-L107).

The inspected Holmes checkout-latency fixture requires a specific explanation about promo-code requests, not merely a related query. Healthchecks tests cover delayed/running state behavior, while Gatus condition tests include certificate-duration comparisons and missing certificate values. These are useful examples of testing the substance and boundary of an observation; no pass rate or diagnostic accuracy was measured here. [Holmes fixture](https://github.com/HolmesGPT/holmesgpt/blob/49804bde566633d4e945952e01c6bf99df6df7ab/tests/llm/fixtures/test_ask_holmes/124_checkout_latency_prometheus/test_case.yaml#L1-L12), [Healthchecks notification tests](https://github.com/healthchecks/healthchecks/blob/f6c46b594dec66c92bca7dd56db58fbd1e4ce9fe/hc/api/tests/test_sendalerts.py#L1-L120), [Gatus certificate cases](https://github.com/TwiN/gatus/blob/d255d0cd4d69ce818574cfdb3a7e82407e6559d7/config/endpoint/condition_test.go#L499-L536).

#### Related evidence and scope notes

K8sGPT was assessed but adds a narrower Kubernetes analyzer → optional explanation approach: its CronJob analyzer checks suspension, cron syntax and starting deadlines, not actual job output or a missed completion heartbeat. It is useful contextual input where relevant, not another general investigator. [Analyzer](https://github.com/k8sgpt-ai/k8sgpt/blob/d77b5357a309a26abd9055fdd768b284f657313c/pkg/analyzer/cronjob.go#L29-L136). Broad incident-agent repository searches surfaced additional agents, but they were not promoted on README claims when the selected approaches already supplied distinct inspectable mechanics.


<a id="research-2"></a>

### A2. Security & Lifecycle Review

| Implementation and evidence type | Inputs → workflow → outputs | Design contribution and limit |
| --- | --- | --- |
| **NVIDIA vulnerability-analysis: implemented agentic investigation pipeline.** | Image/filesystem and requested vulnerabilities → parallel CVE research plus container analysis → exploitability investigation → VEX categorization → per-vulnerability reports, statuses and overall result. Graph edges route unusable prerequisite stages to fail-safe output. [Graph](https://github.com/NVIDIA-AI-Blueprints/vulnerability-analysis/blob/a246a9a8804ec731e0d1cfd3ab0a3cc1a152083d/src/vuln_analysis/pipeline/workflow.py#L219-L255), [parallel stage](https://github.com/NVIDIA-AI-Blueprints/vulnerability-analysis/blob/a246a9a8804ec731e0d1cfd3ab0a3cc1a152083d/src/vuln_analysis/pipeline/stage1.py#L236-L287). | Investigates whether a notice matters to a concrete supplied environment rather than merely repeating a severity. Scope is container vulnerability analysis; it does not cover general vendor retirements, customer feature ownership or upgrade acceptance. |
| **Dependency-Track: implemented persistent deterministic analysis and human-triage workflow.** | Project/SBOM → prepare applicable analyzers → run and reconcile results → persistent component/vulnerability finding → human analysis decision, justification and audit trail. No analyzers/components is a skip; all analyzers failing throws failure. [Analysis workflow](https://github.com/DependencyTrack/dependency-track/blob/e1e3c8f0189bd445a0f09cc90d211afd2a681d8f/apiserver/src/main/java/org/dependencytrack/vulnanalysis/VulnAnalysisWorkflow.java#L65-L109), [decision API](https://github.com/DependencyTrack/dependency-track/blob/e1e3c8f0189bd445a0f09cc90d211afd2a681d8f/apiserver/src/main/java/org/dependencytrack/resources/v1/AnalysisResource.java#L154-L222). | Separates detection from an auditable determination such as in-triage or not-affected. A source/SBOM match still does not prove deployment, exploitability or feature impact; lifecycle obligations need additional evidence. |
| **Renovate: implemented deterministic dependency-update lifecycle, not an LLM agent.** | Repository/config and vulnerability notices → initialize → extract dependencies → calculate updates/branches → update or onboard → retain branch cache/dashboard and finalize. Security notices become package rules with fixed-version/severity context. [Repository lifecycle](https://github.com/renovatebot/renovate/blob/16a786a3ecef4f9a0c035331343c6f20e242d0be/lib/workers/repository/index.ts#L121-L178), [notice handling](https://github.com/renovatebot/renovate/blob/16a786a3ecef4f9a0c035331343c6f20e242d0be/lib/workers/repository/init/vulnerability.ts#L70-L172). | Shows the useful transition from detection into a durable, bounded maintenance task and repeat handling. Its default workflow can change repositories, beyond M2's review role. Notices with no first patched version are skipped in this path, so this cannot be Solvd's complete decision inbox. |
| **Firebase Dynamic Links migration workflow: first-party product-documented behavior; not an agent implementation.** | Identify use cases/platforms → distinguish affected mobile/authentication and link behavior → select migration path → update relevant SDK/hosting/domain configuration → replace published links and verify behavior. [Official FAQ](https://firebase.google.com/support/dynamic-links-faq), [migration procedure](https://firebase.google.com/support/guides/app-links-universal-links). | Adds a lifecycle design that package scanners cannot express: SDK version, client population, configuration and affected function change the action. Published migration instructions are observable; no vendor's internal agent was inspected. |

The NVIDIA implementation is especially useful for **failure semantics**. The researcher tracks model/tool activity and returns marked best-effort output on budget or recursion exhaustion. Exploitability analysis validates a report against pre-triage evidence, allows bounded repair, records rejected attempts and validates the final promoted report again. These are implemented stages; semantic correctness still depends on evidence and model behavior. [Budget/result handling](https://github.com/NVIDIA-AI-Blueprints/vulnerability-analysis/blob/a246a9a8804ec731e0d1cfd3ab0a3cc1a152083d/src/vuln_analysis/plugins/cve_researcher/agent.py#L395-L521), [pre-triage and repair](https://github.com/NVIDIA-AI-Blueprints/vulnerability-analysis/blob/a246a9a8804ec731e0d1cfd3ab0a3cc1a152083d/src/vuln_analysis/functions/exploitability_analyzer.py#L205-L408). Its tests explicitly keep a skipped vulnerability unknown in a mixed batch and prevent top-level success masking an individual failure. [Cases](https://github.com/NVIDIA-AI-Blueprints/vulnerability-analysis/blob/a246a9a8804ec731e0d1cfd3ab0a3cc1a152083d/tests/pipeline/test_fail_safe.py#L193-L277).

Dependency-Track's distinct contribution is the record of the decision, not another narrative. Its documentation distinguishes a false positive from a real vulnerability that does not affect this project and records who changed the analysis state and when. The inspected API tests include state, justification, response and comments. [States/history](https://docs.dependencytrack.org/triage/analysis-states/), [API test](https://github.com/DependencyTrack/dependency-track/blob/e1e3c8f0189bd445a0f09cc90d211afd2a681d8f/apiserver/src/test/java/org/dependencytrack/resources/v1/AnalysisResourceTest.java#L78-L124).

Runtime support needs its own dated evidence. Renovate's endoflife-date source fetches release data and turns EOL/discontinued dates into a deprecation flag; that representation omits the original future deadline in the transformed release. Our role should retain the dated obligation and authoritative source, not only a boolean. [Fetch](https://github.com/renovatebot/renovate/blob/16a786a3ecef4f9a0c035331343c6f20e242d0be/lib/modules/datasource/endoflife-date/index.ts#L26-L56), [transformation](https://github.com/renovatebot/renovate/blob/16a786a3ecef4f9a0c035331343c6f20e242d0be/lib/modules/datasource/endoflife-date/schema.ts#L7-L34). Official Node.js release/support schedules are an example of a source to verify per observed runtime line; this research does not infer any customer's runtime from a repository declaration. [Node.js release policy](https://nodejs.org/en/about/previous-releases).

#### Related evidence and scope notes

For supplied OpenAPI versions, oasdiff is a deterministic comparator rather than a complete security or lifecycle agent: it evaluates breaking-change rules and can locate removed operations. Its operation-removal tests exercise that behavior. This can substantiate an M2 applicability question and an M4 acceptance check, but does not establish which integration uses the operation. [Checker](https://github.com/oasdiff/oasdiff/blob/a4ba100f880c7579765c5e63915a99bf1acc6967/checker/checker.go#L10-L64), [removed-operation test](https://github.com/oasdiff/oasdiff/blob/a4ba100f880c7579765c5e63915a99bf1acc6967/checker/check_api_removed_test.go#L14-L95).

OSV-Scanner was already inspected as a package-extraction/advisory pipeline, but is supporting evidence rather than the agent design itself. Dependabot-core was discovered and its operation families checked in code search; it was not deeply re-reviewed because Renovate already supplies the distinct implemented update lifecycle here. Neither exclusion implies lower quality. Offensive exploitation agents are outside this read-only applicability/maintenance contract; an exploit demonstration is not required to produce the approved decision list.


<a id="research-3"></a>

### A3. Functional & Integration QA

| Implementation and evidence type | Inputs → workflow → outputs | Design contribution and limit |
| --- | --- | --- |
| **Playwright planner/generator/healer** — prompt instructions plus implemented test/MCP infrastructure | A request, seed test and optional requirements → planner initializes and explores, writes scenarios with expected outcomes; generator performs each step/verification using tools, reads the log and writes a test; healer runs, pauses on failure, investigates and edits/retries → Markdown plan, executable specs, amended or skipped test. [Planner](https://github.com/microsoft/playwright/blob/a169686c61af856cd1434b4994ef9c3222ee1041/packages/playwright/src/agents/playwright-test-planner.agent.md), [generator](https://github.com/microsoft/playwright/blob/a169686c61af856cd1434b4994ef9c3222ee1041/packages/playwright/src/agents/playwright-test-generator.agent.md), [healer](https://github.com/microsoft/playwright/blob/a169686c61af856cd1434b4994ef9c3222ee1041/packages/playwright/src/agents/playwright-test-healer.agent.md), [generator tests](https://github.com/microsoft/playwright/blob/a169686c61af856cd1434b4994ef9c3222ee1041/tests/mcp/generator.spec.ts). | Separates exploration, executable specification and failure investigation, with inspectable intermediate artifacts. These are host-driven instructions, not an autonomous service with durable cases. The healer can change expected values and mark persistent failures `fixme`; a maintenance agent must not adopt “make it pass” as its outcome policy. |
| **Midscene Test + Agent** — implemented model-driven UI workflow with deterministic execution kernel | YAML cases invoke registered AI/platform/custom nodes → `aiAct` attempts cached actions or plans/replans; independent `aiAssert` asks a boolean model about the visible context; node execution validates outputs, records failure/not-run and collects report traces → case/step result and agent evidence. [Agent](https://github.com/web-infra-dev/midscene/blob/22284cefea8fa82d588bbbdfc10e670a891479dc/packages/core/src/agent/agent.ts#L1244-L1459), [assertion](https://github.com/web-infra-dev/midscene/blob/22284cefea8fa82d588bbbdfc10e670a891479dc/packages/core/src/agent/insight.ts#L19-L22), [node schemas](https://github.com/web-infra-dev/midscene/blob/22284cefea8fa82d588bbbdfc10e670a891479dc/packages/core/src/agent/test-runner-nodes.ts), [execution](https://github.com/web-infra-dev/midscene/blob/22284cefea8fa82d588bbbdfc10e670a891479dc/packages/core/src/test-runner/engine/execute-step.ts), [failure tests](https://github.com/web-infra-dev/midscene/blob/22284cefea8fa82d588bbbdfc10e670a891479dc/packages/core/tests/unit-test/runner-execution-failure.test.ts). | Demonstrates adaptive UI action alongside explicit expectations and extensible business operations. Assertion defaults use screenshots, not DOM, and the verdict is still model judgment. Completing navigation or returning an AI “pass” does not prove a database, queue or webhook outcome; those need explicit independent observations. |
| **Upright** — deterministic scheduled-probe application | Implemented probe and recurring job → fresh job runs check with time bound, records result/artifacts, retries an unsuccessful result once; jobs over 5 minutes old are discarded → stored result, duration, traces/video/logs and metrics. [Job](https://github.com/basecamp/upright/blob/a40363fe71c2f1887be444b8864478d083220365/app/jobs/upright/probe_check_job.rb), [recording](https://github.com/basecamp/upright/blob/a40363fe71c2f1887be444b8864478d083220365/app/models/concerns/upright/probeable.rb), [browser probe](https://github.com/basecamp/upright/blob/a40363fe71c2f1887be444b8864478d083220365/app/models/upright/probes/playwright/base.rb), [job tests](https://github.com/basecamp/upright/blob/a40363fe71c2f1887be444b8864478d083220365/test/jobs/probe_check_job_test.rb). | Adds a useful operational lifecycle: freshness, bounded retry and retained evidence. It requires authored probes; the [generated browser probe](https://github.com/basecamp/upright/blob/a40363fe71c2f1887be444b8864478d083220365/lib/generators/upright/playwright_probe/templates/probe.rb.tt#L1-L12) is a stub. Binary success/failure does not express missing credentials, product versus test defects or unobserved downstream effects. It is a service reference, not an AI test investigator. |
| **Checkly Playwright reporter demo** — deterministic executable example plus hosted-monitoring integration | Existing tagged Playwright suites → selected groups become scheduled monitoring definitions; sandbox checkout tests reset inventory, create an order and read it back → browser/API/downstream assertions, runner artifacts and configured reporting. [Checkout](https://github.com/checkly/playwright-reporter-demo/blob/3c6bbead32723121bd4a989d4dc0d199249decc6/tests/checkout.spec.ts), [suite configuration](https://github.com/checkly/playwright-reporter-demo/blob/3c6bbead32723121bd4a989d4dc0d199249decc6/checkly.config.ts), [runner](https://github.com/checkly/playwright-reporter-demo/blob/3c6bbead32723121bd4a989d4dc0d199249decc6/playwright.config.ts). | Concrete demonstration that checking the business effect is stronger than checking a success screen. Separates selected monitoring groups from stateful tests. The demo's schedule/upload belongs to a configured vendor account; tags do not authorize writes. The code does not implement AI triage or automatic safe test maintenance. |

These designs expose three different decisions we should preserve. Playwright makes a human-readable expectation a first-class artifact before code; Midscene separates taking an action from asking whether its visible result occurred; Checkly's checkout example asserts the actual stored effect. Our synthesis is to keep **intent, execution and evidence of completion** separate. An adaptive browser may help locate a control, but the accepted assertion must say what business outcome establishes success and how it is independently observed. [Playwright generator](https://github.com/microsoft/playwright/blob/a169686c61af856cd1434b4994ef9c3222ee1041/packages/playwright/src/agents/playwright-test-generator.agent.md), [Midscene assertion](https://github.com/web-infra-dev/midscene/blob/22284cefea8fa82d588bbbdfc10e670a891479dc/packages/core/src/agent/insight.ts#L19-L22), [checkout readback](https://github.com/checkly/playwright-reporter-demo/blob/3c6bbead32723121bd4a989d4dc0d199249decc6/tests/checkout.spec.ts).

Execution history also matters. Playwright's native reporter preserves attempts/errors/attachments and its retry test deliberately classifies fail-then-pass as flaky. Upright discards stale queued checks rather than treating them as current. Midscene explicitly preserves report-collection errors and marks resource admission failures not-run. These influence our result model: a later passing attempt cannot delete the initial failure; an expired login or absent readback remains blocked coverage, and an artifact failure is a separate evidence limitation. [Reporter](https://github.com/microsoft/playwright/blob/a169686c61af856cd1434b4994ef9c3222ee1041/packages/playwright/src/reporters/json.ts#L186-L231), [retry test](https://github.com/microsoft/playwright/blob/a169686c61af856cd1434b4994ef9c3222ee1041/tests/playwright-test/retry.spec.ts#L19-L38), [Upright job](https://github.com/basecamp/upright/blob/a40363fe71c2f1887be444b8864478d083220365/app/jobs/upright/probe_check_job.rb), [Midscene execution](https://github.com/web-infra-dev/midscene/blob/22284cefea8fa82d588bbbdfc10e670a891479dc/packages/core/src/test-runner/engine/execute-step.ts).

#### Related evidence and scope notes

General browser-agent products such as browser-use/Stagehand were discovery leads, but are not recommended here as substitute QA contracts; this report did not audit their full test-oracle behavior. Their exclusion is scope, not a quality verdict. N-iX/APEX is a documented offering in the current contract, without inspected implementation sufficient to derive internals. No efficacy or tool ranking follows from these exclusions.


<a id="research-4"></a>

### A4. Change & Release Review

| Implementation and evidence type | Inputs → workflow → outputs | Design contribution and limit |
| --- | --- | --- |
| **PR-Agent: implemented model-assisted PR review workflow.** | Provider/diff and optional context → fit prompt and diff budget → review/chunk/fallback → validate structured review → render artifact/publish according to mode. Outputs include unreviewed/partially reviewed file coverage. [Preparation](https://github.com/The-PR-Agent/pr-agent/blob/dff634a9ed1832970f6322ff5e0b6236934a0ba4/pr_agent/tools/pr_reviewer.py#L914-L985), [structured output](https://github.com/The-PR-Agent/pr-agent/blob/dff634a9ed1832970f6322ff5e0b6236934a0ba4/pr_agent/tools/pr_reviewer.py#L1337-L1383). | Useful diff/context budgeting and located review artifacts. A comment or model verdict does not establish the maintenance need, sufficient regression checks, release approval or recoverability. |
| **Kodus: implemented tool-using review pipeline.** | PR/config/context and head-bound CI evidence → sandbox/analyzer stages → bounded investigative agents → normalize/filter/deduplicate findings → comments/summary and optional approval action. [Pipeline stages](https://github.com/kodustech/kodus-ai/blob/dbc718c628367e1a259f4e8f270a5aa9d5ea72a4/libs/code-review/pipeline/strategy/code-review-pipeline.strategy.ts#L72-L110), [investigator dispatch/limits](https://github.com/kodustech/kodus-ai/blob/dbc718c628367e1a259f4e8f270a5aa9d5ea72a4/libs/code-review/infrastructure/agents/review-orchestrator.service.ts#L342-L507). | A materially different design from a prepared diff prompt: agents can seek code context, and incomplete runs remain observable. Its executable/analyzer and publishing powers exceed M4; they are not needed to learn the review mechanism. |
| **Code-Maat: implemented deterministic Git-history analysis pipeline, not an agent.** | Supplied VCS log → parse → optional architecture/time grouping → selected churn/coupling analysis → dataset/CSV. Logical coupling computes co-change frequency relative to revisions. [Pipeline and analyses](https://github.com/adamtornhill/code-maat/blob/50537abb8dffa1b1ba4e91a605ee5c558c01b224/src/code_maat/app/app.clj#L40-L73), [coupling calculation](https://github.com/adamtornhill/code-maat/blob/50537abb8dffa1b1ba4e91a605ee5c558c01b224/src/code_maat/analysis/logical_coupling.clj#L24-L50). | Makes “relevant history” reproducible and locatable. Churn/co-change are attention cues, not defect probability, architecture-rule violations or business severity; log window and commit practices affect interpretation. |
| **CodeScene delta review: product-documented behavior; proprietary internals unavailable.** | PR/commit range and existing baseline/goals → compare code-health trend and hotspot goals, flag changed patterns → quality-gate/review information. Versioned docs distinguish full and hotspot-only scans. [Documented workflow](https://docs.enterprise.codescene.io/versions/7.0.10/guides/delta/automated-delta-analyses.html). | Adds accepted goals and changed-versus-baseline analysis to raw metrics. It is an observable design reference, not source-verified internals or evidence that Solvd should use its risk score or reduce human review. |
| **Argo Rollouts analysis: implemented deterministic progressive-delivery decision workflow, not an AI reviewer.** | Declared metrics/conditions and measurements → schedule/reconcile analysis → retain successful/failed/inconclusive/error measurements → apply configured rollout decisions. Rollback windows can skip repeated steps/analysis for recent revisions. [Controller](https://github.com/argoproj/argo-rollouts/blob/6e9f105c1b506c2862806c49838397bd5477f120/analysis/analysis.go#L312-L416), [evaluation](https://github.com/argoproj/argo-rollouts/blob/6e9f105c1b506c2862806c49838397bd5477f120/utils/evaluate/evaluate.go#L18-L57), [rollback semantics](https://github.com/argoproj/argo-rollouts/blob/6e9f105c1b506c2862806c49838397bd5477f120/docs/features/rollback.md#L1-L24). | Shows concrete evidence and state behind release verification, unlike PR narration. M4 reads supplied evidence and asks about recovery; it does not operate a rollout controller or equate a rollback setting with tested recovery. |

PR-Agent records omitted and partial files, and may retain successful chunks after other model attempts fail. Solvd should expose that incompleteness beside the readiness result; a fluent overall review is insufficient. Its no-publication path yields an artifact, while external sinks are delivered earlier in the workflow, so disabling one publication flag does not establish a complete output boundary. [Partial failure and delivery](https://github.com/The-PR-Agent/pr-agent/blob/dff634a9ed1832970f6322ff5e0b6236934a0ba4/pr_agent/tools/pr_reviewer.py#L364-L402). Inspected local-provider/CLI tests exercise JSON output, not release-readiness accuracy. [Local output tests](https://github.com/The-PR-Agent/pr-agent/blob/dff634a9ed1832970f6322ff5e0b6236934a0ba4/tests/unittest/test_plain_diff_provider.py#L225-L256).

Kodus' optional CI-evidence stage explicitly requests checks for the PR head SHA; failure or absent evidence leaves the context without that evidence. Its orchestrator records step-limited and unverifiable runs instead of treating silence as a complete clean review. These mechanics inform our provenance/coverage requirements; they do not prove that a particular review found every defect. [Head-bound checks](https://github.com/kodustech/kodus-ai/blob/dbc718c628367e1a259f4e8f270a5aa9d5ea72a4/libs/code-review/pipeline/stages/load-ci-evidence.stage.ts#L39-L101), [incomplete results](https://github.com/kodustech/kodus-ai/blob/dbc718c628367e1a259f4e8f270a5aa9d5ea72a4/libs/code-review/infrastructure/agents/review-orchestrator.service.ts#L443-L507), [CI-evidence tests](https://github.com/kodustech/kodus-ai/blob/dbc718c628367e1a259f4e8f270a5aa9d5ea72a4/libs/code-review/pipeline/stages/load-ci-evidence.stage.spec.ts#L1-L145).

Code-Maat's coupling tests provide small, explicit co-change examples; Argo's tests distinguish failed, inconclusive and evaluation-error results. Argo also treats absent success/failure expressions as success in one default branch. Solvd should borrow distinct evidence states but require explicit agreed checks, not copy an empty-condition default into readiness. [Coupling tests](https://github.com/adamtornhill/code-maat/blob/50537abb8dffa1b1ba4e91a605ee5c558c01b224/test/code_maat/analysis/logical_coupling_test.clj#L1-L59), [evaluation tests](https://github.com/argoproj/argo-rollouts/blob/6e9f105c1b506c2862806c49838397bd5477f120/utils/evaluate/evaluate_test.go#L29-L104).

#### Related evidence and scope notes

gh-aw and githubnext/agentics were already inspected. Their output separation and bounded reviewer workflows are useful controls, but they do not add a distinct maintenance/readiness methodology here; prompt instructions to review thoroughly are not implementation proof of verification. [Output boundary](https://github.com/github/gh-aw/blob/0627fdbe4beb5f3b71aa569f8d97150b87f2111a/pkg/workflow/compiler_safe_outputs_job.go#L114-L227), [reviewer template](https://github.com/githubnext/agentics/blob/139fa09ef17cde4135e696ff8e7af09bc5ddfa6e/workflows/grumpy-reviewer.md#L57-L132). General coding/auto-fix agents were not expanded because implementation and release execution are outside this role. Argo is included only to study concrete release evidence/state, not to impose Kubernetes.


<a id="research-5"></a>

### A5. Performance Regression

| Implementation and evidence type | Inputs → workflow → outputs | Design contribution and limit |
| --- | --- | --- |
| **Chrome DevTools LCP skill + performance tools** — prompt instructions plus implemented MCP tools | Target page → instruction-led reload trace, inspect LCP subparts/insights, identify element, examine request waterfall/HTML, recommend change and re-trace → raw trace, insights and before/after diagnosis. Tool supports manual start/stop for interactions, exclusive recording and trace-file output. [LCP skill](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/63170b11a2fa74d5ceea757194d7b25f3e145f68/skills/debug-optimize-lcp/SKILL.md), [tools](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/63170b11a2fa74d5ceea757194d7b25f3e145f68/src/tools/performance.ts), [tests](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/63170b11a2fa74d5ceea757194d7b25f3e145f68/tests/tools/performance.test.ts). | Strong example of an evidence-driven investigation loop rather than “run Lighthouse and summarize.” The skill is LCP-focused and lacks repeated sampling, accepted baselines and durable regression state. Its re-trace is a diagnostic recheck, not proof of causal or field improvement. |
| **Cloudflare web-perf skill** — prompt instructions | URL and available tooling → discover capabilities, trace, inspect vitals/CLS/network, then source where available → prioritized measured issues and concrete recommendations, with unavailable measurements stated. [Skill](https://github.com/cloudflare/skills/blob/49a31e0b3229ccdffe4944be9c61bc7481d1d432/skills/web-perf/SKILL.md). | Broadens analysis across network and source and says to verify recommendations. It does not implement a scheduler, statistical comparison or persistence. Its suggestion to remove an unused preconnect after one observed session needs our cross-state caution; one state does not establish global non-use. |
| **Lighthouse CI** — deterministic collection/assertion/history pipeline | URL/config and versioned build → repeated navigation collection, save each LHR, evaluate configured aggregates/assertions, store reports/build metadata → raw samples, budget results and historical build records. [Collector](https://github.com/GoogleChrome/lighthouse-ci/blob/85d33432a9149033b62c69f11c6fe6da0e12e679/packages/cli/src/collect/collect.js), [assertions](https://github.com/GoogleChrome/lighthouse-ci/blob/85d33432a9149033b62c69f11c6fe6da0e12e679/packages/utils/src/assertions.js#L81-L98), [upload](https://github.com/GoogleChrome/lighthouse-ci/blob/85d33432a9149033b62c69f11c6fe6da0e12e679/packages/cli/src/upload/upload.js#L410-L458), [collection tests](https://github.com/GoogleChrome/lighthouse-ci/blob/85d33432a9149033b62c69f11c6fe6da0e12e679/packages/cli/test/collect.test.js). | Supplies repeatable measurement and storage that the skills lack. Assertions [default to optimistic aggregation](https://github.com/GoogleChrome/lighthouse-ci/blob/85d33432a9149033b62c69f11c6fe6da0e12e679/packages/utils/src/assertions.js#L164-L170), so multiple runs do not imply median comparison. A [representative report](https://github.com/GoogleChrome/lighthouse-ci/blob/85d33432a9149033b62c69f11c6fe6da0e12e679/packages/utils/src/representative-runs.js#L17-L64) is selected by FCP/interactive proximity, not necessarily median LCP. Navigation collection does not measure arbitrary interaction INP. |
| **sitespeed.io** — deterministic scripted measurement/diagnostic/comparison pipeline | Controlled browser scripts, iteration/profile settings and saved baseline → single/multistep measurements; optional separate diagnostic profile; compare common metric arrays → raw values, medians/spread, statistical tests, effect size and estimated shift. [Analyzer](https://github.com/sitespeedio/sitespeed.io/blob/2371e74c55aeeb9179de941a940a8bfdadc02bf2/lib/plugins/browsertime/analyzer.js), [comparison](https://github.com/sitespeedio/sitespeed.io/blob/2371e74c55aeeb9179de941a940a8bfdadc02bf2/lib/plugins/compare/index.js), [statistics tests](https://github.com/sitespeedio/sitespeed.io/blob/2371e74c55aeeb9179de941a940a8bfdadc02bf2/test/compareTests.js), [interaction example](https://github.com/sitespeedio/sitespeed.io/blob/2371e74c55aeeb9179de941a940a8bfdadc02bf2/docs/documentation/sitespeed.io/scripting/examples/index.md#L52-L80). | Adds named interaction measurement and explicit distributions rather than one score. Diagnostic profiling is separated from normal iterations. Missing metrics are skipped; sample mismatch is a warning; baseline identity does not encode every environment condition. Our agent must make those limits visible and refuse unsupported comparison. |

The missing behavior is the decision loop connecting these pieces: **is the observed change comparable and worth investigation; what trace question would discriminate among explanations; what evidence would resolve the case?** The skills illustrate investigation order and grounded recommendations; LHCI/sitespeed illustrate repeated collection/history. No inspected source establishes a generally reliable autonomous performance-regression agent spanning all those duties.

There are concrete tool semantics to preserve. DevTools reload tracing navigates through `about:blank`; cache bypass is optional, and automatic stop waits 5 seconds. For a configured interaction state, the caller must use the appropriate non-reload/start-stop path and readiness/action contract rather than assuming a reload trace represents that state. Tests cover default reload, no-reload, cache restoration after failed navigation, recording-state cleanup and parse failure. [Tool implementation](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/63170b11a2fa74d5ceea757194d7b25f3e145f68/src/tools/performance.ts), [tool tests](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/63170b11a2fa74d5ceea757194d7b25f3e145f68/tests/tools/performance.test.ts). This is why the agent must record actual collection mode, not just the label “performance trace.”

LHCI's [optimistic default](https://github.com/GoogleChrome/lighthouse-ci/blob/85d33432a9149033b62c69f11c6fe6da0e12e679/packages/utils/src/assertions.js#L164-L170) chooses favorable extrema for max/min assertions. sitespeed's comparison skips unavailable metrics and warns about unequal iteration counts; its statistics subprocess can fail independently of measurement. These are understandable tool choices, but a maintenance conclusion must expose the missing comparison rather than summarize it as “no regression.” [LHCI aggregation](https://github.com/GoogleChrome/lighthouse-ci/blob/85d33432a9149033b62c69f11c6fe6da0e12e679/packages/utils/src/assertions.js#L81-L98), [sitespeed comparison](https://github.com/sitespeedio/sitespeed.io/blob/2371e74c55aeeb9179de941a940a8bfdadc02bf2/lib/plugins/compare/index.js), [statistics invocation](https://github.com/sitespeedio/sitespeed.io/blob/2371e74c55aeeb9179de941a940a8bfdadc02bf2/lib/plugins/compare/helper.js#L29-L49).


<a id="research-6"></a>

### A6. Accessibility Regression

| Implementation and evidence type | Inputs → workflow → outputs | Design contribution and limit |
| --- | --- | --- |
| **a11y-agent-skills** — host prompt workflows plus implemented deterministic CLI/MCP comparison and verification | Defined state → audit instructions reproduce it and collect evidence; confirmed finding → trace to authored source, propose/perform repair in that separate workflow, reproduce same state; verified repair → narrow behavior test or explicit manual record. Code fingerprints findings, compares lifecycle categories and verifies target absence/readiness/new serious findings. [Audit](https://github.com/smukh/a11y-agent-skills/blob/8bc24f049734c607e23bd3955700fd4858649614/skills/accessibility-audit/SKILL.md), [repair](https://github.com/smukh/a11y-agent-skills/blob/8bc24f049734c607e23bd3955700fd4858649614/skills/fix-accessibility-issue/SKILL.md), [regression](https://github.com/smukh/a11y-agent-skills/blob/8bc24f049734c607e23bd3955700fd4858649614/skills/accessibility-regression-test/SKILL.md), [compare](https://github.com/smukh/a11y-agent-skills/blob/8bc24f049734c607e23bd3955700fd4858649614/packages/core/src/compare.ts), [verify](https://github.com/smukh/a11y-agent-skills/blob/8bc24f049734c607e23bd3955700fd4858649614/packages/core/src/verify.ts). | Coherent evidence→confirmed barrier→source repair→same-state recheck→regression memory. Moved targets remain uncertain. However its normalized findings consume violations, not actual axe incomplete results; scope compatibility omits origin, browser/engine version and authentication. Copy concepts, not the report schema unchanged. |
| **AWS Content Accessibility Utility rendered agent** — full implemented model/tool workflow and deterministic fallback | HTML and rendered probe → Strands model chooses get-element/fix/CSS/state/probe operations; deterministic verify writes a ledger; steering hook blocks resolution without a recorded pass → modified HTML, resolutions and full tool log. Model-off fixed-policy loop uses the same session. [Agent](https://github.com/awslabs/content-accessibility-utility-on-aws/blob/0ffc2a2762d8fb136027d930472f63f2b0621111/content_accessibility_utility_on_aws/agent/agent.py), [session](https://github.com/awslabs/content-accessibility-utility-on-aws/blob/0ffc2a2762d8fb136027d930472f63f2b0621111/content_accessibility_utility_on_aws/agent/session.py), [fallback](https://github.com/awslabs/content-accessibility-utility-on-aws/blob/0ffc2a2762d8fb136027d930472f63f2b0621111/content_accessibility_utility_on_aws/agent/deterministic_loop.py), [hook tests](https://github.com/awslabs/content-accessibility-utility-on-aws/blob/0ffc2a2762d8fb136027d930472f63f2b0621111/tests/rendered/test_session_and_hook.py). | Shows a useful separation between model decisions and deterministic resolution evidence, including runtime states. It mutates reconstructed HTML/CSS; that is not equivalent to repairing the responsible framework component. Ledger keys are selector+criterion, not artifact revision/state, and mutation methods do not clear prior verification: our closure gate must be stronger. |
| **AccessPilot** — full implemented graph with typed model specialists and deterministic side-effect/verification nodes | URL/folder/repo → load/detect/render/discover/scan, normalize, audit/map/investigate, guard, plan/repair/validate, rescan and compare; bounded retry/no-progress stop → preview/draft review, explicit approval tied to verified diff, then optional publication/report. [Graph](https://github.com/joinarun/accesspilot/blob/467a0d98f846c395417abcc2ce4f01a22f6b5621/app/workflow.py), [verification](https://github.com/joinarun/accesspilot/blob/467a0d98f846c395417abcc2ce4f01a22f6b5621/app/services/verification.py), [graph tests](https://github.com/joinarun/accesspilot/blob/467a0d98f846c395417abcc2ce4f01a22f6b5621/tests/unit/test_workflow_graph.py). | Strong example of a case with explicit routing, evidence validity, no-progress stop and review. It is a prototype with in-memory sessions and limited auth/repair support; skipped project checks count as acceptable in its verification expression. A lower issue count can pass while lesser new findings remain. Those meanings must not be imported as “all barriers resolved.” [Limitations](https://github.com/joinarun/accesspilot/blob/467a0d98f846c395417abcc2ce4f01a22f6b5621/docs/limitations.md). |
| **Official axe Playwright adapter** — deterministic detector integration, not an agent | Reproduced page plus include/exclude/rule options → analyze document/frame contexts → full AxeResults, including violations and incomplete. Tests exercise incomplete and inaccessible frames. [Adapter](https://github.com/dequelabs/axe-core-npm/blob/794589bda678dcc8d7d9d4246240f5d816e5613c/packages/playwright/src/index.ts), [tests](https://github.com/dequelabs/axe-core-npm/blob/794589bda678dcc8d7d9d4246240f5d816e5613c/packages/playwright/test/axe-playwright.spec.ts). | Supplies the raw evidence the other workflows must preserve. It neither selects representative states nor establishes keyboard usability, screen-reader experience or conformance. |

The richer workflows justify a barrier case, not a larger scanner wrapper. a11y-agent-skills explicitly says that unreached state produces a partial result, source repair follows confirmation, and manual-only behavior remains a review record. Its manual checklist records performed methods/environments and marks other checks required. [Audit](https://github.com/smukh/a11y-agent-skills/blob/8bc24f049734c607e23bd3955700fd4858649614/skills/accessibility-audit/SKILL.md), [repair](https://github.com/smukh/a11y-agent-skills/blob/8bc24f049734c607e23bd3955700fd4858649614/skills/fix-accessibility-issue/SKILL.md), [manual boundary](https://github.com/smukh/a11y-agent-skills/blob/8bc24f049734c607e23bd3955700fd4858649614/skills/accessibility-audit/references/manual-boundaries.md). Our maintenance role adopts that case logic while keeping repair execution separately authorized.

There are important reasons to avoid uncritical reuse. The a11y-agent-skills [normalizer](https://github.com/smukh/a11y-agent-skills/blob/8bc24f049734c607e23bd3955700fd4858649614/packages/core/src/normalize.ts#L84-L121) drops the actual incomplete collection even though it adds generic human-review reminders; the [scope signature](https://github.com/smukh/a11y-agent-skills/blob/8bc24f049734c607e23bd3955700fd4858649614/packages/core/src/compare.ts) is narrower than a safe comparison contract. AccessPilot's normalizer also iterates violations, and its verification compares issue identities/counts; its own code and limitations distinguish automated findings from subjective and complex interaction review. [Normalizer](https://github.com/joinarun/accesspilot/blob/467a0d98f846c395417abcc2ce4f01a22f6b5621/app/services/normalize.py), [verification](https://github.com/joinarun/accesspilot/blob/467a0d98f846c395417abcc2ce4f01a22f6b5621/app/services/verification.py), [limitations](https://github.com/joinarun/accesspilot/blob/467a0d98f846c395417abcc2ce4f01a22f6b5621/docs/limitations.md). Our design therefore retains raw engine findings, incomplete results, route/state coverage and human work as separate records.

AWS's hook demonstrates that a model statement is not enough to resolve a finding, with tests for allowed/blocked commits. But the [ledger](https://github.com/awslabs/content-accessibility-utility-on-aws/blob/0ffc2a2762d8fb136027d930472f63f2b0621111/content_accessibility_utility_on_aws/agent/session.py) is keyed only to selector/criterion; a later state or HTML mutation is not part of that key. The inference from source is a stale-verification risk, not a reproduced bug. Bind our verification to the exact state contract, source/deployment artifact and engine configuration, and invalidate it when any changes. AccessPilot's diff/verification-bound approval provides a complementary design influence. [Hook tests](https://github.com/awslabs/content-accessibility-utility-on-aws/blob/0ffc2a2762d8fb136027d930472f63f2b0621111/tests/rendered/test_session_and_hook.py), [approval node](https://github.com/joinarun/accesspilot/blob/467a0d98f846c395417abcc2ce4f01a22f6b5621/app/workflow.py).

#### Related evidence and scope notes

Pa11y CI was retained as background evidence but excluded from the main design table because its URL queue/count-threshold model adds less lifecycle differentiation; its threshold aggregation can remove allowed issues from aggregate output, making raw capture necessary. [Implementation](https://github.com/pa11y/pa11y-ci/blob/1c43bdcac7e4c7a66cdf48acf9e66ff7807b2c8e/lib/pa11y-ci.js#L95-L107). simple2226/a11y-agent was discovered as another audit/repair/re-audit loop, but only its repository metadata/tree were inspected, so its claims are not treated as implementation evidence. No source count or efficacy ranking is implied.


<a id="research-7"></a>

### A7. Technical SEO & Discoverability

| Implementation and evidence type | Inputs → workflow → outputs | Design contribution and limit |
|---|---|---|
| **nurkamol/seo-audit**, deterministic crawl/check/report pipeline, pin `b70b3bf8f29bcbbdcdfb969079fd41097d1368e1` | URL, crawl settings, exclusions and optional baseline → HTTP/sitemap/link discovery, source-HTML checks, finding comparison → JSON/Markdown findings with crawl metadata. | Concrete machine-readable observation and finding identity. The comparator matches check ID + URL/path, but does not establish equal page coverage or compare changed details/severity: an unvisited page can lose its finding without being fixed. It observes response HTML. Redirect landing origins and sitemap discovery can enlarge the crawl boundary, so Solvd must enforce its own approved origins/URLs. [entry/collection](https://github.com/nurkamol/seo-audit/blob/b70b3bf8f29bcbbdcdfb969079fd41097d1368e1/src/audit.mjs), [comparison](https://github.com/nurkamol/seo-audit/blob/b70b3bf8f29bcbbdcdfb969079fd41097d1368e1/src/baseline.mjs). |
| **AgriciDaniel/claude-seo**, agent instructions backed by implemented fetch/render/drift helpers, pin `6be93f45064ffbadced572b5d5c95f55fd263af0` | Site URL → audit instructions render the homepage, select specialist work, collect structured findings and produce a prioritized action plan. `render_page.py` keeps raw content and selected browser content; `auto` renders when an SPA-shell heuristic triggers. Separate drift commands persist snapshots/comparisons in SQLite, compare 17 rules and retain history. | Adds the agent-level pattern of interpretation, specialization, durable partial findings and an ordered investigation. It is not a single fully automated end-to-end executor: orchestration is expressed in skills/agent prompts. Drift has actual code. Auto-rendering can miss changes on otherwise complete HTML pages; rendering and drift are separate paths, so a paired source/render baseline is not automatically established. Scores, generic severity and AI-readiness advice exceed M7's purpose. [audit instructions](https://github.com/AgriciDaniel/claude-seo/blob/6be93f45064ffbadced572b5d5c95f55fd263af0/skills/seo-audit/SKILL.md), [render implementation](https://github.com/AgriciDaniel/claude-seo/blob/6be93f45064ffbadced572b5d5c95f55fd263af0/scripts/render_page.py), [drift comparison](https://github.com/AgriciDaniel/claude-seo/blob/6be93f45064ffbadced572b5d5c95f55fd263af0/scripts/drift_compare.py). |
| **dannwaneri/seo-agent**, implemented browser + model + human-review workflow, pin `e88c7bf0e39cc7faf16dedc3e64bd1fed9b8b3ce` | CSV URLs and saved project state → visit pending pages, pause/retry/skip when collection is problematic, call a Claude extractor, check links, save per-URL results → JSON/text reports and run history. | Demonstrates explicit resumability and a human-review queue rather than abandoning a whole run. However, `pending` excludes every previously audited URL, and skipped pages are also marked audited: useful batch progress is not recurring maintenance coverage. The public default calls a model for extraction; advertised tiered routing imports absent `premium` code. Its browser ignores HTTPS errors. Borrow workflow ideas, not those defaults or uninspected premium claims. [loop/state decisions](https://github.com/dannwaneri/seo-agent/blob/e88c7bf0e39cc7faf16dedc3e64bd1fed9b8b3ce/main.py#L137-L278), [saved state](https://github.com/dannwaneri/seo-agent/blob/e88c7bf0e39cc7faf16dedc3e64bd1fed9b8b3ce/core/state.py), [browser](https://github.com/dannwaneri/seo-agent/blob/e88c7bf0e39cc7faf16dedc3e64bd1fed9b8b3ce/core/browser.py). |
| **GoogleChrome/lighthouse**, deterministic browser artifact/audit pipeline, pin `1a4ffa418258919adbbf6ccca548c02e0092bafd` | Approved browser navigation → collect artifacts, run named audits → structured report. Crawlability considers rendered meta, resource headers and robots; canonical checks use link artifacts. | Offers a disciplined gather-versus-judge seam and rendered evidence. It is not an intended-public-page inventory. Crawlability can pass while warning that some bots are blocked; structured-data evaluation includes a manual audit. A category score therefore cannot mean all intended bots/pages/schema are correct. [entry/artifact split](https://github.com/GoogleChrome/lighthouse/blob/1a4ffa418258919adbbf6ccca548c02e0092bafd/core/index.js), [bot semantics](https://github.com/GoogleChrome/lighthouse/blob/1a4ffa418258919adbbf6ccca548c02e0092bafd/core/audits/seo/is-crawlable.js), [manual structured data](https://github.com/GoogleChrome/lighthouse/blob/1a4ffa418258919adbbf6ccca548c02e0092bafd/core/audits/seo/manual/structured-data.js). |

Relevant verification source exists: nurkamol's crawler integration fixtures cover sitemap/noindex/exclusion cases; claude-seo has SPA/rendering/degraded-result tests and a drift portability test; Lighthouse tests partial-bot warnings. These were read, not run. Dannwaneri's reporter and main contain manual acceptance routines; their existence does not demonstrate the model's correctness. [crawler fixtures](https://github.com/nurkamol/seo-audit/blob/b70b3bf8f29bcbbdcdfb969079fd41097d1368e1/test/integration.test.mjs), [render tests](https://github.com/AgriciDaniel/claude-seo/blob/6be93f45064ffbadced572b5d5c95f55fd263af0/tests/test_render_page.py), [drift test](https://github.com/AgriciDaniel/claude-seo/blob/6be93f45064ffbadced572b5d5c95f55fd263af0/tests/test_drift_portability.py), [Lighthouse tests](https://github.com/GoogleChrome/lighthouse/blob/1a4ffa418258919adbbf6ccca548c02e0092bafd/core/test/audits/seo/is-crawlable-test.js).

#### Related evidence and scope notes

The owner still decides public intent, bots, sampling budget and acceptable exclusions. The implementation must define template identification, stable URL/query identity and when changed tooling invalidates comparisons. No inspected approach supplies Solvd's full intent-plus-coverage-plus-review contract. Generic content rewrites, backlink campaigns, schema publishing, `llms.txt` generation and search-account changes stay outside M7. Google says the established technical foundations apply to its AI search features; that is guidance about Google, not proof about every AI engine. [Google AI guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).


<a id="research-8"></a>

### A8. Tracking & Consent QA

| Implementation and evidence type | Inputs → workflow → outputs | Design contribution and limit |
|---|---|---|
| **mbaersch/tracking-auditor**, implemented browser audit and saved-flow comparison, pin `6cacbcc97d706091a74a25105148761c60a1521b` | URL/flags → fresh browser pre-choice capture, accept transition, separate reject browser; request headers/POST, dataLayer, cookies/storage; vendor parsers → Markdown, optional phase-tagged HAR and saved-flow delta. | Most directly demonstrates consent as a temporal experiment rather than a tag inventory. Still lacks the app's approved events/properties/counts/receipt contract. Optional checkout/add-to-cart and service-worker deregistration are outside this role. Pinned tree has no LICENSE: reference only; copying or reuse needs resolved permission. [state runner](https://github.com/mbaersch/tracking-auditor/blob/6cacbcc97d706091a74a25105148761c60a1521b/audit.js), [flow comparison](https://github.com/mbaersch/tracking-auditor/blob/6cacbcc97d706091a74a25105148761c60a1521b/flow-delta.js), [GA4 parser](https://github.com/mbaersch/tracking-auditor/blob/6cacbcc97d706091a74a25105148761c60a1521b/pii-lib/ga4.js). |
| **Adwize/adwize-audit**, implemented deterministic checks plus optional model analyst, pin `fe5661b5e4ed7dd6d764242ff1ec48157e5475ff` | URL/sample settings → collect Snapshot, run pure checks, score, optionally call OpenAI analyst → findings and explicit analysis status. Collector captures request URLs, HTML, cookie names/domains and dataLayer presence/length. | Useful evidence/check/analysis seams and graceful no-key/error behavior. It accepts consent by default, shares a context across pages, and does not execute a reject matrix or capture complete temporal POST payloads in this collector. Generic recommended events are not customer expectations. `analyze=False` unless model use/data disclosure is approved. [runner](https://github.com/Adwize/adwize-audit/blob/fe5661b5e4ed7dd6d764242ff1ec48157e5475ff/core/audit.py), [collector](https://github.com/Adwize/adwize-audit/blob/fe5661b5e4ed7dd6d764242ff1ec48157e5475ff/core/collectors/crawl.py), [analyst](https://github.com/Adwize/adwize-audit/blob/fe5661b5e4ed7dd6d764242ff1ec48157e5475ff/agents/analyst/agent.py). |
| **OpenWPM**, instrumented deterministic experiment framework, pin `4f81c3a94b80b6db0e7393d0700e72f4abf3bc80` | Explicit browser command sequences/config → Firefox instrumentation of request/response, cookies and selected JS signals, visit IDs/timeouts → structured collection storage. | Stronger experiment identity/completion and deeper instrumentation than a simple tag detector; captures POST/header evidence. It supplies neither consent selectors nor event expectations. Reset defaults do not automatically isolate each consent state. Firefox observations require their own baseline. Root GPLv3/extension MPL-2.0 terms need specific integration review. [command semantics](https://github.com/openwpm/OpenWPM/blob/4f81c3a94b80b6db0e7393d0700e72f4abf3bc80/openwpm/command_sequence.py), [HTTP capture](https://github.com/openwpm/OpenWPM/blob/4f81c3a94b80b6db0e7393d0700e72f4abf3bc80/Extension/src/background/http-instrument.ts), [licenses](https://github.com/openwpm/OpenWPM/blob/4f81c3a94b80b6db0e7393d0700e72f4abf3bc80/LICENSE). |
| **Snowplow Micro + first-party examples**, implemented test collector/schema pipeline and deterministic event-contract tests. Current Micro pin `63856488d599102a4e87f4d8e8388c0d16ddf0a2`; example pin `85d3673ab06fee15f70fd601baddc545f7c7262c` | Events sent to Micro → adapter/schema/enrichment processing → good/bad event storage and query APIs. Cypress examples trigger a synthetic app then assert counts, types, schemas, property/context values, sequence and forbidden password fields. | Supplies the missing **expected outcome** pattern, not merely detection. Micro receipt/validation proves behavior at that test collector, not the production warehouse or every vendor destination. Examples are from 2021 and vendor-specific; current code/docs independently confirm the collector/testing approach, not current compatibility of every old test. [current validation](https://github.com/snowplow/snowplow-micro/blob/63856488d599102a4e87f4d8e8388c0d16ddf0a2/src/main/scala/com.snowplowanalytics.snowplow.micro/EventSink.scala), [assertion helpers](https://github.com/snowplow-incubator/snowplow-micro-examples/blob/85d3673ab06fee15f70fd601baddc545f7c7262c/testing/cypress/support/commands.js), [example assertions](https://github.com/snowplow-incubator/snowplow-micro-examples/blob/85d3673ab06fee15f70fd601baddc545f7c7262c/testing/cypress/integration/01_micro_spec.js), [current docs](https://docs.snowplow.io/docs/testing/). |
| **Trackingplan**, first-party product-documented monitoring and investigation agent; closed internals, documentation snapshot | Installed SDK observes outbound tracking requests → copied traffic is parsed into events/properties/destinations and compared over time. Warning UI links affected hits/history/releases; Analyze is documented to investigate traffic/dataLayer/releases/GTM and propose who should fix what. | Adds a useful maintained investigation case: first/last seen, ongoing/muted/resolved, affected releases, notes and inspectable query trail. Docs describe behavior, not code or measured accuracy. Learned observations must not silently define the correct consent policy. Outbound request copies are not independent vendor receipt. [collection](https://www.trackingplan.com/docs/how-it-works), [warning investigation agent](https://www.trackingplan.com/docs/debug-warnings), [release history](https://www.trackingplan.com/docs/autodiscover-releases). |

Tests provide bounded evidence about intended checks: Adwize fixtures cover extraction/checks; OpenWPM tests cover service-worker requests and POST formats; current Micro has API tests. The tracking-auditor pinned tree lacks a suite/CI; Trackingplan's implementation and tests were not available. None was executed here. [Adwize fixtures](https://github.com/Adwize/adwize-audit/blob/fe5661b5e4ed7dd6d764242ff1ec48157e5475ff/tests/test_crawl.py), [OpenWPM instrumentation tests](https://github.com/openwpm/OpenWPM/blob/4f81c3a94b80b6db0e7393d0700e72f4abf3bc80/test/test_http_instrumentation.py), [Micro API tests](https://github.com/snowplow/snowplow-micro/blob/63856488d599102a4e87f4d8e8388c0d16ddf0a2/src/test/scala/com.snowplowanalytics.snowplow.micro/MicroApiSpec.scala).

#### Related evidence and scope notes

The owner must supply the actual event schema, allowed denied-state behavior, destinations and meaningful receipt evidence. Implementation choices remain for batching/retries, duplicate identity, eventual receipt windows and redaction/retention. A production-learned baseline can reveal change, but an existing defect can be stable: learned behavior is never automatically accepted policy. Trackingplan explicitly documents consent-required/optional classifications learned from observed patterns with overrides, which Solvd should treat as suggestions requiring review. [documented learning](https://www.trackingplan.com/docs/warning-and-updates).


<a id="research-9"></a>

### A9. Mobile Release Readiness

| Implementation and evidence type | Inputs → workflow → outputs | Design contribution and limit |
|---|---|---|
| **RevylAI/greenlight**, implemented deterministic source/artifact/preflight workflow, pin `fcb36e395bd4ae20448f2535382baecba9396fd9` | Project or IPA/APK/AAB and selected metadata → parse source/compiled manifest/plist/native libraries, evaluate rules → findings with policy/fix references. | Useful source-versus-archive separation and native metadata evidence. Source module discovery is heuristic, archive arm64 checks are bounded, and source settings do not prove artifact lineage or successful native validation. Policy values/deadlines are constants. Its separate `verify` path can register/upload/run cloud tests and is excluded. [source scan](https://github.com/RevylAI/greenlight/blob/fcb36e395bd4ae20448f2535382baecba9396fd9/internal/playscan/scanner.go), [archive](https://github.com/RevylAI/greenlight/blob/fcb36e395bd4ae20448f2535382baecba9396fd9/internal/playscan/archive.go), [hardcoded rules](https://github.com/RevylAI/greenlight/blob/fcb36e395bd4ae20448f2535382baecba9396fd9/internal/playscan/rules.go), [cloud verification](https://github.com/RevylAI/greenlight/blob/fcb36e395bd4ae20448f2535382baecba9396fd9/internal/verify/runner.go). |
| **fastlane precheck + specific store readers**, implemented deterministic metadata rule workflow and API tools, pin `f6f8c179668f5c476f2fa81857eef6cd27a3a0b2` | App metadata/config → run rule processor → errors, warnings and items not checked. Apple Build readers obtain remote build states. Android `track_release_summaries` uses direct list without an edit. | Offers explicit skipped/unassessed metadata and stateful store evidence. Metadata precheck is not SDK/binary readiness. Traditional Android readers begin/abort edits, so use the specific newer direct reader if strictly read-only. Loading arbitrary Fastfiles/Precheckfiles can execute code. [precheck runner](https://github.com/fastlane/fastlane/blob/f6f8c179668f5c476f2fa81857eef6cd27a3a0b2/precheck/lib/precheck/runner.rb), [rule processor](https://github.com/fastlane/fastlane/blob/f6f8c179668f5c476f2fa81857eef6cd27a3a0b2/precheck/lib/precheck/rule_processor.rb), [Android readers](https://github.com/fastlane/fastlane/blob/f6f8c179668f5c476f2fa81857eef6cd27a3a0b2/supply/lib/supply/reader.rb), [direct client method](https://github.com/fastlane/fastlane/blob/f6f8c179668f5c476f2fa81857eef6cd27a3a0b2/supply/lib/supply/client.rb#L538-L542). |
| **beydemirfurkan/appstore-release**, implemented source preflight/readiness tool + MCP and agent skills, pin `da78ff462233c076f7d7cedf833a1001d49f1f06` | Project/config plus optional App Store snapshot → source rules return findings/manualChecks/notes; pure report combines app/version/store/metadata/review checks → verdict and ordered next actions, including human-only work. | Closest inspected example of a decision workflow rather than a parser. Findings retain IDs/evidence/fixes; waived items remain visible with reasons. Report separates inaccessible sections and build processing state. Skills' “certain rejection” wording is too strong for Solvd; static search cannot prove runtime behavior or store outcome. Broader package includes mutating operations; `--expo-config` executes project code. [preflight implementation](https://github.com/beydemirfurkan/appstore-release/blob/da78ff462233c076f7d7cedf833a1001d49f1f06/src/preflight/index.mjs), [pure report/next actions](https://github.com/beydemirfurkan/appstore-release/blob/da78ff462233c076f7d7cedf833a1001d49f1f06/src/report/report.mjs), [CLI execution boundary](https://github.com/beydemirfurkan/appstore-release/blob/da78ff462233c076f7d7cedf833a1001d49f1f06/src/cli/preflight.mjs), [agent skill](https://github.com/beydemirfurkan/appstore-release/blob/da78ff462233c076f7d7cedf833a1001d49f1f06/skills/app-store-preflight/SKILL.md). |
| **Expo EAS Workflows**, implemented declarative release pipeline plus first-party hosted-job documentation; CLI pin `08c92bf937bc36c32c5f7b8c4ec73cc6bbe02f50` | Release configuration → generated workflow fingerprints native inputs, looks for matching builds, then conditionally builds/submits or publishes updates. Hosted job docs expose build identity filters and approval jobs. | Demonstrates explicit dependency/decision state and linking work to existing build IDs. A fingerprint is compatibility evidence, not artifact hash/signature/native validation or policy approval. This is a release-execution pipeline, not a read-only maintenance agent; Solvd should consume supplied run/build/test evidence, never execute the template. [actual generated workflow](https://github.com/expo/eas-cli/blob/08c92bf937bc36c32c5f7b8c4ec73cc6bbe02f50/packages/eas-cli/src/commandUtils/new/templates/.eas/workflows/deploy-to-production.yml), [job syntax](https://docs.expo.dev/eas/workflows/syntax/), [fingerprint restrictions](https://docs.expo.dev/eas/workflows/pre-packaged-jobs/). |
| **Tassoi/mobile-store-release-skills**, agent instructions plus example release lanes and fixtures, pin `36c0855dc9ca0d6ea94efd9cf6bda24bc93a573c` | Repository inspection → identify stack/release tooling, route by platform, verify current official rules, separate local facts/manual console work → pass/fail/unknown readiness checklist. | Clear coordinator and unknown/evidence discipline; no autonomous readiness engine was established. Golden files describe expected findings, and validator checks file/text presence, not an agent's actual conclusions. These instructions can run tests/builds/uploads when authorized; Solvd borrows inspection/routing/output, excludes execution. [coordinator](https://github.com/Tassoi/mobile-store-release-skills/blob/36c0855dc9ca0d6ea94efd9cf6bda24bc93a573c/skills/mobile-release-coordinator/SKILL.md), [Android skill](https://github.com/Tassoi/mobile-store-release-skills/blob/36c0855dc9ca0d6ea94efd9cf6bda24bc93a573c/skills/google-play-release/SKILL.md), [golden expectation](https://github.com/Tassoi/mobile-store-release-skills/blob/36c0855dc9ca0d6ea94efd9cf6bda24bc93a573c/tests/golden/native-android-release-risk.expected.md), [validator](https://github.com/Tassoi/mobile-store-release-skills/blob/36c0855dc9ca0d6ea94efd9cf6bda24bc93a573c/scripts/validate_skills.py). |

Official bundletool remains a concrete deterministic artifact baseline within this design: `dump` reads AAB manifest/config and `validate` checks bundle structure; it does not establish store acceptance, every module/ABI's runtime compatibility or source lineage. Pin `586a43a450712a1067f3d92cf7574dee68226302`. [dump implementation](https://github.com/google/bundletool/blob/586a43a450712a1067f3d92cf7574dee68226302/src/main/java/com/android/tools/build/bundletool/commands/DumpManager.java), [validation](https://github.com/google/bundletool/blob/586a43a450712a1067f3d92cf7574dee68226302/src/main/java/com/android/tools/build/bundletool/commands/ValidateBundleCommand.java).

Greenlight archive tests, fastlane rule-processor tests and appstore-release preflight/report fixtures were inspected; they establish intended edge cases, not that any candidate passed in this environment. Expo's deployment template is executable workflow source, while hosted job behavior is documented behavior. [Greenlight tests](https://github.com/RevylAI/greenlight/blob/fcb36e395bd4ae20448f2535382baecba9396fd9/internal/playscan/archive_test.go), [precheck tests](https://github.com/fastlane/fastlane/blob/f6f8c179668f5c476f2fa81857eef6cd27a3a0b2/precheck/spec/rule_processor_spec.rb), [preflight tests](https://github.com/beydemirfurkan/appstore-release/blob/da78ff462233c076f7d7cedf833a1001d49f1f06/test/preflight.test.mjs), [report tests](https://github.com/beydemirfurkan/appstore-release/blob/da78ff462233c076f7d7cedf833a1001d49f1f06/test/report.test.mjs).

A further distinction matters: appstore-release retains read failures in `errors`, but `verdictFor` chooses its verdict from version state and blocker findings rather than directly requiring an empty error list. Solvd therefore needs a separate completeness decision for the required evidence of this app/channel; preserving an error string alone is insufficient. The snapshot reader makes concrete GET calls and degrades failed sections instead of failing the whole report. Borrow that resilience while making its effect on the decision explicit. [verdict logic](https://github.com/beydemirfurkan/appstore-release/blob/da78ff462233c076f7d7cedf833a1001d49f1f06/src/report/report.mjs#L156-L173), [snapshot collection](https://github.com/beydemirfurkan/appstore-release/blob/da78ff462233c076f7d7cedf833a1001d49f1f06/src/report/snapshot.mjs).

#### Related evidence and scope notes

Decide who reviews rule changes, acceptable freshness, artifact retention, trusted lineage formats and what native-validation proof is sufficient for each requirement. App-specific extensions, account roles and console warnings often require owner evidence; unavailable access stays unknown. Google confirms direct `applications.tracks.releases.list` is GET, but older fastlane edit-based readers are different operations. Read-only store collection must allowlist exact methods/endpoints; authentication/token exchange needs its own approved handling. [official direct release-list method](https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases/list).

Apple membership renewal illustrates why the action owner and technical reviewer can differ. Record the membership type, applicable account authority and supplied account evidence; the agent identifies the required owner action rather than renewing or inferring authority from repository access. [Apple renewal guidance](https://developer.apple.com/help/account/membership/renewal).

Builds, installs, signing, uploading, store metadata changes, submissions, rollout, cloud-device runs, account renewal and policy-waiver changes remain excluded. Generic app-review marketing checklists are not added wholesale. A clean source scan, valid AAB, compatible fingerprint or “ready” tool verdict never guarantees store acceptance. During broader discovery, `runetiq/mobile-release-readiness` supplied a transparent demo signal-to-SHIP/HOLD rubric but explicitly excludes organizational policy/history/integrations; its engine also defaults missing signal values to healthy numbers. It is a useful counterexample, not Solvd's readiness model. [demo engine](https://github.com/runetiq/mobile-release-readiness/blob/c1443eb2e3980f9dacdb63384770c71a716e0d81/src/runetiq_readiness/engine.py), [stated limits](https://github.com/runetiq/mobile-release-readiness/blob/c1443eb2e3980f9dacdb63384770c71a716e0d81/docs/how-it-works.md).


### A10. Shared-behavior and additional official references

The common operating contract is our design synthesis. LangGraph's [persistence](https://docs.langchain.com/oss/python/langgraph/persistence) and [interrupt](https://docs.langchain.com/oss/python/langgraph/interrupts) documentation distinguish case-progress persistence from application knowledge and note replay when an interrupted node resumes; neither selects a framework or implements our authority policy. Anthropic's [tool-design account](https://www.anthropic.com/research/writing-tools-for-agents) informs task-focused returned evidence and actionable errors. [GitHub Scientist](https://github.com/github/scientist) supplies a control/candidate comparison pattern; the role acceptance cases are our adaptation.

For iOS, Apple's [privacy manifest](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files) and [required-reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api) documentation identify distinct declaration/evidence classes. The [third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/) and [App Privacy information](https://developer.apple.com/app-store/app-privacy-details/) add SDK/declaration scope. The agent compares supplied records and flags missing owner decisions; it does not infer all data handling or invent declared purposes. Apple's [export-compliance workflow](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance) requires an app-specific determination, which stays with the authorized owner. [Upcoming build requirements](https://developer.apple.com/news/upcoming-requirements/) require a versioned source/build-provenance check rather than treating a source deployment target as the build SDK. Google's [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-en) covers developer-supplied practices; platform-specific declarations are not assumed identical. These official sources were checked for this revision; no account was inspected or declaration submitted.

The ARIA-snapshot refinement uses [supported snapshot interfaces](https://playwright.dev/docs/aria-snapshots); [release notes](https://playwright.dev/docs/release-notes) record the removal of the older accessibility API. The inspected [sitespeed statistical code](https://github.com/sitespeedio/sitespeed.io/blob/2371e74c55aeeb9179de941a940a8bfdadc02bf2/lib/plugins/compare/statistical.py) supports the named tests; it is not evidence for a universal sampling rule or bootstrap-median confidence intervals. [FIRST EPSS](https://www.first.org/epss/) estimates published-CVE exploitation likelihood over 30 days, not the probability a particular application is compromised.

<a id="requirement-record"></a>

## Appendix B — versioned requirement-record examples

A record contains `requirement_id`, official source URL and saved relevant text/hash, `verified_at`, reviewer, effective scope/date, platform/form-factor/channel/action conditions, exception evidence, `next_review_due`, and superseded record link. Dates below belong to these **2026-10-28 source observations**, not permanent rules in an agent prompt. Before an actual release decision, retrieve/review the applicable current record. Failed refresh, relevant change awaiting review or overdue required catalog evidence leaves the affected decision pending.

| Example record | Official source | Bounded observed condition |
|---|---|---|
| GP-TARGET-2026-10-28 | [Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en) | Ordinary phone-app submissions/updates: API 36 from August 31, 2026; existing-app availability and other form factors differ. An extension can be requested until November 1, 2026; that does not establish a specific app's grant. |
| GP-PAGESIZE-2026-10-28 | [Android 16 KB guidance](https://developer.android.com/guide/practices/page-sizes) | The stated Google Play scope covers apps targeting Android 15 / API 35+ on 64-bit devices; unsupported updates are blocked starting February 1, 2027. Archive observations and native/device validation remain different evidence. |
| APPLE-BUILD-SOURCE-2026-10-28 | [Apple upcoming requirements](https://developer.apple.com/news/upcoming-requirements/) | Record the applicable upload SDK/Xcode requirement from its effective source version and compare supplied build provenance. This design does not duplicate a fixed SDK number as permanent agent policy. |

An application's reviewed assessment references a requirement-record ID and its evidence, not a copied date alone. A new source record creates a reviewable applicability change; it cannot silently replace a previous accepted exception or make unknown artifact evidence satisfied.

## Evidence and revision record

The full comparison remains in Appendix A with primary sources and source-head pins. Existing October 27 evidence and additional October 28 implementation paths informed the original design. The revised operating contract, budgets, retention profile and role refinements are proposals; only the underlying source behaviors are research observations. No source code, target/customer check, upstream tests or paid model experiment was executed for this document update. No library, registry, application, deployment or account was changed.

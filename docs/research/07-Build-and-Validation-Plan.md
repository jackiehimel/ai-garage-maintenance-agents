# Building Solvd’s 9 maintenance agents

2026-10-29 · Revised around implementation, following Jackie’s feedback

## What we are building

Build **9 runnable maintenance agents**, each with its own tools, application-specific reasoning, saved work and useful output. Existing implementations inform the code we adopt and the behavior we implement. The Garage clone is the first application those agents will work on; creating and testing the clone is preparation, not the product.

The previous execution plan over-emphasized setup and verification. This revision makes implementation the main work: integrate selected tools, write the agent’s instructions and tool operations, implement its investigation and decision logic, connect saved case history and make it runnable. Checks accompany those deliverables.

Keep all 9 approved roles and the standalone maintenance offering. Codex and coding subagents are the builders. No QE-owned agents are assumed available. No ADLC product or Garage redesign is required. The [nine-agent designs](handoff-session-2026-10-28-maintenance-agent-designs.md) remain the detailed behavior reference.

**Nothing has been implemented by this document revision.** The original Garage, library, deployed site and design document remain unchanged. The earlier execution plan is preserved locally for comparison.

## 1. Build the first working agent and the small runtime it needs

Start with **M4 Change & Release Review in Planning mode**. It can read the real cloned repository, examine a maintenance question and relevant code, and produce a useful work packet without waiting for a browser or a release pipeline.

Build these pieces through that actual workflow:

| Implementation piece | Code to write | Working result |
|---|---|---|
| Role definition | Instructions, permitted observations, role-specific input/output types and stopping conditions. | The runtime knows what M4 can investigate and what a work packet must contain. |
| Repository operations | Scoped source reads, diff/history inspection and supplied-result readers. No arbitrary shell operation exposed to the model. | M4 obtains relevant code and change evidence itself within the accepted scope. |
| Investigation loop | Direct model-client calls, named tool selection, returned observations, follow-up questions, finite budgets and structured final output. | M4 can inspect another relevant file or request missing evidence rather than only summarize an initial bundle. |
| Case lifecycle | Save observations and assessments separately; record review, exceptions, evidence identity, next action and recheck history. | A later run continues the same maintenance decision without forgetting its conditions or silently closing it. |
| Execution controls and usage | Enforce permitted actions and data handling; capture actual model/tool usage, termination and cost basis. | The workflow stops predictably and leaves useful saved work. |
| Local invocation and report | A documented local way to start the role, inspect its result, record a disposition and recheck after a supplied change. | We have an executable agent with a usable output and saved case, rather than only a design or prompt file. |

Use TypeScript/Node and a direct model-provider client as the proposed starting stack. Keep the loop explicit. Do not build a general orchestration platform first. The common runtime grows from what M4 actually needs, then from a second working caller.

The coordinator owns shared runtime and case semantics. Implementers own their assigned role’s tools, instructions and decision logic. Common case rules cover review, expiry and recheck; each specialist still owns what its findings mean.

## 2. Build each agent from a concrete reuse-and-code recipe

“Reuse” below distinguishes an actual tool to integrate from an implementation pattern to adapt. The research did not establish that adopting whole upstream agent runtimes would be faster. Select compatible released dependencies and inspect their actual behavior/terms before adoption; the [implementation research](handoff-session-2026-10-27-maintenance-implementation-reuse.md) and design appendix retain the source evidence.

| Agent | Integrate or adapt | Solvd implementation to build | Runnable output |
|---|---|---|---|
| **M1 Reliability & Incident Triage** | Integrate one monitor/log input. Adapt Healthchecks/Gatus observation semantics and Holmes/Robusta/OneUptime investigation patterns. | Signal intake and grouping; affected-function context; scoped log/change queries; competing explanations; incident timeline; owner/escalation handoff; original-condition recovery tracking. | A saved incident brief with supported observations, hypotheses, next investigation and recovery state. |
| **M2 Security & Lifecycle Review** | Integrate OSV-Scanner for supported inventory; optionally oasdiff for supplied specifications. Adapt NVIDIA failure handling and Dependency-Track decision history. | Package/runtime inventory readers; authoritative notice retrieval and condition extraction; deployment/feature applicability reasoning; no-fix actions; deadlines; owned exceptions and change-driven reevaluation. | A prioritized, reviewed maintenance decision list with evidence and unresolved applicability questions. |
| **M3 Functional & Integration QA** | Integrate trusted Playwright browser/API tests and structured results. Adapt the studied planner/investigator and independent readback patterns. | Journey/outcome configuration; selected test execution; actual browser/request evidence capture; failure-boundary investigation; test-maintenance proposals; attempt history; safe replay and original-outcome recheck. | A path-by-path outcome report and a concrete product/test/environment investigation or repair-verification handoff. |
| **M4 Change & Release Review** | Integrate native Git and supplied language/check output. Adapt PR-Agent/Kodus contextual investigation and partial-review patterns. | Relevant-code selection; bounded work-packet generation; proposed acceptance/recovery conditions; separate Readiness mode; exact revision/artifact matching; review and decision history. | A maintenance work packet, followed when requested by a readiness assessment against supplied evidence. |
| **M5 Performance Regression** | Integrate Lighthouse CI collection and diagnostic artifacts. Adapt sitespeed’s raw-sample/comparison approach where appropriate. | Measurement configuration and baseline storage; compatible-cohort comparison; declared statistics/materiality/noise rules; targeted trace/request investigation; regression history and equivalent repair remeasurement. | A performance-change explanation with the measured change, limits, supported investigation and next engineering action. |
| **M6 Accessibility Regression** | Integrate Playwright and its axe adapter. Adapt identity, repair and verification patterns from the studied accessibility implementations. | State coverage; full rule/keyboard observations; semantic finding identity; task-impact explanation; component/source investigation; grouped repair handoff; granular recheck and explicit human-work records. | A reproducible barrier/repair report with separately tracked automated and required human evaluation. |
| **M7 Technical SEO & Discoverability** | Integrate bounded HTTP and selected browser/Lighthouse observations. Adapt the studied source/render comparison and drift-history patterns. | Expected-route/intent inventory; directive/canonical/status checks; targeted rendering; template-level investigation; intentional exclusions; coverage-aware history and equivalent correction recheck. | An owned template/page correction or investigation with evidence and affected coverage. |
| **M8 Tracking & Consent QA** | Integrate Playwright browser/network observation. Adapt Snowplow’s explicit assertions and Adwize’s collection/check/explanation separation. | Accepted event/choice configuration; one supported parser initially; logical-event identity across batches/retries; state experiments; minimized evidence; mismatch investigation; receipt limits and compatible recheck. | An expected-versus-observed tracking decision report explaining the affected measurement and owner action. |
| **M9 Mobile Release Readiness** | Integrate official bundletool where applicable; adopt selected static artifact/record readers. Adapt mobile implementations’ source/artifact/requirement separation. | Versioned official requirement catalog; Android/iOS evidence readers; artifact/build/source reconciliation; conditional applicability and completeness; targeted missing-evidence questions; owner/deadline/exception history. | A requirement-to-evidence action list with platform-specific readiness conditions and responsible owners. |

Every role needs actual implementation of its specialist workflow. A generic report template or scanner summary does not complete a row. Its AI work should be specific: select relevant observations, investigate a discrepancy, connect evidence to the accepted application expectation and propose a supported action.

### How one role gets built

1. **Choose its first supported input.** For example: M2 starts with Garage’s actual npm inventory; M6 starts with one real page state. Record the other supported inputs as subsequent work.
2. **Integrate its selected tool.** Add the scoped operation and preserve its real results, errors, coverage and artifact identity. Implement tool-specific complexity there.
3. **Write the agent behavior.** Implement the role instructions, tool descriptions, structured reasoning/output and bounded follow-up loop using the researched workflow as the blueprint.
4. **Connect the case and report.** Persist the relevant history, owner and next action; generate the usable role output; support review and subsequent recheck.
5. **Run and correct the working agent.** Exercise the actual tool/model path, fix failures and finish the relevant behavioral checks in the same task.
6. **Package that role.** Deliver a reproducible local invocation, configuration, saved example from an actual run and documented supported scope. Then expand its next capability.

This sequence applies to each role. It does not call for completing a separate evaluation program before implementation can begin.

## 3. Organize the builds into parallel streams

Use one coordinating Codex agent, two implementers and one flexible exploration/review slot within the available four concurrent slots. Rotate tasks as work completes; these are not human-engineer staffing allocations.

- **Coordinator:** shared runtime/case ownership, dependency choices, integration and current build state.
- **Implementer A:** initially M4’s source/code workflow, then M2 and applicable M9 work.
- **Implementer B:** initially browser preparation and M7, then M3/M6/M8 as the shared browser implementation becomes useful.
- **Flexible role:** bounded dependency/artifact exploration, independent review or merge assistance. Use available implementer slots for the two review axes when needed.

M1 and M5 use the next available implementation slot. Performance collection runs under controlled load separately from other browser activity. Source-reading work does not wait for a complete browser/application setup.

Implementers work in separate working copies/branches with explicit file ownership. One module owns shared case rules; tool-specific evidence adapters own invocation and evidence validity. Share browser preparation after an actual second caller needs it. Keep each role’s findings and domain decisions distinct.

## 4. Build sequence and deliverables

The following replaces the earlier T00–T17 draft. These are implementation work packages to split into focused tickets at the actual coding seams; they are not already published tickets.

| Build | Requires | What gets built |
|---|---|---|
| **B00 — Development copies and source execution** | Agreed local scope | Separate agent-code workspace and real Garage target clone; protected original; source-reading execution restrictions; minimal versioned role/result/case conventions. No full browser build prerequisite. |
| **B01 — M4 Planning and first runtime** | B00 | Scoped repository operations, direct model/tool loop, first case storage/review/recheck behavior and a runnable M4 work-packet workflow. |
| **B02 — Browser execution and M7** | B00; common runtime available for integrated invocation | Local Garage browser target, bounded HTTP/render collection and runnable M7 template investigation. Preparation and role code can develop alongside B01. |
| **B03 — M2 inventory and lifecycle workflow** | B01’s usable runtime | Scanner integration, applicability reasoning, authoritative notice conditions, deadline/exception history and a runnable decision-list workflow. |
| **B04 — M3 functional workflow** | Browser execution + usable runtime | Real Garage journeys, independent assertions, failure evidence/investigation, test-maintenance proposals and safe outcome recheck. |
| **B05 — M4 Readiness** | B01 | Supplied-result readers, revision/artifact matching, accepted-condition assessment and recovery questions alongside Planning mode. |
| **B06 — M6 accessibility workflow** | Browser execution + usable runtime | Full axe/state/keyboard collection, barrier identity and investigation, repair handoff and granular recheck. |
| **B07 — M1 incident workflow** | Usable runtime + actual local health/log observations | Signal intake, scoped investigation, incident history, owned next action and original-condition recovery tracking. |
| **B08 — M5 performance workflow** | Browser target + controlled collector execution | Repeated navigation collection, baseline/comparison implementation, focused diagnostic analysis and compatible remeasurement. |
| **B09 — M8 tracking workflow** | Usable runtime; browser capture uses browser execution | Event/choice configuration, selected parser, observation/reconciliation logic, mismatch investigation and saved decision/recheck workflow. |
| **B10 — M9 mobile-readiness workflow** | Usable runtime; actual readers need applicable tool/artifact | Reviewed requirement catalog, platform evidence ingestion, artifact/source reconciliation and owner-action reasoning. Build known input handling; resolve actual format/tool requirements before speculative readers. |
| **B11 — Role packaging and integrated toolkit** | Each included role’s implemented scope and passing checks | Independent role launch/configuration, shared runtime packaging, readable reports and a walkthrough of the working roles. Deliver incrementally; packaging one role does not wait for every role. |

**First deliverable:** a working M4 Planning agent on the real cloned repository. **Second stream:** a working M7 agent on the locally running clone. These give us two different implementations using the same small runtime before expanding across the remaining roles.

Next build M2 and M3, then schedule M4 Readiness, M6 and M1 as capacity opens; follow with M5, M8 and M9. Investigate missing mobile/tracking inputs early so those dependencies are visible before their implementation work begins. Keep all 9 on the build list.

Track progress as implemented operations, working role behaviors, actual runs and packaged capabilities. Reforecast after the first working agent and browser integration using observed implementation effort, rather than importing the earlier “3 people, 2 months” assumption into an AI-team build.

## 5. Use the real Garage clone, with clear scope

Use actual tracked code/content from a recorded committed Garage revision; preserve unrelated and uncommitted original work. The source revision inspected for the earlier plan was `8508f6275bc6511164cd842d2eb3a23fd1eb25c5`; record the chosen revision again when creating the clone. No synthetic application or generated business dataset is required.

Keep target preparation proportional to the work being run:

- Source-reading agents require a protected snapshot and enforced file/tool/network permissions for that execution mode.
- Browser agents additionally require the local application, browser dependencies and origin/request/action restrictions. Registry/browser and font preparation are separate setup activities; Garage uses next/font/google.
- Exclude production environment files, deployment linkage and write credentials. Remove production push destinations. Garage’s intake/request code can create actual issues, branches and PRs; cloning does not disable that code.
- Enforce restrictions outside model judgment. Prefer an available restricted job/container mechanism; verify the actual mechanism before relevant execution. Do not let unresolved browser preparation block independently safe source work.
- Check denied original paths without writing to them; use a disposable protected canary for an end-to-end denial check. Keep actual-original hashes/status as an additional check. No live external mutation is needed to test denial.

Local defects and repairs used during development belong only in the clone. Original-site changes remain a later explicit approval. The agents initially investigate and prepare reviewed decisions; code repair and deployment are separate actions.

### Application coverage does not define which agents we build

Garage provides useful real code, package inventory, page journeys, local health, page structure, accessibility and lab-performance evidence. It does not by itself provide a mobile app, an agreed tracking/CMP configuration or a successful downstream business-job outcome.

We can build the respective agents’ known tools, workflow and supported record handling while obtaining the missing actual inputs. A missing input is a specific integration/validation dependency, not a reason to replace the agent with a report saying “unavailable.” Equally, we will not claim mobile or consent behavior was demonstrated merely because the code launches on Garage. No invented app features or fabricated successful runs fill those gaps.

## 6. Attach quality checks to each build

Each implementation task includes focused checks of the behavior it changes: real collector handling, the bounded tool/model path, saved evidence/decisions and the relevant recheck. Include relevant partial, stale, denied, timeout and replay behavior. Keep native results, hypotheses and human dispositions distinct.

A role’s completion evidence travels with that role. Run shared integration checks when shared code changes; do not wait for a portfolio-wide test phase to discover basic defects. Use direct tool results as a baseline where it helps determine whether the agent’s investigation and next action are useful. Actual model execution is needed to substantiate claims about AI behavior.

Record runtime model/tool versions, calls, tokens, duration, termination and cost basis; verify prices for the selected runtime model when configuring it. Keep runtime API spending separate from Codex build usage. Missing costs or unavailable inputs stay explicit.

The existing maturity checkpoints remain: (1) working selected behavior with per-run cost logging, (2) a successful applicable real-project/repository run and ASE feedback, (3) customer usability with the existing council/security/pricing/account/Venu decisions. Tests support those decisions; they are not the main product being built.

## 7. Planning and implementation handoff

The build scope above is the concrete work. Use small self-contained local tickets and the dependency graph to allocate it; keep tracker setup and glossary/ADR creation minimal and relevant to the chosen build workspace. No production Garage issues, labels or registry changes are required.

The previously invoked planning skills require review of the proposed test seams and ticket breakdown before publishing executable tickets. This revision corrects the work packages and does not publish them or imply that a clone or agent already exists. Starting implementation remains distinct from later promotion to the live site.

## Sources and verification record

- [Revised 9-agent designs](handoff-session-2026-10-28-maintenance-agent-designs.md): exact roles, operating contract, scope and detailed pinned research appendix.
- [Implementation/reuse research](handoff-session-2026-10-27-maintenance-implementation-reuse.md): supported tool interfaces, source/release distinctions and prior license observations.
- [Primary Playwright reporters](https://playwright.dev/docs/test-reporters) and [accessibility guidance](https://playwright.dev/docs/accessibility-testing): structured runner output, state-specific axe integration and manual-evaluation limits.
- [Lighthouse CI configuration](https://googlechrome.github.io/lighthouse-ci/docs/configuration.html): explicit collect/assert/upload stages and local report collection.
- [OSV-Scanner source](https://github.com/google/osv-scanner): inventory scanning and the separate remediation path. Actual chosen release and operations require the integration check.
- [bundletool source](https://github.com/google/bundletool): official Android artifact operations; these do not establish store acceptance or a local installed toolchain.
- Repository observations: Garage maintenance data/module/pages; package/template files; intake/request code with external writes; original HEAD and local executable/package presence. Inspection is not a successful test/build/run.
- [Setup skill](/Users/jackiehimel/.agents/skills/setup-matt-pocock-skills/SKILL.md), [to-spec](/Users/jackiehimel/.agents/skills/to-spec/SKILL.md) and [to-tickets](/Users/jackiehimel/.agents/skills/to-tickets/SKILL.md): exact approval/configuration boundaries quoted above.

All build scope, sequencing and relative effort labels in this plan are recommendations. Upstream behavior supports reuse choices; it does not establish Solvd delivery speed, correctness, operating savings or customer readiness. The supporting local reuse and acceptance review notes are retained with this planning session. The library and deployed Garage remain unchanged.

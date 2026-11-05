# Recommended Solvd maintenance agent lineup

Date: 2026-10-26. Proposal for Jackie to review. No library, preview, registry, build order, deployment or production permissions changed. This supersedes the earlier packaging recommendation to retain ten separate entries; the underlying source and needs records remain valid within their stated limits.

## Decision

Recommend **nine reusable agent capabilities: four core maintenance roles and five application-specific specialists**. Select the relevant capabilities per application; nine is the proposed library size, not a required customer bundle or an empirical optimum.

The material change is an operating workflow: detect or receive a problem, assemble application context, investigate, prepare a specific engineering handoff, and check the supplied result. The existing monitor/report service remains the starting boundary. The orchestrator reviews and routes findings; fixes and deployments remain separately authorized, estimated and quoted. Proposed agents can prepare and review that work without implementing it.

This is a service-design recommendation grounded in the completed needs study and seven-provider comparison. Named competitor offerings establish credible workflow precedents. They do not establish Solvd delivery quality, customer demand, ROI or the uniquely correct number of agents.

## Four core roles

“Core” describes the proposed service workflow. Data access and meaningful work still determine applicability; a static site need not run an integration test suite.

| Proposed agent | Work and useful output | Basis and relation to existing library |
|---|---|---|
| **1. Reliability & Incident Triage** | Consume existing uptime/TLS/domain/heartbeat signals and agreed incident or support records. Where approved read-only logs and release records exist, group related symptoms, identify affected functions, distinguish observations from suspected causes, and prepare an evidence-backed next action for the responsible person. Track whether verification evidence was later supplied. Native monitors retain urgent alerting. | Reframes Uptime, Certificates & Incidents. Optional log/error/release context and ticket investigation are a **proposed scope expansion**, not an existing implementation. [Kimai's incident account](https://www.kimai.org/en/blog/2026/post-mortem-certificate-expired) and [Buttondown's incident account](https://buttondown.com/blog/incident-0035) demonstrate concrete detection/response jobs. [SoftServe](https://agenticengineering.softserveinc.com/) and [Sphere](https://www.sphereinc.com/services/ai-powered-software-maintenance) provide diagnosis/context/owner precedents. No guaranteed root cause, autonomous restart or 24/7 response is implied. |
| **2. Security & Lifecycle Review** | Maintain the identified dependency/runtime/service/integration inventory; relate advisories, support deadlines, published API/spec changes and vendor retirements to known versions, configuration and affected features. Give the owner a prioritized, sourced maintenance decision and the engineer affected components and checks. Unknown deployment applicability stays unknown. | Retains Dependency, Security & EOL and takes the inventory/interface/vendor-change review from Integration Check. [Ayala et al.](https://arxiv.org/html/2409.07669v1) documents selected maintainers' interpretation/capacity work; [Lercher et al.](https://arxiv.org/html/2311.08175v1) documents API-evolution work. [Firebase's retirement FAQ](https://firebase.google.com/support/dynamic-links-faq) shows feature/client-specific applicability. Native advisory/update tools remain the baseline. No general security audit, legal opinion, or safe-upgrade certification. |
| **3. Functional & Integration QA** | Use an agreed set of critical user tasks and API/webhook outcomes. Run or interpret existing tests and permitted synthetic checks; preserve failed-step evidence, distinguish application/test/environment failures where evidence allows, and propose reviewed test updates. For example, verify in a sandbox that a submitted form produces the expected downstream record, rather than checking only an HTTP success. | Expands Critical Journey Monitor to include functional/contract verification of identified integrations. Known external changes from agent 2 inform affected tests. The existing Integration Check reviewed inventory/interfaces/vendor changes; runtime verification and creating/changing executable tests are **proposed new reviewed scope**, not existing functionality. [Buttondown](https://buttondown.com/blog/incident-0035) supports checking meaningful outcomes; [Checkly](https://www.checklyhq.com/product/synthetic-monitoring/) supplies an existing baseline. [N-iX's QA kit](https://www.n-ix.com/apex-agentic-kits) is a configured test-design/execution/triage precedent. Production purchases, messages and data writes are not default test permissions. |
| **4. Change & Release Review** | Prepare a maintenance work packet: problem/evidence, affected code and dependencies, relevant history/hotspots, proposed change boundary, acceptance checks and release/rollback considerations. Review supplied change/test/release evidence and report what is still open. Code-health review also runs at assessment or before planned work. | Absorbs standalone Code Integrity into a broader review role. This **adds repair-handoff and release-evidence review**; it does not add implementation or deployment to the base service. [Mockus et al.](https://arxiv.org/html/2504.12517v1) supports contextual maintenance prioritization within a large-company study. [SoftServe](https://agenticengineering.softserveinc.com/) and [Sphere](https://www.sphereinc.com/services/ai-powered-software-maintenance) connect diagnosis/planning with tests and release work. Their implementation scope is broader than this proposal. A static code score alone does not establish priority or a reason to refactor. |

These roles have separate deliverables: agent 1 explains an operational problem; agent 2 explains a maintenance obligation; agent 3 checks expected behavior; agent 4 prepares/reviews a particular maintenance change. They share evidence rather than writing competing copies of the same ticket.

The base QA role may draft proposed test changes. Applying those changes or executing newly generated code requires the separately agreed target, review and execution scope; an existing permission to read evidence does not supply that authority.

## Five specialist roles

| Proposed agent | Select when and useful result | Research basis |
|---|---|---|
| **5. Performance Regression** | Important loading/interaction behavior matters. Compare agreed pages/states under comparable conditions, relate changes to available release evidence, distinguish lab diagnostics from real-user data and identify the next investigation. Runtime resource claims require appropriate runtime evidence. | [Google's Core Web Vitals workflow](https://web.dev/articles/vitals-tools) supplies measurement boundaries; [T-Mobile's engineering case](https://web.dev/case-studies/t-mobile-case-study) illustrates field-data use inside a broader improvement program. Neither proves our reporting improves conversion or can diagnose every memory leak. |
| **6. Accessibility Regression** | Users depend on accessible interfaces, including private apps. Find reproducible barriers in changed components and critical states, group repeated instances, propose a fix/test handoff, and identify human keyboard/screen-reader evaluation still required. | [WebAIM's screen-reader user survey](https://webaim.org/projects/screenreadersurvey10/) provides self-selected user evidence; [W3C evaluation guidance](https://www.w3.org/WAI/test-evaluate/) defines the automated/human boundary. No automated conformance certification. |
| **7. Technical SEO & Discoverability** | Intended public pages need search discovery. Compare technical indexing/crawl/rendering signals, separate intended exclusions from regressions, relate findings to changed templates or releases, and prepare a specific correction. | [Google's traffic-drop guidance](https://developers.google.com/search/docs/monitor-debug/debugging-search-traffic-drops), [AI-search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) and [Momentive's vendor-selected case](https://www.conductor.com/customer-stories/momentive-software/) support the job and boundaries. No special AI markup, guaranteed ranking, or claimed coverage of every AI engine. |
| **8. Tracking & Consent QA** | The application relies on event data or configured consent behavior. Compare selected event payloads, destinations and consent choices with an agreed expected-state contract; explain missing/duplicate/unexpected behavior and the affected decision. | [Elogia's vendor-selected QA account](https://www.trackingplan.com/customer-stories/how-elogia-scaled-value-with-trackingplan) and [Tang et al., USENIX 2025](https://www.usenix.org/system/files/usenixsecurity25-tang.pdf) support observable tracking/choice problems, with population/selection limits. No claim of legal compliance or automatic inference of the correct event design. |
| **9. Mobile Release Readiness** | An iOS/Android app is distributed through stores. Map relevant store/SDK requirements and console warnings to supplied build/artifact evidence, affected release channels, an owner and a release decision. Trigger on a relevant requirement, warning or release. | [Apple requirements](https://developer.apple.com/news/upcoming-requirements/), [Google Play requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en) and [IDEMS' maintainer record](https://github.com/IDEMSInternational/open-app-builder-actions/issues/37) support obligations and reuse of native validation. This does not establish binary/device correctness; crash/rating analysis needs separately agreed data and scope. |

These specialists feed the same maintenance queue. They do not each need a dashboard, separate knowledge store, model, fixed monthly narrative or custom replacement for existing measurement tools.

## What to adopt and how to adapt it

1. **SoftServe: connect diagnosis, code context, tests and release work.** Adopt the handoffs among roles. Use existing scanners, monitors, test runners and coding assistants as tools; build the project-specific evidence and review workflow around them. Solvd's initial offer prepares an actionable handoff; implementing fixes remains a separate engagement.
2. **Sphere: preserve a case from intake through verified closure.** Keep one record of evidence, accountable owner, disposition, requested approval and result. An item awaiting a quote is “awaiting remediation,” not “resolved.” Begin with approved read-only inputs and supervised outputs; do not copy its production authority or promise its coverage.
3. **N-iX: calibrate against the actual stack and retain customer-owned configuration.** Agree expected outcomes, permitted checks and output-quality criteria on a representative application before relying on them. Keep these definitions and evidence portable. Do not borrow its two-week commercial commitment or any vendor's performance claims.
4. **DataArt/EPAM: reuse components across engagements.** Shared connectors, evidence formats and tested workflows are sensible. A new platform, proprietary agent runtime or broad enterprise catalog is not needed for the first slice.

These are adaptations of published operating patterns, not claims of an exclusive Solvd invention or demonstrated advantage.

## What happens to every current entry

| Current entry | Proposed disposition |
|---|---|
| Code Integrity | Fold into Change & Release Review; preserve history, architecture rules and contextual hotspot evidence. |
| Dependency, Security & EOL | Retain/reframe as Security & Lifecycle Review; include identified vendor/API retirement applicability. |
| Integration Check | Move existing inventory/interface/spec/vendor-change review to Security & Lifecycle Review. Propose additional behavioral/contract verification under Functional & Integration QA where access and approved checks permit it. |
| Critical Journey Monitor | Expand into Functional & Integration QA. |
| Uptime, Certificates & Incidents | Expand to Reliability & Incident Triage with optional agreed incident/log/release context. |
| Performance | Retain as Performance Regression. |
| Accessibility | Retain as Accessibility Regression. |
| SEO & AI Search | Retain/reframe as Technical SEO & Discoverability. |
| Analytics, Tags & Consent | Retain/reframe as Tracking & Consent QA. |
| Mobile App Health & Store Readiness | Retain/reframe as Mobile Release Readiness, with the initial evidence boundary above. |

This produces nine entries by retiring Integration Check as a separate entry and placing its existing inventory/change-review work in Lifecycle, with new integration-behavior verification in the expanded QA role. Code Integrity becomes the broader Change & Release Review. It is a deliberate packaging choice, not a reason to erase useful checks or evidence. All changes remain proposals.

Carry forward the [earlier proposed first-slice limits](/Users/jackiehimel/ai-garage-web/docs/handoff-session-maintenance-selection-recommendation.md): potential-secret pattern checks remain optional, with secure evidence handling and no credential validation; license-policy and payment-page script/header/tamper review remain deferred to separately agreed scope. Domain-expiry observations require a reliable source and do not establish ownership, payment or renewal. Mobile crash/ANR/rating-trend work remains deferred pending agreed data and scope. The new agent names do not silently reintroduce those checks.

## Shared service responsibilities

The bundled human orchestrator owns client communication, prioritization, scope, access/approval routing and repair handoff. A maintained application record supplies important functions, integrations, deployment/version evidence, owners, existing alerts, expected behaviors, known limitations and runbooks. Use one maintained record with provenance; no separate “knowledge agent” is required.

Initial assessment for a stateful application must also cover important data/assets, actual backup coverage and retention, available restore-test evidence and the named recovery executor. [Supabase](https://supabase.com/docs/guides/platform/backups) explicitly excludes stored objects from database backups; [Plausible](https://plausible.io/security) describes restore exercises as a distinct practice. Native failed-backup alerts feed reliability triage where available. Revisit recovery evidence after relevant architecture/provider/data changes or an agreed exercise date. Performing a restore or recovery drill remains separately authorized work. No unattended restore or standalone backup agent is proposed.

The service must state who responds and when. Time-sensitive native alerts must reach the agreed responder without waiting for a reviewed periodic report. If no timely response arrangement exists, describe periodic review, not incident protection. “Closed” requires supplied evidence against the agreed check, with customer acceptance where required; a recommendation or accepted quote does not close an issue.

## First demonstration and decision boundary

Recommend demonstrating one connected maintenance case, using the existing dependency prototype where applicable: identify an applicable issue → explain affected behavior → prepare a change/test packet → inspect an existing or separately approved repair → rerun the agreed check → show the recorded outcome. This is a proposed proof priority, not an enacted change to the recorded build order.

Compare with the same native tools and a maintainer using an ordinary assistant. Record source correctness, unsupported/missed findings, whether an engineer can act without reconstructing the investigation, relevant pass/fail evidence, review effort and per-run cost. Do not claim superiority or savings until measured.

The current task authorizes the recommendation, not library edits, test execution on customer systems, remediation, external messages, commits or deployment. The earlier ten-card preview remains unchanged. Full evidence provenance remains in the [needs/source register](/Users/jackiehimel/ai-garage-web/docs/handoff-session-maintenance-selection-evidence.md) and [seven-provider comparison](/Users/jackiehimel/ai-garage-web/docs/handoff-session-2026-10-26-maintenance-service-competitors.md).

Today's three decisive competitor rechecks were retained at `.ua/maintenance-market-comparison-2026-10-26/lineup-followup/raw/`. Their published roles/workflows still support the stated precedents. This proposal does not independently test vendor outcomes, Solvd delivery, buyer demand, customer pricing or service economics.


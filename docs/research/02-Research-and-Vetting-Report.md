# Maintenance agent library: selection findings

**Assessment date:** October 21, 2026  
**Decision stage:** Selection for build and pilot, not customer readiness  
**Scope:** Solvd's 10 proposed maintenance agents

## Recommendation

**Keep all 10 as narrowly scoped candidates for the library. Scrap none under the agreed research-selection bar.** This is the coordinator's recommendation after separate research, independent challenge and correction passes. It does not authorize portfolio changes or commit Solvd to building every candidate immediately.

The evidence supports real recurring workflows and credible uses for the proposed outputs. The cases are stronger than generic statements that maintenance matters: they include attributable organizational activity, current requirements, close competitors and a specific recipient decision. They remain weaker than evidence that Solvd's own implementation improves results, that the intended buyers want this particular bundle, or that the service is profitable. Those claims have not been established.

No rejection was manufactured to make the assessment appear selective. The selection standard was also not changed to protect an existing agent. All recommendations are restricted to the stated applicable segment and current technical scope; an agent does not belong on an individual customer engagement merely because it remains in the library.

## Decisions and specific value

| Agent | Recommendation and applicable segment | Recurring work, useful output and decision | Evidence and principal limitation |
| --- | --- | --- | --- |
| Code Integrity | **Keep.** Supported repositories with an engineer responsible for maintenance prioritization. | Compare structural findings with change history and the accepted baseline; explain affected hotspots with file evidence so the maintainer can choose the next inspection or refactoring discussion. | Sonar (2026) documents broad developer toil; CodeScene (n.d.) documents VidMob's hotspot-led prioritization. Neither proves that this custom ranking or explanation is effective. Strong Fallow/CodeScene/Qlty overlap remains visible. |
| Dependency, Security & End of Life | **Keep.** Applications with identifiable software versions and a responsible technical reviewer. | Reconcile dependency, advisory, support and related posture evidence into a prioritized review; help decide which observations need confirmation or a separately scoped upgrade/security investigation. | Datadog (2026) documents observed software-posture concerns; Tanaka et al. (2026) document actual dependency-update/configuration activity. Bot-created PR counts are not measured human review effort. The usefulness of the combined report is still a pilot question. |
| Integration Check | **Keep.** Applications with meaningful external integrations that can be identified from supplied repository evidence. | Maintain the integration inventory and match relevant vendor notices/version differences to observed use; produce an evidence-linked impact-review brief so the owner can investigate applicability or schedule migration assessment. | Lercher et al. (2023) report actual practitioner change-review practices and dependency-aware roles. Current provider requirements establish conditional obligations; Zulip (n.d.) documents a procedure, not observed execution. The selected interview sample does not establish lightweight-app prevalence or the usefulness of a weekly report. |
| SEO & AI Search | **Keep.** Public websites for which technical search eligibility matters. | Revisit crawl access, metadata and structured data by template; explain changed technical findings so the owner can prioritize corrections or further Search Console investigation. | Conductor's (n.d.) named Momentive purchase/use account documents actual technical-monitoring commitment. It is undated, vendor-selected and an enterprise portfolio. Monthly checking supports periodic review, not continuous incident prevention or promised search rankings. |
| Performance | **Keep.** Maintained web applications with agreed templates and comparable repeated tests. | Track consistent changes against a baseline and assemble measurements/diagnostics into an investigation brief; help an engineer choose where to investigate and later check a change's measured effect. | The 2025 HTTP Archive performance chapter, published in 2026, provides observed need (Jariyal et al., 2026); T-Mobile documents a real cross-functional measurement workflow (Miré et al., 2025). Its richer real-user instrumentation and reported commercial outcomes cannot be attributed to the narrower Solvd proposal. CrUX may be unavailable for a small site. |
| Analytics, Tags & Consent | **Keep.** Sites with an agreed tracking plan, relevant events/consent states and an accountable owner. | Compare observed events, tags and selected script changes with agreed expectations; show evidence by tested state so the owner can investigate missing/unexpected behavior. | Elogia describes repeated manual analytics QA and subsequent monitoring adoption (Trackingplan, 2026). This vendor-selected account supports actual workflow use, not proven Solvd savings or universal small-site demand. DataTrue is a particularly close managed-service alternative. |
| Uptime, Certificates & Incidents | **Keep.** Applications with approved public endpoints and a defined person/process for acting on failures. | Collect endpoint/certificate/domain observations and relevant incident context; support alert follow-up, expiry review and a weekly evidence-linked status discussion. | Kimai's (2026) first-hand postmortem documents silent renewal failure and a monitoring change; CommonLit supplies a separate vendor-selected endpoint-monitoring case (Checkly, n.d.-a). Weekly interpretation cannot substitute for timely deterministic alerts, monitoring the collector itself, or an on-call response service. |
| Accessibility | **Keep.** Maintained public-service or form-heavy websites with someone able to act on findings and arrange manual checks. | Group detectable barriers by template/component, compare the accepted baseline and list outstanding manual checks; support a concrete remediation/audit-priority decision. | WebAIM (2026) documents detectable barriers; Government Digital Service (2024) records an actual automated/manual report-and-retest workflow. GDS is public-sector evidence, not a buying survey for lightweight commercial apps. Automated results do not establish accessibility conformance. |
| Critical Journey Monitor | **Keep.** Applications with explicitly agreed synthetic journeys, maintained expectations and approved test accounts/environments. | Compare journey outcomes and run evidence with prior runs, distinguish blocked/skipped checks and stability concerns; support the decision to investigate a product failure, test problem or missing coverage. | Named LinkedIn/Mistral cases document browser-journey monitoring (Checkly, n.d.-b, 2026); Atlassian (2025) documents actual flakiness-management work. These are enterprise/selected cases. Target upkeep, noisy failures, browser execution volume and reviewer time remain material unknowns. |
| Mobile App Health & Store Readiness | **Keep.** Maintained Android/iOS apps with supplied configuration/artifact evidence and a release owner. | Relate applicable current store requirements to identified app settings and available artifacts; produce a dated release-readiness review with explicit exceptions and unknowns. | Joplin's first-hand issue documents actual library/artifact investigation and maintenance work following a store notice (Cozic et al., 2025). Current platform policies (Google, 2026a, 2026b; Apple, n.d.) are separate from historical issue deadlines. Native warnings plus a human checklist may suffice for simple apps; store acceptance is not guaranteed. |

The cited research and market sources are listed below and in the per-agent dossiers. Every dossier has a complete gate table, at least three relevant alternatives, an illustrative output, an input/access map, resource assumptions and a challenge record.

## What the competitor analysis changes

The proposed offering enters established categories. Close alternatives often already provide scheduling, baselines, trends, prioritization or AI explanation. Those features cannot be described as Solvd inventions or assumed gaps in the market.

Important comparisons include Fallow/CodeScene/Qlty for structural review; Dependabot, Snyk and Renovate for dependency workflows; TOPSinfo, oasdiff, VendorWatch and Stripe's official assistant workflow for integration change review; Screaming Frog, Semrush and Ahrefs for technical search work; Lighthouse CI, SpeedCurve, DebugBear and Calibre for performance; Trackingplan, ObservePoint and DataTrue for analytics; Gatus and established uptime services for endpoint monitoring; Pa11y, axe Monitor, Silktide and Pope Tech for accessibility; and Checkly, Datadog, Playwright/CI and Grafana for journeys. Mobile comparisons include native store/toolchain warnings and release/crash dashboards, within their distinct scopes. The complete capability/price citations and reference metadata are in the corresponding [Code](agents/code-integrity.md), [Dependency](agents/dependency-security-eol.md), [Integration](agents/integration-check.md), [SEO](agents/seo-ai-search.md), [Performance](agents/performance.md), [Analytics](agents/analytics-tags-consent.md), [Uptime](agents/uptime-certs-incidents.md), [Accessibility](agents/accessibility.md), [Journey](agents/critical-journey.md) and [Mobile](agents/mobile-app-health.md) dossiers and their source records; the expanded list does not imply measured equivalence.

**DataTrue is a close service comparison, not merely another scanner.** Its own documentation describes managed setup, tailored reporting and human review, with a Starter price displayed as $1,333/month equivalent, billed $16,000 annually. Higher-tier custom managed journeys/reports must not be attributed to that base tier. This is published supply and pricing evidence, not proof of adoption or willingness to pay for Solvd's bundle (DataTrue, 2026a, 2026b).

The defensible inclusion rationale for a Solvd agent is its specified recurring project-aware work, usable evidence-linked output and accountable review within this offering. That is a plausible design and commercial rationale; it is not evidence of superior outcomes. The dossiers preserve the strongest counterargument for each: existing native reports, deterministic tools and ordinary maintainer judgment may already be sufficient.

## Portfolio and economics

**Retaining 10 library options does not justify deploying 10 agents to every application.** Search-specific work needs a public search use case; analytics needs an agreed plan; journeys need approved and maintained tests; mobile readiness needs a mobile app and relevant evidence. Repository structure, dependency posture and integration changes remain distinct questions even when they share acquisition and inventory work.

Shared infrastructure should be specified and costed once: isolated execution, scheduling, access configuration, inventory, normalized findings, baselines/coverage, evidence storage, redaction and report validation. Persistent probing adds a distinct operating obligation. Separate per-agent collector/rule upkeep and per-customer configuration from those shared costs. A combined review meeting may reuse context, but it does not remove the domain-specific judgment.

The resource ranges are **heterogeneous analyst planning assumptions**, not quotes or measurements. At eight hours/person-day, incremental engineering totals **184/376/720 hours for the first six**, and **360/728/1,432 for all ten**. The coordinator’s single reference shared-core envelope is **64/128/240 hours**, anchored to the broadest original core range; it replaces repeated core allocations but does not prove the combined scope fits. Persistent Uptime collection adds **24/48/96 engineering hours once if selected**. Thus first-six reference totals are **248/504/960 hours**, and all-ten totals **448/904/1,768**. At an explicitly assumed **30 productive engineering hours/week**, these imply roughly **8.3/16.8/32.0** and **14.9/30.1/58.9 engineer-weeks**, with no promised calendar dates or approved budget. The [portfolio model](portfolio-resource-model.md) shows every candidate, its source range and effort drivers; design must reconcile differing target sizes, supported inputs and shared boundaries before commitment.

Gross summed routine-review assumptions normalize to **4.6/12.1/31.8 hours/month** for an all-ten stress-test portfolio, **before overlap credits, support and investigation**. Shared context or a combined meeting supplies no unmeasured discount. Common platform operations **1/3/8 hours/month once** is separate; domain catalog/adapter upkeep, per-customer setup/support and specialist fixture preparation remain additional, with available ranges and unresolved capacity identified in the model. Required roles are not actual staffing assignments. Review labor, failed-run support, source/rule upkeep and test maintenance are meaningful cost drivers; no margin, savings, bundle price or remediation attach rate is established.

As a transparent sensitivity calculation, five weekly-report agents plus four monthly-report agents produce up to about 25.7 report opportunities per average month before quiet-week suppression and extra release checks. An assumed 10–30 minutes of routine review per opportunity gives about 4.3–12.8 hours/month. This is a stress-test scenario, not a validated customer deployment or a service promise; investigation, setup, support and fixes are additional. This generic minutes/report exercise is a different scenario from the summed dossier routine-review estimates above. See [portfolio-resource-model.md](portfolio-resource-model.md) for the arithmetic and exclusions.

## How the review was performed

The revised charter was frozen before verdicts. Five research subagents covered two candidates each; five fresh review subagents independently checked decisive source text and searched for omitted alternatives/counterevidence. The coordinator performed additional primary-source checks and reconciled findings. Reviewer agreement itself was not counted as market evidence.

All six gates were applied: recurring need, actual market-use/resource evidence, useful agent work/output, competitive/commercial inclusion rationale, delivery feasibility and stage-appropriate resource economics. Numerical source floors were only screening rules. Segment applicability, directness and source interest still required judgment.

Material corrections included:

- Separating bot PR counts from human review effort in the dependency case.
- Adding close omitted alternatives, including DataTrue's managed service and relevant smaller-team/open-source options.
- Correcting published prices, annual billing, consumption units and separate AI/RCA entitlements.
- Preserving adjacent qualifications in organizational case material and source-specific access failures.
- Correcting all ten pilot contracts: Accessibility/Mobile were corrected in the earlier pass; the final audit correction replaces the remaining eight percentage/time/spend/setup acceptance rules with predeclared, domain-specific finite expert-reviewed fixtures, faithful coverage/state accounting, evidence traceability and correction/retest on mismatches. Actual resource use and useful decisions are measured against planning assumptions; a future paid/operational pilot requires its own adopted budget.

There were research-budget limitations. One dependency pass recorded 15 distinct endpoints plus 14 repeated page/section requests, exceeding a literal 20-operation cap. Some API/tool documentation and pricing pages remained inaccessible; those claims stay partial/unavailable and appear in the dossiers. The coordinator’s later first-party endoflife.date README check establishes the frozen API’s documented integration route and beta/breaking-change caveat (endoflife.date project, n.d.). It does not verify a live response, schema, coverage/freshness, terms or service guarantee. Pin API/schema/data version and cross-check returned supported lifecycle records against official policy before implementation/run; unsupported or unvalidated records remain unknown. The .NET policy is comparison evidence, not a replacement feed. No unavailable page was treated as proof of a product's absence or of complete API coverage. The final audit correction record is [final-portfolio-resolution.json](reviews/final-portfolio-resolution.json); the [bounded independent re-review](reviews/final-portfolio-rereview.md) approved all four corrections, with no unresolved material finding. The regenerated source ledger now contains 121 records covering 117 distinct URLs: 110 verified, 4 partial and 7 unavailable, after the subsequent source-quality follow-up. These counts describe recorded source checks, not 120 independent studies or universal source verification.

## Date audit and correction

The original bibliography overused “n.d.”: available footer and page-specific metadata dates had been missed, and the earlier reviews failed to detect them. A separate audit inspected all 91 distinct formerly undated routes (95 source records), including one internal snapshot. Three auditors adjudicated original-publisher date signals; the coordinator separately matched Mistral’s case to its exact published CMS UID and URL. **23 public-source records across 22 URLs have corrected dates.** Corrections distinguish publication from content updates and preserve metadata-only qualifications. The full [date audit](date-audit/summary.md) lists each correction and the remaining date-unlocated or date-unverified cases.

A content-update timestamp is not an observation date, a date of adoption, or proof that every claim changed then. M&T Bank’s recovered July 9, 2024 publication and Semrush’s August 16, 2016 publication remain historical evidence; CrUX methodology’s June 20, 2024 update is technical documentation. Mistral’s July 30, 2026 CMS publication does not establish when its customer activity occurred. No copyright year, API effective date, repository creation/latest-commit date or retrieval timestamp was substituted for publication. Remaining “n.d.” means no attributable publication/update date was located in this bounded check, not proof that the source has never had a date. Historical failed-retrieval records remain separate from verified references.

The age corrections do not remove the existing current observation/requirement evidence underpinning any selection gate. The ten build/pilot recommendations therefore remain unchanged; this date audit does not strengthen vendor-selected cases into independent effectiveness evidence or establish demand for Solvd’s bundle.

## Subsequent source-quality correction

User review correctly challenged technical documentation as a main justification. A source-role audit distinguishes empirical need and reported actual use from requirements, procedures and competitor supply across all ten public drafts. Integration’s original argument overstated Zulip’s instructions as actual work. It now uses directly inspected original practitioner research (Lercher et al.,2023), retains current provider requirements separately, and treats Zulip as process documentation. The source supports reported task/resource commitment, not Solvd demand or the chosen weekly cadence. The [independent correction review](source-quality/integration-correction-review.md) finds the narrow G1/G2 Keep defensible under the unchanged bar. Other public-copy corrections narrow broad-survey and segment-transfer claims.

## Proposed next evidence

For each retained candidate, build/pilot evidence should establish declared fixture coverage, clean/no-change behavior, truthful handling of missing inputs, usefulness to the named reviewer and actual setup/run/review costs. Expected outputs must be frozen before evaluation; zero fabricated policy, compliance or factual guarantees is a proposed acceptance rule, not an observed result.

Measure whether the intended reviewer finds the output useful enough to continue using it. Public evidence supports the workflow families but does not establish demand for the exact Solvd bundle. That commercial uncertainty remains explicit; this plan does not impose interviews with Solvd's customers.

The separate proposed roadmap justifies the current six-agent technical starting sequence using evidence, recipient value, effort and shared dependencies; it shows per-stage engineering ranges, required roles, later-agent prerequisites and weekly reviews within stages that may span multiple weeks. Actual implementation, agent runs, portfolio changes and publication remain separate work.

## Selected references

Apple. (n.d.). *Upcoming Requirements*. https://developer.apple.com/news/upcoming-requirements/

Atlassian. (2025, December 8). *Taming Test Flakiness: How We Built a Scalable Tool to Detect and Manage Flaky Tests*. https://www.atlassian.com/blog/how-we-build/taming-test-flakiness-how-we-built-a-scalable-tool-to-detect-and-manage-flaky-tests

Checkly. (n.d.-a). *How CommonLit Runs Monitoring With 100% Accuracy and No False Positives*. https://www.checklyhq.com/case-study/commonlit/

Checkly. (n.d.-b). *How LinkedIn modernized their monitoring infrastructure with Checkly*. https://www.checklyhq.com/case-study/modernizing-linkedins-monitoring-infrastructure/

Checkly. (2026, July 30). *How Mistral Monitors Models and Products at Shipping Speed with Checkly*. https://www.checklyhq.com/case-study/mistral-monitoring-as-code/

The Checkly titles are vendor wording; their outcome claims are not adopted as measured effects. Named participants and exact passages are recorded in the source ledgers.

CodeScene. (n.d.). *VidMob reduces unplanned work by 50% after only two months*. https://codescene.com/resources/customers/vid-mob

The title is the vendor's; its outcome percentage is not adopted as a verified effect.

Conductor. (n.d.). *Boosting organic traffic by 50% for Momentive Software*. https://www.conductor.com/customer-stories/momentive-software/

Used for the named monitoring workflow and purchase consideration, not the title's causal performance claim.

Cozic, L. (laurent22), personalizedrefrigerator, & Joplin maintainers. (2025, September 2). *Android app must support 16 KB page size, issue #13113*. https://github.com/laurent22/joplin/issues/13113

DataTrue. (2026a, October 12). *DataTrue Pricing*. https://datatrue.com/en/pricing/

DataTrue. (2026b, October 12). *Tag and Privacy Monitoring, Done for You*. https://datatrue.com/en/how-it-works/

Datadog. (2026, February). *State of DevSecOps*. https://www.datadoghq.com/state-of-devsecops/

endoflife.date project. (n.d.). *Informative site with EoL dates of everything (project README)*. https://github.com/endoflife-date/endoflife.date

GitHub. (n.d.). *API Versions*. https://docs.github.com/en/rest/about-the-rest-api/api-versions

Google. (2026a, October 16). *Meet Google Play’s target API level requirement*. https://developer.android.com/google/play/requirements/target-sdk

Google. (2026b, October 16). *Support 16 KB page sizes*. https://developer.android.com/guide/practices/page-sizes

Government Digital Service. (2024, December 17). *Accessibility monitoring of public sector websites and mobile apps from 2022 to 2024*. https://www.gov.uk/government/publications/accessibility-monitoring-of-public-sector-websites-and-mobile-apps-from-2022-to-2024/accessibility-monitoring-of-public-sector-websites-and-mobile-apps-from-2022-to-2024

Jariyal, H., Rasam, P., Humaira, & Grogg, A. T. (2026, January 15). *Performance*. In *Web Almanac 2025*. HTTP Archive. https://almanac.httparchive.org/en/2025/performance

Kimai. (2026, May 11). *Expired SSL certificate and a new monitoring setup*. https://www.kimai.org/en/blog/2026/post-mortem-certificate-expired

Lercher, A., Glock, J., Macho, C., & Pinzger, M. (2023, November 14). *Microservice API evolution in practice: A study on strategies and challenges* [Preprint]. arXiv. https://doi.org/10.48550/arXiv.2311.08175

Miré, L., Lee, D., Yeow, T., & Dinger, B. (2025, March 19). *T-Mobile’s data-driven approach to web performance led to a 20% reduction in user site issues and a 60% improvement in visit-to-order rate*. web.dev. https://web.dev/case-studies/t-mobile-case-study

The T-Mobile title describes a wider optimization program; its outcomes are not attributed to Solvd or recurring monitoring alone.

Sonar. (2026). *State of code developer survey report 2026*. https://www.sonarsource.com/state-of-code-developer-survey-report.pdf

Stripe. (n.d.). *Versioning*. https://docs.stripe.com/api/versioning

Tanaka, H., Tsuchida, R., Shimari, K., Kula, R. G., & Matsumoto, K. (2026, September 15). *An exploratory study of Dependabot cooldown adoption in open-source GitHub projects* [Preprint]. arXiv. https://arxiv.org/html/2609.16605v1

Trackingplan. (2026, March 25). *Scaling value, not time: How Elogia transformed its agency model around value-based partnerships*. https://www.trackingplan.com/customer-stories/how-elogia-scaled-value-with-trackingplan

WebAIM. (2026). *The WebAIM Million: The 2026 report on the accessibility of the top 1,000,000 home pages*. https://webaim.org/projects/million/

Zulip. (n.d.). *Billing (Development)*. https://zulip.readthedocs.io/en/latest/subsystems/billing.html

Additional primary policies, technical research and competitor references are given with exact claim locators in `evidence.csv` and the individual dossiers/source JSON. Vendor-selected cases and empirical preprints are identified as such; no access dates are displayed. Same-author, same-year and undated references use alphabetic title suffixes within this report. Publication dates and content-update dates are distinguished in the source ledger; an update does not date the underlying observations.

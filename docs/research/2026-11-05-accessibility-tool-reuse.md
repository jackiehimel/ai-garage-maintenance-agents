# Accessibility tool reuse: smallest useful next increment

Verified against official documentation on 2026-11-05. This is a research recommendation, not a claim that an integration has been implemented or tested.

## Recommendation

Keep axe-core. Add **reason-preserving incomplete triage and a bounded, keyboard-only focus trace**, following Accessibility Insights' assisted-testing model. A targeted retry may resolve transient measurement failures; focus tracing adds interaction evidence. Neither should relabel inherently manual checks as automated passes. Defer another engine and commercial integrations until this small addition is measured.

Microsoft's FastPass combines axe checks, assisted tab-stop testing, and human review. Its tab-stop helper explicitly describes automatic findings as possible failures requiring verification. Current Assessment documentation describes 24 tests for WCAG 2.2 AA, divided into automated, assisted, and manual requirements; older overview pages still mention 2.1 (Microsoft, n.d.-a, n.d.-b).

## Reuse and commercial boundaries

| Tool | Verified capabilities | Practical reuse / boundary |
| --- | --- | --- |
| Microsoft Accessibility Insights for Web | axe-based automated checks; tab-order visualization and possible unreachable/trap findings; structured assisted/manual assessment | Extension source is MIT. Independently implement the documented workflow with Playwright; if copying substantial source, retain Microsoft copyright and MIT notice. It is an extension, not a documented drop-in headless assessment API (Microsoft, n.d.-a, n.d.-c). |
| axe-core | Browser-local rule engine; separate violations, passes, incomplete, and inapplicable results; check-specific data and messages | Already the right baseline. MPL-2.0 source, not MIT. Preserve notices and review source-distribution obligations if modifying/distributing covered files. A separate original adapter avoids copying internals (Deque Systems, n.d.-a, n.d.-b). |
| Deque automated Intelligent Guided Tests | AI-assisted keyboard, interactive-element, modal, image, structure, and table reviews, with human corrections | Requires Pro/Web subscription, AI features, and available AI credits. Traditional IGT workflows remain subscription features. Do not copy proprietary implementation or claim equivalent automation (Deque Systems, n.d.-c). |
| Deque Advanced Rules / MCP | Advanced rules use screenshots, vision, and LLMs for visual headings, unhelpful image alternatives, and contrast over gradients/images; MCP exposes analyze/remediate, with IGT options | Advanced Rules are part of the Web subscription; MCP access requires an eligible subscription and API-key or OAuth credentials. No account-free/key-free replacement is established by these documents. The deprecated `igt` MCP tool is superseded by `analyze` IGT parameters (Deque Systems, n.d.-d, n.d.-e, n.d.-f). |
| IBM Equal Access | `accessibility-checker` supports existing Playwright pages, configurable policies, reports, and baselines | Apache-2.0 repository/engine. Optional independent second opinion, not a mechanism for turning axe incompletes into passes. Preserve applicable license/NOTICE material. Avoid introducing an unguarded browser or remote rule fetch (IBM, n.d.-a, n.d.-b). |

## Exact integration surfaces

1. **Existing axe adapter:** `await new AxeBuilder({ page }).options({ resultTypes: ['violations', 'incomplete'] }).analyze()`. Playwright documents `AxeBuilder`, `.analyze()`, `.include()`, and `.withTags()`; axe documents `resultTypes`. Importantly, omitted result types can still appear with at most one node: this option is not a result filter. For a targeted retry, axe supports `axe.run(context, { runOnly: { type: 'rule', values: ruleIds } })` (Microsoft, n.d.-d; Deque Systems, n.d.-a).
2. **Keyboard evidence:** `await page.keyboard.press('Tab')` and `await page.keyboard.press('Shift+Tab')`; inspect active-element identity through `page.evaluate(...)`; retain screenshot and rectangle evidence. `locator.ariaSnapshot()` is available from Playwright 1.49 and can supply accessible role/name context. Check the installed version before using newer snapshot options (Microsoft, n.d.-e, n.d.-f).
3. **Optional IBM:** `const { report } = await aChecker.getCompliance(page, uniqueLabel)` followed by `await aChecker.close()` in cleanup. Documentation lists Playwright Page as an accepted input. `assertCompliance(report)` evaluates configured failure levels or a baseline; a matching baseline does not independently prove conformance. The package can download/cache engine/rule assets and documents CDN/CSP interactions, so audit and pin acquisition before enabling it in this runtime (IBM, n.d.-a).

## Small implementation proposal

These are proposed engineering constraints, not vendor guarantees.

1. **Preserve the actual uncertainty.** Store every incomplete node's rule ID, frame/shadow target path, HTML, `failureSummary`, and `any/all/none` checks (`id`, `message`, optional `data`, related nodes). Add a derived reason such as measurement unavailable, blocked resource/frame, execution error, or content judgment; retain the raw result. Deduplicate only within the same rule, node, and observed state. Axe explicitly distinguishes incomplete from failure and absence of matching content (Deque Systems, n.d.-a).
2. **Retry only plausibly transient measurement failures.** After bounded font/image readiness and two stable layout observations, run the affected rules once more in the same viewport/state. Retain both attempts. Resolve a review item only when the engine explicitly returns a determinate outcome for that same node/rule; disappearance, timeout, navigation, a different state, or fewer returned nodes is not a pass. Do not force-load blocked resources, disable CSP, or mutate styles to manufacture a measurement.
3. **Add a focus trace with explicit limits.** Proposed defaults: 40 forward tabs, 10 reverse tabs, 10 seconds, bounded screenshots. Follow open shadow roots when collecting active elements; record inaccessible frames/closed roots as coverage gaps. Store order, identity, bounds, role/name evidence, and focused-state screenshots. A repeated cycle is a stop condition and a possible trap, not proof. Ordinary document wraparound and legitimate modal containment must not become automatic WCAG failures.
4. **Keep activation out of discovery.** Permit only Tab/Shift+Tab in this increment. Do not press Enter/Space, fill fields, click controls, or explore menus automatically. Arrow navigation is necessary for many composite widgets but can change values; add it only through a separately specified fixture/site-specific protocol. The trace therefore cannot prove every interactive element is reachable or every control works.
5. **Reuse every existing runtime guard.** Keep non-GET/HEAD blocking, unsafe-destination validation, and service-worker blocking. During the probe, reject new document navigation and popup creation through the existing guarded infrastructure; stop and record attempted navigation, dialogs, downloads, or policy blocks. Tab/focus handlers can execute page JavaScript, so keyboard-only does not imply absence of side effects. Never loosen egress policy to complete a test.
6. **Report three separate quantities:** determinate engine findings, remaining review items with reasons, and interaction coverage/probe limitations. Save changed focus-state screenshots and optionally rerun axe in a bounded genuinely changed state. Claim improved evidence and measured additional coverage, not WCAG certification or an assumed reduction percentage.

## Contrast and media limits

Axe's check-development documentation gives background images as an example of missing contrast data. Gradient/image pixel inference would require a separate validated algorithm; one sampled pixel or an LLM confidence score should not overwrite the engine result. Deque's commercial Advanced Rules specifically target this gap (Deque Systems, n.d.-d, n.d.-g).

For media, collect existing `<track>` metadata and rendered context without playing/downloading media. Presence of a captions track does not prove accurate synchronized captions; absence alone does not establish whether an audio-dependent requirement applies. Current axe rule descriptions classify `video-caption` as needs review and list `audio-caption` among deprecated rules. Discover supported rule IDs from the installed axe version rather than hardcoding older media rules (Deque Systems, n.d.-h).

## Acceptance checks before shipping

Use small controlled fixtures: normal forward/reverse traversal; intentional document wrap; legitimate modal containment; deliberate trap; shadow-root focus; iframe boundary; layout/font readiness; persistent image-background contrast incomplete; media track present/absent; navigation and prohibited-request attempts triggered on focus. Verify the probe stops, all original security guards still reject prohibited actions, raw evidence survives, no unresolved item is silently counted as passing, and total probe time is bounded. These tests validate the adapter's behavior; they do not validate full accessibility conformance.

## Official references

All sources below were accessed November 5, 2026; documentation and branch URLs can change.

- Deque Systems. (n.d.-a). *Axe JavaScript accessibility API*. https://github.com/dequelabs/axe-core/blob/develop/doc/API.md
- Deque Systems. (n.d.-b). *axe-core license (MPL 2.0)*. https://github.com/dequelabs/axe-core/blob/develop/LICENSE
- Deque Systems. (n.d.-c). *Automated intelligent guided testing*. https://docs.deque.com/devtools-for-web/4/en/automated-igts/
- Deque Systems. (n.d.-d). *Advanced rules*. https://docs.deque.com/devtools-server/4.0.0/en/advanced-rules/
- Deque Systems. (n.d.-e). *Axe MCP server*. https://docs.deque.com/devtools-server/4.0.0/en/axe-mcp-server/
- Deque Systems. (n.d.-f). *Security & privacy FAQ*. https://docs.deque.com/devtools-server/4.0.0/en/axe-mcp-server-security/
- Deque Systems. (n.d.-g). *Rule development*. https://github.com/dequelabs/axe-core/blob/develop/doc/rule-development.md
- Deque Systems. (n.d.-h). *Rule descriptions*. https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md
- IBM. (n.d.-a). *accessibility-checker API and configuration*. https://github.com/IBMa/equal-access/blob/main-4.x/accessibility-checker/src/README.md
- IBM. (n.d.-b). *Equal Access engine license (Apache 2.0)*. https://github.com/IBMa/equal-access/blob/main-4.x/accessibility-checker-engine/LICENSE
- Microsoft. (n.d.-a). *FastPass in Accessibility Insights for Web*. https://accessibilityinsights.io/docs/web/getstarted/fastpass/
- Microsoft. (n.d.-b). *Assessment in Accessibility Insights for Web*. https://accessibilityinsights.io/docs/web/getstarted/assessment/
- Microsoft. (n.d.-c). *Accessibility Insights for Web source and MIT license*. https://github.com/microsoft/accessibility-insights-web ; https://github.com/microsoft/accessibility-insights-web/blob/main/LICENSE
- Microsoft. (n.d.-d). *Accessibility testing: Playwright*. https://playwright.dev/docs/accessibility-testing
- Microsoft. (n.d.-e). *Keyboard: Playwright*. https://playwright.dev/docs/api/class-keyboard#keyboard-press
- Microsoft. (n.d.-f). *Locator.ariaSnapshot: Playwright*. https://playwright.dev/docs/api/class-locator#locator-aria-snapshot

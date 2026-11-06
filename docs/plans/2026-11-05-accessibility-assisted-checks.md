# Accessibility assisted checks implementation plan

> For agentic workers: use superpowers:subagent-driven-development. User explicitly directed research and implementation; existing urgent execution authorization applies.

Goal: add useful existing-tool techniques to the default public URL accessibility agent, with measured evidence and understandable next actions.
Architecture: keep axe and configured keyboard states. Add an independently implemented bounded Tab/Shift+Tab probe after the initial axe capture, plus reason-specific review guidance and readable probe results. Follow Microsoft's documented assisted tab-stop workflow, not proprietary Deque internals. No new paid provider or dependency.
Tech stack: current TypeScript, Playwright, axe, static JS UI and HTML exporter.
Spec: this document's global constraints and Task 1 define the authorized increment. Research: docs/research/2026-11-05-accessibility-tool-reuse.md.

## Global Constraints
- Preserve all browser/network protections, guards, public URL restrictions, and method policy. No local browser/server starts: live validation runs in existing GitHub Actions. No foreground user Chrome.
- No paid subscription integration, new dependency, external API or additional model call. Do not copy vendor implementation.
- Never mark an unresolved axe item as passed or a heuristic as a confirmed WCAG violation. Keep original findings, IDs, raw axe and baseline evidence intact.
- Default URL-only runs get the probe; old saved reports render gracefully. Scope is a bounded sample, not complete keyboard or screen-reader coverage.
- Probe sends Tab and Shift+Tab only. No Enter, Space, arrow keys, clicks, field filling or automatic widget activation. Block network/navigation before probe actions through existing guard mechanisms.
- User-facing information leads with concrete actions and observations. Technical identifiers are collapsed. Preserve detailed conformance limits under 'What this check covers' rather than the top sentence.
- Own only feature files listed below. Root owns remote acceptance script/workflow and publishing. Do not alter dist/app while user's server runs.

## Approaches and decision
1. Commercial Deque automated IGT/Advanced Rules: broader AI/visual capabilities but needs subscription, credentials and integration; not silently available through axe-core.
2. Another engine (IBM): adds independent rules but does not resolve manual judgments and adds acquisition/network concerns.
3. Existing axe plus automatic assisted focus evidence and reason-specific review: selected for immediate delivery, no new account or dependency. This is the controller's implementation choice within the user's request, not a claim of commercial parity.

## Review focus
- Normal wraparound/modal containment must not become a confirmed trap or failure.
- Shadow roots/frames, capped samples and navigation attempts must retain honest scope and limits.
- Probe timeout/failure must preserve previously collected axe data.
- Untrusted page text must be bounded, escaped and never treated as instructions.
- Old reports without new measurements must remain readable and not claim a probe ran.

### Task 1: Default assisted accessibility checks and readable evidence
Files:
- Create src/agents/accessibility-probe.ts for the probe and its portable types/policy.
- Modify src/agents/accessibility.ts for invocation, evidence assembly, richer incomplete checks and rule-specific actions.
- Modify public/app.js, src/report.ts and public/styles.css only if needed for readable keyboard results and scope copy.
- Tests: tests/accessibility.test.ts, new tests/accessibility-probe.test.ts, tests/report.test.ts as needed.
- Add a small exported in-memory fixture harness scripts/verify-accessibility-assisted.mjs only if needed; coordinate before writing because root owns CI verification.

Interfaces:
- Export KeyboardProbe with status:'complete'|'incomplete'|'unavailable', steps array, reason?, termination, forwardLimit, reverseLimit, elapsedMs, scopeLimit text. Each step records index/key/focus (selector, tag, labelHint, optional role, rect), optionally screenshot artifact linkage only if straightforward. LabelHint is observed DOM text/ARIA text, never claimed as computed accessible name.
- Export collectKeyboardProbe(page, options) from helper; options include AbortSignal and existing guard callbacks needed to stop on blocked actions/navigation. Exact TypeScript types may follow current module conventions.
- Extend AccessibilityScan with optional keyboardProbe. Result measurements.keyboardProbe={version:1,scopes:[{page,state,...portable probe}]} and measured evidence kind 'keyboard-probe'. Use coverage subject 'Sampled keyboard navigation'. Initial scopes only; no duplicate probe in manually configured states.

Steps:
- [ ] Write failing focused tests for normal forward/reverse trace, normal repeat/wrap as observation only, hard step/time limits, frame boundary, navigation/form guard stop, failure preserving prior axe, bounded escaped untrusted labels, and legacy report absent probe.
- [ ] Implement probe after axe capture and component mapping. At most 40 forward Tabs and 10 reverse Tabs, at most 8 seconds overall inside the existing 28-second scope budget. Stop on meaningful repeated cycle; describe repeat without asserting trap. Finish bounded sampling as complete for the declared sample, with termination and limit visible; timeout/unsafe action/frame boundary as incomplete. Do not claim every interactive element was checked. Guard prevents document/popup/form changes before they occur. No scan failure may erase an already captured axe result. Use existing guarded Page, seal new requests during probe; blocked content/navigation requests require a limitation. Background reporting is not a new site defect.
- [ ] Preserve incomplete check IDs/messages and bounded check data/related-node context (keep raw original). For contrast review, explain recorded overlap/pseudo-element/image/gradient/unknown-background reason and how to measure actual displayed colors; never invent ratios. For video-caption, explain inspecting meaningful audio and caption accuracy; no automatic pass/fail from track presence. Generic rules get linked guidance and exact recorded reason. Do not reduce unresolved counts without explicit measured determinate evidence.
- [ ] Render 'Keyboard navigation sample' in both UI and HTML: counts, what was sampled, readable numbered focus sequence with labelHint/tag and forward/backward direction; technical selectors in details. Make stopped/limited scope and next human action visible. Old reports say no sample was recorded only within this section if shown, never pretend they ran it.
- [ ] Replace prominent accessibility conformance warning with 'Automated accessibility check. See detected issues, recommended actions and checks that need human review.' Preserve full limitation in a collapsed 'What this check covers' in UI and HTML. Do not alter other agent behavior.
- [ ] Compile to .superpowers/sdd/2026-11-05-accessibility-assisted-checks/test-dist and run focused tests during iteration, full suite once. No npm build writing dist/app, browser/server launch or network shell calls. Root owns real-browser fixtures and liveSolvd CI. Commit only task-owned files and write report with exactcommands/test evidence.

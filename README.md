# AI Garage Maintenance Agents

Solvd maintenance-agent implementation workspace. The initial delivery is three independent public-page checks: technical SEO, accessibility and performance.

## Start here

1. Read [SPEC.md](SPEC.md), including its repository decision at the top.
2. Use the **November 5 delivery** issue as the sole delivery checklist.
3. Begin with U1: prove the intended runtime, real scanner calls, live AI assessment and preview access before building the interface.

## Current status

| Capability | Status |
| --- | --- |
| Repository and current specification | Initialized |
| Runtime/provider verification | Not started in this repository |
| SEO agent | Not implemented in this repository |
| Accessibility agent | Not implemented in this repository |
| Performance agent | Not implemented in this repository |
| Deployed demo and live acceptance | Not verified |

Repository initialization is not evidence that an agent works. Prior prototype code has not been imported or independently validated here.

## Repository boundaries

- **This repository:** canonical implementation, shared runtime, tests and the current build specification.
- **[AI Garage](https://github.com/jackiehimel/ai-garage-web):** catalog, research pages and user-facing integration. Confirm the deployable integration during U1.
- **[Earlier maintenance repository](https://github.com/jackiehimel/maintenance-agent-library):** existing research and historical plans; retained without modification.
- **[Demo workspace](https://github.com/jackiehimel/maintenance-demo-workspace):** existing intended home for controlled targets and private evidence; retained without modification.

## Working rules

Keep one current specification and one delivery checklist. Use focused branches and pull requests. Preserve existing research and prototype sources until their useful parts are deliberately integrated. Do not copy an external agent implementation verbatim. Keep secrets, credentials, private target data and raw browser captures out of Git.

The delivered experience must use actual submitted URLs, identify its measurement source, separate scanner results from AI interpretation and visibly report incomplete runs. No mocked or archived result may appear as a current live result.

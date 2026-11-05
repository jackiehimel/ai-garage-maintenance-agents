# AI Garage Maintenance Agents

Run three independent checks against public HTTPS pages through the standalone Solvd interface, the CLI, or the TypeScript API.

| Agent | Evidence |
| --- | --- |
| Technical SEO and Discoverability | Source and rendered HTTP and indexing signals, canonicals, crawler rules, sampled sitemaps, and structured data |
| Accessibility Regression | Axe findings and affected elements, configured keyboard states, focus assertions, and manual review coverage |
| Performance Regression | Repeated desktop Lighthouse navigation, per-sample artifacts, metric distributions, and compatible baseline deltas |

Each run identifies the tested URL, records incomplete coverage, and separates measured observations from supplied evidence and AI interpretation. Export the HTML report, JSON report, and portable baseline from the interface. See the full scope and delivery checks in [SPEC.md](SPEC.md) and [issue #1](https://github.com/jackiehimel/ai-garage-maintenance-agents/issues/1).

## Run on a Chromium-capable host

Install Node.js 24 or later and point `CHROME_PATH` to an installed Chrome or Chromium executable. Run from the repository root.

```sh
npm ci --cache /tmp/maintenance-npm-cache
npm run build
CHROME_PATH=/absolute/path/to/chrome npm start
```

Open [http://127.0.0.1:4175](http://127.0.0.1:4175). The server accepts loopback requests and stores reports and artifacts in `.runs` unless `RUN_STORAGE_ROOT` specifies another writable directory. Set `ANTHROPIC_API_KEY` in the server environment for live assessment. `ANTHROPIC_MODEL` selects the model. If assessment is unavailable, the report still retains any collected evidence.

Use the CLI to invoke one agent independently. Pass `--config` for optional pages, states, intent, release, or sampling settings, and `--baseline` to compare with a prior export. Replace the agent ID with `accessibility` or `performance` as needed.

```sh
CHROME_PATH=/absolute/path/to/chrome npm run agent -- seo-ai-search https://www.solvd.com/ --output .runs
npm run typecheck
npm test
```

## Optional GitHub Actions browser

On a Mac with Node.js 24 or later and an authenticated GitHub CLI, double-click [`scripts/start-demo.command`](scripts/start-demo.command) in Finder, or run `bash scripts/start-demo.command` from this repository. It installs locked dependencies when needed, builds the app, and starts the local interface with the report corrections worker on `codex/report-corrections`. Set `MAINTENANCE_REF` to explicitly select another worker ref. Keep its Terminal window open and open the URL printed by the ready server in Safari. Without `ANTHROPIC_API_KEY`, measured reports still work and explicitly show AI assessment as unavailable. Restart the launcher after source updates so HTML exports and model interpretation use the new compiled code; existing saved reports retain their original measurements.

The local interface can send browser collection to a configured GitHub Actions workflow. This requires the GitHub CLI authenticated to the repository with workflow dispatch and artifact access. `MAINTENANCE_REPOSITORY` and `MAINTENANCE_REF` select the workflow repository and branch. The server assembles the returned evidence and generates the report locally.

```sh
gh auth status
BROWSER_RUNTIME=github-actions npm start
```

The same `BROWSER_RUNTIME=github-actions` setting works with `npm run agent`. Protected Chromium cannot launch inside the current managed macOS environment. The remote worker is verified with sandboxed system Chrome and fixed Node 24.22.1. Browser versions are recorded and changed versions make old baselines incompatible. No model credentials are sent to Actions.

## Verified delivery state

All three agents have real runs against Solvd and example.com, successful live assessments, and compatible baseline repeats. The local interface accepts a URL and calls these same agents; a performance run was also completed through its controls. Saved report links use `http://127.0.0.1:4175/?run=<run-id>`. HTML, JSON, baseline and raw-artifact export endpoints were checked against retained evidence. The latest source passes 59 offline tests, type checking and build, including GitHub Actions CI.

| Capability | Verified example |
| --- | --- |
| SEO | [Solvd live report collection](https://github.com/jackiehimel/ai-garage-maintenance-agents/actions/runs/41955101165); rendered/sitemap limits remain explicitly partial |
| Accessibility | [Compatible Solvd repeat](https://github.com/jackiehimel/ai-garage-maintenance-agents/actions/runs/41955296926); ten persistent automated findings, manual-review items kept separate |
| Performance | [Compatible Solvd repeat](https://github.com/jackiehimel/ai-garage-maintenance-agents/actions/runs/41955116481); three samples, noisy deltas inconclusive |
| Configured accessibility states | [Live focus, assertion and component mapping](https://github.com/jackiehimel/ai-garage-maintenance-agents/actions/runs/41956039870) |

This is an operating local demo with a remote browser worker. Public deployment and a complete browser-based controlled before/after site fixture remain open in [issue #1](https://github.com/jackiehimel/ai-garage-maintenance-agents/issues/1). Controlled known-change cases are covered by offline tests. No automatic client-site changes are made.

## Repository boundaries

This repository owns implementation, runtime, tests, and the standalone app. [AI Garage](https://github.com/jackiehimel/ai-garage-web) remains the catalog. Earlier research and the controlled demo workspace remain in their existing repositories. Keep credentials, private target data, and raw captures out of Git.


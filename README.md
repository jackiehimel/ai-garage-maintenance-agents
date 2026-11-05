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

The local interface can send browser collection to a configured GitHub Actions workflow. This requires the GitHub CLI authenticated to the repository with workflow dispatch and artifact access. `MAINTENANCE_REPOSITORY` and `MAINTENANCE_REF` select the workflow repository and branch. The server assembles the returned evidence and generates the report locally.

```sh
gh auth status
BROWSER_RUNTIME=github-actions npm start
```

The recovery branch workflow has accepted a dispatch. Protected Chromium failed to launch in the current managed macOS environment, so local collection requires a host that permits the browser to start. Check the resulting report for browser coverage and use issue #1 to track deployment and reviewer access. [Workflow dispatch](https://github.com/jackiehimel/ai-garage-maintenance-agents/actions/runs/41954209953)

## Repository boundaries

This repository owns implementation, runtime, tests, and the standalone app. [AI Garage](https://github.com/jackiehimel/ai-garage-web) remains the catalog. Earlier research and the controlled demo workspace remain in their existing repositories. Keep credentials, private target data, and raw captures out of Git.

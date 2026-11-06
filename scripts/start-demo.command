#!/bin/bash
set -euo pipefail

# Run manually in Terminal or by double-clicking this file in Finder.
on_exit() {
  status=$?
  if [[ "$status" -ne 0 && "$status" -ne 130 ]]; then
    printf '\nThe demo stopped with an error (exit %s). See the message above.\n' "$status" >&2
    if [[ -t 0 ]]; then
      read -r -p 'Press Return to close this launcher. ' reply || true
    fi
  fi
}
trap on_exit EXIT

script_directory="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_directory/.."

# Changes apply only to this process and the demo it starts.
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
selected_node=''
for candidate in /usr/local/bin/node /opt/homebrew/bin/node "$(command -v node || true)"; do
  [[ -n "$candidate" && -x "$candidate" ]] || continue
  node_major="$("$candidate" -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || true)"
  if [[ "$node_major" =~ ^[0-9]+$ ]] && [[ "$node_major" -ge 24 ]]; then
    selected_node="$candidate"
    break
  fi
done
if [[ -z "$selected_node" ]]; then
  printf 'Node.js 24 or later is required. No suitable installed Node was found.\n' >&2
  exit 1
fi
export PATH="$(dirname -- "$selected_node"):$PATH"
printf 'Using Node %s\n' "$(node --version)"
if ! command -v npm >/dev/null || ! command -v gh >/dev/null; then
  printf 'The npm and GitHub CLI (gh) commands must already be installed.\n' >&2
  exit 1
fi
printf '\nChecking existing GitHub CLI authentication…\n'
if ! gh auth status; then
  printf '\nGitHub CLI authentication is unavailable. Sign in separately, then reopen this launcher.\n' >&2
  exit 1
fi

dependency_stamp='node_modules/.maintenance-demo-lock.sha256'
lock_fingerprint="$(shasum -a 256 package.json package-lock.json)"
installed_fingerprint=''
if [[ -r "$dependency_stamp" ]]; then installed_fingerprint="$(cat "$dependency_stamp")"; fi
if [[ "$installed_fingerprint" != "$lock_fingerprint" ]] || ! npm ls --all --silent >/dev/null 2>&1; then
  printf '\nInstalling the locked project dependencies…\n'
  npm ci --cache "${TMPDIR:-/tmp}/maintenance-demo-npm-cache" --no-audit --no-fund
  printf '%s\n' "$lock_fingerprint" > "$dependency_stamp"
fi
printf '\nBuilding the demo…\n'
npm run build

export BROWSER_RUNTIME=github-actions
export MAINTENANCE_REPOSITORY=jackiehimel/ai-garage-maintenance-agents
export MAINTENANCE_REF="${MAINTENANCE_REF:-main}"
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  printf '\nMeasured reports work without a model key. AI assessment will be shown as unavailable.\n'
fi
printf '\nStarting the demo with browser worker ref: %s\n' "$MAINTENANCE_REF"
printf 'Keep this Terminal window open. Press Control-C to stop.\n'
printf 'Open the local URL in Safari when the server prints that it is ready.\n\n'
npm start

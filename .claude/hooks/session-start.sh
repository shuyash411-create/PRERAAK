#!/bin/bash
#
# SessionStart hook for Claude Code cloud sessions.
#
# The actual work lives in scripts/setup-local.sh, which is also what
# `npm run setup` runs on a developer's machine. One implementation, two entry
# points, so the container and a laptop cannot drift apart.
#
# This wrapper adds only the thing a hook needs: a gate, so a local machine
# keeps its own database and credentials and is never reconfigured by a hook
# firing on every session start.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  echo "Not a cloud session — leaving the local environment alone."
  echo "Run 'npm run setup' yourself if you need the database prepared."
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
exec "${PROJECT_DIR}/scripts/setup-local.sh"

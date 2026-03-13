#!/bin/bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: $(basename "$0") [cursor-agent options] "prompt"

Runs cursor-agent with the provided options and prompt.

Example:
  $(basename "$0") "process the input folder"
  $(basename "$0") --force --print --model sonnet-4.5 "process the input folder"

Notes:
  - Provide the prompt as the final argument
  - All other arguments are passed through to cursor-agent
  - Default options: --force --print --model auto --output-format=text
  - Output is visible in real-time when run directly in terminal
  - Final response is written to outputs/response.md by cursor-agent
  - Note: When called from Java/dmtools, output may be buffered until completion
EOF
}

if [ $# -lt 1 ]; then
  usage
  exit 1
fi

CURSOR_AGENT_BIN=""
if command -v cursor-agent >/dev/null 2>&1; then
  CURSOR_AGENT_BIN="$(command -v cursor-agent)"
elif [ -x "$HOME/.local/bin/cursor-agent" ]; then
  CURSOR_AGENT_BIN="$HOME/.local/bin/cursor-agent"
fi

if [ -z "$CURSOR_AGENT_BIN" ]; then
  echo "Error: cursor-agent not found in PATH or at $HOME/.local/bin/cursor-agent" >&2
  exit 127
fi

# Extract prompt (last argument)
PROMPT="${!#}"

if [ -z "$PROMPT" ]; then
  echo "Error: prompt argument is required" >&2
  usage
  exit 1
fi

# Get all arguments except the last one (the prompt)
PASS_ARGS=()
if [ $# -gt 1 ]; then
  PASS_ARGS=("${@:1:$#-1}")
fi

# Build command with defaults if no options provided
if [ ${#PASS_ARGS[@]} -eq 0 ]; then
  CMD=("$CURSOR_AGENT_BIN" --force --print --model auto --output-format=text "$PROMPT")
else
  CMD=("$CURSOR_AGENT_BIN" "${PASS_ARGS[@]}" --output-format=text "$PROMPT")
fi

echo "Running: ${CMD[*]}"
echo ""

# DMTools expects outputs/response.md to exist after CLI execution.
mkdir -p outputs
tmp_log="$(mktemp)"
set +e
# Auto-confirm interactive prompts to keep DMTools runs non-interactive.
yes | "${CMD[@]}" | tee "$tmp_log"
exit_code=${PIPESTATUS[1]}
set -e

# Prefer agent-authored outputs/response.md; if missing/invalid, extract JSON array from CLI output.
if [ ! -s outputs/response.md ] || ! jq -e . outputs/response.md >/dev/null 2>&1; then
  if python3 - "$tmp_log" > outputs/response.md <<'PY'
import json
import re
import sys

text = open(sys.argv[1], 'r', encoding='utf-8', errors='ignore').read()
best = None
for m in re.finditer(r'\[[\s\S]*?\]', text):
    s = m.group(0)
    try:
        obj = json.loads(s)
        if isinstance(obj, list):
            best = obj
    except Exception:
        pass

if best is None:
    sys.exit(1)

json.dump(best, sys.stdout, ensure_ascii=False, indent=2)
sys.stdout.write('\n')
PY
  then
    echo "Recovered JSON array to outputs/response.md from CLI output"
  else
    echo "[]" > outputs/response.md
    echo "Warning: Could not extract valid JSON array from CLI output; wrote [] to outputs/response.md" >&2
  fi
fi

rm -f "$tmp_log"

echo ""
echo "=== Cursor Agent completed with exit code: $exit_code ==="

exit $exit_code

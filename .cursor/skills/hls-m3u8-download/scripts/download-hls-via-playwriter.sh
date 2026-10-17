#!/usr/bin/env bash
set -euo pipefail

SESSION="1"
PAGE_MATCH="jable.tv/videos/"
REFERER="https://jable.tv/"
OUTPUT="./download.mp4"
LOG="./hls-download.log"
MAX_ROUNDS=200
BATCH_SIZE=12

usage() {
  echo "Usage: $0 [--session N] [--page-match SUBSTR] [--referer URL] [--output PATH] [--log PATH]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session) SESSION="$2"; shift 2 ;;
    --page-match) PAGE_MATCH="$2"; shift 2 ;;
    --referer) REFERER="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    --log) LOG="$2"; shift 2 ;;
    --max-rounds) MAX_ROUNDS="$2"; shift 2 ;;
    --batch-size) BATCH_SIZE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "${PLAYWRITER_HOST:-}" ]]; then
  PLAYWRITER_HOST="$(ip route show | awk '/default/ {print $3; exit}')"
  export PLAYWRITER_HOST
fi
if [[ -z "${PLAYWRITER_TOKEN:-}" ]]; then
  echo "Error: set PLAYWRITER_TOKEN" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODE_FILE="${SCRIPT_DIR}/playwriter-hls-batch.code.js"
if [[ ! -f "$CODE_FILE" ]]; then
  echo "Missing ${CODE_FILE}" >&2
  exit 1
fi

export PW_PAGE_MATCH="$PAGE_MATCH"
export PW_REFERER="$REFERER"
export PW_OUTPUT="$OUTPUT"
export PW_BATCH_SIZE="$BATCH_SIZE"

CODE="$(tr '\n' ' ' < "$CODE_FILE")"

: >"$LOG"
for round in $(seq 1 "$MAX_ROUNDS"); do
  echo "=== round ${round} ===" >>"$LOG"
  if ! npx -y playwriter@latest -s "$SESSION" --timeout 120000 -e "$CODE" >>"$LOG" 2>&1; then
    echo "Batch failed; see ${LOG}" >&2
    tail -20 "$LOG" >&2
    exit 1
  fi
  last="$(rg '^(\[log\] )?progress ' "$LOG" | tail -1 || true)"
  echo "$last"
  if [[ -n "$last" ]] && [[ "$last" =~ progress\ ([0-9]+)\ /\ ([0-9]+) ]]; then
    cur="${BASH_REMATCH[1]}"
    total="${BASH_REMATCH[2]}"
    if [[ "$cur" == "$total" ]]; then
      echo "complete" >>"$LOG"
      break
    fi
  fi
done

echo "Done. Output (session cwd): ${OUTPUT}. Log: ${LOG}"

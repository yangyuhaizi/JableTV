#!/usr/bin/env bash
# 兼容旧入口：转发到 hls-m3u8-download skill
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "${HOME}/projects/JableTV/.cursor/skills/hls-m3u8-download/scripts/download-hls-via-playwriter.sh" \
  --session "${PLAYWRITER_SESSION:-1}" \
  --page-match "${PW_PAGE_MATCH:-jable.tv/videos/meyd-568}" \
  --referer "${PW_REFERER:-https://jable.tv/}" \
  --output "${PW_OUTPUT:-./meyd-568.mp4}" \
  --log "${ROOT}/hls-download.log" \
  "$@"

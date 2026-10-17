#!/usr/bin/env bash
set -euo pipefail

SESSION="1"
PAGE_MATCH="jable.tv/videos/"
REFERER="https://jable.tv/"

usage() {
  echo "Usage: $0 [--session ID] [--page-match SUBSTR] [--referer URL]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session) SESSION="$2"; shift 2 ;;
    --page-match) PAGE_MATCH="$2"; shift 2 ;;
    --referer) REFERER="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "${PLAYWRITER_HOST:-}" ]]; then
  PLAYWRITER_HOST="$(ip route show | awk '/default/ {print $3; exit}')"
  export PLAYWRITER_HOST
fi
if [[ -z "${PLAYWRITER_TOKEN:-}" ]]; then
  echo "Error: set PLAYWRITER_TOKEN (must match Win playwriter serve --token)" >&2
  exit 1
fi

CODE='state.page=context.pages().findLast(p=>p.url().includes(process.env.PW_PAGE_MATCH)); if(!state.page) throw new Error("tab not found"); const m3u8Url=await state.page.evaluate(({ref})=>{const text=Array.from(document.scripts).map(s=>s.textContent||s.src).join(" "); const re=/https?:[^ "\x27<>]+/g; let m; while((m=re.exec(text))){if(m[0].includes(".m3u8")) return m[0];} return null;},{ref:process.env.PW_REFERER}); if(!m3u8Url) throw new Error("no m3u8 in scripts"); const check=await state.page.evaluate(async({url,ref})=>{const r=await fetch(url,{headers:{Referer:ref}}); return {status:r.status,size:(await r.text()).length};},{url:m3u8Url,ref:process.env.PW_REFERER}); console.log(JSON.stringify({m3u8Url,check},null,2));'

export PW_PAGE_MATCH="$PAGE_MATCH"
export PW_REFERER="$REFERER"

npx -y playwriter@latest -s "$SESSION" --timeout 60000 -e "$CODE"

#!/usr/bin/env bash
set -uo pipefail

ROOM_ID=""
TOKEN="${ZERO_PLAYER_TOKEN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)
      if [[ $# -lt 2 ]]; then
        echo "--token requires a value" >&2
        exit 1
      fi
      TOKEN="$2"
      shift 2
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      ROOM_ID="$1"
      shift
      ;;
  esac
done

if [[ -z "$ROOM_ID" ]]; then
  echo "Usage: curl -fsSL https://zeroplayer.space/watch-room.sh | bash -s -- <roomId>  (set ZERO_PLAYER_TOKEN=<token> to authenticate; --token <token> also works)" >&2
  exit 1
fi

URL="https://zeroplayer.space/api/rooms/$ROOM_ID/events"
ARGS=(-fsSL -N)
if [[ -n "$TOKEN" ]]; then
  ARGS+=(-H "Authorization: Bearer $TOKEN")
fi

err="$(mktemp)"
cleanup() {
  rm -f "$err"
}
trap cleanup EXIT

curl "${ARGS[@]}" "$URL" 2>"$err" | {
  while IFS= read -r line; do
    [[ "$line" == data:* ]] || continue
    line="${line#data: }"
    [[ -n "$line" ]] || continue
    printf '%s\n' "$line"
    case "$line" in
      *'"ready":true'*|*'"currentPlayer":"you"'*|*'"type":"closed"'*|*'"status":"finished"'*|*'"status":"aborted"'*)
        exit 0
        ;;
      *'"type":"error"'*)
        exit 1
        ;;
    esac
  done
}
status=$?
if [[ $status -eq 0 || $status -eq 141 ]]; then
  exit 0
fi
cat "$err" >&2 || true
exit $status

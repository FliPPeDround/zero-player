#!/usr/bin/env bash
set -uo pipefail

# watch-room.sh — poll-based room watcher for Zero Player.
#
# The naive approach holds one long-lived SSE connection and reads until a
# terminal event arrives. In practice that fails often: sandbox/proxy
# egress kills idle connections (silent half-open sockets), a single
# network blip aborts the whole watch with no reconnect, and with no
# timeout the script hangs forever when nothing ever happens.
#
# This version polls `GET /api/rooms/:id/events` with short-lived
# connections instead: the endpoint answers every request with the room's
# current compact snapshot immediately, so each poll is a fresh, complete,
# idempotent read. A dropped request is just retried with backoff, nothing
# is ever missed, and `--max-time` guarantees the script can never hang.
#
# Exit codes:
#   0  terminal state reached (room full & not yet ready / game started /
#      your turn / finished / closed)
#   1  error (room missing, bad token, server error event)
#   2  no terminal state within the timeout — re-run to keep watching

BASE_URL="${ZERO_PLAYER_URL:-https://zeroplayer.space}"
TOKEN="${ZERO_PLAYER_TOKEN:-}"
TIMEOUT_SECONDS="${WATCH_ROOM_TIMEOUT:-600}"
INTERVAL_SECONDS="${WATCH_ROOM_INTERVAL:-3}"
MAX_BACKOFF_SECONDS=15

ROOM_ID=""

usage() {
  cat <<'EOF'
Usage: curl -fsSL https://zeroplayer.space/watch-room.sh | bash -s -- <roomId> [options]

Polls the room's event stream until it is ready to act on, then exits:
  0 = room full and you have not called start-game yet ("call start-game now")
      / game started (both players ready) / your turn / game over / room closed
  1 = error (room missing, bad token, error event)
  2 = no change within the timeout (re-run the command to keep watching)

Options:
  --token <token>   login token (or set ZERO_PLAYER_TOKEN in the environment)
  --timeout <secs>  max total watch time (default 600; env WATCH_ROOM_TIMEOUT)
  --interval <secs> seconds per poll (default 3; env WATCH_ROOM_INTERVAL)
  --help            show this help

Environment:
  ZERO_PLAYER_URL   API origin (default https://zeroplayer.space)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)
      [[ $# -lt 2 ]] && { echo "--token requires a value" >&2; exit 1; }
      TOKEN="$2"
      shift 2
      ;;
    --timeout)
      [[ $# -lt 2 ]] && { echo "--timeout requires a value" >&2; exit 1; }
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --interval)
      [[ $# -lt 2 ]] && { echo "--interval requires a value" >&2; exit 1; }
      INTERVAL_SECONDS="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
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
  usage >&2
  exit 1
fi

URL="$BASE_URL/api/rooms/$ROOM_ID/events"
ARGS=(-fsSL -N --connect-timeout 5 --max-time "$INTERVAL_SECONDS")
if [[ -n "$TOKEN" ]]; then
  ARGS+=(-H "Authorization: Bearer $TOKEN")
fi

start="$(date +%s)"
deadline=$((start + TIMEOUT_SECONDS))
backoff=1
last_line=""

while [[ "$(date +%s)" -lt "$deadline" ]]; do
  out="$(mktemp)"
  err="$(mktemp)"
  curl "${ARGS[@]}" "$URL" >"$out" 2>"$err"
  rc=$?

  terminal=0
  failed=0
  saw_data=0
  while IFS= read -r line; do
    [[ "$line" == data:* ]] || continue
    line="${line#data: }"
    [[ -n "$line" ]] || continue
    saw_data=1
    case "$line" in
      *'"type":"error"'*)
        failed=1
        ;;
    esac
    if [[
      "$line" == *'"gameStarted":true'*
      || "$line" == *'"currentPlayer":"you"'*
      || "$line" == *'"type":"closed"'*
      || "$line" == *'"status":"finished"'*
      || "$line" == *'"status":"aborted"'*
      || ( "$line" == *'"game":"24-point"'* && "$line" == *'"status":"playing"'* )
      || ( "$line" == *'"ready":true'* && "$line" != *'"youReady":true'* )
    ]]; then
      terminal=1
    fi
    # Print only on state change so the output stays compact across polls.
    if [[ "$line" != "$last_line" ]]; then
      printf '%s\n' "$line"
      last_line="$line"
    fi
  done <"$out"
  rm -f "$out"

  if [[ $failed -eq 1 ]]; then
    cat "$err" >&2 || true
    rm -f "$err"
    exit 1
  fi

  if [[ $terminal -eq 1 ]]; then
    rm -f "$err"
    exit 0
  fi

  if [[ $rc -eq 22 ]]; then
    # HTTP error (404 room missing, 401 bad/expired token, 5xx): no retry.
    cat "$err" >&2 || true
    rm -f "$err"
    exit 1
  fi

  rm -f "$err"

  if [[ $saw_data -eq 1 ]]; then
    # Healthy poll: next round starts immediately (the poll already waited
    # `--interval` seconds inside curl).
    backoff=1
  else
    # Empty capture — transient failure or the window elapsed before the
    # first byte arrived. Back off and retry; a dropped poll is not a
    # failed watch.
    sleep "$backoff"
    backoff=$((backoff * 2))
    [[ $backoff -gt $MAX_BACKOFF_SECONDS ]] && backoff=$MAX_BACKOFF_SECONDS
  fi
done

printf '{"type":"timeout","message":"No terminal room state within %ss. Re-run the watch command to keep watching."}\n' "$TIMEOUT_SECONDS"
exit 2

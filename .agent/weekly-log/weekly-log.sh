#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://idea-dump-alpha.vercel.app"
API_KEY_FILE="$(dirname "$0")/.wpl_api_key"
if [[ -f "$API_KEY_FILE" ]]; then
  WPL_API_KEY="$(cat "$API_KEY_FILE")"
fi
if [[ -z "${WPL_API_KEY:-}" ]]; then
  echo "Missing WPL_API_KEY and no .wpl_api_key file found" >&2
  echo "Create $API_KEY_FILE or export WPL_API_KEY" >&2
  exit 1
fi

action="${1:-}"

case "$action" in
  create)
    if [[ $# -lt 5 ]]; then
      echo "Usage: $0 create <date> <day> <operation_task> <tools_used> <lesson_learned>" >&2
      exit 1
    fi
    date="$2"
    day="$3"
    operation_task="$4"
    tools_used="$5"
    lesson_learned="$6"

    curl -sS -X POST "$BASE_URL/api/logs" \
      -H "Content-Type: application/json" \
      -H "x-api-key: $WPL_API_KEY" \
      -d "{\"content\":{\"date\":\"$date\",\"day\":\"$day\",\"operation_task\":\"$operation_task\",\"tools_used\":\"$tools_used\",\"lesson_learned\":\"$lesson_learned\"}}"
    ;;
  list)
    from="${2:-}"
    to="${3:-}"
    limit="${4:-200}"
    query=""
    if [[ -n "$from" ]]; then
      query="?from=$from"
      if [[ -n "$to" ]]; then
        query="$query&to=$to"
      fi
      if [[ -n "$limit" ]]; then
        query="$query&limit=$limit"
      fi
    fi

    curl -sS -X GET "$BASE_URL/api/logs$query" \
      -H "x-api-key: $WPL_API_KEY"
    ;;
  update)
    if [[ $# -lt 6 ]]; then
      echo "Usage: $0 update <id> <date> <day> <operation_task> <tools_used> <lesson_learned>" >&2
      exit 1
    fi
    id="$2"
    date="$3"
    day="$4"
    operation_task="$5"
    tools_used="$6"
    lesson_learned="$7"

    curl -sS -X PATCH "$BASE_URL/api/logs/$id" \
      -H "Content-Type: application/json" \
      -H "x-api-key: $WPL_API_KEY" \
      -d "{\"content\":{\"date\":\"$date\",\"day\":\"$day\",\"operation_task\":\"$operation_task\",\"tools_used\":\"$tools_used\",\"lesson_learned\":\"$lesson_learned\"},\"allow_human_overwrite\":false}"
    ;;
  *)
    echo "Usage: $0 {create|list|update} ..." >&2
    exit 1
    ;;
esac

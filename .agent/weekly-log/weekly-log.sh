#!/usr/bin/env bash
# Weekly Productivity Log Helper Script
# Usage: ./weekly-log.sh {create|list|update} ...
set -euo pipefail

# Configuration
BASE_URL="${WPL_BASE_URL:-https://idea-dump-alpha.vercel.app}"
API_KEY_FILE="$(dirname "$0")/.wpl_api_key"

# Load API key from file or environment
if [[ -f "$API_KEY_FILE" ]]; then
  WPL_API_KEY="$(cat "$API_KEY_FILE" | tr -d '\n\r')"
fi

if [[ -z "${WPL_API_KEY:-}" ]]; then
  echo "Error: Missing WPL_API_KEY" >&2
  echo "" >&2
  echo "Options:" >&2
  echo "  1. Create $API_KEY_FILE with your API key" >&2
  echo "  2. Export WPL_API_KEY environment variable" >&2
  exit 1
fi

# Helper function for JSON escaping
escape_json() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\n/\\n/g'
}

action="${1:-help}"

case "$action" in
  create)
    if [[ $# -lt 5 ]]; then
      echo "Usage: $0 create <date> <day> <task> <tools> <lesson>" >&2
      echo "" >&2
      echo "Arguments:" >&2
      echo "  date    - Date in YYYY-MM-DD format" >&2
      echo "  day     - Day of week (e.g., Monday)" >&2
      echo "  task    - What you worked on" >&2
      echo "  tools   - Tools/technologies used" >&2
      echo "  lesson  - Key insight or learning" >&2
      echo "" >&2
      echo "Example:" >&2
      echo "  $0 create 2026-02-05 Wednesday \"Built API endpoints\" \"Next.js, Supabase\" \"RLS is powerful\"" >&2
      exit 1
    fi

    date="$2"
    day="$3"
    task="$(escape_json "$4")"
    tools="$(escape_json "$5")"
    lesson="$(escape_json "${6:-}")"

    response=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/api/logs" \
      -H "Content-Type: application/json" \
      -H "x-api-key: $WPL_API_KEY" \
      -d "{\"content\":{\"date\":\"$date\",\"day\":\"$day\",\"operation_task\":\"$task\",\"tools_used\":\"$tools\",\"lesson_learned\":\"$lesson\"}}")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
      echo "✓ Log created successfully"
      echo "$body" | jq -r '.data.id // empty' 2>/dev/null || echo "$body"
    else
      echo "✗ Failed to create log (HTTP $http_code)" >&2
      echo "$body" >&2
      exit 1
    fi
    ;;

  list)
    from="${2:-}"
    to="${3:-}"
    limit="${4:-50}"
    
    query=""
    [[ -n "$from" ]] && query="?from=$from"
    [[ -n "$to" ]] && query="${query:+$query&}${query:-?}to=$to"
    [[ -n "$limit" ]] && query="${query:+$query&}${query:-?}limit=$limit"

    response=$(curl -sS -w "\n%{http_code}" -X GET "$BASE_URL/api/logs$query" \
      -H "x-api-key: $WPL_API_KEY")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
      # Pretty print with jq if available
      if command -v jq &>/dev/null; then
        echo "$body" | jq '.data[] | {date: .content.date, day: .content.day, task: .content.operation_task[0:50]}'
      else
        echo "$body"
      fi
    else
      echo "✗ Failed to list logs (HTTP $http_code)" >&2
      echo "$body" >&2
      exit 1
    fi
    ;;

  update)
    if [[ $# -lt 7 ]]; then
      echo "Usage: $0 update <id> <date> <day> <task> <tools> <lesson>" >&2
      exit 1
    fi

    id="$2"
    date="$3"
    day="$4"
    task="$(escape_json "$5")"
    tools="$(escape_json "$6")"
    lesson="$(escape_json "$7")"

    response=$(curl -sS -w "\n%{http_code}" -X PATCH "$BASE_URL/api/logs/$id" \
      -H "Content-Type: application/json" \
      -H "x-api-key: $WPL_API_KEY" \
      -d "{\"content\":{\"date\":\"$date\",\"day\":\"$day\",\"operation_task\":\"$task\",\"tools_used\":\"$tools\",\"lesson_learned\":\"$lesson\"},\"allow_human_overwrite\":false}")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
      echo "✓ Log updated successfully"
    else
      echo "✗ Failed to update log (HTTP $http_code)" >&2
      echo "$body" >&2
      exit 1
    fi
    ;;

  help|--help|-h)
    echo "Weekly Productivity Log CLI"
    echo ""
    echo "Usage: $0 <command> [arguments]"
    echo ""
    echo "Commands:"
    echo "  create <date> <day> <task> <tools> <lesson>  - Create a new log entry"
    echo "  list [from] [to] [limit]                     - List log entries"
    echo "  update <id> <date> <day> <task> <tools> <lesson> - Update a log entry"
    echo "  help                                         - Show this help"
    echo ""
    echo "Environment:"
    echo "  WPL_API_KEY   - API key (or use .wpl_api_key file)"
    echo "  WPL_BASE_URL  - API base URL (default: $BASE_URL)"
    ;;

  *)
    echo "Unknown command: $action" >&2
    echo "Run '$0 help' for usage" >&2
    exit 1
    ;;
esac

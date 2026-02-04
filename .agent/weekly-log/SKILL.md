---
description: How to interact with the Weekly Productivity Log API
---

# Weekly Productivity Log API

This skill enables AI agents to create, read, and update daily productivity log entries.

## Authentication

Include your API key in the request header:
```
x-api-key: YOUR_AGENT_API_KEY
```

## Base URL

All endpoints are relative to your IdeaDump deployment URL.

---

## Endpoints

### 1. Create Log Entry

**POST** `/api/logs`

Creates a new daily log entry.

**Request Body:**
```json
{
  "content": {
    "date": "2026-02-04",
    "day": "Tuesday",
    "operation_task": "What you worked on today",
    "tools_used": "VSCode, Supabase, etc.",
    "lesson_learned": "Key insight or takeaway"
  }
}
```

**Required Fields:**
- `content.date` - The date in YYYY-MM-DD format

**Optional Fields:**
- `content.day` - Day of week (e.g., "Monday")
- `content.operation_task` - Description of work performed
- `content.tools_used` - Tools/technologies used
- `content.lesson_learned` - Key learnings

**Response (201 Created):**
```json
{
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "source": "agent",
    "content": { ... },
    "effective_date": "2026-02-04",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

---

### 2. List Log Entries

**GET** `/api/logs`

Retrieves log entries with optional filtering.

**Query Parameters:**
- `from` - Start date (YYYY-MM-DD)
- `to` - End date (YYYY-MM-DD)
- `limit` - Max results (default 200, max 500)
- `sort` - Sort order (default: `created_at.desc`)

**Example:**
```
GET /api/logs?from=2026-02-01&to=2026-02-07&limit=50
```

---

### 3. Update Log Entry

**PATCH** `/api/logs/{id}`

Updates an existing log entry. Content is fully replaced.

**Request Body:**
```json
{
  "content": {
    "date": "2026-02-04",
    "day": "Tuesday",
    "operation_task": "Updated task description",
    "tools_used": "Updated tools",
    "lesson_learned": "Updated lesson"
  },
  "allow_human_overwrite": false
}
```

**Note:** Set `allow_human_overwrite: true` if updating a human-created entry.

---

## Best Practices

1. **Always include date** - The `content.date` field is required
2. **Be specific** - Provide clear task descriptions
3. **Log daily** - Best to create entries at end of each day
4. **Track tools** - Noting tools helps identify patterns
5. **Capture lessons** - Even small insights are valuable

## Example: Daily Log Creation

```bash
curl -X POST https://your-app.vercel.app/api/logs \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "content": {
      "date": "2026-02-04",
      "day": "Tuesday",
      "operation_task": "Implemented Weekly Productivity Log feature with API endpoints and dashboard UI",
      "tools_used": "VSCode, Next.js, Supabase, TypeScript",
      "lesson_learned": "Hybrid auth (session + API key) simplifies multi-client access patterns"
    }
  }'
```

# OpenAPI-like Endpoint Specification

## Overview

This document specifies the API contract for the **AI-Assisted Weekly Productivity Log** system.

The system supports:

* Human admin access via browser session
* AI agent access via API key
* Structured daily logs
* Weekly markdown export

Multiple log entries per day are allowed.

---

## Authentication

### Hybrid Gatekeeper Strategy

Request authentication is resolved in this order:

1. If a valid **admin session cookie** is present
   → identity = `admin`
2. Else if a valid `x-api-key` header is present
   → identity = `agent`
3. Else
   → `401 Unauthorized`

---

## Authorization Rules

| Action                    | Admin | Agent                      |
| ------------------------- | ----- | -------------------------- |
| Read logs                 | Yes   | Yes                        |
| Create logs               | Yes   | Yes                        |
| Update AI-created logs    | Yes   | Yes                        |
| Update human-created logs | Yes   | Only if explicitly allowed |
| Delete logs               | Yes   | No                         |

Agent overwriting human logs requires `allow_human_overwrite=true`.

---

## Data Model

### Daily Log Content (JSONB)

```yaml
type: object
required:
  - date
properties:
  date:
    type: string
    format: date
    example: "2026-01-27"
  day:
    type: string
    example: "Tuesday"
  operation_task:
    type: string
    example: "Implemented unified API gateway"
  tools_used:
    type: string
    example: "VSCode, Supabase, Postman"
  lesson_learned:
    type: string
    example: "Role separation prevents accidental overwrites"
additionalProperties: false
```

Fields may be empty strings except `date`.

---

### Daily Log Entry

```yaml
type: object
required:
  - id
  - user_id
  - source
  - content
  - effective_date
  - created_at
  - updated_at
properties:
  id:
    type: string
    format: uuid
  user_id:
    type: string
    format: uuid
  source:
    type: string
    enum: [agent, human]
  content:
    $ref: "#/components/schemas/DailyLogContent"
  effective_date:
    type: string
    format: date
  created_at:
    type: string
    format: date-time
  updated_at:
    type: string
    format: date-time
```

---

## Error Format

```yaml
type: object
required:
  - error
  - message
properties:
  error:
    type: string
  message:
    type: string
  details:
    type: object
```

---

## Endpoints

---

### GET `/api/logs`

List log entries.

**Auth:** admin or agent

**Query Parameters**

* `from` (date, optional)
* `to` (date, optional)
* `limit` (int, optional, default 200, max 500)
* `cursor` (string, optional)
* `sort` (string, optional, default `created_at.desc`)

**Response 200**

```yaml
type: object
properties:
  data:
    type: array
    items:
      $ref: "#/components/schemas/DailyLogEntry"
  next_cursor:
    type: string
    nullable: true
```

---

### POST `/api/logs`

Create a new log entry.

**Auth:** admin or agent

**Body**

```yaml
type: object
required:
  - content
properties:
  content:
    $ref: "#/components/schemas/DailyLogContent"
  effective_date:
    type: string
    format: date
```

Rules:

* Always creates a new row
* If `effective_date` missing, default to `content.date`
* `source = agent` if agent, otherwise `human`

**Response 201**

```yaml
type: object
properties:
  data:
    $ref: "#/components/schemas/DailyLogEntry"
```

---

### PATCH `/api/logs/{id}`

Update an existing log entry.

**Auth:** admin or agent

**Path Parameters**

* `id` (uuid)

**Body**

```yaml
type: object
properties:
  content:
    $ref: "#/components/schemas/DailyLogContent"
  allow_human_overwrite:
    type: boolean
    default: false
```

Rules:

* Admin may update any entry
* Agent may update:

  * entries with `source=agent`
  * `source=human` only if `allow_human_overwrite=true`
* Content replacement is full replace, not merge

**Response 200**

```yaml
type: object
properties:
  data:
    $ref: "#/components/schemas/DailyLogEntry"
```

---

### DELETE `/api/logs/{id}`

Delete a log entry.

**Auth:** admin only

**Response 204**
Empty body

---

### POST `/api/export/weekly`

Generate weekly markdown table.

**Auth:** admin only

**Body**

```yaml
type: object
required:
  - from
  - to
properties:
  from:
    type: string
    format: date
  to:
    type: string
    format: date
```

**Response 200**

```yaml
type: object
properties:
  markdown:
    type: string
```

Markdown rules:

* Columns:

  1. Date / Day
  2. Operation / Task
  3. Equipment / Development Tools Used
  4. Lesson Learned
* Multiple entries per day listed separately
* Sorted by `effective_date ASC`, then `created_at ASC`

---

# Step-by-Step Implementation Plan (Agent Checklist)

## Step 0: Baseline

* Locate existing session auth logic
* Locate existing API key logic
* Extract both into `resolveIdentity(req)`

**Done when**

* Function returns `{ role, user_id }` or throws typed error

---

## Step 1: Database Migration

Create table `daily_logs`:

```sql
create table daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null check (source in ('agent','human')),
  content jsonb not null,
  effective_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index daily_logs_user_date_idx
  on daily_logs (user_id, effective_date);

create index daily_logs_user_created_idx
  on daily_logs (user_id, created_at desc);
```

**Done when**

* Table exists
* Inserts and selects succeed

---

## Step 2: RLS (Optional)

If using Supabase RLS:

* Admin session may access rows where `auth.uid() = user_id`
* Agent uses service role, enforce rules in API

---

## Step 3: Unified Gateway Helper

Create `lib/auth/resolveIdentity.ts`.

Logic:

1. Check admin session
2. Else validate `x-api-key`
3. Map agent key to fixed `user_id` via env vars

Env:

```
AGENT_API_KEY=...
AGENT_USER_ID=...
```

**Done when**

* Both admin and agent can authenticate via test route

---

## Step 4: `/api/logs` Route

Implement GET and POST.

### GET

* Filter by `user_id`
* Apply date range
* Sort and paginate

### POST

* Validate content schema
* Normalize `effective_date`
* Set `source`
* Insert row

**Done when**

* Agent can create
* Admin can read
* Multiple entries per day allowed

---

## Step 5: `/api/logs/{id}` Route

Implement PATCH and DELETE.

### PATCH

* Fetch row
* Enforce overwrite rules
* Replace content
* Update timestamp

### DELETE

* Admin only

**Done when**

* Agent cannot delete
* Agent cannot overwrite human rows without flag

---

## Step 6: Weekly Export

Client-side preferred.

Logic:

* Fetch logs in range
* Sort deterministically
* Render markdown table
* Copy to clipboard

Optional server endpoint for parity.

---

## Step 7: Dashboard UI

Minimal requirements:

* Table view grouped by date
* Editable fields bound to JSON
* Save triggers PATCH
* Refresh button
* Export markdown button

---

## Step 8: Test Matrix

Auth:

* No auth → 401
* Session → admin
* API key → agent

Permissions:

* Agent create ✔
* Agent read ✔
* Agent update agent row ✔
* Agent update human row ✖ unless flag
* Agent delete ✖
* Admin delete ✔

Data:

* Multiple entries same date
* Empty fields allowed
* `effective_date` defaults correctly

---

## Step 9: Golden Requests

### Create

```http
POST /api/logs
x-api-key: <key>

{
  "content": {
    "date": "2026-01-29",
    "day": "Thursday",
    "operation_task": "Built weekly export formatter",
    "tools_used": "VSCode",
    "lesson_learned": ""
  }
}
```

### Update

```http
PATCH /api/logs/<id>
x-api-key: <key>

{
  "content": {
    "date": "2026-01-29",
    "day": "Thursday",
    "operation_task": "Built and tested weekly export formatter",
    "tools_used": "VSCode",
    "lesson_learned": "Sorting rules matter"
  }
}
```
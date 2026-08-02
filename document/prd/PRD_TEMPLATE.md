# PRD: [Feature Name]

- **Status:** Draft
- **Owner:** [Name]
- **Last updated:** [YYYY-MM-DD]
- **Related documents:** [Links or None]

Remove all bracketed guidance and any section that does not apply.

## Summary

[State what will be built and the intended outcome in three sentences or fewer.]

## Problem

[State the user problem, current limitation, and supporting evidence.]

## Goals

- [Required measurable outcome]

## Non-Goals

- [Explicitly excluded behavior]

## Users and Access

| User or role | Allowed actions |
|---|---|
| [User or role] | [View, create, update, delete, administer] |

## User Flow

1. [Entry point]
2. [Required user action]
3. [System response]
4. [Success outcome]

## Requirements

| ID | Requirement | Acceptance |
|---|---|---|
| FR-001 | [Required behavior] | [Observable pass condition] |

## Data and Interfaces

Delete this section if there are no changes.

- **Data:** [Tables, fields, constraints, ownership, retention]
- **Interfaces:** [Routes, APIs, RPCs, queues, Storage]
- **Idempotency:** [Duplicate and retry behavior]

## Security and Privacy

- **Authentication:** [Required session or token]
- **Authorization:** [Role, module, ownership, and RLS rules]
- **Sensitive data:** [Storage, logging, and deletion rules]

## Failure and Edge Cases

| Scenario | Expected behavior |
|---|---|
| [Invalid input, timeout, retry, duplicate, or partial failure] | [User-visible and durable result] |

## Delivery

Delete this section if no deployment or configuration changes are required.

- **Migrations:** [Forward migrations or None]
- **Environment:** [Variable names only, never secret values]
- **Deployment order:** [Database, service, application]
- **Rollback:** [Safe rollback approach]

## Verification

- **Automated:** [Tests and commands]
- **Browser:** [Routes, viewports, and user flows]
- **Data:** [Database or Storage checks]

## Open Decisions

- [Decision, options, recommendation, and owner, or write `None`]

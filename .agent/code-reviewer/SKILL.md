---
name: code-reviewer
description: Automated code review skill for ensuring code quality, consistency, and scalability. Use this skill when reviewing code changes, before committing, when explicitly asked to review code, or when /code-review is mentioned. Performs checks for naming conventions, modularity, scalability, atomic design patterns for UI, and creates semantic commits with proper branching.
---

# Code Reviewer Skill

Automated code review workflow ensuring code quality, consistency, and scalability before committing changes.

## Workflow

### Step 1: Trigger Detection

This skill activates when:
- User asks to "review code" or "check my code"
- Before committing changes
- User mentions `/code-review`
- After completing a feature or refactoring

### Step 2: Run Code Review

Execute these checks in order:

#### 2.1 Naming Convention Check

**File Naming:**
- Components: `PascalCase.tsx` (e.g., `ConfirmationScreen.tsx`)
- Services: `camelCase.ts` (e.g., `supabaseClient.ts`)
- Utils: `camelCase.ts` (e.g., `dateUtils.ts`)
- Types: `camelCase.ts` or `PascalCase.ts` (e.g., `index.ts`, `Transaction.ts`)
- Constants/Config: `camelCase.ts` or `SCREAMING_SNAKE.ts`
- Tests: `*.test.ts` or `*.spec.ts`

**Variable/Function Naming:**
- Functions: `camelCase` (e.g., `formatDate`, `extractTextFromImage`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `API_CONFIG`, `MAX_RETRIES`)
- Types/Interfaces: `PascalCase` (e.g., `Transaction`, `IOCRService`)
- Boolean variables: Prefix with `is`, `has`, `should` (e.g., `isValid`, `hasError`)
- Event handlers: Prefix with `handle` or `on` (e.g., `handleClick`, `onSave`)

**Report format:**
```
✅ PASS: Naming conventions consistent
or
❌ FAIL: Naming issues found:
  - [file]: [issue]
```

#### 2.2 Modularity Check

**Criteria:**
- Single Responsibility: Each file/function does one thing
- No hardcoded values: Use config/constants files
- Reusable utilities: Common logic extracted to utils
- Service layer separation: Business logic in services, not components
- Type definitions: Shared types in `types/` folder

**Check for:**
- Hardcoded strings (move to constants)
- Hardcoded numbers (move to config)
- Duplicated code (extract to utility)
- Mixed concerns (split into services/components)

**Report format:**
```
✅ PASS: Code is modular
or
⚠️ WARN: Modularity improvements suggested:
  - [file:line]: Move hardcoded value to config
```

#### 2.3 Scalability Check

**Criteria:**
- Interface-based services (dependency injection ready)
- Centralized configuration
- Error handling with retry logic
- Logging for debugging
- Type-safe operations
- Pagination for lists
- Caching considerations

**Check for:**
- Services without interfaces
- Direct API calls without error handling
- Missing TypeScript types
- Large functions (>50 lines)
- Deep nesting (>3 levels)

#### 2.4 Atomic Design Check (UI Components Only)

**For React/React Native components, verify:**

**Atoms** (`components/atoms/`):
- Smallest building blocks (Button, Input, Icon, Text)
- No business logic
- Only UI props

**Molecules** (`components/molecules/`):
- Combinations of atoms (SearchBar, CategoryChip, TransactionCard)
- Minimal logic
- Reusable combinations

**Organisms** (`components/organisms/`):
- Complex UI sections (Header, TransactionList, CategoryPicker)
- May contain business logic
- Page sections

**Templates** (`components/templates/` or layouts):
- Page layouts
- Define structure, not content

**Pages/Screens** (`screens/`):
- Full pages with data fetching
- Connect to services
- Compose organisms

**Report format:**
```
✅ PASS: Atomic design principles followed
or
⚠️ WARN: Atomic design improvements:
  - Move [Component] to atoms/ (too simple for molecules)
  - Split [Component] into smaller atoms
```

### Step 3: Generate Review Report

```markdown
# Code Review Report

## Summary
- Files reviewed: X
- Issues found: Y
- Warnings: Z

## Results

### Naming Conventions: ✅ PASS / ❌ FAIL
[details]

### Modularity: ✅ PASS / ⚠️ WARN
[details]

### Scalability: ✅ PASS / ⚠️ WARN
[details]

### Atomic Design: ✅ PASS / ⚠️ WARN (if UI components)
[details]

## Recommended Actions
1. [action 1]
2. [action 2]
```

### Step 4: Fix Issues (if any)

If issues found:
1. Ask user if they want automatic fixes
2. Apply fixes one at a time
3. Re-run review after fixes

### Step 5: Commit with Semantic Message

Once review passes:

#### 5.1 Determine Commit Type

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat: add OCR service for receipt scanning` |
| `fix` | Bug fix | `fix: correct currency parsing for EUR` |
| `refactor` | Code refactoring | `refactor: extract validation to utils` |
| `style` | Formatting only | `style: fix indentation in aiService` |
| `docs` | Documentation | `docs: add architecture documentation` |
| `test` | Tests | `test: add unit tests for duplicateDetection` |
| `chore` | Maintenance | `chore: update dependencies` |

#### 5.2 Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Examples:**
```
feat(mobile): add confidence indicator component

- Visual badges for OCR confidence scores
- Color-coded: green (high), yellow (medium), red (low)

Closes #123
```

```
refactor(services): extract error handling to utils

- Add withRetry utility for automatic retries
- Add logger for consistent logging
- Add custom error types (OCRError, AIServiceError)
```

#### 5.3 Branch Strategy

**When to branch:**
- New feature: `feature/<name>` (e.g., `feature/ocr-service`)
- Bug fix: `fix/<name>` (e.g., `fix/currency-parsing`)
- Refactor: `refactor/<name>` (e.g., `refactor/modularize-services`)

**Commands:**
```bash
# Create and switch to new branch
git checkout -b feature/my-feature

# Commit changes
git add .
git commit -m "feat(scope): description"

# Push branch
git push -u origin feature/my-feature
```

**When to commit directly to main:**
- Small fixes (typos, formatting)
- Documentation updates
- Config changes

### Step 6: Final Verification

After commit:
1. Verify commit message is semantic
2. Verify branch name follows convention
3. Report success

## Quick Reference

### Naming Conventions Summary

| Type | Convention | Example |
|------|------------|---------|
| Component files | PascalCase.tsx | `ConfirmationScreen.tsx` |
| Service files | camelCase.ts | `supabaseClient.ts` |
| Util files | camelCase.ts | `dateUtils.ts` |
| Config files | camelCase.ts | `config/index.ts` |
| Test files | *.test.ts | `validation.test.ts` |
| Functions | camelCase | `formatDate()` |
| Constants | SCREAMING_SNAKE | `API_CONFIG` |
| Types/Interfaces | PascalCase | `Transaction`, `IOCRService` |
| Booleans | is/has/should prefix | `isValid`, `hasError` |

### Atomic Design Quick Check

```
Is it a single UI element (Button, Input)?        → Atom
Is it a small combo of atoms (SearchBar)?         → Molecule
Is it a complex section (Header, List)?           → Organism
Is it a page layout?                              → Template
Is it a full page with data?                      → Screen/Page
```

### Semantic Commit Types

```
feat     → New feature
fix      → Bug fix
refactor → Code restructuring
style    → Formatting only
docs     → Documentation
test     → Tests
chore    → Maintenance
```

---
description: ALWAYS run this workflow for ANY code change - commit using conventional commits and atomic commits
---
# Git Workflow Guidelines

**⚠️ MANDATORY**: This workflow MUST be executed for EVERY code change. Do not skip this workflow.

This workflow defines the branching strategy and commit message conventions for this project.

## Branching Strategy

Use a **feature branch** workflow. The `main` branch should always contain stable, production-ready code.

**⚠️ CRITICAL RULE**: For EVERY new feature request or distinct task, you MUST create a NEW branch. NEVER commit directly to `main` or reuse an old feature branch for a new unconnected task. Isolate every request to protect `main`.

### Branch Naming Convention

Use the following prefixes based on the type of work:

| Prefix      | Purpose                                      | Example                          |
|-------------|----------------------------------------------|----------------------------------|
| `feat/`     | New features                                 | `feat/user-authentication`       |
| `fix/`      | Bug fixes                                    | `fix/login-crash`                |
| `docs/`     | Documentation changes                        | `docs/update-readme`             |
| `refactor/` | Code refactoring (no functional change)      | `refactor/simplify-api-calls`    |
| `chore/`    | Maintenance tasks (deps, configs)            | `chore/update-dependencies`      |
| `test/`     | Adding or updating tests                     | `test/add-unit-tests`            |
| `style/`    | Formatting, styling (no logic change)        | `style/update-theme`             |

### Workflow Steps

1. **Create a branch** from `main`:
   ```powershell
   git checkout main
   git pull origin main
   git checkout -b <prefix>/<short-description>
   ```

2. **Make changes** and commit using the commit convention below.

3. **Push the branch**:
   ```powershell
   git push -u origin <branch-name>
   ```

4. **Merge back to main** (after review/approval):
   ```powershell
   git checkout main
   git merge <branch-name>
   git push origin main
   git branch -d <branch-name>
   ```

---

## Atomic Commits

**Keep commits small and focused.** Each commit should represent one single, complete logical change.

### Rules for Atomic Commits

1. **One purpose per commit** - Each commit should do ONE thing only
2. **Complete changes** - The commit should be a complete, working unit
3. **No mixing** - Do not mix unrelated features, fixes, or changes in one commit
4. **Reviewable** - Each commit should be easy to understand and review

### Examples

**Good** (atomic):
```
style(button): update primary button color
style(card): increase border radius
feat(search): add search input component
```

**Bad** (non-atomic):
```
feat: add search, update styles, fix bug
```

---

## Commit Message Convention

Use **Conventional Commits** format:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Description                                      |
|------------|--------------------------------------------------|
| `feat`     | A new feature                                    |
| `fix`      | A bug fix                                        |
| `docs`     | Documentation only changes                       |
| `style`    | Formatting, missing semicolons (no code change)  |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test`     | Adding or correcting tests                       |
| `chore`    | Maintenance tasks                                |

### Examples

```
feat(auth): add login with Google OAuth

fix(api): resolve null pointer in user endpoint

docs: update installation instructions

refactor(utils): simplify date formatting logic

chore(deps): upgrade React to v18
```

### Rules

1. **Use lowercase** for type and scope.
2. **Use imperative mood** in the description ("add" not "added").
3. **Keep the subject line under 72 characters**.
4. **Separate subject from body with a blank line** (if body is present).

---

## Agent Instructions

**IMPORTANT**: This workflow MUST be followed for EVERY code change made to this repository.

// turbo-all

### Before Making Changes
1. Check current branch with `git branch`
2. Ensure `.agent/` directory is ignored (check `.git/info/exclude`)

### For Every Change
1. Determine the type of change (feat, fix, docs, refactor, style, chore, test)
2. If not on a feature branch, create one:
   ```powershell
   git checkout -b <type>/<short-description>
   ```
3. Stage changed files:
   ```powershell
   git add <files>
   ```
4. Commit with conventional commit message:
   ```powershell
   git commit -m "<type>(<scope>): <description>"
   ```
5. Push the branch:
   ```powershell
   git push -u origin <branch-name>
   ```

### After Task Completion
When a task or feature is complete:
1. Push all commits
2. Optionally merge to main (if approved):
   ```powershell
   git checkout main
   git merge <branch-name>
   git push origin main
   ```


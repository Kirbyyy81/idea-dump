# Shared Component Guide

## Scope

- Apply this guide to everything under `components/`.
- Follow the root `AGENTS.md` and `document/DESIGN_SYSTEM.md` together with this guide.
- Keep route-specific components in the nearest `app/<route>/_components/` directory unless they are genuinely reused across features.

## Organization

- Use `atoms/` for design-system primitives such as buttons, inputs, cards, badges, loaders, and selectors.
- Use `molecules/` for small reusable compositions with one focused interaction.
- Use `organisms/` for cross-feature layout or workflow compositions. Do not place a feature-owned component here only because it is large.
- Reuse existing components before introducing a new primitive or a parallel variant.
- Use `AppShell` `pageTitle`, `headerAction`, and `headerClassName` for authenticated page headers. `AppShell` renders `PageHeader` centrally. Supply the current page name and only pass an action when the page has a relevant primary control. Do not add breadcrumbs.

## UI Rules

- Use the design tokens and visual rules in `document/DESIGN_SYSTEM.md`.
- Do not expose raw browser form controls in user-facing UI. Wrap them in an existing or reusable styled component.
- Keep copy direct and necessary. Do not add decorative descriptions or generic `Description` labels.
- Use `next/image` for application images when image optimization applies.
- Keep components focused. Extract stateful workflows, dialogs, and feature-specific sections when a shared component starts owning unrelated responsibilities.

## Accessibility

- Give icon-only controls an accessible name.
- Preserve keyboard navigation, visible focus, dialog focus management, and Escape behavior.
- Associate labels, validation messages, and help text with their form controls.
- Do not use colour as the only way to communicate status.

## Validation

- Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` for shared component changes.
- Exercise affected desktop and mobile interactions when changing navigation, dialogs, forms, or responsive behavior.

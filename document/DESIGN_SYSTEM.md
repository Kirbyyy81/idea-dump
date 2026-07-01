# IdeaDump Design System

A warm, compact, pastel dashboard system for managing ideas, projects, PRDs, work items, notes, and delivery progress.

---

## 1. Design Essence

IdeaDump should feel like a friendly project command centre, not a formal document repository.

It should be:

- Warm and personal, using creamy backgrounds and gentle pastel surfaces.
- Structured and decisive, using near-black navigation, buttons, text, and key borders.
- Compact but readable, showing useful information without becoming cluttered.
- Playful with purpose, using pastel workflow zones and hand-drawn doodle icons.
- Tactile and calm, using rounded shapes and visible outlines instead of shadows.

IdeaDump should not feel like:

- A cold white-and-blue enterprise dashboard.
- A generic document portal full of identical cards.
- A glassmorphism interface with blur, gradients, or glowing effects.
- A childish productivity app with excessive doodles or decoration.
- A dense spreadsheet with poor visual hierarchy.

---

## 2. Core Design Principles

1. **Warm canvas, strong controls**  
   Use cream and ivory for the workspace. Use near-black for navigation, primary actions, important text, and strong borders.

2. **Pastels communicate meaning**  
   Pastel colours should represent workflow areas, not only decoration.

3. **One glance should answer the essentials**  
   Users should quickly understand what needs attention, what is active, what is due soon, and what is currently selected.

4. **Information should be layered**  
   Show summary cards first, then lists, then a focused details panel.

5. **Use borders, not shadows**  
   Structure should come from outlines, spacing, and colour contrast. Shadows should only appear on menus and floating overlays.

6. **Keep interaction labels direct**  
   Use labels such as `Create PRD`, `Add task`, `Open project`, `Request review`, and `Mark complete`.

---

## 3. Foundation Tokens

### 3.1 Colour System

```css
:root {
  /* Canvas and surfaces */
  --bg-canvas: #F3ECD9;
  --bg-shell: #FFFDF6;
  --bg-surface: #FFFDF6;
  --bg-subtle: #F7F1E4;
  --bg-hover: #EEE5D2;
  --bg-selected: #F1E6D9;

  /* Navigation and text */
  --nav-bg: #191917;
  --nav-bg-hover: #2A2926;
  --nav-text: #FFFDF6;
  --nav-text-muted: #B8B4AA;

  --text-primary: #1B1B18;
  --text-secondary: #5F5C55;
  --text-muted: #8D887D;
  --text-disabled: #B8B2A5;
  --text-on-dark: #FFFDF6;

  /* Borders */
  --border-default: #D7D0C1;
  --border-subtle: #E7E0D3;
  --border-strong: #5A5952;
  --border-dark: #1B1B18;

  /* Primary actions */
  --action-primary: #191917;
  --action-primary-hover: #32312E;
  --action-primary-text: #FFFDF6;

  /* Pastel workflow surfaces */
  --pastel-pink: #EFA9D1;
  --pastel-pink-soft: #FAE0EE;

  --pastel-yellow: #F5D76B;
  --pastel-yellow-soft: #FDF1BF;

  --pastel-olive: #A7B772;
  --pastel-olive-soft: #DFE8C2;

  --pastel-blue: #B8CEF0;
  --pastel-blue-soft: #E0EBFB;

  --pastel-lilac: #D8C8EC;
  --pastel-peach: #F2C8AE;

  /* Workflow mapping */
  --surface-idea: var(--pastel-blue);
  --surface-prd: var(--pastel-pink);
  --surface-active: var(--pastel-yellow);
  --surface-complete: var(--pastel-olive);
  --surface-archived: #E6E3DD;

  /* Semantic feedback */
  --success: #688743;
  --success-bg: #E8F0DB;

  --warning: #9A6D11;
  --warning-bg: #FFF1C8;

  --error: #B5485D;
  --error-bg: #FBE1E5;

  --info: #5577B1;
  --info-bg: #E5EEFC;

  /* Charts */
  --chart-1: #191917;
  --chart-2: #EFA9D1;
  --chart-3: #F5D76B;
  --chart-4: #A7B772;
  --chart-5: #B8CEF0;
}
```

### 3.2 Colour Usage Rules

| Colour family | Use for | Avoid using for |
|---|---|---|
| Warm ivory | Canvas, app shell, cards, forms | Important actions or alerts |
| Near-black | Sidebar, buttons, titles, key metrics, strong borders | Large page backgrounds |
| Blue | Ideas, discovery, research, planning | Errors or overdue states |
| Pink | PRDs, reviews, documents, collaborators | Destructive actions |
| Yellow | Active work, due soon, planning | Long text backgrounds |
| Olive | Completed, approved, stable, on-track | Warnings or errors |
| Semantic colours | Success, warning, error, system feedback | General project categorisation |

---

## 4. Typography

Use a rounded modern sans-serif throughout the product.

```css
:root {
  --font-heading: "Plus Jakarta Sans", "Manrope", "DM Sans", system-ui, sans-serif;
  --font-body: "Plus Jakarta Sans", "Manrope", "DM Sans", system-ui, sans-serif;

  --font-regular: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
  --font-extrabold: 800;
}
```

### Next.js Font Setup

```typescript
import { Plus_Jakarta_Sans } from "next/font/google";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-heading",
});
```

Apply the same font family to body text.

### Type Scale

| Element | Size | Weight | Line Height | Usage |
|---|---:|---:|---:|---|
| Display title | 28px | 800 | 1.15 | Greeting, dashboard title, selected project |
| H1 | 24px | 800 | 1.2 | Main page title |
| H2 | 18px | 700 | 1.3 | Section heading |
| H3 | 15px | 700 | 1.35 | Card title, panel title |
| Body large | 14px | 400 to 500 | 1.55 | Descriptions |
| Body | 13px | 400 to 500 | 1.5 | Standard content |
| Small | 12px | 500 | 1.45 | Metadata |
| Label | 10px | 700 | 1.3 | Pills, filters, chart labels |
| Micro | 9px | 600 | 1.2 | Dense table metadata |

### Typography Rules

- Use sentence case throughout the interface.
- Do not use serif typography in the product UI.
- Use muted text only for secondary metadata.
- Keep titles short and scannable.
- Avoid more than two text weights inside a single card.

---

## 5. Spacing, Radius, Borders, and Elevation

### Spacing Scale

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

### Spacing Rules

- Dashboard card padding: 12px to 16px.
- Larger panels: 20px to 24px.
- Page padding: 16px to 24px.
- Row gap: 8px to 12px.
- Major dashboard region gap: 20px to 24px.
- Form field gap: 16px.

### Radius Scale

```css
:root {
  --radius-xs: 6px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-shell: 28px;
  --radius-pill: 999px;
}
```

### Borders and Elevation

```css
:root {
  --border-width: 1px;
  --border-strong-width: 1.5px;
  --border-shell-width: 2px;

  --shadow-subtle: 0 2px 8px rgba(27, 27, 24, 0.05);
}
```

Rules:

- Use a 2px border for the main application shell.
- Use 1px borders for cards, inputs, list rows, menus, and dropdowns.
- Use 1.5px borders for selected panels and important detail areas.
- Avoid shadows on cards.
- Use subtle shadows only for floating menus, modals, and popovers.
- Never use gradients.

---

## 6. Application Layout

### Desktop Shell

```text
Page canvas
└── Application shell
    ├── Dark navigation rail
    ├── Main workspace
    │   ├── Utility header
    │   ├── Page title and context
    │   ├── Summary cards
    │   └── List and detail workspace
    └── Optional planning rail
        ├── Calendar
        ├── Quick actions
        └── Upcoming work timeline
```

```css
.app-shell {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr) 300px;
  gap: 20px;
  min-height: calc(100vh - 48px);
  max-width: 1540px;
  margin: 24px auto;
  padding: 16px;
  background: var(--bg-shell);
  border: var(--border-shell-width) solid var(--border-strong);
  border-radius: var(--radius-shell);
}
```

### Layout Rules

- Sidebar width: 208px to 240px.
- Planning rail width: 280px to 340px.
- Main content should remain the largest area.
- Use list-plus-detail layouts for projects, PRDs, and work items.
- The right rail should show time-based information, not duplicate main dashboard content.

---

## 7. Navigation

### Sidebar Structure

```text
General
- Dashboard
- Ideas
- Projects
- PRDs
- Work items

Tools
- Calendar
- Notes
- Documents
- Settings

Account
- Profile
- Log out
```

```css
.sidebar {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 18px 14px;
  background: var(--nav-bg);
  color: var(--nav-text);
  border-radius: var(--radius-lg);
}
```

### Sidebar Rules

- Keep the sidebar near-black.
- Use ivory for active navigation text.
- Use muted ivory for inactive navigation text.
- Use original hand-drawn doodle icons at 18px.
- Navigation items should be at least 40px high.
- Use a restrained active state, not a bright pastel block.
- Keep `Log out` anchored near the bottom.
- Keep the wordmark simple and compact.

### Mobile Navigation

- Below 768px, use a drawer or bottom navigation.
- Show only the most important destinations in bottom navigation.
- Move secondary tools into a menu or drawer.

---

## 8. Components

### 8.1 Utility Header

Use the utility header for:

- Search
- Context filters
- Breadcrumbs
- Notifications
- Settings
- Profile access

Rules:

- Keep utility controls compact.
- A pink circular search button is allowed as a small accent.
- Avoid a large full-width search bar unless search is the primary page feature.
- Keep controls aligned in one horizontal row.

---

### 8.2 Buttons

#### Primary Button

```css
.button-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 10px 16px;
  background: var(--action-primary);
  color: var(--action-primary-text);
  border: 1px solid var(--action-primary);
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: var(--font-bold);
  line-height: 1;
  transition: background 160ms ease, transform 160ms ease;
}

.button-primary:hover {
  background: var(--action-primary-hover);
  transform: translateY(-1px);
}
```

Use for:

- Create PRD
- Add idea
- Create project
- Save changes
- View all details
- Request review

#### Secondary Button

```css
.button-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 10px 16px;
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: var(--font-bold);
  transition: background 160ms ease, border-color 160ms ease;
}

.button-secondary:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}
```

#### Ghost Button

```css
.button-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 8px 12px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: var(--font-semibold);
}

.button-ghost:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
```

#### Destructive Button

Use only for permanent deletion or irreversible archive actions.

- Use pale error background.
- Use strong deep-red text.
- Require confirmation for irreversible actions.

---

### 8.3 Icon Buttons

```css
.icon-button {
  display: inline-grid;
  width: 40px;
  height: 40px;
  place-items: center;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-pill);
  transition: background 160ms ease, border-color 160ms ease;
}

.icon-button:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}
```

Rules:

- Use 18px to 20px custom doodle SVG icons.
- Add accessible labels to every icon-only button.
- Use icon-only buttons only for familiar actions such as search, close, notifications, refresh, calendar, and more options.
- Do not use icon-only buttons for important destructive actions.

---

### 8.4 Inputs

```css
.input {
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font: inherit;
  font-size: 13px;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.input:hover {
  border-color: var(--border-strong);
}

.input:focus-visible {
  outline: none;
  border-color: var(--border-dark);
  box-shadow: 0 0 0 3px rgba(25, 25, 23, 0.12);
}

.input::placeholder {
  color: var(--text-muted);
}
```

Rules:

- Inputs should feel ivory or off-white, not pure white.
- Use visible labels above fields.
- Do not rely only on placeholders as labels.

---

### 8.5 Chips and Filters

```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 6px 10px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  font-size: 10px;
  font-weight: var(--font-bold);
}

.chip[data-active="true"] {
  background: var(--action-primary);
  color: var(--action-primary-text);
  border-color: var(--action-primary);
}
```

Rules:

- Keep labels short.
- Use one clear active state per filter group.
- Use colour chips only when colour itself has meaning.

---

### 8.6 Status Badges

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  font-size: 10px;
  font-weight: var(--font-bold);
  line-height: 1;
}

.badge-idea {
  background: var(--pastel-blue-soft);
  color: #456899;
  border-color: #AFC5E7;
}

.badge-prd {
  background: var(--pastel-pink-soft);
  color: #A34473;
  border-color: #E7B7CF;
}

.badge-active {
  background: var(--pastel-yellow-soft);
  color: #856008;
  border-color: #EAD37B;
}

.badge-complete {
  background: var(--pastel-olive-soft);
  color: #58733B;
  border-color: #B4C78A;
}

.badge-archived {
  background: #F0EEEA;
  color: #6E6A62;
  border-color: #D9D5CD;
}
```

Never use colour alone to communicate status. Always include text.

---

## 9. Card System

Do not use one generic card style everywhere.

### A. Featured Summary Card

Use for high-value dashboard information.

```css
.card-featured {
  position: relative;
  min-height: 138px;
  padding: 16px;
  overflow: hidden;
  border: 1px solid rgba(27, 27, 24, 0.12);
  border-radius: var(--radius-lg);
}
```

Include:

- Card title
- One or two key metrics
- Supporting trend or label
- Small chart, progress bar, or breakdown
- One faint abstract background shape

Use pastel backgrounds for these cards.

### B. Supporting Metric Card

```css
.card-metric {
  min-height: 96px;
  padding: 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
}
```

Use for:

- Ideas waiting for review
- PRDs in draft
- Tasks due this week
- Completed projects this month

### C. List Card

```css
.card-list {
  padding: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
}
```

Rules:

- Rows should be 48px to 64px high.
- Use clear left-to-right hierarchy.
- Use pastel selected states.
- Do not hide important metadata behind hover states.

### D. Focus Detail Panel

```css
.card-detail {
  padding: 16px;
  background: var(--pastel-pink-soft);
  border: 1.5px solid var(--border-strong);
  border-radius: var(--radius-lg);
}
```

Use for:

- Selected PRD
- Selected project
- Important work item
- Review status
- Decisions and blockers

---

## 10. Dashboard Content Mapping

| Dashboard card | Surface | Main content |
|---|---|---|
| Ideas pipeline | Blue | New, shortlisted, and ready-to-plan ideas |
| PRD progress | Pink | Draft, review, approved, and blocked PRDs |
| Active work | Yellow | Tasks, due soon items, blockers |
| Delivery health | Olive | Completed work, on-track projects, release readiness |

### List Row Pattern

```text
[Pastel icon tile]  Title and short metadata  [Status badge]  [Due date or activity]
```

Include:

- Leading icon or project avatar
- Primary title
- Short metadata line
- Status badge
- Optional due date, owner, or action menu

### Detail Panel Pattern

```text
Title and workflow status
Short summary
Owner, project, updated date
Progress or readiness breakdown
Linked work items
Open blockers or decisions
Primary action
```

For PRDs, include:

- PRD status
- Linked project
- Owner and reviewers
- Last updated date
- Requirement readiness
- Open decisions
- Primary action such as `Open PRD` or `Request review`

---

## 11. Calendar and Timeline Rail

Use the right rail for time-based planning.

Recommended components:

- Small monthly calendar
- Add work item button
- Today timeline
- Upcoming reviews
- Upcoming deadlines
- Release dates
- Compact all-work filter

Rules:

- Keep calendar cells small but interactive.
- Use soft circles or rounded fills for selected dates.
- Use small dots or chips for event categories.
- Keep timelines concise, showing time, title, owner, and status.

---

## 12. Data Visualisation

Charts should support decisions, not dominate the interface.

Preferred chart types:

- Tiny line charts for trend changes
- Compact bar charts for workload distribution
- Segmented progress bars for PRD status
- Small labelled counts for quick summaries

Rules:

- Use no more than five colours in a chart.
- Use near-black for the most important series.
- Use pastel chart colours consistently with workflow meaning.
- Include labels or supporting text for accessibility.
- Do not use gradients, 3D charts, or overly detailed axes.

---

## 13. Icons

### Icon Direction

Use an original custom hand-drawn SVG icon set.

The icon language should feel:

- Hand-drawn, slightly imperfect, and warm.
- Rounded and friendly.
- Bold enough to read at small sizes.
- Monochrome by default.
- Consistent, as though drawn by one person using the same pen.

Do not use Lucide, Material Symbols, emoji, or mixed icon libraries in the completed product.

### Construction Rules

```css
:root {
  --icon-size-xs: 14px;
  --icon-size-sm: 16px;
  --icon-size-md: 18px;
  --icon-size-lg: 20px;
  --icon-size-xl: 24px;

  --icon-stroke-compact: 1.8px;
  --icon-stroke-standard: 2px;
  --icon-stroke-feature: 2.2px;
}

.doodle-icon {
  width: var(--icon-size-lg);
  height: var(--icon-size-lg);
  flex: 0 0 auto;
  color: currentColor;
  fill: none;
  stroke: currentColor;
  stroke-width: var(--icon-stroke-standard);
  stroke-linecap: round;
  stroke-linejoin: round;
}
```

### SVG Rules

- Use a 24 by 24 viewBox.
- Keep most artwork inside an 18 by 18 to 20 by 20 visual area.
- Use rounded caps and joins.
- Use outlines by default.
- Use slight intentional irregularity, such as a wavy edge or imperfect oval.
- Avoid tiny details that disappear below 18px.
- Avoid realistic, glossy, 3D, filled, or emoji-style icons.

### Icon Colour Rules

- Default icon colour is `var(--text-primary)`.
- On dark navigation, use muted ivory for inactive items and bright ivory for active items.
- Use pastel icon tiles for grouping, not pastel icon strokes.
- Keep icons monochrome.

```css
.icon-tile {
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid rgba(27, 27, 24, 0.12);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
}

.icon-tile[data-tone="idea"] {
  background: var(--pastel-blue-soft);
}

.icon-tile[data-tone="prd"] {
  background: var(--pastel-pink-soft);
}

.icon-tile[data-tone="active"] {
  background: var(--pastel-yellow-soft);
}

.icon-tile[data-tone="complete"] {
  background: var(--pastel-olive-soft);
}
```

### Core Icon Set

| Purpose | Doodle concept |
|---|---|
| Dashboard | Slightly uneven four-panel grid |
| Ideas | Rounded lightbulb with a small spark |
| Projects | Loose folder with visible paper |
| PRDs | Folded document with short scribble lines |
| Work items | Checklist with rounded ticks |
| Calendar | Wavy-bound calendar page |
| Notes | Sticky note with lifted corner |
| Documents | Two offset paper sheets |
| Search | Hand-drawn lens with soft angled handle |
| Notifications | Rounded bell with small clapper |
| Add | Uneven rounded plus |
| Settings | Soft-edged sliders or simple gear |
| Completed | Circular hand-drawn tick |
| Archive | Storage box or paper tray |
| Team | Two minimal rounded head-and-shoulder forms |

### Icon Usage Rules

- Use doodle icons in sidebar navigation, buttons, lists, menus, cards, and empty states.
- Pair unfamiliar icons with text.
- Use icon-only buttons only for familiar utility actions.
- Avoid using decorative icons on every card.
- Design icons at 20px first, then scale them for larger uses.
- Store icons as reusable React SVG components.

Example component naming:

```text
DashboardDoodleIcon
IdeaDoodleIcon
ProjectDoodleIcon
PrdDoodleIcon
TaskDoodleIcon
CalendarDoodleIcon
NotesDoodleIcon
SearchDoodleIcon
SettingsDoodleIcon
```

---

## 14. Empty, Loading, and Error States

### Empty States

Use:

- Small hand-drawn doodle icon
- Soft pastel circle or tile
- Clear explanation
- One primary action

Example:

```text
No PRDs yet

Turn a project idea into a clear plan.

[Create your first PRD]
```

### Loading States

- Use compact skeleton rows.
- Preserve layout dimensions.
- Avoid spinning illustrations or flashy animations.

### Error States

- Use pale pink error panels.
- Clearly explain what failed.
- Provide a retry action.
- Avoid showing technical error codes unless useful to the user.

---

## 15. Motion and Interaction

```css
:root {
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --transition-fast: 120ms var(--ease-standard);
  --transition-base: 160ms var(--ease-standard);
  --transition-slow: 220ms var(--ease-standard);
}
```

Rules:

- Buttons can change background and move up by a maximum of 1px.
- Cards should use subtle border or background changes on hover.
- List rows should show a selected state after click.
- Menus can use short fade and slight scale transitions.
- Avoid bounce, parallax, large scale effects, or looping animations.

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 16. Accessibility

- Maintain at least 4.5:1 contrast for normal text.
- Use near-black text on pastel surfaces for important content.
- Never use colour as the only status indicator.
- All icon-only buttons require accessible labels.
- All interactive elements must be at least 40px by 40px.
- Prefer 44px by 44px touch targets on mobile.
- Always show keyboard focus.
- Support keyboard navigation for navigation, tabs, filters, lists, menus, and dropdowns.
- Use semantic headings, buttons, landmarks, and list elements.
- Ensure dense dashboard content remains readable at 200% browser zoom.

```css
:focus-visible {
  outline: 2px solid var(--border-dark);
  outline-offset: 3px;
}
```

---

## 17. Responsive Breakpoints

```css
:root {
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
  --breakpoint-2xl: 1440px;
}
```

| Width | Layout |
|---|---|
| 1280px and above | Full shell with sidebar, workspace, and right rail |
| 1024px to 1279px | Narrow sidebar, summary cards may become two columns |
| 768px to 1023px | Sidebar becomes drawer, right rail moves below content |
| Below 768px | Single-column workspace, bottom navigation or drawer |

### Mobile Rules

- Show active work first.
- Keep summary cards above lists.
- Move calendar and timeline into separate sections or tabs.
- Do not force three columns into small screens.
- Keep primary actions easy to reach.

---

## 18. Implementation Rules

1. Define all tokens in `globals.css`.
2. Use one rounded sans-serif font family throughout the interface.
3. Use near-black for navigation and primary actions.
4. Use pastel surfaces to communicate workflow categories.
5. Use featured, metric, list, and detail card variants intentionally.
6. Keep dashboard cards compact.
7. Use visible borders and restrained shadows.
8. Use only the approved original doodle SVG icon family.
9. Do not use gradients, glass effects, or large decorative backgrounds.
10. Keep the desktop shell framed and rounded.
11. Prefer list-plus-detail layouts for projects, PRDs, and work items.
12. Keep action labels specific and clear.
13. Test desktop, tablet, mobile, keyboard navigation, and zoom before completing a screen.

---

## 19. Quick Reference

```text
Canvas: warm beige
Workspace: ivory
Navigation: near-black
Primary actions: near-black pill buttons
Typography: rounded modern sans-serif
Borders: visible warm-grey outlines
Cards: compact, rounded, outlined, and hierarchical
Ideas: blue
PRDs: pink
Active work: yellow
Completed work: olive
Icons: original hand-drawn doodle SVGs
Layout: summary cards, list, detail panel, optional planning rail
Motion: subtle and functional
```
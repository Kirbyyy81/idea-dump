# IdeaDump Design System

A clean, modern design system for the IdeaDump PRD management hub.

## Design Principles

- **Light Mode First**: Bright, clean interface optimized for readability
- **No Gradients**: Solid colors only for clarity and simplicity
- **No Shadows**: Flat design with borders for depth and separation
- **Minimal & Modern**: Clean aesthetic with generous whitespace
- **Purposeful Motion**: Subtle, meaningful interactions
- **Icon Library**: Use Lucide React icons exclusively (no emojis)

---

## Color Palette

### Base Colors (Light Mode)

```css
/* Backgrounds */
--bg-base: #F2EAD3;           /* Warm beige - main background */
--bg-elevated: #FFFFFF;       /* Pure white - cards */
--bg-hover: #E8DDBF;          /* Darker beige - hover states */
--bg-subtle: #F7F2E5;         /* Light beige - subtle backgrounds */

/* Text */
--text-primary: #2C2416;      /* Dark brown - headings, primary text */
--text-secondary: #5C5346;    /* Medium brown - body text, descriptions */
--text-muted: #8B8375;        /* Light brown - timestamps, metadata */
--text-disabled: #B8AFA0;     /* Disabled states */

/* Borders */
--border-default: #D4C9B3;    /* Beige border - default */
--border-strong: #C4B89D;     /* Darker beige - emphasized borders */
--border-subtle: #E5DCC8;     /* Light beige - subtle dividers */
```

### Accent Colors (Pastel Palette)

```css
/* Primary Interactive */
--accent-rose: #E37083;       /* Rose Pink - primary actions */
--accent-blue: #89B7C2;       /* Muted Blue - secondary actions */

/* Secondary Accents */
--accent-sage: #A8BF8A;       /* Sage Green - success, completed */
--accent-apricot: #FCCD86;    /* Warm Apricot - warnings, in-progress */
--accent-coral: #F49AA2;      /* Soft Coral - highlights */

/* Status Colors */
--status-idea: #89B7C2;       /* Muted Blue - idea phase */
--status-prd: #E37083;        /* Rose Pink - PRD written */
--status-dev: #FCCD86;        /* Warm Apricot - in development */
--status-complete: #A8BF8A;   /* Sage Green - completed */
--status-archived: #9CA3AF;   /* Gray - archived */
```

### Semantic Colors

```css
/* Feedback */
--success: #A8BF8A;
--warning: #FCCD86;
--error: #EF4444;
--info: #89B7C2;

/* Success states (lighter backgrounds) */
--success-bg: #F0F4EC;
--warning-bg: #FEF8EC;
--error-bg: #FEF2F2;
--info-bg: #EFF6F8;
```

---

## Typography

### Font Family

```css
/* Headings - Serif for elegance */
--font-heading: 'DM Serif Text', Georgia, serif;

/* Body - Sans-serif for readability */
--font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

**Import fonts** (add to `layout.tsx` or `globals.css`):
```typescript
import { DM_Serif_Text, Inter } from 'next/font/google';

const dmSerifText = DM_Serif_Text({ 
  weight: '400',
  subsets: ['latin'],
  variable: '--font-heading'
});

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-body'
});
```

### Type Scale

| Element | Size | Weight | Line Height | Letter Spacing |
|---------|------|--------|-------------|----------------|
| **H1** | 36px | 700 (Bold) | 1.2 | -0.02em |
| **H2** | 28px | 700 (Bold) | 1.3 | -0.01em |
| **H3** | 24px | 600 (Semibold) | 1.4 | -0.01em |
| **H4** | 20px | 600 (Semibold) | 1.4 | normal |
| **Body Large** | 16px | 400 (Regular) | 1.6 | normal |
| **Body** | 14px | 400 (Regular) | 1.5 | normal |
| **Body Small** | 13px | 400 (Regular) | 1.5 | normal |
| **Caption** | 12px | 500 (Medium) | 1.4 | 0.02em |

### Usage Examples

```css
/* Headings - DM Serif Text */
h1 { 
  font-family: var(--font-heading);
  font-size: 36px; 
  font-weight: 400; /* DM Serif Text only has 400 weight */
  line-height: 1.2; 
  letter-spacing: -0.02em; 
}
h2 { 
  font-family: var(--font-heading);
  font-size: 28px; 
  font-weight: 400; 
  line-height: 1.3; 
  letter-spacing: -0.01em; 
}
h3 { 
  font-family: var(--font-heading);
  font-size: 24px; 
  font-weight: 400; 
  line-height: 1.4; 
}

/* Body - Inter */
body { 
  font-family: var(--font-body);
  font-size: 14px; 
  font-weight: 400; 
  line-height: 1.5; 
}
.text-large { font-size: 16px; line-height: 1.6; }
.text-small { font-size: 13px; }
.caption { font-size: 12px; font-weight: 500; letter-spacing: 0.02em; }
```

---

## Spacing System

Based on 4px base unit:

```css
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
--space-20: 80px;
--space-24: 96px;
```

### Common Patterns

- **Component padding**: 16px - 24px
- **Card padding**: 24px - 32px
- **Section spacing**: 48px - 64px
- **Page margins**: 80px - 96px
- **Grid gap**: 16px - 24px

---

## Border Radius

```css
--radius-sm: 6px;      /* Small elements (badges, tags) */
--radius-md: 8px;      /* Buttons, inputs */
--radius-lg: 12px;     /* Cards, modals */
--radius-xl: 16px;     /* Large cards */
--radius-2xl: 20px;    /* Featured elements */
--radius-full: 9999px; /* Pills, avatars */
```

---

## Components

### Buttons

#### Primary Button
```css
background: var(--accent-rose);
color: white;
border: none;
border-radius: var(--radius-md);
padding: 10px 20px;
font-weight: 500;
transition: all 0.2s ease;

/* Hover */
background: #D45F73; /* Darker rose */
transform: translateY(-1px);
```

#### Secondary Button
```css
background: transparent;
color: var(--text-primary);
border: 1px solid var(--border-default);
border-radius: var(--radius-md);
padding: 10px 20px;
font-weight: 500;

/* Hover */
background: var(--bg-hover);
border-color: var(--border-strong);
```

#### Ghost Button
```css
background: transparent;
color: var(--text-secondary);
border: none;
padding: 10px 16px;

/* Hover */
background: var(--bg-hover);
color: var(--text-primary);
```

### Cards

```css
background: var(--bg-elevated);
border: 1px solid var(--border-default);
border-radius: var(--radius-lg);
padding: 24px;
transition: all 0.2s ease;

/* Hover */
border-color: var(--border-strong);
transform: translateY(-2px);
```

### Badges

```css
display: inline-flex;
align-items: center;
padding: 4px 12px;
border-radius: var(--radius-full);
font-size: 12px;
font-weight: 500;
border: 1px solid transparent;

/* Status variants */
.badge-idea {
  background: var(--info-bg);
  color: var(--status-idea);
  border-color: var(--status-idea);
}

.badge-prd {
  background: #FEF2F4;
  color: var(--status-prd);
  border-color: var(--status-prd);
}

.badge-dev {
  background: var(--warning-bg);
  color: var(--status-dev);
  border-color: var(--status-dev);
}

.badge-complete {
  background: var(--success-bg);
  color: var(--status-complete);
  border-color: var(--status-complete);
}
```

### Inputs

```css
background: white;
border: 1px solid var(--border-default);
border-radius: var(--radius-md);
padding: 10px 14px;
font-size: 14px;
color: var(--text-primary);
transition: all 0.2s ease;

/* Focus */
border-color: var(--accent-rose);
outline: 2px solid rgba(227, 112, 131, 0.1);
outline-offset: 0;

/* Placeholder */
::placeholder {
  color: var(--text-muted);
}
```

---

## Interactions & Animations

### Transitions

```css
/* Standard transition */
transition: all 0.2s ease;

/* Specific properties */
transition: transform 0.2s ease, border-color 0.2s ease;
```

### Hover Effects

```css
/* Lift on hover */
transform: translateY(-2px);

/* Scale on hover (buttons) */
transform: scale(1.02);

/* Background change */
background: var(--bg-hover);
```

### Focus States

```css
/* Keyboard focus (accessibility) */
outline: 2px solid var(--accent-rose);
outline-offset: 2px;
```

---

## Layout Patterns

### Container

```css
max-width: 1280px;
margin: 0 auto;
padding: 0 24px;
```

### Grid

```css
display: grid;
grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
gap: 24px;
```

### Sidebar Layout

```css
display: grid;
grid-template-columns: 240px 1fr;
gap: 32px;
min-height: 100vh;
```

---

## Icons

**Library**: Lucide React (already installed in dependencies)

### Usage

```typescript
import { FileText, Folder, Github, Settings, Plus, Search } from 'lucide-react';

// Example usage
<FileText className="w-5 h-5" />
<Plus className="w-4 h-4" />
```

### Common Icons

| Purpose | Icon Component |
|---------|----------------|
| Projects | `FileText` |
| Folders | `Folder` |
| GitHub | `Github` |
| Settings | `Settings` |
| Add/Create | `Plus` |
| Search | `Search` |
| Edit | `Edit` |
| Delete | `Trash2` |
| Archive | `Archive` |
| Status: Idea | `Lightbulb` |
| Status: PRD | `FileText` |
| Status: Dev | `Code` |
| Status: Complete | `CheckCircle` |
| Notes | `StickyNote` |
| Calendar | `Calendar` |

### Icon Sizing

```css
/* Standard sizes */
.icon-sm { width: 16px; height: 16px; }
.icon-md { width: 20px; height: 20px; }
.icon-lg { width: 24px; height: 24px; }
```

---

## Accessibility

- **Minimum contrast ratio**: 4.5:1 for normal text, 3:1 for large text
- **Focus indicators**: Always visible for keyboard navigation
- **Touch targets**: Minimum 44x44px for interactive elements
- **Motion**: Respect `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Responsive Breakpoints

```css
/* Mobile first approach */
--breakpoint-sm: 640px;   /* Small tablets */
--breakpoint-md: 768px;   /* Tablets */
--breakpoint-lg: 1024px;  /* Laptops */
--breakpoint-xl: 1280px;  /* Desktops */
```

---

## Implementation Notes

1. **CSS Variables**: All design tokens should be defined as CSS custom properties in `globals.css`
2. **Component Library**: Use these tokens consistently across all components
3. **No Gradients**: All backgrounds, borders, and buttons use solid colors only
4. **No Shadows**: Use borders and subtle transforms for depth - no box-shadows
5. **Light Mode Only**: Dark mode is out of scope for initial implementation
6. **Fonts**: Import DM Serif Text and Inter from `next/font/google`
7. **Icons**: Use Lucide React exclusively - no emojis or other icon libraries
8. **Color Harmony**: All colors adjusted to complement the warm beige (#F2EAD3) base background

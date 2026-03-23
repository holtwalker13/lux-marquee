# UI wireframe and design tokens

## Flow

1. **Step 1 — Your event** — Event type (segmented control or cards), date picker, optional notes.
2. **Step 2 — Lettering** — Large text input + helper examples; estimate card directly below.
3. **Step 3 — Contact** — Name, email, phone, consent, submit.

## Typography

| Role | Font | Source |
|------|------|--------|
| Headings / hero | Fraunces | `next/font/google` |
| Body / UI | Nunito | `next/font/google` |

## Palette (CSS variables)

| Token | Use |
|-------|-----|
| `--cream` | Page background |
| `--blush` | Accents, chips |
| `--cocoa` | Primary text |
| `--coral` | CTA, highlights |
| `--card` | Card surface |

## Components

- Rounded-3xl cards, soft shadow on estimate summary.
- Step pills at top (1 · 2 · 3) with active state in blush/coral.
- Primary button: coral fill, white label, subtle hover lift.

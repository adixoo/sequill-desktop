# Design System: Pastel Quill

**Project ID:** None
**Code:** tokens, densities and `q-*` component classes in `src/app/test/quill.css`. Previews: `/test` (landing), `/test/app` (desktop editor, compact), `/test/components` (every component in both densities).

This is Sequill's only design system. The live app still runs on the older tokens in `src/app/globals.css` until these values replace them.

**Scope and inputs**

- **Covers:** the site (`/`, `/download`, the not-found page), the editor (`/app`) and the schema designer (`/vis`), in light and dark, from phone width to desktop.
- **Fixed inputs** (not reopened here): the six pastels and their meanings; DM Sans, JetBrains Mono and Caveat; the free Hugeicons set drawn through `Icon`; Tailwind 4 with shadcn/ui on Radix in `src/components/ui`; the `.dark` class from `next-themes`.
- **Constraints:** WCAG 2.2 AA (text 4.5:1; control edges and focus 3:1; targets 24px; nothing by colour, pointer or motion alone; everything by keyboard). The landing page ships none of the editor's code, so the system is CSS only. The data grid is virtualised, so row heights are fixed per density. End-to-end tests run in the Tauri desktop app.
- **Judgement calls** (recorded in the Decision log, section 9): the "bright orderly workroom" tone, how little colour counts as meaningful, and where compact density applies.

## 1. Visual Theme & Atmosphere

A **bright, orderly workroom**. The marketing pages are confident and open: display headlines, generous but not wasteful whitespace, gray cards that hold real pieces of the product, a single near-black action per band, and a dark close at the foot of the page. The editor reads like a well-made desktop tool: a soft gray frame around one white working sheet, quiet hairlines, data in a crisp monospace, and colour only where it means something.

The pastels are Sequill's voice. They never decorate chrome; each one carries a meaning (a status, a SQL token, a change, a focus) and appears in three strengths: a translucent **wash** for fills, the full **pastel** for strokes and solid marks, and a deep **ink** shade for text. A handwritten **Caveat** note in butter, always beside a hand-drawn arrow, is the one human gesture, and it lives only on marketing pages.

**Key characteristics**

- Light-first, with a dark theme in neutral charcoal (no blue or purple cast), never black: the darkest surface is #191919. In dark the working sheet sits one step darker than its frame.
- Near-monochrome at the action layer: the primary button is ink (#18181B), never a brand colour.
- Depth by tone first (canvas → surface → raised), 1px hairlines second, soft shadow only on what truly floats.
- Real product UI inside cards, at true size, instead of illustrations.
- Pastels on data and meaning; under 3% of an app screen's pixels carry colour.

### Principles, in priority order

Distilled from the rules in this file. When two pull against each other, the higher one wins.

1. **Readable by everyone.** Contrast is measured, not judged; nothing depends on colour, a pointer or motion alone.
2. **Colour carries meaning.** Each pastel has one job, the chrome stays gray and the primary action is Ink.
3. **The data is the hero.** Real product UI over illustration; mono values, tabular figures and nothing competing with the cells.
4. **One system, two densities.** The same tokens everywhere, only sizes change. Reuse or add a token, never a one-off value.
5. **Quiet by default.** Depth by tone, then hairline, then a shadow only on what floats. No gradients, no blur; in the app, motion is feedback.

| Principle   | Carried by                                                                                                         | How it plays out                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Readable  | `--ink-muted` (≥ 4.5:1), `--strong` (soft, 2.2:1) with the Cobalt focus border, the focus recipe, change-mark dots | Fields on Raised keep a Surface fill so their edge stays visible (over 5); change washes always carry a dot; phone targets stay 40px in compact (over 4) |
| 2 Meaning   | Meaning aliases (7.3), `--x-ink` / `--x-wash`, `q-tone-*`, Ink primary                                             | The SQL editor's active line leaves the Lilac wash for Raised, because Lilac means keyword                                                               |
| 3 Data      | `--font-mono`, `--text-cell`, `--row`, `--row-selected`, `q-num`                                                   | No zebra stripes: they would compete with the Selected, Edited and Added washes                                                                          |
| 4 Densities | Density tokens (7.9), `--z-*`, the radius and elevation scales                                                     | The `ui` primitives give up fixed heights to read `--control`                                                                                            |
| 5 Quiet     | Tone steps, `--hairline`, `--shadow-*`, `--dur-*`                                                                  | Dialog backdrops and the file drop zone lose their blur; app screens get no entrances                                                                    |

## 2. Color Palette & Roles

Components use roles, never raw hexes. Light is the default; dark is set by the `.dark` class.

### Ground and structure

| Role         | Light                    | Dark                   | Use                                                                                   |
| ------------ | ------------------------ | ---------------------- | ------------------------------------------------------------------------------------- |
| **Canvas**   | Cool Paper Mist #F7F7F8  | Frame Charcoal #202020 | Page floor; the app's L-frame (sidebar + top bar)                                     |
| **Surface**  | Pure Sheet White #FFFFFF | Sheet Charcoal #191919 | Cards on canvas, the app's working sheet, inputs                                      |
| **Raised**   | Soft Fog #F1F1F3         | Lifted Ash #262626     | Gray feature cards, menus, popovers, segmented track                                  |
| **Active**   | Pale Pewter #EAEAED      | Smoked Iron #2E2E2E    | Hover fill, active nav pill, pressed ghost button                                     |
| **Rule**     | Whisper Line #EBEBEE     | Quiet Seam #242424     | Row rules inside tables and lists                                                     |
| **Hairline** | Silver Thread #DEDEE3    | Iron Seam #303030      | Card, sheet and section edges                                                         |
| **Strong**   | Soft Steel #AEAEB6       | Soft Gunmetal #505050  | Control borders (inputs, outlined buttons, chips, checkboxes); soft, 2.2:1 on Surface |
| **Decor**    | Mid Stone #A1A1A9        | Dusk Gray #6B6B6B      | Non-text marks: dot leaders, inactive glyphs                                          |
| **Inverse**  | Graphite Night #26262B   | Footer Ash #232323     | The page-closing footer                                                               |

### Text

| Role           | Light                  | Dark                | Use                                                   |
| -------------- | ---------------------- | ------------------- | ----------------------------------------------------- |
| **Ink**        | Charcoal Ink #18181B   | Moonlight #EDEDED   | Headlines, body, key figures                          |
| **Ink Soft**   | Graphite Ink #45454C   | Pale Silver #C4C4C4 | Running secondary copy                                |
| **Ink Muted**  | Weathered Gray #63636B | Mist Gray #A0A0A0   | Labels, meta, placeholders (≥ 4.5:1 on every surface) |
| **On Inverse** | #ECECEF, soft #A1A1A9  | same                | Footer text                                           |

### The six pastels (meaning)

Pastels are identical in both themes. **Ink** is a deep shade in light (pastel text fails on white) and the pastel itself in dark. **Wash** is 25–40% alpha in light, 14% in dark.

| Pastel                 | Pastel  | Light ink                | Meaning                                                                                  |
| ---------------------- | ------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| **Soft Peach Blossom** | #FFB3A1 | Burnt Terracotta #A8432B | Numbers in SQL                                                                           |
| **Buttercream**        | #F5E1A4 | Deep Mustard #7D6200     | Caution, pending states, handwritten notes and arrows                                    |
| **Seafoam Mint**       | #A6E3C4 | Forest Mint #1D7550      | Positive, done, string literals                                                          |
| **Powder Sky**         | #A9C9FF | Cobalt Ink #2D5CAD       | Focus, selection, links, SQL functions, the paid status; the one data hue on app screens |
| **Wisteria Lilac**     | #CBB6FF | Royal Violet #6646C2     | SQL keywords only (never a UI accent)                                                    |
| **Blush Rose**         | #F6A8C6 | Raspberry Ink #A83866    | Destructive, error, cancelled                                                            |

### Change marks and states

- **Added** Electric Spring Green #6EE7A1 (light ink #146C36) and **Edited** Vivid Cornflower #7CACFF (light ink #1D4FC4), for unsaved schema and cell edits, always with a wash fill and a dot, never colour alone.
- **Selected row** Ice #E4EDFD (dark #212B38).
- **Text selection** Powder Sky wash. **Focus ring** Cobalt Ink at 3px, 45% strength (under 3:1 in light; DDR-013 proposes a full-strength outline).
- **On accent** Charcoal #18181B: text on a solid pastel.

### Colour rules

- One primary action per band or screen, in Ink. Pastels never fill a primary button.
- App screens: colour on data, status and selection only; the chrome stays gray.
- Status pills are a wash with the same hue's ink text, never a saturated fill with white text.
- No gradients anywhere.

### Contrast (measured)

WCAG 2.x ratios for every text pair the system uses, computed from the token values (washes composited over Surface). Text needs 4.5:1; control boundaries and focus indicators need 3:1.

| Pair                                                   | Light   | Dark     | Needs |
| ------------------------------------------------------ | ------- | -------- | ----- |
| `--ink` on `--surface`                                 | 17.7    | 15.0     | 4.5:1 |
| `--ink` on `--canvas`                                  | 16.5    | 13.9     | 4.5:1 |
| `--ink` on `--raised`                                  | 15.7    | 12.9     | 4.5:1 |
| `--ink` on `--active`                                  | 14.8    | 11.6     | 4.5:1 |
| `--ink-soft` on `--surface`                            | 9.5     | 10.1     | 4.5:1 |
| `--ink-soft` on `--canvas`                             | 8.9     | 9.3      | 4.5:1 |
| `--ink-soft` on `--raised`                             | 8.4     | 8.7      | 4.5:1 |
| `--ink-soft` on `--active`                             | 7.9     | 7.8      | 4.5:1 |
| `--ink-muted` on `--surface`                           | 6.0     | 6.7      | 4.5:1 |
| `--ink-muted` on `--canvas`                            | 5.6     | 6.2      | 4.5:1 |
| `--ink-muted` on `--raised`                            | 5.3     | 5.8      | 4.5:1 |
| `--ink-muted` on `--active`                            | 5.0     | 5.2      | 4.5:1 |
| `--ink` on `--row-selected`                            | 15.0    | 12.2     | 4.5:1 |
| Primary button label (`--canvas` on `--ink`)           | 16.5    | 13.9     | 4.5:1 |
| `--on-inverse` on `--inverse`                          | 12.8    | 13.3     | 4.5:1 |
| `--on-inverse-soft` on `--inverse`                     | 5.9     | 6.1      | 4.5:1 |
| `--peach-ink` on `--surface`                           | 6.0     | 10.2     | 4.5:1 |
| `--butter-ink` on `--surface`                          | 5.8     | 13.6     | 4.5:1 |
| `--mint-ink` on `--surface`                            | 5.7     | 12.1     | 4.5:1 |
| `--sky-ink` on `--surface`                             | 6.5     | 10.5     | 4.5:1 |
| `--lilac-ink` on `--surface`                           | 6.5     | 9.8      | 4.5:1 |
| `--rose-ink` on `--surface`                            | 6.1     | 9.5      | 4.5:1 |
| `--added-ink` on `--surface`                           | 6.5     | 11.4     | 4.5:1 |
| `--edited-ink` on `--surface`                          | 7.1     | 7.7      | 4.5:1 |
| `--peach-ink` on `--peach-wash` (badge, notice)        | 5.2     | 7.6      | 4.5:1 |
| `--butter-ink` on `--butter-wash` (badge, notice)      | 5.2     | 9.4      | 4.5:1 |
| `--mint-ink` on `--mint-wash` (badge, notice)          | 5.1     | 8.6      | 4.5:1 |
| `--sky-ink` on `--sky-wash` (badge, notice)            | 5.6     | 7.7      | 4.5:1 |
| `--lilac-ink` on `--lilac-wash` (badge, notice)        | 5.5     | 7.3      | 4.5:1 |
| `--rose-ink` on `--rose-wash` (badge, notice)          | 5.1     | 7.1      | 4.5:1 |
| `--added-ink` on `--added-wash` (badge, notice)        | 5.8     | 8.3      | 4.5:1 |
| `--edited-ink` on `--edited-wash` (badge, notice)      | 5.8     | 6.0      | 4.5:1 |
| `--on-accent` on `--peach` (solid pastel)              | 10.3    | 10.3     | 4.5:1 |
| `--on-accent` on `--butter` (solid pastel)             | 13.7    | 13.7     | 4.5:1 |
| `--on-accent` on `--mint` (solid pastel)               | 12.2    | 12.2     | 4.5:1 |
| `--on-accent` on `--sky` (solid pastel)                | 10.5    | 10.5     | 4.5:1 |
| `--on-accent` on `--lilac` (solid pastel)              | 9.8     | 9.8      | 4.5:1 |
| `--on-accent` on `--rose` (solid pastel)               | 9.6     | 9.6      | 4.5:1 |
| Control border (`--strong` on `--surface`)             | **2.2** | **2.2**  | 3:1   |
| Control border (`--strong` on `--canvas`)              | **2.1** | **2.0**  | 3:1   |
| Focus ring colour (`--sky-ink` on `--surface`)         | 6.5     | 10.5     | 3:1   |
| Focus ring as drawn (45% `--sky-ink` over `--surface`) | **2.1** | 3.1      | 3:1   |
| Focus ring as drawn (45% `--sky-ink` over `--raised`)  | **2.0** | **2.99** | 3:1   |

**Every pair passes in both themes except the focus ring as drawn.** The token passes, but the ring paints it at 45%, which reads 2.0–2.1:1 in light and just under or over 3:1 in dark. Fields still meet 3:1 through their Cobalt focus border; buttons, chips, choices, interactive cards, menu items and nav rows rely on the ring alone. The ring is also a `box-shadow` with `outline: none`, which Windows forced-colours mode removes. DDR-013 (Proposed) fixes both. Control borders (`--strong`) are deliberately soft (DDR-014): 2.2:1 on Surface and about 2:1 on Canvas, under the 3:1 WCAG 1.4.11 asks of an input's boundary. Fields make up for it with their Surface fill against Canvas and Raised, a placeholder or label, and a full-strength Cobalt border on focus; fields on Raised keep their Surface fill. Card edges and row rules (`--hairline`, `--rule`) are decorative and exempt; they stay light on purpose. In dark, `--strong` is `#505050`, one step below `--decor`.

## 3. Typography Rules

**Faces:** DM Sans for display and UI, JetBrains Mono for data, IDs and SQL, Caveat for handwritten notes beside a drawn arrow (marketing only, never in the app).

**Scale and voice:** display sizes are DM Sans at weight 600, never heavier, with negative tracking. Everything else sits at zero tracking.

| Style      | Class or token       | Size / line             | Weight           | Tracking | Use                                                   |
| ---------- | -------------------- | ----------------------- | ---------------- | -------- | ----------------------------------------------------- |
| display-xl | `q-display-xl`       | 64 / 1.05 (40 on phone) | 600              | -0.03em  | Landing h1                                            |
| display-lg | `q-display-lg`       | 48 / 1.1 (32 on phone)  | 600              | -0.03em  | Section heads, the desktop band                       |
| display-md | `q-display-md`       | 36 / 1.15 (28 on phone) | 600              | -0.025em | Reference-page titles, sub-section heads              |
| display-sm | `q-display-sm`       | 28 / 1.2 (22 on phone)  | 600              | -0.02em  | CTA band head, step titles                            |
| title-lg   | `q-title-lg`         | 22 / 1.3                | 600              | -0.01em  | Sheet and large panel titles                          |
| title-app  | `q-title-app`        | 22 / 1.3; 18 compact    | 600              | -0.01em  | The app screen's h1                                   |
| title-md   | `q-title-md`         | 18 / 1.4                | 600              | 0        | Feature-card titles, section heads on reference pages |
| title-sm   | `q-card-title`       | 16; 15 compact          | 600              | 0        | Card and panel titles, dialog titles                  |
| lead       | `text-lg`, `text-xl` | 18–20 / 1.6             | 400              | 0        | The hero sentence, section intros, the FAQ answer     |
| body-md    | (default)            | 16 / 1.5                | 400              | 0        | Marketing running text                                |
| body-sm    | `--text-ui`          | 14 / 1.5; 13 compact    | 400              | 0        | App body, nav, footer                                 |
| small      | `--text-small`       | 12; 11 compact          | 500 (hints 400)  | 0        | Badges, table headers, labels, hints, meta            |
| code       | `--text-cell`        | 14 / 1.5; 13 compact    | 400              | 0        | JetBrains Mono: cell values, SQL, IDs                 |
| button     | `--control-fs`       | 14 / 1; 13 compact      | 600; 500 compact | 0        | Button and control labels                             |

- Bigger before bolder: emphasis comes from a larger size, not 700.
- Tabular figures on every number that lines up or updates.
- Sentence case everywhere. No tiny uppercase tracked labels, no eyebrow above a heading.
- Table headers are 12px (11px compact), sentence case, Ink Muted, with the column type beside the name in mono.

## 4. Density

Two densities share every colour and radius; only size changes. **Comfortable** is the default (marketing pages, forms, settings, onboarding). **Compact** is for option-heavy desktop screens: the editor, its toolbars, grids and inspectors, and product fragments shown on marketing pages. Set `data-density="compact"` on a container and every component inside tightens together.

| Token                        | Comfortable    | Compact        | Drives                                          |
| ---------------------------- | -------------- | -------------- | ----------------------------------------------- |
| `--control` (sm / lg)        | 36px (32 / 40) | 30px (26 / 34) | Buttons, inputs, selects, segmented, menu items |
| `--button`                   | 32px (= sm)    | 30px           | A default button's height                       |
| `--control-px`               | 14px           | 12px           | Horizontal padding inside controls              |
| `--control-fs` / weight      | 14px / 600     | 13px / 500     | Control labels                                  |
| `--icon`                     | 16px           | 14px           | Icons in controls, tabs, nav                    |
| `--row` / `--row-head`       | 40 / 36px      | 30 / 28px      | Table and grid rows, header row                 |
| `--cell-px`                  | 12px           | 8px            | Table cell padding                              |
| `--text-cell`                | 14px           | 13px           | Mono cell values                                |
| `--nav-row`                  | 32px           | 28px           | Sidebar rows                                    |
| `--pill-h`                   | 22px           | 18px           | Badges, counts                                  |
| `--check` / `--switch-h`     | 16 / 20px      | 14 / 16px      | Checkbox, radio, switch                         |
| `--pad-panel` / `--pad-card` | 24 / 24px      | 16 / 16px      | Sheet and card padding                          |
| `--gap`                      | 16px           | 12px           | Gaps between blocks                             |
| `--text-ui` / `--text-small` | 14 / 12px      | 13 / 11px      | Body and meta text in the app                   |
| `--title-app`                | 22px           | 18px           | The app screen's h1                             |

Sizing rules for controls:

- **Fields** (input, textarea, input group, select) are comfortable sm (32px, 14px text) in every density. The components set this themselves; only a dense toolbar picker, such as rows per page, uses a `size="sm"` select in the area's density.
- **Buttons** take the default size and follow their area. Busy, dashboard screens (the editor, the schema designer, their toolbars, sheets and inspectors) are compact, so a button is compact default (30px). Calm areas with few elements (dialogs, empty and welcome screens, the boot error) set `data-density="comfortable"`, where a default button is comfortable sm (32px). Use `lg` only for a marketing call to action.

Rules: nothing under 11px in either density; phone fields stay 16px; compact is a desktop density (phone touch targets stay at least 40px). The marketing call to action always uses the large button (40px).

## 5. Component Stylings

Class names are the `q-*` classes in `quill.css`; each one reads the density tokens above.

### Component map

Atomic levels, used as a sorting aid rather than a rule.

| Level     | Members                                                                                                                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Atoms     | `q-btn` and its variants, `q-chip`, `q-input`, `q-select`, `q-textarea`, `q-check`, `q-radio`, `q-switch`, `q-badge`, `q-count`, `q-dot`, `q-avatar`, `q-kbd`, `q-label`, `q-hint`, `q-error`, `q-divider`, `q-skeleton`, `q-tooltip`, the type classes, `Icon` |
| Molecules | `q-field`, `q-input-icon`, `q-btn-group`, `q-segmented`, `q-tabs`, `q-breadcrumb`, `q-nav-item`, `q-menu-item`, `q-stat`, `q-notice`, `q-toast`, `q-progress`, `q-empty`, column header, pagination                                                             |
| Organisms | `q-toolbar`, `q-table` and the data grid, `q-card` family, `q-stats`, `q-menu`, `q-popover`, `q-dialog`, sheet, command palette, context menu, filter builder, columns menu, row inspector, SQL editor, schema designer, file drop zone, loader, toaster        |
| Templates | App shell (framed sheet); marketing page (top nav, hero band, feature grid, CTA band, inverse footer)                                                                                                                                                           |
| Pages     | `/`, `/download`, `/app`, `/vis`; references at `/test`, `/test/app`, `/test/components`                                                                                                                                                                        |

### Status

Where each family stands (checked against the code on 2026-11-24). There is no Figma file: this document and `/test/components` are the design source. No family has visual-regression or automated accessibility tests yet; the desktop e2e suite covers behaviour only.

| Family                            | Spec | `quill.css`                                               | Preview            | Live app           | Open gaps                                                                               |
| --------------------------------- | ---- | --------------------------------------------------------- | ------------------ | ------------------ | --------------------------------------------------------------------------------------- |
| Buttons, groups                   | yes  | yes                                                       | `/test/components` | no                 | Focus ring (DDR-013); loading state is spec only (see States)                           |
| Chips, segmented, tabs            | yes  | yes                                                       | `/test/components` | no                 | Focus ring on chips; disabled state is spec only                                        |
| Fields                            | yes  | yes                                                       | `/test/components` | no                 | Focus vanishes in forced colours (DDR-013)                                              |
| Checkbox, radio, switch           | yes  | yes                                                       | `/test/components` | no                 | Focus ring; indeterminate checkbox is spec only                                         |
| Badges, counts, avatars, keys     | yes  | yes                                                       | `/test/components` | no                 | none                                                                                    |
| Cards, stats                      | yes  | yes                                                       | `/test/components` | no                 | Focus ring on interactive cards                                                         |
| Tables                            | yes  | yes                                                       | `/test/components` | no                 | none                                                                                    |
| Navigation                        | yes  | yes                                                       | `/test/components` | no                 | Focus ring on nav rows                                                                  |
| Menu, dialog, tooltip, toast      | yes  | yes                                                       | `/test/components` | no                 | Focus ring on menu items                                                                |
| Popover                           | yes  | yes                                                       | none               | no                 | Not previewed                                                                           |
| Notice, progress, skeleton, empty | yes  | yes                                                       | `/test/components` | no                 | none                                                                                    |
| Toolbar, app shell                | yes  | partly: `q-toolbar`, `q-title-app`; the shell is Tailwind | `/test/app`        | no                 | The preview stays compact on phones (30px controls), against the 40px phone-target rule |
| Marketing top nav                 | yes  | n/a (Tailwind)                                            | `/test`            | no                 | Below 768px the preview hides the links but has no menu button yet                      |
| App components (section below)    | yes  | n/a                                                       | none               | yes, on old tokens | Column resize is pointer-only                                                           |

### Icons

The free Hugeicons set, drawn with `Icon` (`src/components/ui/icon.tsx`) in the current text colour: Ink Muted in nav rows, Ink Soft in ghost buttons, the tone's ink inside a toned badge or notice. Size is `--icon` (16px, 14px compact) inside controls; a check mark at 12px uses `strokeWidth={3}` so it reads. An icon is hidden from screen readers unless it is the only label, in which case it (or its button) takes an `aria-label`. Never an icon in a tinted square.

### Radius scale

| Role                                              | Value |
| ------------------------------------------------- | ----- |
| Keys, checkboxes                                  | 4px   |
| Menu items                                        | 6px   |
| Buttons, inputs, selects, notices                 | 8px   |
| Cards, dialogs, menus, popovers                   | 12px  |
| Hero mockup card, the app's working sheet         | 16px  |
| Segmented track, chips, badges, avatars, switches | full  |

Nothing above 16px.

### Buttons (`q-btn`)

- **Primary** (`q-btn-primary`): Ink fill, Canvas label. One per screen or band. Hover lightens 14%; press scales down to 96% and springs back on release.
- **Secondary** (`q-btn-secondary`): Surface fill, 1px Strong border, Ink label. Every other action.
- **Soft** (`q-btn-soft`): Raised fill, no border. Grouped or repeated commands.
- **Ghost** (`q-btn-ghost`): no fill until hover (Raised); Ink Soft label. Toolbars and icon actions.
- **Danger** (`q-btn-danger`): Rose wash with Raspberry label. Never a solid red block.
- **Link** (`q-btn-link`): text only, underline on hover.
- **Sizes:** `q-btn-sm`, default, `q-btn-lg` (marketing CTA, 40px). **Icon-only:** `q-btn-icon` (square), `q-btn-round` (circle), always with an `aria-label`.
- **Group** (`q-btn-group`): joined buttons sharing edges, inner corners square (Sort | Filter | Columns).
- **States:** pressed toggles (`aria-pressed`) take the Active fill; focus draws a 3px Cobalt ring at 45%; disabled drops to 50%.

### Chips, segmented control, tabs

- **Filter chip** (`q-chip`): pill, Strong border, small control height. On (`aria-pressed`) is a Sky wash with a Cobalt label. Filters in toolbars.
- **Segmented** (`q-segmented` + `q-segment`): a Raised pill track; the active segment is a Surface pill with the small shadow. As tall as a control, as wide as its options. One per screen (Data / Structure / SQL).
- **Underline tabs** (`q-tabs` + `q-tab`): on a full-width Hairline; the selected tab has a 2px Ink underline and Ink label, others Ink Muted. Open objects.

### Toolbar (`q-toolbar`)

A wrapping row of controls with the control gap, panel side padding and 1px vertical separators (`q-toolbar-sep`). Search first, then filters, then grouped options, then utility icons pushed right. In compact density a toolbar is 36px tall.

### Fields

- **Input, select, textarea** (`q-input`, `q-select` inside `q-select-wrap`, `q-textarea`): Surface fill, 1px Strong border, 8px corners, control height. Focus: Ink border plus a soft 3px Ink ring at 15%. Invalid (`aria-invalid`): Raspberry border with a rose-wash ring. Disabled: Raised fill, Ink Muted text, still readable.
- **Leading icon** (`q-input-icon`): icon at the control padding, text indented past it.
- **Field** (`q-field`): label above (`q-label`, 500), the control, then a hint (`q-hint`, Ink Muted) or an error (`q-error`, Raspberry), 6px apart.

### Choices

Native inputs: **checkbox** (`q-check`, 4px corners), **radio** (`q-radio`), **switch** (`q-switch` with `role="switch"`). Off: Strong border or track; on: Ink fill with a Canvas mark. A switch applies at once; checkboxes wait for Save.

### Badges, counts, avatars, keys

- **Badge** (`q-badge`): pill, small text at 500, Raised fill. **Tones** (`q-tone-butter | sky | mint | rose | peach`): the pastel wash with its ink. Butter pending, Sky paid or selected, Mint done, Rose cancelled or failing, Peach numeric types. **Outline** (`q-badge-outline`) for neutral states; **dot** (`q-dot`) for live status.
- **Count** (`q-count`): Ink pill with a tabular number, only on a queue that needs action.
- **Avatar** (`q-avatar`): circle with initials, Raised or a tone.
- **Key** (`q-kbd`): 20px, hairline edge with a 2px bottom edge.

### Cards (`q-card`)

- **Default:** Surface, 1px Hairline, 12px corners, card padding. Head (`q-card-head`: title and a badge or actions), description (`q-card-desc`), foot (`q-card-foot`: a hairline above, actions).
- **Soft** (`q-card-soft`): Raised fill, no edge. Marketing feature cards holding a real product fragment, never an icon in a tinted square.
- **Elevated** (`q-card-elevated`): the medium shadow. Only the one floating hero mockup.
- **Interactive** (`q-card-interactive`): a choice. Hover darkens the edge; selected takes a Cobalt edge on a faint Sky tint.
- **Inverse** (`q-card-inverse`): Inverse fill, once per page.
- **Stats** (`q-stats` + `q-stat`): peer figures in one container split by hairlines, label above a tabular value. Wraps without leaving empty cells.

### Tables and the data grid (`q-table`)

- Header row at `--row-head`: small sentence-case Ink Muted labels with the column type beside the name in mono; one Hairline under it; no fill band.
- Rows at `--row` with 1px Rule lines. **No zebra striping.** `q-table-data` sets cells in JetBrains Mono at `--text-cell`; `q-table-hover` adds a Raised hover.
- Numbers right-aligned in tabular figures (`num`) with fixed decimals. NULL in Ink Muted (`q-cell-null`); real zeros printed.
- Selected row (`aria-selected`): Selected Row Ice. Unsaved edit (`q-cell-edited`): Edited wash with a 6px Cornflower dot. Added row (`q-row-added`): Added wash.
- One status badge per row.

### Navigation

- **Sidebar row** (`q-nav-item`): nav-row height, 8px corners, icon in Ink Muted, label in Ink Soft; current (`aria-current="page"`) is the neutral Active pill with an Ink label, never a coloured bar. **Group label** (`q-nav-label`): small, sentence case.
- **Breadcrumb** (`q-breadcrumb`): Ink Muted crumbs, the last one Ink at 500.

### Overlays

- **Menu** (`q-menu`): Raised, Hairline edge, 12px corners, the float shadow, 4px inner padding. Items (`q-menu-item`) at control height with 6px corners; highlighted takes Active; danger items in Raspberry; labels (`q-menu-label`), separators (`q-menu-sep`) and shortcut hints (`q-menu-kbd`).
- **Popover** (`q-popover`): the menu's surface with card padding.
- **Dialog** (`q-dialog`): Raised, 12px corners, the float shadow, at most 440px wide; title, body in Ink Soft, actions right-aligned (cancel secondary, confirm primary or danger). Backdrop (`q-backdrop`): near-black at 32% (55% in dark), no blur.
- **Tooltip** (`q-tooltip`): Ink fill, Canvas text, 6px corners.
- **Toast** (`q-toast`): Raised, the float shadow, a tone dot, a title and an Ink Muted detail.

### Feedback

- **Notice** (`q-notice` plus a tone): an inline message in the tone of its meaning, 8px corners; neutral for information.
- **Progress** (`q-progress`): 6px track (4px compact) in Raised, Ink fill at the true ratio, both ends labelled in text.
- **Skeleton** (`q-skeleton`): flat Raised bars at the real size, no shimmer.
- **Empty state** (`q-empty`): 1px dashed Strong frame, one sentence and one action.

### App shell (framed sheet)

The sidebar (240px) and the top bar (control height + 12px: 48px comfortable, 40px compact) share the Canvas tint with no rule between them, forming an L. The work sits on a Surface sheet inset 8px from the window's right and bottom edges, 16px corners, 1px Hairline, no shadow. Inside: tabs, then the title row (`q-title-app`, one sentence of context, the segmented control and actions), then the toolbar, the grid, a status bar and a 300px inspector rail. The desktop app runs compact.

### Handwritten notes

Caveat 24–32px in Butter ink (light) / Buttercream (dark), lowercase, always beside a hand-drawn arrow stroke in the same colour that points at one thing. One per screen, marketing only.

### App components

Specs for the editor's own components. They run today in the live app on the old tokens; these are their targets when they move to Quill, built from the classes above. Where a value is not a token it is given here.

- **Command palette** (`CommandPalette`): a `q-dialog` 20vh from the top, `min(560px, 100% - 32px)` wide. A borderless search field at `--control-lg` with a leading icon and a Hairline under it; results grouped under `q-menu-label`s; each result a `q-menu-item` with its icon, label and shortcut (`q-menu-kbd`); the highlighted result takes Active. No match: one sentence in Ink Muted. Foot row in `--text-small` Ink Muted with `q-kbd` hints (↑ ↓ to move, Enter to open, Esc to close).
- **Context menu** (`ContextMenu`): a `q-menu` at the pointer. Common actions first, destructive ones last after a separator, at most ten items; a submenu shows a chevron at the right and opens on hover or →.
- **Dropdown menu and select popup** (`DropdownMenu`, `Select`): a `q-menu` 4px from its trigger, at least as wide as the trigger. A 16px slot on the left holds the check mark of the chosen item in Ink, so labels stay on one edge.
- **Sheet / drawer** (`Sheet`): the mobile navigation sheet slides from the left on Canvas, `min(18rem, 88vw)` wide. Task sheets (row editor, import) slide from the right on Surface, `min(420px, 100%)` wide, a Hairline on the open edge and the float shadow; a header with the title and a ghost close icon, a scrolling body at `--pad-panel`, and a foot with a Hairline above holding the actions (cancel secondary, confirm primary).
- **Filter builder** (`FilterBuilder`): one row per condition: column select, operator select, value input, then a ghost icon button to remove it, all at `--control` with `--control-gap` between. Rows after the first start with "and" in Ink Muted. "Add filter" is a small ghost button with a plus; Apply is a small primary at the foot. Applied filters show in the toolbar as pressed `q-chip`s with a remove ×.
- **Column header** (`GridHeaderCell`): the column name, then its type in mono Ink Muted. A 12px sort arrow only on the sorted column. On hover or focus a ghost small icon button at the right opens the column menu: Sort ascending, Sort descending, Filter…, Hide column, a separator, Copy name.
- **Columns menu** (`ColumnsMenu`): a `q-menu` listing every column with a `q-check`; a search field on top once there are more than ten columns; "Show all" at the foot.
- **Column resize**: an 8px invisible hit area on each header's right edge. On hover or drag a 2px Cobalt line runs the full grid height and the cursor becomes `col-resize`. Widths stay between 64px and 720px (default 180px, from `MIN_COLUMN_WIDTH`, `MAX_COLUMN_WIDTH`, `DEFAULT_COLUMN_WIDTH`); double-click fits the column to its content.
- **Row inspector** (`RowInspector`): the 300px right rail on desktop, a right sheet below 1024px. Head: "Row N" or the row's identity, with its status badge. Body: one line per column, label in Ink Muted at `--text-ui` on the left, value in mono at `--text-cell` on the right; NULL in `q-cell-null`; long text wraps under its label. Clicking a value of an editable table turns it into a `q-input`; an unsaved value takes the Edited wash and dot. Foot: secondary actions.
- **Pagination** (status bar): a `q-toolbar` under the grid. Left: "1–250 of 1,284 rows" in tabular figures. Right: page size as a small `q-select` (100, 250, 500, 1000; from `PAGE_SIZES`), "Page 1 of 6", and ghost small icon buttons for previous and next, disabled at either end.
- **SQL editor** (CodeMirror, `editor-theme.ts`): Surface background, Ink text in mono at `--text-cell`, line height 1.7. Gutter on Surface with line numbers in Decor and the active line's number in Ink Muted. Active line: Raised (not the lilac wash: lilac belongs to keywords). Selection: Sky wash. Matching bracket: Butter wash. Syntax from the `--code-*` tokens. The autocomplete popup is a `q-menu` (Raised, Hairline, `--radius-sm` items) with the chosen completion in the Sky wash and its detail in Ink Muted.
- **Schema designer** (`vis`): the canvas is Canvas, with an optional 1px dot grid in Hairline every 16px. A table node is Surface with a 1px Hairline and 8px corners; a 40px head on Raised holds the table name at 600; 28px rows hold the column name in mono 12px and, at the right, its type or `pk`/`fk` in Ink Muted, key columns at 600. A selected node takes a Cobalt edge and a 3px Sky-wash ring. Foreign-key edges are 1.5px Cobalt curves from the key row to the referenced row. Unsaved nodes and columns use the Added and Edited washes with their dot.
- **File drop zone**: a full-window layer at `--z-overlay`, inset 12px, 2px dashed Cobalt, 12px corners, Canvas at 92% opacity (no blur). Centred: a 40px icon in Cobalt, "Drop to open" at `q-title-md`, and one Ink Soft line listing the accepted files (.sqlite, .sqlite3, .db, .db3, .s3db, .sl3).
- **Loader** (`Loader`): centred in the area it will fill. The product mark at 40px drawing itself in Ink Muted, a label in `--text-ui` Ink Muted, and, when the boot has stages, a short list: the current stage in Ink, finished ones in Mint ink with a check, pending ones in Decor. It appears only after 150ms so fast loads never flash it; under reduced motion the mark is static.
- **Toasts** (`Toaster`): bottom-right on desktop, 16px from the edges; bottom-centre on phones, full width less 16px. At most three visible, newest at the bottom. Each is a `q-toast` with a 16px icon in its tone: success Mint ink, information Sky ink, warning Butter ink, error Rose ink, loading a spinner in Ink Muted. Timing is in Overlay motion.

### Choosing a component

| You need                                         | Use                                          | Not                         |
| ------------------------------------------------ | -------------------------------------------- | --------------------------- |
| The one main action of a band or screen          | `q-btn-primary`                              | A pastel or gradient button |
| Any other action                                 | `q-btn-secondary`; `q-btn-ghost` in toolbars | A second primary            |
| A destructive action                             | `q-btn-danger`, confirmed in a `q-dialog`    | A solid red button          |
| Another view of the same object (Data / SQL)     | `q-segmented`, one per screen                | Tabs                        |
| Moving between open objects                      | `q-tabs`                                     | Segmented                   |
| Narrowing a list                                 | `q-chip`                                     | Segmented                   |
| A setting that applies at once                   | `q-switch`                                   | A checkbox                  |
| A choice saved with a form                       | `q-check`, `q-radio`                         | A switch                    |
| A message tied to the page that stays            | `q-notice`                                   | A toast                     |
| Word that something finished                     | Toast                                        | A dialog                    |
| A question before a destructive or blocking step | `q-dialog`                                   | A toast                     |
| A task with several fields                       | Right sheet                                  | A dialog wider than 440px   |
| A row's status                                   | One `q-badge` with a tone                    | Coloured text alone         |
| A hint on hover                                  | `q-tooltip`, never the only label            | A tooltip on touch-only UI  |

### States

What each interactive class draws. "Spec only" marks a state this document defines that `quill.css` does not implement yet.

| Class                               | Hover                    | Focus                  | Pressed / selected                                      | Disabled                           | Invalid        | Loading           |
| ----------------------------------- | ------------------------ | ---------------------- | ------------------------------------------------------- | ---------------------------------- | -------------- | ----------------- |
| `q-btn`                             | Per variant              | Ring                   | `aria-pressed`: Active fill; press scales to 96%        | 50% (`:disabled`, `aria-disabled`) | n/a            | Spec only (below) |
| `q-chip`                            | Raised fill, Ink label   | Ring                   | `aria-pressed`: Sky wash, Cobalt label                  | Spec only: 50%, `aria-disabled`    | n/a            | n/a               |
| `q-segment`, `q-tab`                | Tab: Ink label           | 2px Cobalt outline     | `aria-pressed` / `aria-selected`                        | Spec only: 50%, `aria-disabled`    | n/a            | n/a               |
| `q-input`, `q-select`, `q-textarea` | none                     | Cobalt border and ring | n/a                                                     | Raised fill, Ink Muted text        | `aria-invalid` | n/a               |
| `q-check`, `q-radio`, `q-switch`    | none                     | Ring                   | `:checked`: Ink fill, Canvas mark                       | 50%                                | n/a            | n/a               |
| `q-check` indeterminate             | none                     | Ring                   | Spec only: Ink fill with a Canvas dash                  | 50%                                | n/a            | n/a               |
| `q-card-interactive`                | Strong edge              | Ring                   | `aria-pressed` / `aria-selected`: Cobalt edge, Sky tint | n/a                                | n/a            | n/a               |
| `q-menu-item`                       | Active fill              | Ring                   | `data-highlighted`: Active fill                         | `aria-disabled`: Ink Muted, inert  | n/a            | n/a               |
| `q-nav-item`                        | Raised fill, Ink label   | Ring                   | `aria-current="page"`: Active pill, Ink label           | n/a                                | n/a            | n/a               |
| `q-table` row                       | Raised (`q-table-hover`) | n/a                    | `aria-selected`: Selected Row Ice                       | n/a                                | n/a            | `q-skeleton` rows |

**Button loading** (spec only): `aria-busy="true"` and disabled; a spinner at `--icon` replaces the leading icon (or sits before the label) in the label's colour; the label and the width stay put.

### Keyboard and ARIA

| Component                        | Markup                                                                                                                                       | Keys                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button, chip                     | `<button>`; icon-only takes `aria-label`; toggles take `aria-pressed`                                                                        | Enter, Space                                                                                                                                                                            |
| Segmented                        | `role="group"` with `aria-label`; each segment a `<button aria-pressed>`, exactly one pressed                                                | Tab between segments, Enter or Space                                                                                                                                                    |
| Tabs                             | `role="tablist"`, `role="tab"` with `aria-selected` and `aria-controls`, `role="tabpanel"`                                                   | ← → move and select, Home / End                                                                                                                                                         |
| Field                            | A `<label>`; hint and error tied by `aria-describedby`; `aria-invalid` with the error in words                                               | Native                                                                                                                                                                                  |
| Checkbox, radio, switch          | Native inputs; radios in a `<fieldset>` with a `<legend>`; a switch takes `role="switch"`                                                    | Space; arrows inside a radio group                                                                                                                                                      |
| Menu, context menu, select popup | Radix primitives                                                                                                                             | Arrows, type-ahead, Enter; Esc closes and returns focus to the trigger; → opens a submenu                                                                                               |
| Dialog, sheet, command palette   | Labelled by its title; one modal layer traps focus at a time                                                                                 | Esc closes and returns focus to what opened it                                                                                                                                          |
| Tooltip                          | Supplementary only, never an element's only name; shows on focus too                                                                         | Esc hides it                                                                                                                                                                            |
| Toast                            | A polite live region; errors are assertive and stay until closed                                                                             | Its actions are buttons, reachable by keyboard while it is open                                                                                                                         |
| Data grid                        | `role="grid"` with `row`, `columnheader` (`aria-sort`), `rowheader`, `gridcell`, `aria-selected`, row and column indexes                     | Arrows, Page Up / Down, Home / End (with Ctrl: grid ends), Tab; Enter or F2 edits; typing starts an edit; Space selects the row; Shift+Enter opens the row; Ctrl+A, Ctrl+C, Delete, Esc |
| Column resize handle             | `role="separator"`, vertical, labelled "Resize {column}"; spec only: focusable with `aria-valuenow`, `aria-valuemin` 64, `aria-valuemax` 720 | Spec only: ← → by 8px, Enter fits to content                                                                                                                                            |
| Sidebar, breadcrumb              | `<nav>` with a label; the current page takes `aria-current="page"`                                                                           | Tab                                                                                                                                                                                     |
| Progress                         | `<progress>` or `role="progressbar"` with its value; both ends labelled in text                                                              | n/a                                                                                                                                                                                     |
| Skeleton, loader                 | The region being filled takes `aria-busy="true"`; bars are `aria-hidden`; the loader's label is text                                         | n/a                                                                                                                                                                                     |
| File drop zone                   | Always paired with an "Open file" button that does the same job                                                                              | n/a                                                                                                                                                                                     |

**Targets:** anything under 24px (compact checkboxes, radios and switches; 24px small buttons sit right at the line) sits inside its `<label>` or keeps 24px between target centres. **Forced colours:** every focus indicator must survive Windows high-contrast mode, so it includes an outline (DDR-013).

## 6. Layout Principles

### Spacing (4px base)

4 · 8 · 12 · 16 · 24 · 32 · 48 · 96. Sections are 96px apart on desktop (64px on phone); card padding 32px (feature) or 24px (product); 24px gutters between cards; 16px inside dense panels.

### Marketing grid

- Max content width 1200px, centred, 24px outer margins on phone, 32px from md.
- Hero band: two equal halves (6/6), headline and actions left, the hero mockup card right; stacks below 1024px with the mockup under the text.
- Feature cards in mixed spans (8/4, 4/8) rather than a uniform three-up row; one column on phone.
- Pacing alternates Surface and Canvas bands; the page closes on the Inverse footer.
- Top navigation 64px: mark and name left, three to five plain links, one primary action right. It collapses to a menu below 768px.

### App grid

- Sidebar 240px + sheet; at under 1024px the sidebar becomes a sheet behind a menu button and the frame disappears.
- One gutter (`--gap`) inside the sheet, horizontal and vertical; panel padding `--pad-panel`.
- The title row: an h1 at `--title-app`, one sentence about the data beneath it in Ink Muted, actions on the right (at most one filled primary).
- A right rail (300px) for the selected row's details, starting level with the toolbar.

### Elevation

| Level  | Treatment                         | Use                                      |
| ------ | --------------------------------- | ---------------------------------------- |
| Flat   | Tone step only                    | Bands, feature cards, the app frame      |
| Edge   | 1px Hairline                      | Product cards, the sheet, inputs, tables |
| Small  | `0 1px 2px rgb(24 24 27 / 5%)`    | Active segment in the segmented control  |
| Medium | `0 4px 12px rgb(24 24 27 / 8%)`   | The hero mockup card                     |
| Float  | `0 12px 32px rgb(24 24 27 / 12%)` | Menus, popovers, dialogs                 |

In dark, the same shadows use black at 30–45%.

### Motion

Quick 200ms and base 400ms with the enter curve `cubic-bezier(0.16, 1, 0.3, 1)`; UI state changes ≈150ms; content rises 16px with a 70ms stagger on marketing pages only. Only transform and opacity animate. Reduced motion shows the final state at once. App screens have no entrances: motion there is feedback only.

### Stacking order

| Level   | Token         | Value | What sits there                                                                                       |
| ------- | ------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| Sticky  | `--z-sticky`  | 10    | Sticky grid header and row-number column, sticky marketing stages                                     |
| Header  | `--z-header`  | 20    | Top bars that stay put while the page scrolls                                                         |
| Overlay | `--z-overlay` | 40    | Backdrop, sheets, dialogs, the command palette, the file drop zone                                    |
| Popover | `--z-popover` | 50    | Menus, context menus, select popups, popovers, autocomplete: above dialogs, since they open from them |
| Toast   | `--z-toast`   | 60    | Toasts                                                                                                |
| Tooltip | `--z-tooltip` | 70    | Tooltips; nothing goes above them                                                                     |

Spec: the tokens exist in `quill.css`, but nothing reads them yet; the `ui` primitives still use `z-10` and `z-50` (see section 8). Never write a raw z-index. Within one level the layer opened last is on top (portal order). Only one modal layer holds focus at a time: a dialog opened from a sheet takes over the focus trap until it closes.

### Overlay motion

| Layer                               | Enter                                                                                    | Exit                                        | Notes                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Menu, context menu, select, popover | 100ms (`--dur-instant`): fade, scale 0.96 → 1 from the trigger side, `--ease-enter`      | 100ms fade, `--ease-exit`                   | Transform origin at the trigger                                                                               |
| Tooltip                             | After 500ms of hover (0ms when moving between tooltips), 100ms fade                      | 100ms fade                                  | Not shown on touch                                                                                            |
| Dialog, command palette             | Backdrop 150ms fade; panel 150ms fade and scale 0.96 → 1, `--ease-enter`                 | 100ms fade and scale to 0.98, `--ease-exit` |                                                                                                               |
| Sheet / drawer                      | 200ms (`--dur-quick`) slide in from its edge, `--ease-enter`; the backdrop fades with it | 150ms slide out, `--ease-exit`              |                                                                                                               |
| Toast                               | 200ms rise of 8px with a fade, `--ease-enter`                                            | 150ms fade, `--ease-exit`                   | Success and info close after 4s, warnings after 6s; errors stay until closed; loading stays until it resolves |
| File drop zone                      | 100ms fade when a file is dragged in                                                     | 100ms fade on leave or drop                 |                                                                                                               |
| Loader                              | Appears after a 150ms delay; stages crossfade in 150ms                                   | 150ms fade                                  |                                                                                                               |

Spec: `quill.css` has no overlay animations yet; the `ui` primitives animate with their own 100ms fade and zoom until they move over. Exits are faster than entrances. Only transform and opacity animate. Under reduced motion every layer only fades, and the global rule shortens it to 1ms.

## 7. Token Reference

Every token Pastel Quill defines or relies on, with its exact value. Tokens marked **(globals)** are declared in `src/app/globals.css` and inherited unchanged; everything else is declared in `src/app/test/quill.css`. Light is `:root`; dark is `:root.dark`. A value written `→ --x` is an alias that resolves to that token in the current theme.

**Layers.** Tokens sit in three layers, and a component reads only the bottom two:

| Layer        | Named by           | Tokens                                                                                                           |
| ------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1. Global    | Look               | The pastels with their inks and washes (7.2); the motion values (7.10)                                           |
| 2. Semantic  | Role               | Ground, line and text roles (7.1); meaning aliases (7.3); radius, elevation, layout and stacking (7.6–7.8, 7.12) |
| 3. Component | Component property | Density tokens (7.9); the shadcn/ui variables (7.4); the `--code-*` aliases CodeMirror reads                     |

- Components (`q-*` classes, `ui` primitives) read Layers 2 and 3 and never a literal: `quill.css` holds no colour literal outside its token blocks. The one Layer 1 reader is `q-tone-*`, whose job is to show a hue, and the chart series.
- The ground, line and text roles hold their literal per theme directly instead of pointing at a gray ladder; the old `--gray-*` ladder is what Quill retires. Theme switching happens in Layer 2.
- The source of truth is CSS custom properties; there is no `tokens.json` (DDR-012).

### 7.1 Ground, lines and text

| Token                     | Light                 | Dark               | Role                                                           |
| ------------------------- | --------------------- | ------------------ | -------------------------------------------------------------- |
| `--canvas`                | `#F7F7F8`             | `#202020`          | Page floor; the app's L-frame                                  |
| `--surface`               | `#FFFFFF`             | `#191919`          | Cards, the app's working sheet, inputs                         |
| `--raised`                | `#F1F1F3`             | `#262626`          | Soft cards, menus, popovers, dialogs, segmented track          |
| `--active`                | `#EAEAED`             | `#2E2E2E`          | Hover fill, active nav pill, pressed toggles                   |
| `--zebra`                 | → `--active`          | → `--active`       | Legacy alias kept for old components; Quill never stripes rows |
| `--rule`                  | `#EBEBEE`             | `#242424`          | Row rules in tables and lists                                  |
| `--hairline`              | `#DEDEE3`             | `#303030`          | Card, sheet and section edges                                  |
| `--strong`                | `#AEAEB6`             | `#505050`          | Control borders (soft: 2.2:1 on Surface)                       |
| `--decor`                 | `#A1A1A9`             | `#6B6B6B`          | Non-text marks (dots, inactive glyphs)                         |
| `--inverse`               | `#26262B`             | `#232323`          | Footer and inverse cards                                       |
| `--on-inverse`            | `#ECECEF`             | `#ECECEF`          | Text on inverse                                                |
| `--on-inverse-soft`       | `#A1A1A9`             | `#A1A1A9`          | Secondary text on inverse                                      |
| `--ink`                   | `#18181B`             | `#EDEDED`          | Primary text; primary button fill                              |
| `--ink-soft`              | `#45454C`             | `#C4C4C4`          | Secondary text                                                 |
| `--ink-muted`             | `#63636B`             | `#A0A0A0`          | Labels, meta, placeholders                                     |
| `--on-accent`             | `#18181B`             | `#18181B`          | Text on a solid pastel                                         |
| `--row-selected`          | `#E4EDFD`             | `#212B38`          | Selected grid row                                              |
| `--scrollbar-thumb`       | `#7E7E86`             | `#6B6B6B`          | Scrollbar thumb                                                |
| `--scrollbar-thumb-hover` | → `--ink-muted`       | `#A0A0A0`          | Scrollbar thumb on hover                                       |
| `--backdrop`              | `rgb(10 10 10 / 32%)` | `rgb(0 0 0 / 55%)` | Behind dialogs and sheets                                      |

### 7.2 Pastels, inks and washes (globals)

The pastel is the same in both themes. The ink is a deep shade in light and the pastel itself in dark. Washes are the pastel at an alpha: 25–40% in light, 14% (`24` hex) in dark.

| Pastel   | `--x`     | `--x-ink` light | `--x-ink` dark | `--x-wash` light | `--x-wash` dark |
| -------- | --------- | --------------- | -------------- | ---------------- | --------------- |
| `peach`  | `#FFB3A1` | `#A8432B`       | `#FFB3A1`      | `#FFB3A147`      | `#FFB3A124`     |
| `butter` | `#F5E1A4` | `#7D6200`       | `#F5E1A4`      | `#F5E1A466`      | `#F5E1A424`     |
| `mint`   | `#A6E3C4` | `#1D7550`       | `#A6E3C4`      | `#A6E3C44D`      | `#A6E3C424`     |
| `sky`    | `#A9C9FF` | `#2D5CAD`       | `#A9C9FF`      | `#A9C9FF4D`      | `#A9C9FF24`     |
| `lilac`  | `#CBB6FF` | `#6646C2`       | `#CBB6FF`      | `#CBB6FF4D`      | `#CBB6FF24`     |
| `rose`   | `#F6A8C6` | `#A83866`       | `#F6A8C6`      | `#F6A8C64D`      | `#F6A8C624`     |
| `added`  | `#6EE7A1` | `#146C36`       | `#6EE7A1`      | `#6EE7A140`      | `#6EE7A124`     |
| `edited` | `#7CACFF` | `#1D4FC4`       | `#7CACFF`      | `#7CACFF40`      | `#7CACFF24`     |

Tokens: `--peach`, `--peach-ink`, `--peach-wash`, `--butter`, `--butter-ink`, `--butter-wash`, `--mint`, `--mint-ink`, `--mint-wash`, `--sky`, `--sky-ink`, `--sky-wash`, `--lilac`, `--lilac-ink`, `--lilac-wash`, `--rose`, `--rose-ink`, `--rose-wash`, `--added`, `--added-ink`, `--added-wash`, `--edited`, `--edited-ink`, `--edited-wash`.

### 7.3 Meaning aliases (globals)

| Token               | Resolves to                                   | Use                      |
| ------------------- | --------------------------------------------- | ------------------------ |
| `--positive`        | → `--mint-ink`                                | Good change, done        |
| `--negative`        | → `--rose-ink`                                | Bad change, error        |
| `--caution`         | → `--butter-ink`                              | Warning, pending         |
| `--code-keyword`    | → `--lilac-ink`                               | SQL keywords             |
| `--code-string`     | → `--mint-ink`                                | SQL strings              |
| `--code-number`     | → `--peach-ink`                               | SQL numbers              |
| `--code-fn`         | → `--sky-ink`                                 | SQL functions            |
| `--code-comment`    | → `--ink-muted`                               | SQL comments             |
| `--code-punct`      | → `--ink-soft`                                | SQL punctuation          |
| `--annotate`        | → `--butter-ink` (light), → `--butter` (dark) | Handwritten note text    |
| `--annotate-stroke` | `#96750A` (light), → `--butter` (dark)        | Hand-drawn arrow strokes |
| `--chart-1`         | → `--peach`                                   | Chart series 1           |
| `--chart-2`         | → `--sky`                                     | Chart series 2           |
| `--chart-3`         | → `--mint`                                    | Chart series 3           |
| `--chart-4`         | → `--lilac`                                   | Chart series 4           |
| `--chart-5`         | → `--rose`                                    | Chart series 5           |

### 7.4 Component aliases (shadcn/ui variables)

The `src/components/ui` primitives read these. Quill re-points the ones marked **Q**; the rest come from globals.

| Token                          | Resolves to           |     | Token                    | Resolves to     |
| ------------------------------ | --------------------- | --- | ------------------------ | --------------- |
| `--background`                 | → `--canvas`          |     | `--foreground`           | → `--ink`       |
| `--card`                       | → `--surface`         |     | `--card-foreground`      | → `--ink`       |
| `--popover`                    | → `--raised`          |     | `--popover-foreground`   | → `--ink`       |
| `--primary`                    | → `--ink`             |     | `--primary-foreground`   | → `--canvas`    |
| `--secondary`                  | → `--raised`          |     | `--secondary-foreground` | → `--ink`       |
| `--muted` **Q**                | → `--active`          |     | `--muted-foreground`     | → `--ink-muted` |
| `--accent` **Q**               | → `--active`          |     | `--accent-foreground`    | → `--ink`       |
| `--destructive`                | → `--rose-ink`        |     | `--border`               | → `--hairline`  |
| `--input` **Q**                | → `--strong`          |     | `--ring`                 | → `--sky-ink`   |
| `--radius`                     | → `--radius-lg` (8px) |     | `--sidebar` **Q**        | → `--canvas`    |
| `--sidebar-foreground`         | → `--ink`             |     | `--sidebar-primary`      | → `--ink`       |
| `--sidebar-primary-foreground` | → `--canvas`          |     | `--sidebar-accent` **Q** | → `--active`    |
| `--sidebar-accent-foreground`  | → `--ink`             |     | `--sidebar-border`       | → `--hairline`  |
| `--sidebar-ring`               | → `--sky-ink`         |     |                          |                 |

### 7.5 Typography

| Token                      | Value                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `--font-sans` (globals)    | `var(--font-dm-sans), system-ui, sans-serif` (DM Sans 400, 500, 600, 700)                   |
| `--font-heading` (globals) | → `--font-sans`                                                                             |
| `--font-mono` (globals)    | `var(--font-jetbrains-mono), ui-monospace, Menlo, monospace` (JetBrains Mono 400, 500, 600) |
| `--font-hand` (globals)    | `var(--font-caveat), "Segoe Print", "Bradley Hand", cursive` (Caveat 400)                   |

| Class          | Size                                                 | Line height | Weight   | Tracking                             |
| -------------- | ---------------------------------------------------- | ----------- | -------- | ------------------------------------ |
| `q-display-xl` | `clamp(2.5rem, 1.2rem + 3.6vw, 4rem)` (40–64px)      | 1.05        | 600      | -0.03em                              |
| `q-display-lg` | `clamp(2rem, 1.2rem + 2.2vw, 3rem)` (32–48px)        | 1.1         | 600      | -0.03em                              |
| `q-display-md` | `clamp(1.75rem, 1.3rem + 1.2vw, 2.25rem)` (28–36px)  | 1.15        | 600      | -0.025em                             |
| `q-display-sm` | `clamp(1.375rem, 1.1rem + 0.8vw, 1.75rem)` (22–28px) | 1.2         | 600      | -0.02em                              |
| `q-title-lg`   | 1.375rem (22px)                                      | 1.3         | 600      | -0.01em                              |
| `q-title-md`   | 1.125rem (18px)                                      | 1.4         | 600      | 0                                    |
| `q-title-app`  | `var(--title-app)` (22px / 18px compact)             | 1.3         | 600      | -0.01em                              |
| `q-num`        | inherits                                             | inherits    | inherits | `font-variant-numeric: tabular-nums` |

Display headings also set `text-wrap: balance`. Text tokens for the app live in density (7.9).

### 7.6 Radius

| Token            | Value  | Use                                                            |
| ---------------- | ------ | -------------------------------------------------------------- |
| `--radius-xs`    | 4px    | Keys, checkboxes, skeleton bars                                |
| `--radius-sm`    | 6px    | Menu items, tooltips                                           |
| `--radius-md`    | 8px    | Buttons, inputs, selects                                       |
| `--radius-lg`    | 8px    | Same as md; the shadcn primitives' control radius (`--radius`) |
| `--radius-xl`    | 12px   | Cards, dialogs, menus, popovers                                |
| `--radius-frame` | 16px   | Hero mockup card, the app's working sheet                      |
| `--radius-pill`  | 9999px | Segmented track, chips, badges, avatars, switches              |

Tailwind's `rounded-2xl`, `rounded-3xl` and `rounded-4xl` (globals: `--radius-2xl`, `--radius-3xl`, `--radius-4xl`, derived from `--radius` as 14.4, 17.6 and 20.8px) are not part of Quill; nothing goes above 16px.

### 7.7 Elevation

| Token            | Light                             | Dark                           | Use                                 |
| ---------------- | --------------------------------- | ------------------------------ | ----------------------------------- |
| `--shadow-sm`    | `0 1px 2px rgb(24 24 27 / 5%)`    | `0 1px 2px rgb(0 0 0 / 30%)`   | Active segment                      |
| `--shadow-md`    | `0 4px 12px rgb(24 24 27 / 8%)`   | `0 4px 12px rgb(0 0 0 / 35%)`  | Hero mockup card, `q-card-elevated` |
| `--shadow-float` | `0 12px 32px rgb(24 24 27 / 12%)` | `0 12px 32px rgb(0 0 0 / 45%)` | Menus, popovers, dialogs, toasts    |

`--shadow-lift` and `--shadow-ring` (globals) are retired and not used.

### 7.8 Layout and spacing

| Token             | Value                  | Use                            |
| ----------------- | ---------------------- | ------------------------------ |
| `--content-max`   | 1200px                 | Marketing content width        |
| `--margin`        | 24px; 32px from 768px  | Page side margins              |
| `--space-section` | 96px; 64px below 768px | Between marketing bands        |
| `--space-card`    | 32px; 24px below 768px | Marketing feature-card padding |

| Fixed value                    | Size                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| Spacing scale (Tailwind steps) | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 96px                      |
| Breakpoints (Tailwind)         | `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536px |
| Marketing top bar              | 64px                                                       |
| App sidebar                    | 240px; a sheet below 1024px, up to `min(18rem, 88vw)`      |
| App top bar                    | `--control` + 12px (48px comfortable, 40px compact)        |
| App sheet inset                | 8px from the window's right and bottom edges               |
| Inspector rail                 | 300px                                                      |
| Top-bar search                 | up to 548px wide                                           |
| Dialog                         | up to 440px wide                                           |
| Toast                          | up to 380px wide                                           |
| Menu                           | at least 200px wide, 4px inner padding                     |

### 7.9 Density

Comfortable is the default on every `.quill` page and on `[data-density="comfortable"]`; compact applies inside `[data-density="compact"]`.

| Token              | Comfortable     | Compact          | Drives                                          |
| ------------------ | --------------- | ---------------- | ----------------------------------------------- |
| `--control-sm`     | 32px            | 26px             | Small buttons, chips                            |
| `--control`        | 36px            | 30px             | Buttons, inputs, selects, menu items, segmented |
| `--control-lg`     | 40px            | 34px             | Large buttons (marketing CTA)                   |
| `--control-px`     | 14px            | 12px             | Padding inside controls                         |
| `--control-gap`    | 8px             | 6px              | Gap inside and between controls                 |
| `--control-fs`     | 0.875rem (14px) | 0.8125rem (13px) | Control text                                    |
| `--control-weight` | 600             | 500              | Button label weight                             |
| `--icon`           | 16px            | 14px             | Icons in controls, tabs, nav                    |
| `--check`          | 16px            | 14px             | Checkbox and radio                              |
| `--switch-h`       | 20px            | 16px             | Switch height (width is 1.8×)                   |
| `--seg-pad`        | 3px             | 2px              | Segmented track padding                         |
| `--row`            | 40px            | 30px             | Table and grid rows                             |
| `--row-head`       | 36px            | 28px             | Table header row                                |
| `--cell-px`        | 12px            | 8px              | Table cell padding                              |
| `--nav-row`        | 32px            | 28px             | Sidebar rows                                    |
| `--pill-h`         | 22px            | 18px             | Badges, counts                                  |
| `--avatar`         | 32px            | 24px             | Avatars                                         |
| `--pad-panel`      | 24px            | 16px             | Sheet and panel padding                         |
| `--pad-card`       | 24px            | 16px             | Card padding                                    |
| `--gap`            | 16px            | 12px             | Gap between blocks                              |
| `--toolbar-py`     | 8px             | 4px              | Toolbar vertical padding                        |
| `--text-ui`        | 0.875rem (14px) | 0.8125rem (13px) | App body text                                   |
| `--text-small`     | 0.75rem (12px)  | 0.6875rem (11px) | Labels, meta, badges                            |
| `--text-cell`      | 0.875rem (14px) | 0.8125rem (13px) | Mono cell values, SQL                           |
| `--title-app`      | 1.375rem (22px) | 1.125rem (18px)  | App screen h1                                   |

### 7.10 Motion (globals)

| Token           | Value  |     | Token            | Value                               |
| --------------- | ------ | --- | ---------------- | ----------------------------------- |
| `--dur-instant` | 100ms  |     | `--ease-enter`   | `cubic-bezier(0.16, 1, 0.3, 1)`     |
| `--dur-quick`   | 200ms  |     | `--ease-move`    | `cubic-bezier(0.65, 0, 0.35, 1)`    |
| `--dur-base`    | 400ms  |     | `--ease-exit`    | `cubic-bezier(0.7, 0, 0.84, 0)`     |
| `--dur-slow`    | 700ms  |     | `--ease-pop`     | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| `--dur-draw`    | 600ms  |     | `--ease-draw`    | `cubic-bezier(0.45, 0, 0.2, 1)`     |
| `--dur-write`   | 800ms  |     | `--stagger-row`  | 70ms                                |
| `--dur-scene`   | 1200ms |     | `--stagger-char` | 28ms                                |
| `--dur-hold`    | 2500ms |     |                  |                                     |

Component state changes (hover, press, toggle) use 150ms with `--ease-enter`. Marketing entrances rise 16px over `--dur-base`, staggered 70ms. Reduced motion shortens every animation and transition to 1ms.

### 7.11 State recipes (derived values)

| State                     | Value                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------- |
| Focus ring                | `box-shadow: 0 0 0 3px color-mix(in oklab, var(--sky-ink) 45%, transparent)`        |
| Segment and tab focus     | `outline: 2px solid var(--sky-ink)`                                                 |
| Invalid field             | border `--rose-ink`, `box-shadow: 0 0 0 3px var(--rose-wash)`                       |
| Primary hover             | `color-mix(in oklab, var(--ink) 86%, var(--canvas))`                                |
| Danger hover              | `color-mix(in oklab, var(--rose-wash), var(--rose) 25%)`                            |
| Selected interactive card | border `--sky-ink`, fill `color-mix(in oklab, var(--sky-wash) 40%, var(--surface))` |
| Press                     | `transform: translateY(1px)`                                                        |
| Disabled                  | `opacity: 0.5` (fields: `--raised` fill, `--ink-muted` text)                        |
| Text selection            | `--sky-wash` (globals)                                                              |

### 7.12 Stacking order

| Token         | Value |
| ------------- | ----- |
| `--z-sticky`  | 10    |
| `--z-header`  | 20    |
| `--z-overlay` | 40    |
| `--z-popover` | 50    |
| `--z-toast`   | 60    |
| `--z-tooltip` | 70    |

What sits at each level is in Layout Principles, Stacking order.

### 7.13 Using tokens in code

- Every colour role is a Tailwind colour: `bg-canvas`, `bg-surface`, `text-ink-muted`, `border-hairline`, `bg-mint-wash`, `text-rose-ink`, `bg-row-selected` (globals maps each `--x` to `--color-x`).
- Size tokens go through Tailwind's variable syntax: `h-(--row)`, `p-(--pad-panel)`, `gap-(--gap)`, `rounded-(--radius-frame)`, `text-(length:--text-ui)`, `shadow-(--shadow-md)`.
- Never write a raw hex, pixel size or shadow in a component; add or reuse a token here. The fixed sizes in 7.8 (search width, dialog, toast, sidebar sheet) are the one allowed set of literal sizes until they become tokens. The `/test` previews still hold 8 other raw sizes, mostly the drawn schema fragment's geometry; they go when the previews move into the app.

## 8. Migrating the Live App to Quill

Today the live app (`/`, `/app`, `/vis`, `/download`) runs on the older tokens in `src/app/globals.css`; Quill runs only on `/test`. This is the map from one to the other.

### What the inventory found

The problems Quill exists to fix, from a search of `src` outside the Quill files on 2026-11-24:

- **Control borders fail 1.4.11.** The old `--strong` (`#C4C4CB` light, `#45454C` dark) reads 1.7:1 on Surface in light and 2.0:1 in dark.
- **The dark theme sits beside black** (`#0A0A0B`, `#111113`, `#18181B`) and its grays lean slightly blue.
- **Eyebrows above headings:** `pn-eyebrow` in 13 files.
- **Density cannot reach the primitives:** 7 files in `src/components/ui` set fixed `h-6` to `h-9` heights.
- **Raw stacking:** 31 raw `z-*` values in 15 files.
- **Lilac used outside its meaning:** the SQL editor's active line sits in the Lilac wash that also marks keywords.
- **Blur and ornament:** `backdrop-blur` in 4 files; window dots on code blocks.

### Token values that change

The light theme barely moves; the dark theme moves off near-black to neutral charcoal.

| Token                          | Light: old → new                    | Dark: old → new                               |
| ------------------------------ | ----------------------------------- | --------------------------------------------- |
| `--canvas`                     | `#F7F7F8` (same)                    | `#0A0A0B` → `#202020`                         |
| `--surface`                    | `#FFFFFF` (same)                    | `#111113` → `#191919`                         |
| `--raised`                     | `#F1F1F3` (same)                    | `#18181B` → `#262626`                         |
| `--zebra`                      | `#EAEAED` → alias of `--active`     | `#212125` → alias of `--active` (`#2E2E2E`)   |
| `--hairline`                   | `#DEDEE3` (same)                    | `#2E2E33` → `#303030`                         |
| `--strong`                     | `#C4C4CB` → `#AEAEB6`               | `#45454C` → `#505050`                         |
| `--decor`                      | `#A1A1A9` (same)                    | `#6B6B73` → `#6B6B6B`                         |
| `--ink`                        | `#18181B` (same)                    | `#EDEDF0` → `#EDEDED`                         |
| `--ink-soft`                   | `#45454C` (same)                    | `#BDBDC4` → `#C4C4C4`                         |
| `--ink-muted`                  | `#63636B` (same)                    | `#93939B` → `#A0A0A0`                         |
| `--row-selected`               | `#E4EDFD` (same)                    | `#1B2230` → `#212B38`                         |
| `--scrollbar-thumb` / `-hover` | same                                | `#6B6B73` / `#93939B` → `#6B6B6B` / `#A0A0A0` |
| `--on-accent`                  | `#0A0A0B` → `#18181B`               | `#0A0A0B` → `#18181B`                         |
| `--radius-lg` (and `--radius`) | 10px → 8px                          | same                                          |
| `--radius-xl`                  | 14px → 12px                         | same                                          |
| `--muted`                      | → `--raised` becomes → `--active`   | same                                          |
| `--accent`                     | → `--zebra` becomes → `--active`    | same                                          |
| `--input`                      | → `--hairline` becomes → `--strong` | same                                          |
| `--sidebar`                    | → `--surface` becomes → `--canvas`  | same                                          |
| `--sidebar-accent`             | → `--zebra` becomes → `--active`    | same                                          |

**New tokens:** `--active`, `--rule`, `--inverse`, `--on-inverse`, `--on-inverse-soft`, `--backdrop`, `--shadow-sm`, `--shadow-md`, `--shadow-float`, `--radius-frame`, `--content-max`, `--margin`, `--space-section`, `--space-card`, every density token (7.9) and every `--z-*` token (7.12).

**Retired once nothing reads them:** the `--gray-*` ladder, `--shadow-lift` (use `--shadow-md` or `--shadow-float`), `--shadow-ring` (use the focus-ring recipe), `--radius-2xl`, `--radius-3xl`, `--radius-4xl`, and finally the `--zebra` alias.

### Classes and components that change

| Today                                           | In Quill                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pn-eyebrow` (13 files)                         | Removed: no eyebrows. Fold the words into the heading, or use a sentence-case `q-label` / `q-nav-label` where it names a group |
| `pn-table-head` (5 files)                       | `q-table` headers: 12px sentence case, Ink Muted                                                                               |
| `pn-tnum` (19 files)                            | `q-num`                                                                                                                        |
| `pn-hand`, `pn-stroke`                          | Kept: the handwritten note and its arrow                                                                                       |
| Landing `ln-*` classes and `Tile` tones         | `q-container`, `q-display-*`, `q-card` / `q-card-soft` / `q-card-inverse`, `q-btn-lg`                                          |
| `Chip` (pastel eyebrow pill)                    | `q-badge` with a tone, never above a heading                                                                                   |
| `CodeBlock` (2px ring, window dots)             | A Surface block with a 1px Hairline, no window dots (as `SqlCode` on `/test`)                                                  |
| Drop zone with `backdrop-blur-sm` on Canvas 85% | Canvas at 92%, no blur (see App components)                                                                                    |
| SQL editor active line in the Lilac wash        | Raised                                                                                                                         |

**Literal colours outside the CSS.** `src/app/layout.tsx` (the dark `theme-color`) and `src/app/manifest.ts` (`background_color`, `theme_color`) hold the old dark Canvas `#0A0A0B`; they become `#202020`. `src/lib/logo.ts` keeps its literals, since the mark is drawn into icon files, but its comments name `--gray-*` tokens that retire.

**Primitives in `src/components/ui`** have fixed sizes today, so they ignore density until they read the tokens:

- `Button`: `h-8` / `h-6` / `h-7` / `h-9` → `h-(--control)`, `h-(--control-sm)` (xs and sm), `h-(--control-lg)`; icon sizes → `size-(--control)` and friends; padding `px-(--control-px)`; label weight `--control-weight`; the outline variant's border → `--strong`.
- `Input`, `Textarea`, `Select` trigger: `h-8` → `h-(--control)`, text `--control-fs` (16px on phones stays).
- `Dialog`, `AlertDialog`: the `ring-foreground/10` edge → 1px Hairline plus `--shadow-float`; the overlay's `bg-black/10` and blur → `bg-(--backdrop)`, no blur.
- `DropdownMenu`, `ContextMenu`, `Popover`, `Select` content, `Command`: Hairline edge, `--shadow-float`, items at `h-(--control)` with `--radius-sm`.
- `Badge`: `h-(--pill-h)`. `Switch`, `Checkbox`: `--switch-h`, `--check`. `Tabs`: the underline-tab spec.
- Every `z-10` / `z-50`: the matching `--z-*` token.

**Density in the app:** the editor already stores a density (`setDensity` in `src/lib/store/workspace.ts`) and its grid rows already match Quill (`ROW_HEIGHT` is 30px compact, 40px comfortable, the same as `--row`). Put `data-density={density}` on the editor and schema-designer shells (compact by default); marketing pages stay comfortable, and the product fragments on them are compact.

### Order of work

1. Move the token blocks from `quill.css` into `globals.css`, replacing the old values and dropping the `:has(.quill)` scope; move the `q-*` classes beside them.
2. Point the `ui` primitives at the density and `--z-*` tokens.
3. Set `data-density` on the app shells.
4. Replace the `pn-*` and `ln-*` classes and the components in the table above; remove eyebrows.
5. Retire the old tokens once a search finds no readers.
6. Check: typecheck, lint, unit tests, the desktop e2e suite (`bun run test:e2e`), and the page inspector on `/`, `/app`, `/vis` and `/download` in both themes.
7. Keep `/test/components` as the living reference (or move it to a permanent route); delete the other `/test` pages.

### Release stages

| Stage         | Done when                                                                                         | Who sees it                                             |
| ------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Alpha (today) | Tokens and `q-*` classes exist, scoped to `/test` by `:root:has(.quill)`; values may still change | `/test` only                                            |
| Beta          | Steps 1–3 done; every row of the contrast table passes, the focus ring included                   | Every page; old classes still render, on the new values |
| Stable        | Steps 4–5 done; every adoption metric below at its target                                         | Every page                                              |

During Beta the old class names (`pn-*`, `ln-*`) and aliases (`--zebra`) are the compatibility layer: they keep working on Quill's values while screens move over.

### Deprecation

An old token or class is **deprecated** in the release that ships Beta, with its replacement named in a comment beside it and in the tables above. It is **removed** no earlier than the next minor release, and only when the search for it finds no readers. A deprecated name never gains new readers.

### Adoption metrics

Counted with `grep -rlE --include='*.ts' --include='*.tsx' --include='*.css' -e '<pattern>' src | grep -vE '^src/(app/test|components/quill)/'`, so file counts include `globals.css` where it defines the name. Patterns are `grep -E`; in the table, `\|` stands for `|`.

| Metric                                          | Pattern                                     | Baseline (2026-11-24)                 | Target                   |
| ----------------------------------------------- | ------------------------------------------- | ------------------------------------- | ------------------------ |
| Live files using `q-*` classes                  | `className="[^"]*\bq-`                      | 0 files                               | Every screen             |
| `pn-eyebrow`                                    | `pn-eyebrow`                                | 14 files                              | 0                        |
| `pn-table-head`                                 | `pn-table-head`                             | 6 files                               | 0                        |
| `pn-tnum`                                       | `pn-tnum`                                   | 20 files                              | 0                        |
| Landing `ln-*` classes                          | `\bln-[a-z]+`                               | 21 files, 226 uses                    | 0                        |
| Raw stacking                                    | `\bz-(10\|20\|30\|40\|50)\b\|\bz-\[`        | 15 files, 31 uses                     | 0                        |
| Blur                                            | `backdrop-blur`                             | 4 files                               | 0                        |
| `--zebra` readers                               | `--zebra\|bg-zebra`                         | 12 files, 27 uses                     | 0, then remove the alias |
| `--gray-*` ladder                               | `--gray-[0-9]+\|gray-[0-9]{2,3}\b`          | 6 files, 40 uses                      | 0                        |
| Retired shadows                                 | `shadow-(lift\|ring)`                       | 2 files, 9 uses                       | 0                        |
| Radii over 16px                                 | `rounded-(2xl\|3xl\|4xl)`                   | 1 file                                | 0                        |
| Fixed-height `ui` primitives                    | `\bh-(6\|7\|8\|9)\b` in `src/components/ui` | 7 files                               | 0                        |
| Colour literals outside the exceptions register | `#[0-9A-Fa-f]{6}\b`                         | 0 (all 7 files are listed exceptions) | 0                        |
| Failing contrast rows                           | The table in section 2                      | 2 (focus ring as drawn)               | 0                        |

## 9. Decision Log

Each row is one design decision record. A new foundation value, component or rule adds a row. An accepted row is never rewritten: a new row replaces it and the old one is marked "Superseded by DDR-0nn". A row moves from Proposed to Accepted in the pull request that ships it. A decision big enough to need more than a row gets a full write-up in that pull request (context, decision, options, consequences, when to revisit) and a link here.

| DDR | Status                | Decision                                                                                                              | Instead of, and why not                                                                                                                   | Revisit when                                                |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 001 | Accepted              | The primary action is Ink with a Canvas label, one per band or screen                                                 | A pastel primary: it would blur the pastels' meanings, and a pastel fill needs dark text to pass                                          | A brand colour is ever added                                |
| 002 | Accepted              | Each pastel comes as a triad: pastel for marks, wash for fills, ink for text                                          | 50–950 lightness scales: dozens of tokens nobody needs, inviting decorative tints. Pastel text fails on white; the inks pass at 5.7–6.5:1 | A hue needs more than three strengths                       |
| 003 | Accepted              | Dark is neutral charcoal (`#202020` frame, `#191919` sheet, one step darker than its frame); never black              | Near-black grays (`#0A0A0B`, `#111113`, `#18181B`), which sit beside black and lean slightly blue                                         | Dark-theme feedback                                         |
| 004 | Superseded by DDR-014 | Control borders use `--strong` at 3:1 on Surface and Canvas; fields on Raised keep a Surface fill                     | The old `#C4C4CB` / `#45454C`, at 1.7:1 and 2.0:1                                                                                         | `--strong`, `--surface` or `--raised` change                |
| 005 | Accepted              | Sentence case everywhere; no eyebrows, no tracked uppercase labels                                                    | `pn-eyebrow`: it repeats the heading in smaller, harder-to-read text                                                                      | Never                                                       |
| 006 | Accepted              | Table rows use 1px rules, a Raised hover and Selected Row Ice; no zebra                                               | Zebra stripes, which compete with the Selected, Edited and Added washes                                                                   | People report losing their row in wide grids                |
| 007 | Accepted              | Two densities from one token set, switched by `data-density`; compact for the desktop editor, comfortable elsewhere   | One density (too loose for the editor or too tight for forms), or separate compact components (two copies to keep)                        | A third density is asked for                                |
| 008 | Accepted              | Lilac marks SQL keywords only; the SQL editor's active line is Raised                                                 | Lilac as a UI accent or active-line fill, which blurs its one meaning                                                                     | Never                                                       |
| 009 | Accepted              | Depth by tone, then a 1px hairline, then a shadow only on what floats; no gradients, no blur                          | Shadowed cards and blurred overlays: noise where a tone step already separates the layers                                                 | Never                                                       |
| 010 | Accepted              | Stacking uses the `--z-*` scale; popovers sit above dialogs because they open from them                               | Raw `z-*` values, which collide (31 today)                                                                                                | A new layer type appears                                    |
| 011 | Accepted              | The Caveat note and its arrow appear on marketing pages only, one per screen                                          | Notes in the app, where they would compete with data                                                                                      | Never                                                       |
| 012 | Proposed              | Tokens live only as CSS custom properties; no W3C DTCG `tokens.json`                                                  | A `tokens.json` plus a build step: a second copy with no second reader today                                                              | A design tool or another repository needs the tokens        |
| 013 | Proposed              | Focus is a 2px solid `--sky-ink` outline with a 2px offset on every control, the recipe segments and tabs already use | The 3px `box-shadow` ring at 45%: 2.0–2.1:1 in light, and invisible in forced-colours mode because of `outline: none`                     | `--sky-ink` changes                                         |
| 014 | Accepted              | Control borders are soft (`#AEAEB6` light, `#505050` dark, 2.2:1 on Surface); focus draws a full Cobalt border        | DDR-004's `#8E8E96` / `#6B6B6B` at 3:1, which read too heavy across a dense editor                                                        | Contrast complaints, or an accessibility audit asks for 3:1 |
| 015 | Accepted              | Compact controls are 30px (26 / 34) with 12px side padding                                                            | 28px (24 / 32) with 10px, which felt cramped                                                                                              | The editor's toolbars stop fitting on one row               |

## 10. Governance

**Model.** Centralised: Sequill has one maintainer, who owns the principles, tokens and this document. Outside contributions follow `CONTRIBUTING.md`; any change to how something looks starts as an issue.

**Adding or changing a token or component**

1. Search this document, `quill.css`, `src/components/ui` and `src/components/common/pastel` for something that already does the job; extend it if it nearly does.
2. Open an issue naming the screen that needs it and why nothing existing fits. A component earns a place in the system when a second screen needs it; until then it stays local.
3. Add a Proposed row to the Decision log.
4. Spec it here, in the section it belongs to, with its states and its keyboard and ARIA row; put new tokens in section 7 and any new text pair in the contrast table.
5. Build it in `quill.css` (in `globals.css` once Quill moves there), reading only Layer 2 and 3 tokens.
6. Preview it in `/test/components` in both densities; check both themes, phone width, keyboard only and reduced motion.
7. In the same pull request, mark the decision Accepted and add a changeset if users will see the change.

**Versioning.** The system ships with the app and shares its version (`package.json`, Changesets); it has no version of its own, and tokens ship only as this repository's CSS. Renaming or removing a token, class or density value is breaking: it lands in one pull request that updates every reader (the search finds none left), with a row in the Decision log. A new token, class or variant is additive. A value change that keeps the contrast table passing is a fix.

**Exceptions register.** Colour literals are allowed only in the token blocks (`globals.css`, `quill.css`), `src/app/layout.tsx` and `src/app/manifest.ts` (browsers need literals; they must match Canvas), `src/lib/logo.ts` and `src/components/common/logo.tsx` (the mark keeps its own colours in every theme and is drawn into image files), the schema designer's custom-colour default in `src/components/vis/color-picker.tsx`, and tests. Anything else needs a Decision log row.

**Audit,** before each minor release:

- Run the adoption metric searches (section 8) and compare with the last baseline.
- Recompute the contrast table for any token that changed.
- Open `/test/components` and `/test/app` in both themes and both densities, by keyboard.
- Check this document against `quill.css`: every `q-*` class appears in both.
- Score each area 0 (missing or broken), 1 (partial) or 2 (meets this document): colour and contrast, type, density, components, keyboard and ARIA, migration.

## 11. Notes for Stitch Generation

### Language to use

- **Atmosphere:** "Bright orderly workroom; near-monochrome with soft meaningful pastels; real product UI inside gray cards."
- **Buttons:** "Charcoal ink button with 8px corners and a semibold 14px label."
- **Depth:** "Flat tone steps, 1px silver hairlines, one soft shadow on the hero mockup only."
- **Dark theme:** "Neutral charcoal frame (#202020) around a slightly darker sheet (#191919); no blue cast, never black."

### Colour references

- Grounds: "Cool Paper Mist (#F7F7F8)" with "Pure Sheet White (#FFFFFF)"; dark "Frame Charcoal (#202020)" with "Sheet Charcoal (#191919)".
- Text: "Charcoal Ink (#18181B)", "Graphite Ink (#45454C)", "Weathered Gray (#63636B)".
- Focus and data: "Powder Sky (#A9C9FF)" with "Cobalt Ink (#2D5CAD)".
- Danger: "Blush Rose wash with Raspberry Ink (#A83866)".

### Component prompts

- "A hero band in two equal halves: a 64px DM Sans semibold headline with tight negative tracking, one sentence, a charcoal 40px button and an outlined one; on the right a white 16px-rounded card showing the real data grid with a soft shadow."
- "A gray (#F1F1F3) feature card with 12px corners and 32px padding holding a small real interface fragment, no icon."
- "An editor shell: a pale gray L-frame around a white sheet with 16px corners and a 1px silver edge; a data grid with 12px gray sentence-case headers, monospace values, right-aligned numbers, no zebra rows."
- "Compact desktop toolbar: 30px controls with 8px corners, a search field with a leading icon, pill filter chips with the active one in a pale sky wash, a joined Sort | Filter | Columns group, ghost icon buttons on the right; 30px grid rows."

### Iteration

1. Change one component at a time.
2. Name the role, not the hue ("Hairline", "Sky ink for focus").
3. Keep each pastel's meaning: Rose only for danger and cancelled, Sky only for focus, selection, links and data (the main series, the paid status), Lilac only for SQL keywords.

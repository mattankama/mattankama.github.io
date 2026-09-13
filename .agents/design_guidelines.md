# Design Guidelines
### Weightlifting Workout App
*Implementation Reference*

> **Purpose**
> A standalone visual reference for implementing the workout app described in CONTEXT.md. Use it for screen layout, component styling, and any future design or development work on the app. The interface is dark-mode-only and minimal: bold, meaningful text carries the hierarchy, the palette below is the only palette, and decorative effects are used sparingly — functional depth cues (micro-shadows on sticky elements, elevated input backgrounds) are permitted where they aid layer separation on a dark canvas.

## System at a glance

| | |
|---|---|
| **Visual character** | Minimal, direct, unadorned. Nothing on screen that isn't load-bearing. |
| **Core approach** | Weight and size create hierarchy, not color or effects. Bold text marks what the user needs to read or act on; everything else recedes. |
| **Palette** | Six fixed tokens (dark-mode-only), defined in Section 2. One accent, used sparingly. |
| **Density** | Compact and thumb-friendly — built to be read and adjusted mid-set, often one-handed. |
| **Surfaces** | Neumorphic (soft-embossed). We use subtle light and dark shadows to create depth, making elements appear extruded from or inset into the background surface, while maintaining minimalism. No blur or gradients. |
| **Motion** | Minimal; only where it explains a real state change (the timer, a logged set). |

## 1. Core visual principles

**Minimal first.** The interface should feel empty before it feels full. If an element doesn't help the user log a set or manage the timer, it doesn't belong on screen.

**Bold means meaningful.** Bold weight is reserved for what the user is reading or editing right now: the exercise name, the current weight, the rep count, the timer. Labels, units, and metadata stay at a lighter weight so bold text is never competing with itself.

**Hierarchy without decoration.** Gradients and glassmorphism are not part of this system. Size, weight, spacing, and the single accent color do the main work of hierarchy. We use neumorphic effects (soft-embossed highlights and shadows) to create tactile depth—buttons extrude from the surface, inputs press into it—while remaining fundamentally minimal.

**Neumorphic by default.** We embrace soft UI depth. Instead of flat cards, interactive elements like buttons and containers extrude smoothly from the surface, while inputs and active states appear pressed (inset).

**Built for the gym, not the pitch deck.** Sweaty hands, bad lighting, and glancing mid-set are the real usage conditions. Every choice should hold up there, not just in a mockup.

### Brand character

| Trait | Visual expression |
|---|---|
| **Direct** | States the number, not a description of it — "185 × 8," not "you lifted 185 lbs for 8 reps." |
| **Honest** | No motivational copy, streaks, or gamified language standing in for real progress. |
| **Fast** | Every control reachable in one tap; nothing nested behind menus during a workout. |
| **Legible** | Readable at arm's length, in a gym, without your glasses. |
| **Quiet** | The app should be fully usable with the sound and the color both off. |

## 2. Color system

**Rule:** the app is dark-mode-only. Every screen is built from the six tokens below. Copper is the only accent, and it appears once per screen at most. There is no light mode.

### Palette

| Token | Value | Use |
|---|---|---|
| **Surface** | `#191D24` | Background canvas (near-black). |
| **Ink** | `#E8E7E4` | Primary text (soft white). Every exercise name, weight, and rep count is set in Ink. |
| **Structure** | `#799496` | Secondary text, dividers, borders. |
| **Muted** | `#4A5568` | Inactive controls, placeholder text, quiet metadata — darker than Structure, recedes on a dark background. |
| **Elevated** | `#232830` | Subtle surface lift for sticky bars, input fields, and grouped panels. Never used as text. |
| **Accent** | `#B87D4B` | The one deliberate highlight: a running timer, the Complete Workout button, a selected machine. |

> **Color rules**
> - Accent (Copper) appears at most once per screen — reserve it for the single most important action or state.
> - Never blend, gradient, or tint between two palette colors; use each color flat and at full value.
> - Structure and Muted are both quiet tones — use Structure where stronger separation is needed (dividers, secondary text) and Muted where content should recede further (placeholders, disabled controls, inactive metadata).
> - State (timer running, set completed, machine selected) should be legible from weight and position alone — color reinforces it, it doesn't carry it alone.
> - Elevated provides subtle layer separation on the dark canvas — use it for sticky elements and input backgrounds, never for text.

## 3. Typography

**Font.** The app uses custom web fonts to establish a modern, minimal aesthetic. `Inter` is used for body text and UI controls to ensure maximal legibility at small sizes. `Space Grotesk` is used for all numbers (timers, weight, reps) and primary headings (h1, screen titles, exercise names) to provide a distinct, tech-forward character.

**Two weights only.** Bold and Regular. No light, thin, semi-bold, or italic — a third weight adds a hierarchy level this app doesn't need.

### Type scale

| Role | Range | Use |
|---|---|---|
| **Timer** | 48–64 pt, Bold | The rest-timer readout. Always the largest text on screen when a workout is active. |
| **Weight × Reps** | 28–34 pt, Bold | The current set's numbers — the thing the user is here to see and change. |
| **Exercise name** | 18–20 pt, Bold | Identifies the current exercise at a glance. |
| **Button / action label** | 15–17 pt, Bold | Complete Workout, Add Machine, Add Set — anything the user taps. |
| **Body / metadata** | 13–15 pt, Regular | Machine name, set count, timestamps — present but quiet. |

### Typographic discipline

- Use tabular (fixed-width) numerals wherever numbers change — the timer and the weight/rep counters especially — so digits don't shift the layout as they update.
- Never use color alone to distinguish bold, meaningful text from regular text; weight always carries that distinction.
- Keep labels short enough that they never wrap at the smallest supported screen width.
- No all-caps body text; reserve capitals for short labels only, not sentences.

## 4. Spacing, density & geometry

| | |
|---|---|
| **Base rhythm** | 8-point spacing grid, with 4-point exceptions for micro-spacing between a number and its unit. |
| **Touch targets** | 44 × 44 pt minimum on every tappable control — set +/−, weight/rep steppers, machine switcher. Gym use means sweaty, imprecise taps. |
| **Sticky elements** | The timer bar and Complete Workout button get generous internal padding (16–20 pt) so they stay easy to hit without looking. |
| **List rows** | Compact — exercises and sets should be scannable in a single glance down the screen, not spaced out like marketing content. |

### Shape & radius

- One radius value, used everywhere a corner is rounded. Do not vary radius by component.
- Keep it modest — enough to soften a rectangle, not enough to read as a pill. This is not a "rounded card" app.
- Full pills are reserved for small, genuinely token-like elements (a machine tag), never for buttons or containers.
- No large sweeping radii applied for the sake of looking "modern" — that reads as decoration, which this system avoids.

## 5. Surfaces & layout anatomy

- The UI is neumorphic. Elements share the background color of their container and use combinations of light and dark shadows to create depth. No blur, no translucency, no gradients.
- Sticky elements and buttons appear extruded using outer shadows (e.g., `-5px -5px 10px rgba(255,255,255,0.05), 5px 5px 10px rgba(0,0,0,0.5)`).
- Input fields and selects appear pressed into the surface using inset shadows (e.g., `inset -3px -3px 6px rgba(255,255,255,0.05), inset 3px 3px 6px rgba(0,0,0,0.5)`).
- Lists are the primary layout, not cards. An exercise and its sets form an ordered list separated by hairlines or soft neumorphic dividers.
- Exercise entry blocks use a left accent border (`3px solid Structure`) with padding-left for visual rhythm as you scroll.
- Routine panels on the home screen use a neumorphic extruded background with border-radius for subtle grouping.

### Component notes

| Component | Guidance |
|---|---|
| **Rest timer bar** | Pinned to the top of the screen at all times during a workout. Large, bold, tabular numerals in Ink; switches to Accent only while running. A divider line, not a shadow, separates it from the list below. |
| **Exercise row** | Bold exercise name and current weight × reps in Ink. Machine name and set count sit below in Muted, Regular weight — clearly secondary. |
| **Set stepper (+/− sets, weight, reps)** | Plain bold numerals with neumorphic +/− controls on either side. The controls extrude from the surface and inset when pressed. |
| **Machine switcher** | A simple inline selector, not a styled dropdown. Selecting or adding a machine swaps in that machine's own saved stats immediately, with no transition beyond the numbers changing. |
| **Complete Workout button** | Pinned to the bottom of the screen. Solid Accent fill, bold label, full width. Uses neumorphic shadows for a tactile appearance. |

## 6. Iconography

- Prefer text over icons. A label the user can read beats an icon they have to interpret, especially glancing mid-set.
- If an icon is used (add/remove set, timer controls), keep it single-weight, line-based, and sized to match the surrounding text — no filled, multicolor, or novelty icon styles.
- Never rely on an icon alone for a destructive or important action (removing a set, deleting a machine) without a text label nearby.

## 7. Motion

- Motion is the exception, not the default. Most state changes — switching a machine, editing a stat — should update instantly with no transition.
- Where motion is used — the timer ticking down, a set marked complete — keep it fast (under ~150 ms) and purely functional. It should explain a change, not perform one.
- No bounce, spring, confetti, or celebratory animation on completing a set or a workout. The reward is the workout being logged, not an effect.

## 8. Anti-patterns

> **No exceptions**
> These patterns are excluded regardless of platform, screen, or future feature. If a new screen seems to need one of them, the screen's hierarchy needs rework — not an effect.

- Gradients of any kind, on any surface or text.
- Glassmorphism, frosted blur, or translucent panels.
- Oversized corner radii or an "everything is a pill" button style.
- More than one accent color active on a single screen.
- Decorative icons, multicolor icon packs, or icons used to fill empty space.
- Confetti, "level up" language, streak badges, or other gamified celebration.
- Skeleton-loading animations or spinners for changes that update instantly on-device.
- Any color outside the six tokens defined in Section 2.
- Light mode or dual-mode theming — the app is dark-mode-only.

## 9. Open decisions

| Decision | Status | Guidance |
|---|---|---|
| **Platform / font stack** | Resolved | The app uses `Inter` for standard UI text and `Space Grotesk` for headings and tabular numbers, loaded via Google Fonts. |
| **Exact corner radius** | Not specified | The rule (one value, modest, used everywhere) is set; the numeric value is left to implementation. |

## 10. Implementation token sheet

*These names are reference-friendly aliases for the palette values; they do not change the source colors.*

| Reference token | Value | Meaning |
|---|---|---|
| `--color-surface` | `#191D24` | Background canvas (near-black) |
| `--color-ink` | `#E8E7E4` | Primary text (soft white) |
| `--color-structure` | `#799496` | Secondary text, dividers, borders |
| `--color-muted` | `#4A5568` | Inactive / placeholder / quiet metadata |
| `--color-elevated` | `#232830` | Sticky bars, input backgrounds, grouped panels |
| `--color-accent` | `#B87D4B` | Single highlight: active timer, primary action, selected state |
| `--space-unit` | 8 pt | Primary spacing rhythm |
| `--space-micro` | 4 pt | Micro-spacing exception |
| `--touch-target-min` | 44 pt | Minimum tappable area |
| `--motion-duration` | <150 ms | Functional motion only |

### Implementation checklist

- [ ] Is every bold element something the user needs to read or act on right now?
- [ ] Does Accent appear at most once on this screen?
- [ ] Could this screen be understood in grayscale?
- [ ] Are sticky elements using Elevated background + micro-shadow for layer separation?
- [ ] Is there a gradient, blur, or decorative shadow anywhere? (If yes, remove it.)
- [ ] Are all touch targets at least 44 × 44 pt?
- [ ] Does every icon have a text label nearby?
- [ ] Is spacing built from the 8pt grid (4pt only for micro-spacing)?
- [ ] Are all native `<select>` elements replaced with custom dropdowns matching the design system?

### Source scope

Built from the app's CONTEXT.md (workout creation, active-workout, and completion flows) and the dark-mode-only palette. The exact radius remains open per Section 9, while the font stack has been resolved to use Inter and Space Grotesk.

---
*Companion to CONTEXT.md · September 2026*
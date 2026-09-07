# Design Guidelines
### Weightlifting Workout App
*Implementation Reference*

> **Purpose**
> A standalone visual reference for implementing the workout app described in CONTEXT.md. Use it for screen layout, component styling, and any future design or development work on the app. The interface should be as minimal as possible: bold, meaningful text carries the hierarchy, the five-color palette below is the only palette, and gradients, glassmorphism, and similar decorative effects are excluded by design.

## System at a glance

| | |
|---|---|
| **Visual character** | Minimal, direct, unadorned. Nothing on screen that isn't load-bearing. |
| **Core approach** | Weight and size create hierarchy, not color or effects. Bold text marks what the user needs to read or act on; everything else recedes. |
| **Palette** | Five fixed colors, defined in Section 2. One accent, used sparingly. |
| **Density** | Compact and thumb-friendly — built to be read and adjusted mid-set, often one-handed. |
| **Surfaces** | Flat. No cards, no shadows, no blur, no gradients. |
| **Motion** | Minimal; only where it explains a real state change (the timer, a logged set). |

## 1. Core visual principles

**Minimal first.** The interface should feel empty before it feels full. If an element doesn't help the user log a set or manage the timer, it doesn't belong on screen.

**Bold means meaningful.** Bold weight is reserved for what the user is reading or editing right now: the exercise name, the current weight, the rep count, the timer. Labels, units, and metadata stay at a lighter weight so bold text is never competing with itself.

**Hierarchy without decoration.** Gradients, glassmorphism, drop shadows, and neumorphic effects are not part of this system. Size, weight, spacing, and the single accent color do all the work that effects would otherwise be asked to do.

**Flat by default.** No cards, no elevation, no containers, unless grouping content genuinely helps the user scan it faster.

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

**Rule:** every screen is built from the five colors below. Copper is the only accent, and it appears once per screen at most.

### Base palette

| Token | Value | Use |
|---|---|---|
| **Ink** | `#191D24` | Primary text. Every exercise name, weight, and rep count is set in Ink. |
| **Structure** | `#523A34` | Secondary text, dividers, and the frame around sticky elements (timer bar, Complete Workout button). |
| **Muted** | `#799496` | Inactive controls, placeholder text, quiet metadata like machine names and set counts. |
| **Surface** | `#FFF8E8` | The background canvas. Nearly everything sits directly on Surface. |
| **Accent** | `#B87D4B` | The one deliberate highlight: a running timer, the Complete Workout button, a selected machine. |

> **Color rules**
> - Accent (Copper) appears at most once per screen — reserve it for the single most important action or state.
> - Never blend, gradient, or tint between two palette colors; use each color flat and at full value.
> - Structure and Muted are both quiet tones — use Structure where stronger separation is needed (dividers, sticky-element borders) and Muted where content should recede further (placeholders, disabled controls).
> - State (timer running, set completed, machine selected) should be legible from weight and position alone — color reinforces it, it doesn't carry it alone.

### Dark mode

**Rule:** dark mode uses the same five colors, remapped — never a sixth color, and never a naive full-palette invert.

| Token | Light | Dark | Use |
|---|---|---|---|
| **Surface** | `#FFF8E8` | `#191D24` | Background canvas. The palette's two extreme tones swap directly — they already sit at opposite ends of the lightness range, so the swap needs no new color. |
| **Ink** | `#191D24` | `#FFF8E8` | Primary text. Same swap, reversed. |
| **Structure** | `#523A34` | `#799496` | Secondary text and dividers. Deep Mocha doesn't have enough contrast against a dark background to stay legible, so Cool Steel takes over this role in dark mode. |
| **Elevated** *(dark mode only)* | — | `#523A34` | Deep Mocha is repurposed as a flat fill for grouped panels and sticky-element separation — never as text. It replaces the contrast it can't provide as a readable color with a structural one instead. |
| **Accent** | `#B87D4B` | `#B87D4B` | Unchanged. Copper reads clearly on both light and dark backgrounds. |

> **Dark mode notes**
> - Muted has no separate tone in dark mode — the fixed palette only supports one legible secondary tier against a dark background, not two. Use Structure's color for all secondary and placeholder text, and fall back to size or spacing (not a third color) if something needs to recede further.
> - Don't simply invert every light-mode value — Structure's role changes color (Deep Mocha → Cool Steel) rather than just its target inverting, because the swap that works for Ink/Surface doesn't hold at Structure's contrast level.
> - Accent stays Copper in both modes. Don't lighten or desaturate it for dark backgrounds — it was already chosen from a palette that includes a bright, warm mid-tone.
> - Follow the system's light/dark setting by default; this app doesn't need its own in-app toggle unless requested later.

## 3. Typography

**Font.** Use the platform's native system font. No custom or decorative typefaces — the app should look like it belongs on the device it's running on. (Not finalized: the exact stack depends on the eventual platform — see Section 9.)

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

- Every screen sits flat on Surface. No shadows, no blur, no translucency, no gradients — ever, not even subtle ones.
- Sticky elements (timer bar, Complete Workout button) are separated from scrolling content with a single flat divider line in Structure, not a shadow or a blur.
- Lists are the primary layout, not cards. An exercise and its sets form a flat, ordered list separated by hairlines.
- If a container is ever needed, it's a flat Surface or Structure-bordered block — never a "card" with elevation.

### Component notes

| Component | Guidance |
|---|---|
| **Rest timer bar** | Pinned to the top of the screen at all times during a workout. Large, bold, tabular numerals in Ink; switches to Accent only while running. A divider line, not a shadow, separates it from the list below. |
| **Exercise row** | Bold exercise name and current weight × reps in Ink. Machine name and set count sit below in Muted, Regular weight — clearly secondary. |
| **Set stepper (+/− sets, weight, reps)** | Plain bold numerals with flat +/− controls on either side. No skeuomorphic button styling — a flat tap target is enough. |
| **Machine switcher** | A simple inline selector, not a styled dropdown. Selecting or adding a machine swaps in that machine's own saved stats immediately, with no transition beyond the numbers changing. |
| **Complete Workout button** | Pinned to the bottom of the screen. Solid Accent fill, bold label, full width. No gradient, no shadow — flat color is the entire treatment. |

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
- Neumorphism or soft-embossed "pressed" shadows.
- Drop shadows used decoratively rather than to separate a genuinely sticky element.
- Oversized corner radii or an "everything is a pill" button style.
- More than one accent color active on a single screen.
- Decorative icons, multicolor icon packs, or icons used to fill empty space.
- Confetti, "level up" language, streak badges, or other gamified celebration.
- Skeleton-loading animations or spinners for changes that update instantly on-device.
- Any color outside the five tokens defined in Section 2.

## 9. Open decisions

| Decision | Status | Guidance |
|---|---|---|
| **Platform / font stack** | Open | Not specified in the brief. Use the eventual platform's native system font — do not introduce a custom typeface to resolve this. |
| **Exact corner radius** | Not specified | The rule (one value, modest, used everywhere) is set; the numeric value is left to implementation. |

## 10. Implementation token sheet

*These names are reference-friendly aliases for the palette values; they do not change the source colors.*

| Reference token | Value | Meaning |
|---|---|---|
| `--color-ink` | `#191D24` | Primary text |
| `--color-structure` | `#523A34` | Secondary text, dividers, sticky-element borders |
| `--color-muted` | `#799496` | Inactive / placeholder / quiet metadata |
| `--color-surface` | `#FFF8E8` | Background canvas |
| `--color-accent` | `#B87D4B` | Single highlight: active timer, primary action, selected state |
| `--space-unit` | 8 pt | Primary spacing rhythm |
| `--space-micro` | 4 pt | Micro-spacing exception |
| `--touch-target-min` | 44 pt | Minimum tappable area |
| `--motion-duration` | <150 ms | Functional motion only |

### Implementation checklist

- [ ] Is every bold element something the user needs to read or act on right now?
- [ ] Does Accent appear at most once on this screen?
- [ ] Could this screen be understood in grayscale?
- [ ] Are the timer bar and Complete Workout button separated with a flat divider, not a shadow or blur?
- [ ] Is there a gradient, blur, or shadow anywhere that isn't strictly functional? (If yes, remove it.)
- [ ] Are all touch targets at least 44 × 44 pt?
- [ ] Does every icon have a text label nearby?
- [ ] Is spacing built from the 8pt grid (4pt only for micro-spacing)?

### Source scope

Built from the app's CONTEXT.md (workout creation, active-workout, and completion flows) and the fixed five-color palette supplied for the project. No font stack, dark-mode values, or exact radius have been decided — these remain open per Section 9.

---
*Companion to CONTEXT.md · September 2026*
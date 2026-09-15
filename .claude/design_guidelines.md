# Design Guidelines
### Rattlesnake — Weightlifting Workout App
*Implementation Reference — design system "**FORGE**"*

> **Purpose**
> The single visual reference for this app. It describes the system that is actually implemented in `app/static/css/style.css`; if the code and this document disagree, one of them is a bug. The interface is dark-mode-only, mobile-first, and built to be used one-handed, mid-set, with sweaty hands, in bad gym light.

## System at a glance

| | |
|---|---|
| **Name** | FORGE — mass, material, heat. |
| **Visual character** | Warm graphite surfaces, huge extended numerals, one incandescent accent. Confident and physical rather than clinical. |
| **Core approach** | Hierarchy is carried by the *shape of the letters* — width and weight rise together with importance. Grouping is carried by *surfaces*, never by hairline dividers. |
| **Palette** | A warm four-step elevation ramp on a near-black (never `#000`) canvas, three inks, one accent, one destructive. |
| **Typeface** | One variable family, Archivo, with two axes: weight 100–900 and **width 62–125%**. Nothing else loads. |
| **Density** | Generous targets, tight type. Every control ≥44×44; the primary ones are 48. |
| **Surfaces** | Opaque, stacked, with concentric corner radii. Chrome floats above content on glass. |
| **Motion** | Spring physics with a visible overshoot, on state changes only. Shapes morph under the thumb. |

## 1. Core visual principles

**Width is the hierarchy axis.** This is the system's one real idea. Archivo is a variable font with a `wdth` axis, so importance is expressed by letterforms getting wider and heavier together: display type at 116% width, titles at 106%, everything else at 100%. It means the timer and the big numbers are unmistakably the most important things on screen without needing a box, a rule, or a colour to say so.

**Nothing whispers.** There is no 11px uppercase letterspaced grey micro-label anywhere in this system, and there must never be one. That pattern is both dated and, in a gym, unreadable. Labels are sentence case, 13px minimum, ≥600 weight, and every single one clears WCAG AA against the surface it actually sits on. Where the old system tracked labels *out*, this one tracks display type *in* (−0.035em) and lets weight do the work — the same move Material 3 Expressive makes with its "emphasized" styles.

**Grouping is a surface, not a line.** An exercise is a card. A routine is a card. A set is a row-surface inside a card. Hairlines in this system are the lit top edge of a material (`inset 0 1px 0`), never a divider between two pieces of content. On a dark canvas, elevation is communicated by *lighter surfaces* — shadows are close to invisible, so they are not asked to carry structure.

**Concentric radii.** Nested corners follow `inner = outer − padding`. A card at radius 26 with 10px padding contains controls at radius 16. Mismatched nested corners are the clearest tell of unconsidered work; getting this right is nearly free.

**Content is opaque; only chrome is glass.** Exactly two glass surfaces exist, both on the session screen — the floating rest timer and the pinned `Complete Session` bar — and they are the navigation layer, not the content layer. Home has no glass: its create action is an ordinary pill in the page flow, because nothing there needs to float over scrolling content. Glass never stacks on glass, and it never sits under a number you have to read. Anyone who has asked their OS to reduce transparency gets the identical layout on a flat opaque surface.

**Built for the gym, not the pitch deck.** Sweaty hands, bad lighting, glancing mid-set. Every choice has to hold up there.

### Brand character

| Trait | Visual expression |
|---|---|
| **Direct** | States the lift the way a lifter writes it — `185 lb × 8 reps` — not a sentence describing it. |
| **Honest** | No streaks, badges, confetti, or motivational copy. A finished set turns warm; that is the entire celebration. |
| **Fast** | Every control reachable in one tap. Nothing a workout needs is behind a menu. |
| **Legible** | Readable at arm's length, from a phone propped against a rack. |
| **Quiet** | Fully usable with the sound off and colour ignored — state is always legible from shape and fill as well as hue. |

## 2. Colour system

**Rule:** dark-mode only. The canvas is a *warm near-black*, deliberately not `#000` — pure black cannot support an elevation ladder, and it vibrates against high-contrast text.

### Palette

| Token | Value | Use |
|---|---|---|
| `--canvas` | `#0F0E0D` | The page. Warm near-black. |
| `--surface-1` | `#1C1A18` | Cards: a routine, an exercise, the empty state. |
| `--surface-2` | `#272320` | Controls nested in a card: inputs, select triggers, set rows. |
| `--surface-3` | `#332E2A` | Pressed, hovered, focused, and open menu surfaces. |
| `--surface-done` | `#3D2C22` | A completed set row. **Opaque by requirement** — see below. |
| `--ink` | `#F7F4F1` | Names and numbers. Warm off-white, never `#FFF`. |
| `--ink-2` | `#C4BEB8` | Supporting copy. |
| `--ink-3` | `#A39C95` | Units, meta, placeholders. The floor — nothing quieter than this exists. |
| `--ember` | `#FF7A2F` | The one accent. |
| `--ember-ink` | `#14100E` | Text on an ember fill. |
| `--danger` | `#FF6183` | Destructive only. |
| `--edge` | `rgba(255,255,255,0.085)` | Material edge. |
| `--edge-strong` | `rgba(255,255,255,0.18)` | Outlined controls. |
| `--glass` | `rgba(24,21,20,0.86)` | Floating chrome. |

> **Colour rules**
> - **Ember means "live or done", and nothing else.** A running rest timer, a completed set, and the action that starts work. It is never decoration.
> - **On Progress, ember is the series line.** That screen has no live or done state to claim the accent, and "at most once" includes zero (ADR 0001), so the one ember mark is the line the screen exists to show. The readout above it is `--ink`: it is information, not state. See ADR 0002.
> - **Destructive is pink-leaning on purpose.** `#FF6183` against `#FF7A2F` can never be confused at a glance, which a conventional red could be.
> - **Never put an alpha tint on a surface that has something behind it.** A completed set row sits directly above the swipe-to-delete panel; giving it `rgba(ember, 0.1)` lets the delete colour read straight through the row. That is why `--surface-done` is a pre-blended opaque value. This bug is invisible to the static screenshot audit, because the audit never renders a completed set.
> - **Contrast is measured against the real composited background**, not against the canvas. Every pair in this system clears AA at its own size, including on `--surface-done` and on glass.
> - State is never carried by hue alone: a completed set changes its surface, its ring, *and* the shape of its toggle.

## 3. Typography

**One family: `Archivo`**, self-hosted as a single `.woff2` (90 KB, latin subset) at `app/static/fonts/archivo-latin-var.woff2`, preloaded in `base.html`. There is no network at runtime, so Google Fonts `<link>` tags do not work — a new face means downloading the `.woff2`, updating `@font-face`, and updating the preload tag.

Archivo was chosen for three reasons: it carries a genuine `wdth` axis (62–125%) so the whole hierarchy comes from one file; it has true tabular figures; and it is a well-drawn grotesque that is not `Inter`, `Geist`, or `Space Grotesk` — all three of which now read as a default rather than a decision.

### Width scale

| Token | Value | Use |
|---|---|---|
| `--w-display` | `116%` | Hero title, rest timer, weight and rep numerals. |
| `--w-title` | `106%` | Exercise and routine names. |
| `--w-ui` | `100%` | Everything else. |

### Type scale

| Role | Token | Size | Weight | Use |
|---|---|---|---|---|
| Hero | `--t-hero` | 44 → 60 | 800 | The app title on home. |
| Timer | `--t-timer` | 40 → 52 | 700 | The rest-timer readout, and the Progress top-set value. One big readout per screen. |
| Page title | `--t-h1` | 28 → 34 | 750–800 | Screen titles, routine names. |
| Exercise name | `--t-h2` | 22 | 750 | Identifies the lift. |
| Numbers | `--t-num` | 30 | 700 | Weight and reps. Tabular. |
| Body / button | `--t-body` | 16 | 450–700 | Also the floor that stops iOS focus-zoom. |
| Small | `--t-sm` | 15 | 550–650 | Secondary copy, small buttons. |
| Meta | `--t-xs` | 13 | 600 | Units, chips, field labels. **The smallest size in the system.** |

### Typographic discipline

- **Every changing number gets `font-variant-numeric: tabular-nums`** plus `font-feature-settings: "tnum" 1` — the timer, weights and reps. Without it, digits shimmy as values increment.
- **Tighten display type, never loosen it.** `−0.035em` at display sizes, `−0.02em` at title sizes.
- **No uppercase transforms and no positive letter-spacing anywhere.**
- Long user-supplied strings (routine and exercise names) always get `overflow-wrap: anywhere` and a full-width line. They wrap; they are never truncated to an ellipsis.

## 4. Spacing, density & geometry

4px base scale, `--s1` … `--s12`. Page gutter `--gutter` is 16px on phones, 24px from 620px up. The content column is capped at `--shell` (560px) and centred.

### Shape & radius

| Token | Value | Use |
|---|---|---|
| `--r-card` | `26px` | Cards. |
| `--r-control` | `16px` | Controls nested in a card (26 − 10 padding). |
| `--r-chip` | `10px` | Chips, menu items, the completion box. |
| `--r-pill` | `999px` | Buttons and count chips. |

**Targets.** `--tap` is 48px and applies to every primary control. Nothing interactive is ever below 44×44 — including the set-weight and set-rep inputs, which carry the target themselves because the number *is* the control.

## 5. Surfaces & layout anatomy

**Home.** A hero title, then routines as full-width cards. Each card stacks: name on its own full-width line → a count chip → an action row with an ember `Start` filling the width and a bordered `Edit` beside it. The name having its own line is structural, not stylistic — it is what makes the layout immune to the flex-crush bug that previously squeezed routine names into a 28px box. Any flex child holding text carries `min-width: 0`. `Create Routine` is a full-width pill at the foot of the viewport: the container is a flex column at `min-height: 100dvh` and the action takes `margin-top: auto`, so it sits at the bottom when the list is short and simply follows the last card when the list is long. It is not pinned — nothing scrolls underneath it, and it still needs no bar, glass, or divider. Progress has no control at all: it is the pager's second pane, reached by sliding left (§7).

**Session.** The rest timer is a glass capsule floating over the scrolling content, not a bar occupying space above it. Each exercise is a card containing its name, its instance selector, its set rows, and a full-width ghost `+ Add Set`. The bottom bar is glass with a solid ember `Complete Session`.

**The set row** is the most important component in the app. It is a sliding surface over a parked delete panel:

```
[ 1 ]   185 lb  ×  8 reps            ( ✓ )
```

- The index is a 24px chip; the numbers are 30px extended tabular inputs; units sit on the number's baseline.
- There is **no column header**. Units travel with their own number, so nothing can drift out of sync with the rows beneath it.
- The completion target is 48×48 — the largest thing you can hit in the row.
- Completed: the surface becomes `--surface-done`, gains an ember ring, the index brightens to `--ink`, and the toggle fills ember while its corner radius morphs from a rounded square to a circle. **The numbers stay at full contrast** — a finished set is still information you need.
- The delete panel is inset 3px from the row. Sitting flush, its colour bleeds through the surface's antialiased corner arc as a one-pixel pink seam.

**Routine editor.** Each exercise is a card; its instances sit in a darker well pressed into that card, so nesting is visible rather than implied. The destructive zone is isolated at the bottom behind an in-page confirm — never a native `confirm()`.

**Progress.** Two selectors, then the current top set as a `--t-timer` readout, then the chart on a card, then one row-surface per session carrying the exact numbers. The chart is hand-drawn SVG measured in real pixels and redrawn on resize — never a scaled `viewBox`, which would smear stroke widths and axis type. It is deliberately not tappable: a dense series cannot carry 44×44 targets without lying about them, so the values live in the rows beneath it. The y-axis is not zero-based — a 0 baseline flattens every real gain — and its floor and ceiling are labelled so the scale is stated rather than implied. Axis labels and gridlines are chart furniture, not the hairline dividers §1 bans.

### Component notes

- **Buttons.** `--primary`/`--accent` = ember fill (go). `--secondary` = raised surface. `--muted` = outline. `--danger` = tinted with a pink ring. `.btn-text` is a bordered 44px pill, not bare text.
- **Custom select** replaces the native `<select>`; the chevron is drawn from borders, so there is no icon font and no request.
- **Inline errors** are tinted panels with a ring, prepended to the relevant container — never a `console.error` alone.

## 6. Iconography

Near-zero. The only marks are a drawn chevron on the select and a stroked check in the completion box. No icon font, no SVG sprite, no network request. Anything new should be drawable in CSS or a handful of path commands.

## 7. Motion

- `--dur` 180ms, `--dur-fast` 110ms, `--dur-page` 380ms (the Home ↔ Progress pane snap).
- `--ease-spring` is a `linear()` spring with a visible overshoot, used for state changes that should feel physical.
- **Shapes morph under the thumb**: `.btn:active` drops from a pill to an 18px radius and scales to 0.97; the completion box squashes to 0.88 and rounds fully. This is the one genuinely contemporary micro-interaction in the system, and it is nearly absent from the web.
- **The spring is for `transform`, not for shape.** On `border-radius` the overshoot travels past the corner it is heading for and settles back, which reads as a wobble rather than as give; the completion box therefore springs its scale and eases its radius.
- **State paints before it persists.** A completion toggle applies its class on the tap and lets the request follow. Awaiting the round trip first left the box in its un-checked square for the length of the request — a visible flash on anything slower than localhost — and made the tap feel dropped.
- **Horizontal gestures need `touch-action: pan-y pinch-zoom`** on `body`. Without it the browser claims the horizontal pan and never delivers the `pointermove` events the page swipe and the set-row swipe are built on: both work under a synthetic mouse drag and silently fail under a real finger.
- **Home and Progress are a pager, not a transition.** Both panes sit side by side on one track inside a single document; the track tracks the finger 1:1 through the drag and snaps on release. This is direct manipulation — the distinction that matters is that the pane under the thumb is the real, already-loaded thing at every point in the gesture, not a frame played back after a flick. Release commits on either distance or velocity, so a short fast flick counts — and the two directions are not priced the same: going further in asks 22% of a pane or 0.45 px/ms, coming back asks 4% or 0.12 — about a sixth of the travel, barely more than the 8px slop that claims the drag at all. That slop is the hard floor: below it the track never claims the pointer, so no threshold can commit a shorter gesture than that. Returning is the gesture you make far more often, one-handed and mid-workout, and its failure is worse: an under-shot drag back strands you on a pane you were trying to leave, while an over-eager one only shows a chart you dismiss the same way. A gesture is horizontal, vertical, or *not yet either*, and that third state carries the design: the first few pixels of a real swipe are noisy, so judging on whichever sample crosses the slop first throws away swipes that drift a little up or down on the way out. The track concedes only to vertical travel that is both substantial (36px) and decisive (1.4x the horizontal); short of that it keeps watching, which costs nothing because the pane goes on scrolling natively until the pointer is actually claimed. That bar has to be high, and the reason is the short gesture: a brief swipe covers very little horizontal ground early on, so a low give-up fires while dx is still tiny and kills exactly the quick, drifting flick that returning is meant to be. Conceding is only about when to stop watching — claiming still requires dx to out-travel dy, which a scroll never does — so waiting longer risks nothing. This is also what lets the return threshold sit as low as it does without stealing scrolls; past the first or last pane the track still moves, at 0.35 of the drag, so the end of the strip is felt rather than hit. A live drag must never carry a transition, or the transform chases the finger instead of landing on it — `.snapping` is added for the release only.
- **The pane snap has its own easing, `--ease-page`.** `--ease` spends 83% of its travel in the first third of the duration, which is right for a control moving a few pixels under the thumb and wrong for a whole screen crossing the viewport: it reads as a lurch followed by a crawl, and slowing it down only lengthens the crawl. `--ease-page` (`cubic-bezier(0.33, 1, 0.68, 1)`) spreads the same distance far more evenly — measured on the live page: 19% at 40ms, 44% at 80ms, 75% at 150ms. It is still an ease-out, because a pane released from a drag should carry the finger's motion and settle, not start from rest.
- Motion never explains something the layout already said. `prefers-reduced-motion` disables all of it.

## 8. Anti-patterns

- ❌ Uppercase, letterspaced, small, grey labels. The single most dated pattern available.
- ❌ Hairline dividers doing the work of grouping.
- ❌ Pure `#000`, or any pure `#FFF` text.
- ❌ An alpha tint on any surface that has another element behind it.
- ❌ Truncating a user's routine or exercise name.
- ❌ Glass on a content surface, or glass stacked on glass.
- ❌ Two accents. Ember is the only one; danger is not an accent, it is a warning.
- ❌ Gamification of any kind — streaks, badges, confetti, encouragement copy.
- ❌ Renaming a CSS class without grepping `app/static/js/*.js` and `app/templates/*.html` first. The JS builds DOM with these exact names.

## 9. Open decisions

- **Light mode** is not implemented. The token layer is structured so it would be a `:root` override rather than a rewrite, but the product is dark-only today.
- **Units are pounds**, hard-coded in the row label and the input's accessible name. Kilograms would need both.
- **`oklch()`** is the better authoring space for this palette (P3 headroom, predictable lightness) and is worth migrating to once the contrast tooling parses it; the values above are the sRGB equivalents.

## 10. Implementation token sheet

Authoritative source: `:root` in `app/static/css/style.css`.

```css
--canvas:#0F0E0D; --surface-1:#1C1A18; --surface-2:#272320;
--surface-3:#332E2A; --surface-done:#3D2C22;
--ink:#F7F4F1; --ink-2:#C4BEB8; --ink-3:#A39C95;
--ember:#FF7A2F; --ember-ink:#14100E; --danger:#FF6183;
--edge:rgba(255,255,255,.085); --edge-strong:rgba(255,255,255,.18);
--glass:rgba(24,21,20,.86);
--font:"Archivo"; --w-display:116%; --w-title:106%; --w-ui:100%;
--dur:180ms; --dur-fast:110ms; --dur-page:380ms;
--ease-page:cubic-bezier(.33,1,.68,1);
--r-card:26px; --r-control:16px; --r-chip:10px; --r-pill:999px;
--tap:48px; --shell:560px; --gutter:16px;
```

### Implementation checklist

- [ ] Every screen works at 390px with no horizontal scrolling.
- [ ] Every interactive element is ≥44×44.
- [ ] Every text/background pair clears AA **against its real composited background** — including completed set rows and glass.
- [ ] No uppercase or letterspaced labels; nothing below 13px.
- [ ] Nested radii follow `inner = outer − padding`.
- [ ] Changing numbers use tabular figures.
- [ ] No surface with alpha sits above another element.
- [ ] `prefers-reduced-motion` and `prefers-reduced-transparency` both degrade cleanly.
- [ ] Tests pass and coverage stays ≥90%.

### Source scope

`app/static/css/style.css` is the only stylesheet. `app/templates/*.html` carry structure; `app/static/js/*.js` build DOM using the class names above and must be updated in lockstep with any rename.

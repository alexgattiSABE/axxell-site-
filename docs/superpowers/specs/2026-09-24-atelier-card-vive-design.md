# Atelier: live cards, no overlaps (design)

**Date:** 2026-09-24 · **Branch:** `atelier-card-vive` (from `f869d0a`, origin/atelier-effetti-sottocostellazione) · **Page:** `atelier/capitoli.html`
**Approved by Nicolò (Nike)** in chat on 2026-09-24, from screenshots of the page.

## Goal

The effects page (7 glass cards on the DNA helix) must become a showcase a client can use directly:
nothing overlaps, every card works and moves on its own, and every card reads like a small landing page.

## What Nike asked for (his words, summarised)

1. "No overlaps of any kind." The card in front looked like it was behind the DNA.
2. The DNA must not disappear while scrolling.
3. The captions at the bottom stay fixed in front, but their grays must become readable.
4. Cards must not touch each other.
5. Remove the click that opens the detail pages: the client interacts directly with the preview.
6. Card 2: the animation doesn't work. Card 3: fix the format. Card 4: the animation isn't visible, make it automatic.
   Card 5: add the copy plus the "cryptography" effect that already exists in atelier.
   Card 6: faster, and remove the background tunnel.
7. Add landing-page copy to every card. Watch spacing, overlaps and colours.
8. Evocative titles.
9. The index on the left gets bigger and its title becomes "ESPLORA IL MONDO".

**Assumption (stated to Nike, approved):** every card starts on its own when it is in front, and the mouse adds interaction.
He asked for this explicitly on cards 4 and 6.

## Root causes found (read-only investigation)

- **DNA over the card:** the helix lives on its own canvas (`#helixStage`, z-index 2) above the stage.
  The old hole in its mask was an axis-aligned rectangle, opened only when the card was dead frontal (`_frac < 0.10`).
- **DNA vanishing during scroll:** caused by the first fix from this session. `bucoElica()` swaps a
  `data:image/svg+xml` `mask-image` every frame while the cards move. The browser decodes it asynchronously,
  and an unready mask counts as fully transparent.
- **Overlapping cards:** with `deckScale = 1` and `climb = 0.85` the neighbours u=±1 project almost entirely
  inside the front card. A projection brute force found a working setup: `climb ≈ 2.2`,
  `deckScale(u) = 1 − 0.45·min(1,|u|)`.
- **Card 2, sneaker:** `js/sneaker.js` is never loaded by `capitoli.html` and has no `WC.effects.sneaker` handle.
  The card only ever shows its poster.
- **Card 3, orologio:** the 80 frames are 660×814 portraits on white. `draw()` does contain-fit after `clearRect`,
  so the transparent side bands show the blurred poster.
- **Card 4, vesper:** in the card `progressTarget` stays 0, so only the orb shows, and it moves only with the mouse.
  The orb → galaxy → brain sequence was scroll-driven in `capitoli-legacy.html`. The 2.9 s intro dolly starts nearly empty.
- **Card 6, warp:** a 26 s loop with no yoyo restarts from the tunnel phase (0–0.132) every time.
  The canvas has alpha 0, so the tunnel poster shows through.
- **Scramble effect:** `js/headings.js:47-80` uses GSAP ScrambleTextPlugin (`vendor/ScrambleTextPlugin.min.js`,
  registered in `js/core.js:77`). It is not loaded in `capitoli.html` today.
- **Interaction blocked:** `#stage-live` has `pointer-events:none`. The window `click` raycasts onto the card and calls `enter()`.
  The window `pointerdown/move` start a drag spin that freezes the effect.

## Design

### A. Page and movement

1. **Helix cut-out without a mask image.** Replace the SVG `mask-image` with `clip-path: path(nonzero, "...")`, written every frame.
   - The path is a full-screen rectangle plus the outline of each card in front of the helix axis, wound opposite to the rectangle, so the winding inside a card is zero and the helix is cut there. Overlapping outlines would repaint (winding −1). That is safe because point 3 guarantees that cards never overlap.
   - It is synchronous (Safari 13.1+, Chrome 88+), so there is no decode and no flicker. `path()` coordinates are CSS px of the border box, which here is the viewport (`fixed; inset:0`).
   - The rule stays the same: cut only the cards with `z > −R` and `uReveal ≥ 0.3`, using the real rounded outline projected by the scene camera.
   - During the entrance (`body.-entra`, translateY 42px), subtract the element's live offset (`getBoundingClientRect().top`) from the y coordinates.
   - Write the path only when it changes (the key includes W×H). Measure the Safari frame cost in verification.
2. **Captions stay fixed in front** (Nike: "those stay fixed in front").
   - The hint (currently .34 alpha, 10.5px), `.fsub` (.55), `.counter i/.tot` (.34/.5) and `#dots` (.26) go to at least .72 alpha.
   - The hint goes up to 12px or more. All caption text stays at 11px or more.
   - The hint text becomes "scorri per cambiare mondo · usa l'anteprima" (mobile: "scorri fuori · tocca l'anteprima", 12px, one line at 390px).
3. **No card touches another** (checked at u = −1, 0, +1 and at mid-transition u = ±0.5, on 1440×900 and 390×844).
   - Start from `TUNE.climb = 2.2` and `deckScale(u) = 1 − 0.45·min(1,|u|)`.
   - Then adjust `yTop`/`climb`/`deckFade` so the neighbours do not sit under the bottom caption or the nav.
   - A neighbour that cannot fit fades out (`deckFade`) instead of overlapping.
   - Portrait keeps its own `helixTune()` factors, re-verified.
4. **Index on the left:** title "ESPLORA IL MONDO", about 1.5× the current size.
   - One row per card, showing the 7 new titles. The 5 type rows go.
   - A row lights up when its card is in front. Clicking a row brings that card in front: `pickRiga` returns the card index (0..6), and the `CLUSTERS.length`/`primoDelCluster` paths go.
   - The canvas grows (IW/IH) so 7 rows plus the title fit without clipping, and the mesh is scaled with it.
   - The index moves out of every card's footprint. It is part of the no-overlap check (point 3), including u=−1 top-left and portrait.
   - Behind the glass it is no longer refracted by any card, because no card crosses it. That keeps "no overlaps of any kind" true.
   - The legibility floor of point 2 applies here too.
5. **No navigation.** Remove the click → `enter()` → `location.href` path, `prefetch`, zoom fly-in, `#world` overlay,
   `popstate`/deep link/`CAME_FROM`, the pointer cursor on the front card, and `EFFETTI[j].page`.
   - Clicking a side card still brings it in front (`portaDavanti`).
   - Keyboard: the arrows still change card. Enter does nothing on the front card (no `enter()`), and Escape has nothing to close.
   - `capitoli-legacy.html` and its rewrite stay as they are (not linked from this page any more).
6. **Direct interaction.**
   - `#stage-live` gets `pointer-events:auto` and `touch-action:none` while an effect is awake. Without `touch-action`, a swipe on the preview would scroll the page natively and cancel the pointer.
   - The camera parallax (window `pointermove`, capitoli.html ~1421) freezes while the pointer is over the preview, so the card does not slide under the cursor.
   - Window `pointerdown/move/click` handlers ignore events whose target is inside `#stage-live`, so a drag on the preview never spins the deck.
   - The wheel still changes card from anywhere, including over the preview.
   - Keyboard arrows keep working.
   - On touch, a swipe on the preview belongs to the effect. A swipe elsewhere changes card.

### B. The seven cards

Each card keeps its module. Each effect runs on its own when woken, and the pointer adds interaction on top.

**Module rule:** `capitoli-legacy.html` loads the same `js/*.js` files. Every change to a module lives in its `external` branch (the `WC.effects.<id>` handle used by the card) or behind a flag set by that branch. The legacy scroll-pinned versions must behave exactly as before.

| # | id | New title | Fix |
|---|---|---|---|
| 1 | altitude | **Vapore** | Automatic stirring: an invisible "phantom pointer" on a slow Lissajous path feeds the fluid when the real mouse is still for more than 1.5 s. |
| 2 | sneaker | **Gravità** | Add a `WC.effects.sneaker` handle following the existing pattern: create the host once, `container.appendChild(host)` on every `start`, `stop` only pauses, `resize` no-op. Muted looping `<video>` with `muted` + `playsinline` set before `src`, webm listed before mp4, poster `assets/sneaker-poster.webp`, `object-fit:cover`. Load `js/sneaker.js` in `capitoli.html`. |
| 3 | orologio | **Anatomia** | Fill the whole card: paint the canvas with the frames' white (sampled from frame 1), then contain-fit the watch shifted to the right half of the card, so there are no transparent bands and the left side stays free for the copy (dark text on white). |
| 4 | vesper | **Nebulosa** | Inside the `mountVesper` external branch, an automatic looping driver (GSAP, yoyo, played and paused like warp's `extTl`) moves `progressTarget` over the 0..4 clock: orb → galaxy → brain in about 18 s. The brain phase starts only once `brain-mesh.bin` has loaded; until then the yoyo turns back at the galaxy. A shorter intro, in the external branch only, shows something within about 0.5 s. The mouse keeps its bulge and sway. |
| 5 | saucer | **Contatto** | Landing copy whose headline plays the scramble effect each time the card settles in front. Load `vendor/ScrambleTextPlugin.min.js` before `js/core.js` (core registers it only if present). No SplitText: the headline is two fixed `<span>` lines with `white-space:nowrap`, and each line scrambles separately (stagger 0.22 s, `chars:'upperAndLowerCase'`, speed 0.5, revealDelay 0.15), so line breaks never jump. |
| 6 | warp | **Genesi** | The driver skips the tunnel: it plays from after `phaseMorphOut` (lower bound read from CONFIG, about 0.37, where the particles have already become the helix) to 1, yoyo, in about 12 s (was 26 s). On `start`, `scroll = scrollTarget` so the damping never flies through the tunnel. The particles stay (they ARE the helix and the forms). The clear colour becomes opaque, so the tunnel poster no longer shows through. |
| 7 | lithos | **Rivela** | Hybrid mode in the external branch: the pointer listener is always attached, and the frame loop follows the pointer while it has moved in the last 1.5 s, otherwise the Lissajous path (blended, no jump). The `auto` flag set at mount keeps working for touch and reduced motion. |

The posters (`assets/effetti/<id>.webp`) must match what each live effect shows first.
New posters are captured from the live effect for cards 2, 3, 4 and 6 (sneaker, orologio, vesper, warp), so the switch from poster to live has no jump.

### C. Landing copy inside each card

- **Layer:** its own fixed DOM layer `#lp`, outside `#stage-live` (whose children are hidden by `soloQuestoSiVede()` and which is `hidden` while nothing is awake). It sits above `#stage-live`, is positioned every frame from the front card's rect (the same `misura` used by `place()`), and is `pointer-events:none` so the preview underneath stays interactive.
  - It shows only for the front card, on the poster as well as on the live effect, so it is also there while scrolling settles and under reduced motion.
  - It fades out while the front card is more than ~0.15 of a turn off-centre, and it fades in again when the next card settles.
- **Layout:** it sits in the left 42% of the card, vertically centred.
  - A soft scrim runs behind it (a linear gradient from the effect's background colour to transparent, never a coloured glow).
  - It contains: a small kicker (the card's type), a headline (serif display face already used in atelier, clamp at about 22–40px relative to the card width), one line of subtext (12px or more), and one ghost button.
  - The button is decorative, scrolls nothing and navigates nowhere. It is a `<span role="presentation">`, not a link.
- **Rules:** the centre of the animation stays clear. Text never overlaps text, and no text overlaps the card edge (padding of at least 6% of the card width).
  - Contrast is 4.5:1 or better on its scrim.
  - Card 3 uses dark text (white background). The others use light text.
  - Portrait (front card narrower than about 420px): the copy moves to a band along the bottom of the card, full width, headline only (about 18px, 2 lines at most) plus the button. The kicker and the subtext are hidden.
- **Copy (Italian, final unless Nike edits):**

| # | Kicker | Headline | Subtext | Button |
|---|---|---|---|---|
| 1 Vapore | Fluidi | Il cielo si piega dove passi. | Una simulazione di fluido che segue il cursore, in tempo reale. | Muovi il mouse |
| 2 Gravità | Immagini animate | Ogni passo, sospeso. | Il prodotto che fluttua e gira da solo, come in uno spot. | Guarda |
| 3 Anatomia | Immagini animate | Dentro ogni dettaglio. | L'orologio si apre pezzo per pezzo, senza un fotogramma fuori posto. | Esplora |
| 4 Nebulosa | Modelli interattivi | Da una sfera, una galassia. Da una galassia, un'idea. | Ventimila punti che cambiano forma e rispondono al tuo gesto. | Avvicinati |
| 5 Contatto | Modelli interattivi | Quarantamila fili d'erba. Uno solo è stato scelto. | Una scena 3D che risponde a chi la guarda. | Scopri |
| 6 Genesi | Testo | Tutto comincia da un'elica. | Particelle che si ricompongono in forme sempre nuove. | Osserva |
| 7 Rivela | Prima / dopo | La luce racconta il prima e il dopo. | Passa sopra l'immagine e scopri com'era. | Illumina |

- The bottom caption shows the new title (`fName`) and the kicker (`fSub`).
- Cards keep their cluster colours. The ghost button border and the kicker use the card colour.

### D. Constraints (from earlier plans, still binding)

- No external hosts except Google Fonts. Three r128 UMD global. Only one effect animating at a time (the controller enforces this; stopped modules keep their renderers alive, and that stays as it is).
- Scene tints go through CONFIG, never shader edits.
- Reduced motion: no effect wakes (already enforced); the landing copy shows statically on the poster.
- Do not touch `capitoli-legacy.html`, the chapter folders (`il-viaggio/`, `la-macchina/`, …), or the robot homepage.

## Verification

Playwright screenshots (Chromium from `~/Library/Caches/ms-playwright/chromium-1243`, driver in `~/Progetti/axxell-chatbot/node_modules/playwright`), at 1440×900 and 390×844:

1. For each of the 7 cards in front: a still frame, then 2 s later, to check the effect moves on its own (pixel diff > threshold).
2. During the transition (wheel, capture at 150 ms): the helix is visible (non-zero cyan pixels in the helix column above and below the card).
3. Intersection check of the projected card outlines (the real quads, not their bounding boxes) plus the index rect and the caption rect, read through `page.evaluate`, at rest and at u=±0.5: zero intersection.
4. Clicking and dragging on the preview does not change `spin` and does not navigate. The URL is unchanged.
5. No console errors except the known 404s.

## Out of scope

Merge to `main` and pushing: both need Nike's explicit OK, and he must first be told which account and repo.

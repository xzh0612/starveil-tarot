# Live poster + curved fan acceptance — 2026-09-12

## Delivered
- Unified original room/witch/table illustration, visitor and downward gaze states.
- Real-time shader: masked hair/fabric movement, robe shimmer, candle illumination, pointer-interactive dust. Head-only crossfade keeps scene and hands stable. No skeletal or hand-grabbing claim.
- All 78 fixed deck entries retained; curved overlapping ribbon replaces grid. Pointer drag, inertia, wheel, arrow buttons, range/keyboard, hover lift, central extraction and flip.
- Responsive full-screen 1440×900 and 390×844 inspected, no document scrolling at checked sizes.
- Old assets/models and renderer retained; current card artwork/meanings, selection RNG and archive formats unchanged.

## Verification
- Production build passes. Existing Vite >500 kB JS warning remains (~958 kB uncompressed).
- `node --test frontend/tests/*.test.mjs`: 15 passed.
- Separate Playwright CLI session: dragging changes slider and selects zero cards; Home/End reach both ends; keyboard picks index 0, pointer picks index 77, keyboard picks index 1. Three distinct cards selected; 3/3 completion; all three flip; gaze table state confirmed.
- Main preview: mouse extraction works; desktop and mobile fan inspected; extracted cards positioned below fingertips on velvet. Existing archive restored as current session after preview testing, then returned to home; no QA archives saved.
- Motion pause: two successive canvas screenshots byte-identical; after enabling, successive screenshots differ.
- Console: no observed application/runtime/shader error; pre-existing favicon.ico 404 only.

## Evidence
- `../../output/playwright/poster-fan-desktop.png`
- `../../output/playwright/poster-fan-mobile.png`
- `../../output/playwright/poster-reading.png`

## Extension seams
`PosterScene.jsx` exports pose assets, consumes action/view/motion/particles and uses existing gaze resolver. Additional pose artwork or a future animation backend can replace this adapter. `FanDeck.jsx` only reports an original deck index through onDraw; it never shuffles the session.

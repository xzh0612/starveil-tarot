# Prototype Instructions

## Confirmed user direction

- Web-only full-screen single-page experience; no document-level scrolling. Long text can scroll inside a reader panel.
- Muted violet starry Gothic chamber, faceless female hooded witch above a table, interactive particles, fixed 78-card artwork.
- Use actual 3D model assets for the witch. First version may use basic object motion, but preserve GLB and named animation interfaces for later skeletal animation.
- Desktop draw: 6 rows × 13 columns, all cards simultaneously visible, no overlap. Narrow screens rearrange to 13 rows × 6 columns.
- User authorizes asset generation, modeling, and implementation; user reviews concrete iterations. Never claim exact concept-art fidelity unless browser comparison verifies it.
- Latest user direction supersedes Nyx v2: use a beautiful young adult female illustrated character inspired by premium Honor of Kings promotional art. Default is the v3 live cutout with silver-lavender hair, flowing hood/robe, local fabric motion and garment particles. The rejected procedural 3D model stays archived, not the default. Describe illustration motion honestly; do not claim skeletal facial animation or cloth physics.
- Latest scene feedback: retain approved female identity and clothing, but use seated waist-up illustrations across the table. Viewer-facing gaze for conversation, downward gaze for card selection/reveal, resting hands near tabletop. Avoid a full-body character standing on a stage. Foreground tabletop and pose composition must be checked together, including 78-card and responsive layouts.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

- 2026-09-12 confirmed: replace default witch with a unified illustrated live poster (witch seated behind a visibly textured lavender velvet table), local hair/robe motion and gaze-state transitions. Keep prior models archived.
- Latest card selection supersedes ALL previous grid requirements: overlapping curved horizontal fan/ribbon of 78 fixed cards, drag/scroll to browse, hover lifts, click extracts to central tabletop. No full 78-card grid. No document scrolling.

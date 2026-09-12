# Nyx v4 · Seated conversation / table gaze

Built-in imagegen edit of approved `witch-moonlit-v3.png`, 2026-09-12. Final atlas: `witch-seated-v4.png`, two equal horizontally arranged square frames. Left faces visitor; right looks down at cards. Original output retained at `/Users/yzh/.codex/generated_images/01a0940b-4687-7723-88bb-7cca11f99d4d/exec-61b167ce-5c12-4192-aeda-f0e3f18910f8.png`.

Direction: preserve recognizable youthful face, silver-lavender hair, violet eyes, plum hood, silver embroidered gown and crescent jewelry. Replace full-length standing pose with waist-up seated view across a table, shoulders relaxed, forearms forward, hands resting palm-down. Align body, hands and camera across both states. Left gaze meets viewer; right chin lowers about 12 degrees toward the cards. No room, table, chair, labels or particles in the asset.

Initial two generation attempts produced baked checkerboard backgrounds, not real transparency, and were not shipped. Final edit requests a uniform chroma-green background while preserving both characters. `SeatedWitch.js` removes green in the live shader and suppresses edge spill. Source is RGB, not falsely labeled as an alpha PNG.

Runtime uses pose blending, subtle upper-cloth/hair displacement with contact-area suppression, garment shimmer and table contact shading. `witch-staging.js` maps UI state to gaze and tabletop framing. No claim of continuous physical head rotation, eye tracking, hand IK or actual finger-to-card contact.

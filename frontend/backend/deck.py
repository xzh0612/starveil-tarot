"""Deck, spread and guide data for the Starveil reading agent.

This is the Python side of `frontend/src/domain.js`. The frontend stays the
single source of truth: `scripts/export-domain-json.mjs` evaluates the JavaScript
data modules and writes `backend/data/starveil-domain.json`, and
`src/data/card-references.json` is already JSON and is read in place.

Run `node scripts/export-domain-json.mjs` after editing any `src/data/*-guides.js`
file, then `node scripts/export-domain-json.mjs --check` to confirm the snapshot
is current (a pytest case does the same check).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_PACKAGE_DIR = Path(__file__).resolve().parent
_DOMAIN_SNAPSHOT = _PACKAGE_DIR / "data" / "starveil-domain.json"
_REFERENCES_FILE = _PACKAGE_DIR.parent / "src" / "data" / "card-references.json"


def _load(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


_domain = _load(_DOMAIN_SNAPSHOT)

#: Fixed deck identity, mirrored from `DECK_VERSION` in `src/domain.js`.
DECK_VERSION: str = _domain["deckVersion"]

#: Editorial guide revision, mirrored from `GUIDE_VERSION` in `src/data/card-guides.js`.
GUIDE_VERSION: str = _domain["guideVersion"]

#: All 78 cards in deck order, each with id/name/group/key/area/image/upright/reversed.
CARDS: list[dict[str, Any]] = _domain["cards"]

#: Card lookup by id, matching `cardById` in `src/domain.js`.
CARD_BY_ID: dict[str, dict[str, Any]] = {card["id"]: card for card in CARDS}

#: The nine catalog spreads in catalog order, matching `spreads` in `src/domain.js`.
SPREADS: list[dict[str, Any]] = _domain["spreads"]

#: Editorial guides by card id: symbolism/upright/reversed/relationships/work/question.
CARD_GUIDES: dict[str, dict[str, str]] = _domain["cardGuides"]

#: Historical and modern reference records, read from the frontend data directory.
CARD_REFERENCES: Any = _load(_REFERENCES_FILE)

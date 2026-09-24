#!/usr/bin/env node
// Exports the JavaScript domain data into a JSON snapshot the Python agent can read.
//
// The single source of truth stays src/domain.js and src/data/*-guides.js. This
// script only evaluates those modules and writes the result, so the frontend is
// never edited to serve the Python port.
//
//   node scripts/export-domain-json.mjs           # write the snapshot
//   node scripts/export-domain-json.mjs --check   # fail if the snapshot is stale
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DECK_VERSION, cards, spreads } from "../src/domain.js";
import { GUIDE_VERSION, cardGuides } from "../src/data/card-guides.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "backend", "data", "starveil-domain.json");

function build() {
  return {
    deckVersion: DECK_VERSION,
    guideVersion: GUIDE_VERSION,
    cards: cards.map((card) => ({
      id: card.id,
      name: card.name,
      group: card.group,
      key: card.key,
      area: card.area,
      image: card.image,
      upright: card.upright,
      reversed: card.reversed,
    })),
    spreads: spreads.map((spread) => ({
      id: spread.id,
      name: spread.name,
      description: spread.description,
      positions: [...spread.positions],
    })),
    cardGuides: Object.fromEntries(
      Object.entries(cardGuides).map(([id, guide]) => [
        id,
        {
          symbolism: guide.symbolism,
          upright: guide.upright,
          reversed: guide.reversed,
          relationships: guide.relationships,
          work: guide.work,
          question: guide.question,
        },
      ]),
    ),
  };
}

const serialized = JSON.stringify(build(), null, 2) + "\n";

if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : null;
  if (current !== serialized) {
    console.error("starveil-domain.json is stale. Run: node scripts/export-domain-json.mjs");
    process.exit(1);
  }
  console.log("starveil-domain.json is up to date");
} else {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, serialized);
  const snapshot = JSON.parse(serialized);
  console.log(
    `Wrote ${path.relative(root, target)}: ${snapshot.cards.length} cards, ` +
      `${snapshot.spreads.length} spreads, ${Object.keys(snapshot.cardGuides).length} guides`,
  );
}

import { majorRows } from './major-guides.js';
import { wandsRows } from './wands-guides.js';
import { cupsRows } from './cups-guides.js';
import { swordsRows } from './swords-guides.js';
import { pentaclesRows } from './pentacles-guides.js';

export const GUIDE_VERSION = 'rws-editorial-2026-09-12';
export const cardGuides = Object.fromEntries(
  [...majorRows, ...wandsRows, ...cupsRows, ...swordsRows, ...pentaclesRows].map(
    ([id, symbolism, upright, reversed, relationships, work, question]) =>
      [id, { symbolism, upright, reversed, relationships, work, question }],
  ),
);

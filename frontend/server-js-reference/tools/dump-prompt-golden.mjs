#!/usr/bin/env node
// Migration tool — dumps byte-exact prompts built by the reference implementation.
//
// The Starveil agent was ported from JavaScript to Python. Prompt assembly is the
// single most drift-prone part of that port, so this script freezes what the
// reference produced into a golden snapshot that the Python suite then has to
// reproduce character for character.
//
//   node server-js-reference/tools/dump-prompt-golden.mjs
//
// writes backend/tests/fixtures/prompt-golden.json
//
// This script lives inside server-js-reference/ on purpose: that directory is the
// preserved Oracle, and it is deleted as one unit once the port is trusted.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DECK_VERSION, cardById, spreads } from "../../src/domain.js";
import { buildReadingMessages } from "../readings.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const target = path.join(root, "backend", "tests", "fixtures", "prompt-golden.json");

const deckIds = Object.keys(cardById);
const spreadById = (id) => spreads.find((spread) => spread.id === id);

function cardsFor(spreadId, offset = 0) {
  const spread = spreadById(spreadId);
  return spread.positions.map((position, index) => ({
    id: deckIds[(index * 7 + offset) % deckIds.length],
    reversed: index % 2 === 0,
    position,
  }));
}

function cardsForSpread(spread) {
  return spread.positions.map((position, index) => ({
    id: deckIds[(index * 5 + 3) % deckIds.length],
    reversed: index % 2 === 1,
    position,
  }));
}

function catalogSpread(id) {
  const spread = spreadById(id);
  return { id: spread.id, name: spread.name, description: spread.description, positions: [...spread.positions] };
}

function turn(index, text) {
  return { role: index % 2 === 0 ? "user" : "assistant", text };
}

function historyOf(turns, size) {
  const text = "这是一段用于填充历史长度的对话内容，包含牌面观察与现实信息。".repeat(Math.ceil(size / 26));
  const messages = [];
  for (let i = 0; i < turns; i++) messages.push(turn(i, `${i}:${text}`));
  return messages;
}

const cases = [
  {
    name: "three-card first reading",
    body: {
      question: "我最近的工作状态该如何调整？",
      cards: cardsFor("three"),
      spread: catalogSpread("three"),
      messages: [],
      memories: [],
      usePersonalMemory: false,
      deckVersion: DECK_VERSION,
    },
  },
  {
    name: "three-card reading with short history",
    body: {
      question: "我最近的工作状态该如何调整？",
      cards: cardsFor("three"),
      spread: catalogSpread("three"),
      messages: historyOf(5, 400),
      memories: [],
      usePersonalMemory: false,
      deckVersion: DECK_VERSION,
    },
  },
  {
    name: "follow-up turn with prior assistant",
    body: {
      question: "那我现在应该先做哪一步？",
      cards: cardsFor("three"),
      spread: catalogSpread("three"),
      messages: [
        { role: "user", text: "我最近的工作状态该如何调整？" },
        { role: "assistant", text: "牌面显示你正在收尾一个阶段，建议先整理手头的事项。" },
      ],
      memories: [],
      usePersonalMemory: false,
      deckVersion: DECK_VERSION,
    },
  },
  {
    name: "twelve-card year spread",
    body: {
      question: "未来一年我该关注哪些主题？",
      cards: cardsFor("year", 2),
      spread: catalogSpread("year"),
      messages: [],
      memories: [],
      usePersonalMemory: false,
      deckVersion: DECK_VERSION,
    },
  },
  {
    name: "single-card guidance",
    body: {
      question: "此刻我最需要看见什么？",
      cards: cardsFor("one", 9),
      spread: catalogSpread("one"),
      messages: [],
      memories: [],
      usePersonalMemory: false,
      deckVersion: DECK_VERSION,
    },
  },
  {
    name: "custom spread",
    body: {
      question: "这段关系里我的需求是什么？",
      cards: [
        { id: deckIds[4], reversed: false, position: "内在" },
        { id: deckIds[41], reversed: true, position: "外在" },
        { id: deckIds[70], reversed: false, position: "行动" },
      ],
      spread: { id: "custom", name: "内外三张", description: "自定义牌阵", positions: ["内在", "外在", "行动"] },
      messages: [],
      memories: [],
      usePersonalMemory: false,
      deckVersion: DECK_VERSION,
    },
  },
  {
    name: "history compaction under pressure",
    body: {
      question: "我该如何看待现在的进展？",
      cards: cardsFor("three"),
      spread: catalogSpread("three"),
      messages: historyOf(30, 3_000),
      memories: [],
      usePersonalMemory: false,
      deckVersion: DECK_VERSION,
    },
  },
  {
    name: "personal memory enabled",
    body: {
      question: "做重要决定前我该如何安排自己？",
      cards: cardsFor("three", 6),
      spread: catalogSpread("three"),
      messages: [],
      memories: [
        { id: "m1", text: "我会先独处整理思绪，再做决定。", enabled: true },
        { id: "m2", text: "我习惯把工作安排写下来。", enabled: true },
        { id: "m3", text: "我希望在下班后不再处理工作消息。", enabled: false },
      ],
      usePersonalMemory: true,
      deckVersion: DECK_VERSION,
    },
  },
  {
    name: "high-stakes professional boundary",
    body: {
      question: "我该不该把积蓄都投进这只基金？",
      cards: cardsFor("choice", 1),
      spread: catalogSpread("choice"),
      messages: [],
      memories: [],
      usePersonalMemory: false,
      deckVersion: DECK_VERSION,
    },
  },
  {
    name: "perspective boundary",
    body: {
      question: "他心里还在想我吗？",
      cards: cardsFor("love", 3),
      spread: catalogSpread("love"),
      messages: [],
      memories: [],
      usePersonalMemory: false,
      deckVersion: DECK_VERSION,
    },
  },
  {
    name: "debug diagnostics included",
    body: {
      question: "这份工作还值得继续吗？",
      cards: cardsFor("career", 5),
      spread: catalogSpread("career"),
      messages: [],
      memories: [],
      usePersonalMemory: false,
      deckVersion: DECK_VERSION,
    },
  },
  {
    name: "spread with an unknown position",
    body: {
      question: "我该怎么理解这个阶段？",
      cards: cardsForSpread({ positions: ["起点", "转折", "落点", "余波"] }),
      spread: { id: "custom", name: "四段", description: "自定义四段牌阵", positions: ["起点", "转折", "落点", "余波"] },
      messages: [],
      memories: [],
      usePersonalMemory: false,
      deckVersion: DECK_VERSION,
    },
  },
];

const snapshot = [];
for (const item of cases) {
  const options = { includeRetrievalDiagnostics: item.name === "debug diagnostics included" };
  const messages = buildReadingMessages(item.body, options);
  snapshot.push({
    name: item.name,
    includeRetrievalDiagnostics: options.includeRetrievalDiagnostics,
    body: item.body,
    expected: {
      messages,
      promptChars: messages.reduce((total, message) => total + String(message.content ?? "").length, 0),
    },
  });
}

mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify({ promptVersion: "nyx-prompt-v47", cases: snapshot }, null, 1) + "\n");
console.log(`Wrote ${path.relative(root, target)} with ${snapshot.length} cases`);
for (const item of snapshot) {
  console.log(`  ${item.expected.promptChars.toString().padStart(6)} chars  ${item.name}`);
}

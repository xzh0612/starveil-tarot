# Active Question Relevance Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a grounded but generic answer from passing validation when it does not address an explicit relationship, career, or reflection topic in the current question.

**Architecture:** Derive a small set of explicit domain terms from the already validated `activeQuestion`, pass that contract into the same parser used for the initial response and bounded repair, and reject only when a routed domain exists and the top-level response text does not mention any of its concrete terms. Keep open or choice-only questions compatible by skipping this gate when no explicit domain term is present.

**Tech Stack:** Node.js ESM, existing deterministic RAG/parser, Node test runner, Markdown documentation.

**Spec:** The user’s RAG/Prompt optimization request and the active Starveil evidence contract.

## Global Constraints

- Fixed card meanings remain authoritative; this gate checks relevance, not whether tarot can verify facts.
- Do not send retrieval diagnostics or new user data to DeepSeek.
- Preserve the single bounded repair request and stable parser error codes.
- Every completed change must pass the local suite, build, audit, and GitHub Actions.

---

### Task 1: Define the question relevance contract

**Files:**
- Modify: `frontend/server/reading-rag.mjs`
- Test: `frontend/tests/reading-rag.test.mjs`

**Interfaces:**
- Add `questionRelevanceTerms(question)` as an internal deterministic helper.
- Extend `parseReadingOutput` options with `activeQuestion` and `requireQuestionRelevance`.
- Reject with the stable message `当前回答没有直接回应本轮问题，请重试。` when an explicit domain is present but no question term is shared by top-level `text`.

- [x] **Step 1: Write the failing test**

```js
test('rejects a grounded response that does not answer the explicit question domain',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我该如何处理这段关系？',cards:[card]});
 const output=JSON.stringify({text:'继续保持稳定节奏并记录一次行动。',actions:[]});
 assert.throws(()=>parseReadingOutput(output,{cards:[card],evidence,activeQuestion:'我该如何处理这段关系？',requireQuestionRelevance:true,requireTextSupport:true,isFollowUp:true}),/没有直接回应本轮问题/);
});
```

- [x] **Step 2: Run the focused test and confirm it fails**

Run: `node --test frontend/tests/reading-rag.test.mjs --test-name-pattern="直接回应本轮问题"`

Expected: FAIL because the parser does not yet accept the new option or error.

- [x] **Step 3: Implement the minimal relevance check**

Use explicit relationship, career, and reflection words already recognized by `analyzeReadingQuestion`; intent words such as `如何` and `会不会` are never used as topic terms. When one or more domains are active, require at least one term from every active domain and accept any term from that domain's vocabulary so synonyms such as `考试` and `学习` remain compatible; leave questions without an explicit domain unchanged.

- [x] **Step 4: Run the focused test and the RAG tests**

Run: `node --test frontend/tests/reading-rag.test.mjs`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/server/reading-rag.mjs frontend/tests/reading-rag.test.mjs
git commit -m "feat: guard answers against off-topic text"
```

### Task 2: Wire the contract into Prompt, repair, and evaluation

**Files:**
- Modify: `frontend/server/readings.mjs`
- Modify: `frontend/server/reading-eval.mjs`
- Modify: `frontend/tests/readings.test.mjs`
- Modify: `frontend/tests/reading-eval.test.mjs`
- Modify: `frontend/server/README.md`
- Modify: `README.md`

**Interfaces:**
- Pass `activeQuestion` and `requireQuestionRelevance: true` to the initial and bounded-repair parser options.
- Add a Prompt rule stating that top-level `text` must directly answer an explicit active-question domain.
- Map the stable validation message to `question_relevance` and include the same rule in the offline Prompt contract/evaluation.

- [x] **Step 1: Write the failing middleware/evaluation assertions**

Assert that the Prompt contains the relevance rule, that the repair code maps `当前回答没有直接回应本轮问题` to `question_relevance`, and that a valid relationship fixture includes the relationship term in its top-level text.

- [x] **Step 2: Implement wiring and docs**

Keep the existing evidence and repair boundaries unchanged; only add the active-question contract and version the Prompt to `nyx-prompt-v33`.

- [x] **Step 3: Run all verification commands**

```bash
node --test frontend/tests/*.test.mjs
npm --prefix frontend run eval:reading
npm --prefix frontend run build
npm --prefix frontend audit --omit=dev
git diff --check
```

Expected: all tests pass, all four evaluation scores are 100, build succeeds, audit reports 0 vulnerabilities, and diff check is clean.

- [x] **Step 4: Commit and push**

```bash
git add README.md frontend/server/README.md frontend/server/readings.mjs frontend/server/reading-eval.mjs frontend/tests/readings.test.mjs frontend/tests/reading-eval.test.mjs docs/superpowers/plans/2026-09-16-active-question-relevance.md
git commit -m "feat: wire active question relevance into reading contract"
git push origin codex/tarot-first-version
```

- [x] **Step 5: Verify remote CI and synchronization**

Run the new GitHub Actions workflow with `gh run watch --exit-status`, then confirm `git status --short` is empty and `git rev-list --left-right --count HEAD...origin/codex/tarot-first-version` returns `0 0`.

"""Byte-level prompt parity against the preserved JavaScript implementation.

`fixtures/prompt-golden.json` was produced by
`server-js-reference/tools/dump-prompt-golden.mjs`, which ran the original Node
implementation over 12 request shapes and recorded the exact message list it
built. Prompt assembly is the most drift-prone part of the port — it embeds
retrieval scores, evidence ordering and three separate compaction budgets — so it
is pinned here character for character rather than spot-checked.

Regenerate the snapshot (only while `server-js-reference/` still exists):

    node server-js-reference/tools/dump-prompt-golden.mjs
"""

from __future__ import annotations

import json

import pytest

from backend.readings import build_reading_messages
from conftest import FIXTURES_DIR

with (FIXTURES_DIR / "prompt-golden.json").open(encoding="utf-8") as handle:
    GOLDEN = json.load(handle)

CASES = GOLDEN["cases"]


def test_snapshot_has_the_expected_number_of_cases():
    assert len(CASES) == 12


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_prompt_matches_the_reference_snapshot(case):
    messages = build_reading_messages(
        case["body"],
        include_retrieval_diagnostics=case["includeRetrievalDiagnostics"],
    )
    expected = case["expected"]["messages"]
    assert len(messages) == len(expected), "message count differs from the reference"
    for index, (actual, reference) in enumerate(zip(messages, expected)):
        assert actual["role"] == reference["role"], f"message {index} role differs"
        assert actual["content"] == reference["content"], f"message {index} content differs"
    assert sum(len(message["content"]) for message in messages) == case["expected"]["promptChars"]

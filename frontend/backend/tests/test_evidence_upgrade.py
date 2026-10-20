"""Tests for the evidence-validation upgrade (hybrid retrieval + softer gate)."""

from __future__ import annotations

import asyncio
import json

import pytest

from backend.reading_rag import (
    _claim_supported_by_evidence,
    parse_reading_output,
    retrieve_reading_evidence_async,
)
from backend.semantic_reranker import rerank_evidence, score_evidence

CARD = [{"id": "m08", "reversed": False, "position": "建议"}]

TWO_CHUNKS = [
    {
        "evidenceId": "m08:symbolism",
        "cardId": "m08",
        "position": "建议",
        "kind": "symbolism",
        "tier": "anchor",
        "source": "canonical_fixed",
        "sourceType": "canonical_fixed",
        "sourceLabel": "固定牌义",
        "text": "人物在星光下向水池和大地倒水，强调坦诚与恢复。",
        "retrievalReasons": [],
    },
    {
        "evidenceId": "m08:relationships",
        "cardId": "m08",
        "position": "建议",
        "kind": "relationships",
        "tier": "application",
        "source": "canonical_fixed",
        "sourceType": "canonical_fixed",
        "sourceLabel": "固定牌义",
        "text": "建议通过诚实、温和和一致的行动重建信任。",
        "retrievalReasons": [],
    },
]


def _card_reading_output(reading):
    return json.dumps(
        {
            "text": "先看这张牌。",
            "cardReadings": [
                {
                    "cardId": "m08",
                    "position": "建议",
                    "reading": reading,
                    "evidenceIds": ["m08:symbolism", "m08:relationships"],
                }
            ],
        },
        ensure_ascii=False,
    )


def test_card_reading_support_uses_the_union_of_its_cited_evidence(monkeypatch):
    """A paragraph drawn from two chunks is grounded by the two chunks together.

    Neither chunk explains the whole paragraph on its own, which is the normal
    shape of a real reading and exactly what the citation list is for.
    """
    monkeypatch.delenv("STARVEIL_SUPPORT_RATIO", raising=False)
    reading = (
        "人物在星光下向水池和大地倒水，强调坦诚与恢复；"
        "建议通过诚实、温和和一致的行动重建信任。"
    )
    parsed = parse_reading_output(
        _card_reading_output(reading),
        {"cards": CARD, "evidence": TWO_CHUNKS, "requireCardReadingSupport": True},
    )
    assert parsed["cardReadings"][0]["reading"] == reading


def test_card_reading_still_rejects_invented_content(monkeypatch):
    """Union scoring must not become a blanket pass."""
    monkeypatch.delenv("STARVEIL_SUPPORT_RATIO", raising=False)
    reading = "人物在星光下向水池和大地倒水；明天你会收到一笔钱。"
    with pytest.raises(ValueError, match="逐牌解读内容与证据不匹配"):
        parse_reading_output(
            _card_reading_output(reading),
            {"cards": CARD, "evidence": TWO_CHUNKS, "requireCardReadingSupport": True},
        )


def test_support_ratio_rescues_a_mostly_grounded_claim(monkeypatch):
    evidence = {"text": "稳定节奏观察边界平衡"}
    # Three substantive clauses share a real term; the fourth is unsupported and
    # long enough to count (short labels are intentionally neutral).
    claim = "稳定节奏很重要，观察边界很关键，保持平衡有必要，星辰会在今晚坠落大地。"

    monkeypatch.setenv("STARVEIL_SUPPORT_RATIO", "1.0")
    assert (
        _claim_supported_by_evidence(claim, evidence, require_sentence_support=True) is False
    )

    monkeypatch.setenv("STARVEIL_SUPPORT_RATIO", "0.75")
    assert (
        _claim_supported_by_evidence(claim, evidence, require_sentence_support=True) is True
    )


def test_unsupported_claim_still_rejected_at_default_ratio(monkeypatch):
    monkeypatch.delenv("STARVEIL_SUPPORT_RATIO", raising=False)
    assert (
        _claim_supported_by_evidence(
            "对方已经搬去火星。", {"text": "稳定节奏观察边界平衡"}, require_sentence_support=True
        )
        is False
    )


def test_reranker_bridges_synonyms_plain_lexical_would_miss():
    evidence = [
        {"evidenceId": "a", "text": "变化与转化正在发生", "kind": "symbolism"},
        {"evidenceId": "b", "text": "工作计划的推进", "kind": "work"},
    ]
    scores = score_evidence("这次转变该从哪里开始", [], evidence)
    assert scores["a"] > scores["b"]


def test_reranker_is_a_noop_on_malformed_input():
    assert asyncio.run(rerank_evidence(None)) == {}
    assert score_evidence("问题", [], []) == {}


def test_async_retrieval_applies_semantic_scores():
    cards = [{"id": "m08", "reversed": False, "position": "建议"}]
    evidence = asyncio.run(
        retrieve_reading_evidence_async(
            question="我和他的关系该怎么走",
            cards=cards,
            semantic_reranker=rerank_evidence,
        )
    )
    assert any((item.get("retrievalSemanticScore") or 0) > 0 for item in evidence)
    assert any("semantic-v1" in (item.get("retrievalMethod") or "") for item in evidence)

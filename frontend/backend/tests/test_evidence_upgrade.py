"""Tests for the evidence-validation upgrade (hybrid retrieval + softer gate)."""

from __future__ import annotations

import asyncio

from backend.reading_rag import _claim_supported_by_evidence, retrieve_reading_evidence_async
from backend.semantic_reranker import rerank_evidence, score_evidence


def test_support_ratio_rescues_a_mostly_grounded_claim(monkeypatch):
    evidence = {"text": "稳定节奏观察边界平衡"}
    # Three substantive clauses share a real term; the fourth is unsupported.
    claim = "稳定节奏很重要，观察边界很关键，保持平衡有必要，星辰会坠落。"

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

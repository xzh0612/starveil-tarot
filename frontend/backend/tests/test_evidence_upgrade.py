"""Tests for the evidence-validation upgrade (hybrid retrieval + softer gate)."""

from __future__ import annotations

import asyncio
import json

import pytest

from backend.reading_rag import (
    _claim_supported_by_evidence,
    _has_real_claim_terms,
    _is_mostly_foreign,
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


# --- cross-language citations ------------------------------------------------
#
# The pool mixes Chinese editorial guides with the English Waite text and English
# modern-application notes (the latter prefixed by a short Chinese label). A
# Chinese claim about an English source cannot share a term with it, so the gate
# must not read the language boundary as an invented claim. Chinese-sourced
# citations stay strict.

_REF_CHUNKS = [
    {
        "evidenceId": "m08:symbolism",
        "cardId": "m08",
        "position": "建议",
        "kind": "symbolism",
        "tier": "anchor",
        "source": "canonical_fixed",
        "text": "人物在星光下向水池和大地倒水，强调坦诚与恢复。",
        "retrievalReasons": [],
    },
    {
        "evidenceId": "m08:waite",
        "cardId": "m08",
        "position": "建议",
        "kind": "waite",
        "tier": "reference",
        "source": "waite",
        "text": (
            "A woman pours water from an urn into a pool. Divinatory Meanings: "
            "Contentment, happiness, a star of hope."
        ),
        "retrievalReasons": [],
    },
    {
        "evidenceId": "m08:modern",
        "cardId": "m08",
        "position": "建议",
        "kind": "modern",
        "tier": "reference",
        "source": "modern",
        "text": "建设面：Expressing joy and youthful energy；Taking action to fulfil needs.",
        "retrievalReasons": [],
    },
]


def _reference_output(claims):
    return json.dumps(
        {
            "text": "先看这张牌。",
            "references": [
                {
                    "evidenceId": evidence_id,
                    "cardId": "m08",
                    "position": "建议",
                    "claim": claim,
                }
                for evidence_id, claim in claims
            ],
        },
        ensure_ascii=False,
    )


def _reference_options():
    return {
        "cards": [{"id": "m08", "reversed": False, "position": "建议"}],
        "evidence": _REF_CHUNKS,
        "requireReferences": True,
        "requireReferenceClaims": True,
        "requireReferenceSupport": True,
    }


def test_foreign_source_citation_is_not_failed_on_language(monkeypatch):
    """A Chinese summary of the English Waite text must not be rejected."""
    monkeypatch.delenv("STARVEIL_SUPPORT_RATIO", raising=False)
    content = _reference_output(
        [
            ("m08:symbolism", "人物在星光下向水池和大地倒水，强调坦诚与恢复。"),
            ("m08:waite", "一位女子把水倒入水池，牌义指向满足与希望之星。"),
            ("m08:modern", "现代牌义强调表达喜悦，并采取行动满足需要。"),
        ]
    )
    parsed = parse_reading_output(content, _reference_options())
    assert len(parsed["references"]) == 3


def test_chinese_citation_still_rejects_invented_claim(monkeypatch):
    """Skipping foreign sources must not weaken Chinese-sourced citations."""
    monkeypatch.delenv("STARVEIL_SUPPORT_RATIO", raising=False)
    content = _reference_output(
        [("m08:symbolism", "人物在星光下向水池和大地倒水，强调坦诚与恢复。")]
    )
    assert parse_reading_output(content, _reference_options())

    with pytest.raises(ValueError, match="引用说明与证据不匹配"):
        parse_reading_output(
            _reference_output([("m08:symbolism", "这张牌预示明天会收到一笔奖金。")]),
            _reference_options(),
        )


def test_is_mostly_foreign_distinguishes_labeled_english_from_chinese():
    assert _is_mostly_foreign("建设面：Expressing joy and youthful energy.") is True
    assert _is_mostly_foreign("人物在星光下向水池和大地倒水，强调坦诚与恢复。") is False
    assert _is_mostly_foreign("") is False


def test_filler_only_clause_does_not_dilute_support(monkeypatch):
    """A clause made of stop/generic words has no fact to verify.

    "事业上需要分析" produces only n-grams that slice across filler words
    ("事业上需", "要分析"); none of them occur in the evidence, so counting the
    clause as a miss rejected a claim whose remaining clauses quote the source.
    """
    monkeypatch.delenv("STARVEIL_SUPPORT_RATIO", raising=False)
    evidence = {"text": "适合分析、澄清目标与制定标准；关键结论需要可追溯的依据。"}
    claim = "事业上需要分析、澄清目标与制定标准，关键结论需要可追溯的依据。"
    assert _claim_supported_by_evidence(claim, evidence, require_sentence_support=True) is True

    assert _has_real_claim_terms("事业上需要分析") is False
    assert _has_real_claim_terms("工作应用强调分析") is False
    assert _has_real_claim_terms("明天会收到一笔奖金") is True


# --- goal sections carry reasoning, not just quotation -----------------------

_GOAL_CHUNK = {
    "evidenceId": "m08:work",
    "cardId": "m08",
    "position": "建议",
    "kind": "work",
    "tier": "application",
    "source": "canonical_fixed",
    "text": "适合分析、澄清目标与制定标准；关键结论需要可追溯的依据。",
    "retrievalGoals": ["advice"],
    "retrievalReasons": [],
}


def _goal_section_output(text):
    return json.dumps(
        {
            "text": "先回应建议。",
            "goalSections": [
                {"goal": "advice", "text": text, "evidenceIds": ["m08:work"]}
            ],
        },
        ensure_ascii=False,
    )


def _goal_section_options():
    return {
        "cards": [{"id": "m08", "reversed": False, "position": "建议"}],
        "evidence": [_GOAL_CHUNK],
        "requiredGoalSections": ["advice"],
        "requireGoalSections": True,
    }


def test_goal_section_allows_a_reasoning_clause_next_to_quoted_ones(monkeypatch):
    """Two quoted clauses plus one operational suggestion is still grounded.

    The prompt asks advice sections to state conditions and next steps, which are
    the model's own reasoning and cannot appear in card text. At the default 0.75
    this section scored 2/3 and was rejected.
    """
    monkeypatch.delenv("STARVEIL_SUPPORT_RATIO", raising=False)
    text = "关键结论需要可追溯的依据，澄清目标与制定标准，试用安排要落成书面条款。"
    parsed = parse_reading_output(_goal_section_output(text), _goal_section_options())
    assert parsed["goalSections"][0]["text"].startswith("关键结论")


def test_goal_section_still_rejects_invented_content(monkeypatch):
    """The lower floor must not admit a section written entirely off-card."""
    monkeypatch.delenv("STARVEIL_SUPPORT_RATIO", raising=False)
    text = "试用安排要落成书面条款，按期重新评估，把模糊处先问清再回头比较。"
    with pytest.raises(ValueError, match="目标分段内容与证据不匹配"):
        parse_reading_output(_goal_section_output(text), _goal_section_options())

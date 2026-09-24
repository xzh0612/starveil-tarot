"""Regression tests for the reading-rag output contract.

Translated from ``server-js-reference/tests/reading-rag.test.mjs`` (line 564 to
the end of the file) so the Python port keeps the same coverage as the
JavaScript original. Each test asserts exactly what its JavaScript counterpart
asserts, with the same inputs and the same expectations. Names are derived from
the JavaScript test sentences so the two suites stay traceable.
"""

from __future__ import annotations

import asyncio
import json

import pytest

from backend.reading_rag import (
    MEMORY_RETRIEVAL_VERSION,
    analyze_reading_question,
    evidence_source_authority,
    evidence_source_type,
    parse_reading_output,
    requires_perspective_boundary,
    requires_professional_boundary,
    retrieve_memory_evidence,
    retrieve_reading_evidence,
    retrieve_reading_evidence_async,
    summarize_reading_evidence,
)

# The two-card spread used by most of the original suite.
CARDS = [
    {"id": "m08", "reversed": False, "position": "建议"},
    {"id": "c06", "reversed": True, "position": "关系挑战"},
]


def find(items, **match):
    """`items.find(item => ...)` — first match, or fail loudly like the JS does."""
    for item in items:
        if all(item.get(key) == value for key, value in match.items()):
            return item
    raise AssertionError(f"no evidence chunk matching {match!r}")


def find_card_kind(evidence, card_id, kind):
    """`evidence.find(e => e.cardId === id && e.kind === kind)`."""
    return find([item for item in evidence if item["cardId"] == card_id], kind=kind)


def js_json(value):
    """`JSON.stringify(v)` — no non-ASCII escaping and no separator spaces."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def test_async_semantic_reranker_receives_full_candidates_and_falls_back_on_failure():
    seen = []
    single_card = [{"id": "m08", "reversed": False, "position": "建议"}]

    async def reranker(payload):
        seen.append(len(payload["evidence"]))
        return {"m08:modern": 1}

    boosted = asyncio.run(
        retrieve_reading_evidence_async(
            question="我该如何处理这段关系？",
            cards=single_card,
            max_per_card=7,
            max_total_evidence=4,
            semantic_reranker=reranker,
        )
    )
    assert seen[0] == 5
    assert find(boosted, kind="modern")["retrievalSemanticScore"] == 1

    async def failing(_payload):
        raise RuntimeError("offline")

    fallback = asyncio.run(
        retrieve_reading_evidence_async(
            question="我该如何处理这段关系？",
            cards=single_card,
            max_per_card=7,
            max_total_evidence=4,
            semantic_reranker=failing,
        )
    )
    assert all(item["retrievalSemanticScore"] == 0 for item in fallback)

    async def never_resolves(_payload):
        await asyncio.sleep(10)

    timed = asyncio.run(
        retrieve_reading_evidence_async(
            question="我该如何处理这段关系？",
            cards=single_card,
            max_total_evidence=4,
            semantic_timeout_ms=5,
            semantic_reranker=never_resolves,
        )
    )
    assert all(item["retrievalSemanticScore"] == 0 for item in timed)


def test_evidence_summary_reports_tier_and_per_card_coverage_for_prompt_diagnostics():
    evidence = retrieve_reading_evidence(question="我该如何处理这段关系？", cards=CARDS)
    summary = summarize_reading_evidence(
        evidence, CARDS, themes=["relationship"], goals=["advice"]
    )
    assert summary["total"] == len(evidence)
    assert summary["requiredCount"] == 4
    assert summary["missingAnchorCardIds"] == []
    assert summary["perCard"]["m08"]["hasSymbolism"] is True
    assert summary["perCard"]["m08"]["hasOrientation"] is True
    assert summary["tiers"]["anchor"] >= 4
    assert summary["semanticCount"] == 0
    assert summary["missingGoalCoverage"] == []
    assert summary["goalCoverage"]["advice"]["ok"] is True


def test_evidence_summary_exposes_missing_goal_support():
    question = "我之后会怎样发展？"
    cards_for_goal = [{"id": "m08", "reversed": False, "position": "建议"}]
    evidence = retrieve_reading_evidence(question=question, cards=cards_for_goal)
    full = summarize_reading_evidence(
        evidence,
        cards_for_goal,
        themes=analyze_reading_question(question)["themes"],
        goals=["forecast"],
    )
    assert full["missingGoalCoverage"] == []
    anchors = summarize_reading_evidence(
        [item for item in evidence if item["tier"] == "anchor"],
        cards_for_goal,
        themes=["future"],
        goals=["forecast"],
    )
    assert anchors["missingGoalCoverage"] == ["forecast"]
    assert anchors["goalCoverage"]["forecast"]["referenceCount"] == 0


def test_evidence_summary_identifies_goal_gaps_on_individual_cards():
    cards_for_goal = [
        {"id": "m08", "reversed": False, "position": "建议"},
        {"id": "c06", "reversed": True, "position": "关系挑战"},
        {"id": "w01", "reversed": False, "position": "过去"},
    ]
    question = "我之后会怎样发展？"
    routing = analyze_reading_question(question)
    evidence = retrieve_reading_evidence(
        question=question, cards=cards_for_goal, max_total_evidence=8
    )
    summary = summarize_reading_evidence(
        evidence, cards_for_goal, themes=routing["themes"], goals=routing["goals"]
    )
    assert summary["goalCoverage"]["forecast"]["ok"] is True
    assert any(
        "forecast" in goals for goals in summary["missingGoalCoverageByCard"].values()
    )
    assert summary["coverageBoundaryGoals"] == ["forecast"]


def test_memory_retrieval_is_opt_in_and_ranks_user_confirmed_context_by_the_question():
    evidence = retrieve_memory_evidence(
        question="做重要决定前我该如何安排自己？",
        memories=[
            {"id": "m1", "text": "做重要决定前，我需要先独处整理思绪。", "enabled": True},
            {"id": "m2", "text": "我喜欢在周末散步。", "enabled": True},
            {"id": "m3", "text": "这条记录不应发送。", "enabled": False},
        ],
    )
    assert evidence[0]["evidenceId"] == "memory:m1"
    assert not any(item["evidenceId"] == "memory:m2" for item in evidence)
    assert not any(item["evidenceId"] == "memory:m3" for item in evidence)
    assert all(item["source"] == "memory" and item["cardId"] is None for item in evidence)
    assert evidence[0]["tier"] == "personal"
    assert evidence[0]["sourceType"] == "personal_memory"
    assert evidence[0]["memoryStatus"] == "user_confirmed"
    assert evidence[0]["memoryUse"] == "context_only"
    assert evidence[0]["retrievalReasons"] == ["memory_keyword_match"]
    assert len(evidence[0]["retrievalTerms"]) > 0
    assert evidence[0]["retrievalMethod"] == MEMORY_RETRIEVAL_VERSION


def test_memory_retrieval_returns_no_unrelated_personal_records():
    evidence = retrieve_memory_evidence(
        question="我该如何准备考试？",
        memories=[
            {"id": "m1", "text": "我喜欢在周末散步。", "enabled": True},
            {"id": "m2", "text": "家里的猫叫月光。", "enabled": True},
        ],
    )
    assert evidence == []


def test_memory_retrieval_uses_a_concrete_alias_group_without_broadening_unrelated_records():
    evidence = retrieve_memory_evidence(
        question="我想和他交流一下，怎么开口？",
        memories=[
            {"id": "m1", "text": "重要的事情可以先沟通，再讨论彼此的边界。", "enabled": True},
            {"id": "m2", "text": "我喜欢在周末散步。", "enabled": True},
        ],
    )
    assert [item["evidenceId"] for item in evidence] == ["memory:m1"]
    assert evidence[0]["retrievalReasons"] == ["memory_keyword_expansion"]
    assert evidence[0]["retrievalMethod"] == MEMORY_RETRIEVAL_VERSION


def test_memory_retrieval_rejects_a_single_generic_short_overlap():
    evidence = retrieve_memory_evidence(
        question="我该怎么安排？",
        memories=[
            {"id": "generic", "text": "我会先安排周末散步。", "enabled": True},
            {"id": "specific", "text": "我在重要决定前会先独处整理思绪。", "enabled": True},
        ],
    )
    assert [item["evidenceId"] for item in evidence] == []


def test_memory_retrieval_ignores_pronoun_and_temporal_short_overlaps():
    evidence = retrieve_memory_evidence(
        question="我最近压力很大，怎么调整？",
        memories=[
            {"id": "generic", "text": "我最近会安排一些事情。", "enabled": True},
            {"id": "specific", "text": "我会记录每次压力变化，再调整节奏。", "enabled": True},
        ],
    )
    assert [item["evidenceId"] for item in evidence] == ["memory:specific"]


def test_memory_retrieval_respects_a_deterministic_total_text_budget():
    memories = [
        {
            "id": f"long-{index}",
            "text": f"我在重要决定前会先独处整理思绪，第{index}条。{'补充记录。' * 1_500}",
            "enabled": True,
        }
        for index in range(6)
    ]
    evidence = retrieve_memory_evidence(
        question="重要决定 独处 整理思绪",
        memories=memories,
        max_items=6,
        max_total_chars=4_000,
    )
    assert len(evidence) > 0
    assert len(evidence) < 6
    assert sum(len(item["text"]) for item in evidence) <= 4_000
    assert evidence[0]["evidenceId"] == "memory:long-0"
    assert evidence[0]["memoryExcerpted"]


def test_structured_output_accepts_only_references_from_the_retrieved_evidence_set():
    evidence = retrieve_reading_evidence(question="我每天学习两小时，如何保持？", cards=[CARDS[0]])
    valid = js_json(
        {
            "text": "把稳定节奏拆成可执行的小步。",
            "references": [
                {
                    "evidenceId": evidence[0]["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "稳定节奏",
                }
            ],
            "followUp": "你最容易在哪个时段中断？",
            "uncertainty": "牌义是反思线索，不是事实证明。",
        }
    )
    parsed = parse_reading_output(valid, {"cards": CARDS, "evidence": evidence})
    assert parsed["text"] == "把稳定节奏拆成可执行的小步。"
    assert parsed["references"][0]["evidenceId"] == evidence[0]["evidenceId"]
    assert parsed["references"][0]["tier"] == evidence[0]["tier"]
    assert parsed["references"][0]["sourceLabel"] == evidence[0]["sourceLabel"]
    assert parsed["references"][0]["evidenceExcerpt"] == evidence[0]["text"]
    assert parsed["references"][0]["retrievalReasons"] == evidence[0]["retrievalReasons"]
    assert parsed["followUp"] == "你最容易在哪个时段中断？"
    with pytest.raises(ValueError, match="引用证据无效"):
        parse_reading_output(
            js_json(
                {
                    "text": "x",
                    "references": [
                        {"evidenceId": "fake", "cardId": "m08", "position": "建议"}
                    ],
                }
            ),
            {"cards": CARDS, "evidence": evidence},
        )


def test_structured_output_deduplicates_repeated_evidence_references():
    evidence = retrieve_reading_evidence(question="我每天学习两小时，如何保持？", cards=[CARDS[0]])
    reference = {
        "evidenceId": evidence[0]["evidenceId"],
        "cardId": "m08",
        "position": "建议",
        "claim": "稳定节奏",
    }
    parsed = parse_reading_output(
        js_json({"text": "保持稳定节奏。", "references": [reference, reference]}),
        {"cards": [CARDS[0]], "evidence": evidence},
    )
    assert len(parsed["references"]) == 1
    assert parsed["references"][0]["evidenceId"] == evidence[0]["evidenceId"]


def test_reference_deduplication_preserves_unique_evidence_after_repeated_entries():
    evidence = retrieve_reading_evidence(question="我每天学习两小时，如何保持？", cards=[CARDS[0]])
    first = {
        "evidenceId": evidence[0]["evidenceId"],
        "cardId": "m08",
        "position": "建议",
        "claim": "稳定节奏",
    }
    second = {
        "evidenceId": evidence[1]["evidenceId"],
        "cardId": "m08",
        "position": "建议",
        "claim": "力量",
    }
    parsed = parse_reading_output(
        js_json({"text": "保持稳定节奏。", "references": [first] * 24 + [second]}),
        {"cards": [CARDS[0]], "evidence": evidence},
    )
    assert [item["evidenceId"] for item in parsed["references"]] == [
        first["evidenceId"],
        second["evidenceId"],
    ]


def test_structured_output_can_cite_relevant_personal_memory_with_null_card_coordinates():
    memory = retrieve_memory_evidence(
        question="做重要决定前我该如何安排自己？",
        memories=[
            {"id": "m1", "text": "做重要决定前，我需要先独处整理思绪。", "enabled": True}
        ],
    )
    output = js_json(
        {
            "text": "把先独处整理思绪作为可执行的准备。",
            "references": [
                {
                    "evidenceId": "memory:m1",
                    "cardId": None,
                    "position": None,
                    "claim": "先独处整理思绪",
                }
            ],
        }
    )
    parsed = parse_reading_output(output, {"cards": [CARDS[0]], "evidence": memory})
    assert parsed["references"][0]["cardId"] is None
    assert parsed["references"][0]["position"] is None
    assert parsed["references"][0]["tier"] == "personal"
    assert parsed["references"][0]["sourceType"] == "personal_memory"
    assert parsed["references"][0]["evidenceExcerpt"] == memory[0]["text"]
    with pytest.raises(ValueError, match="引用证据无效"):
        parse_reading_output(
            js_json(
                {
                    "text": "x",
                    "references": [
                        {
                            "evidenceId": "memory:m1",
                            "cardId": "m08",
                            "position": "建议",
                            "claim": "先独处",
                        }
                    ],
                }
            ),
            {"cards": [CARDS[0]], "evidence": memory},
        )


def test_preserves_personal_memory_truncation_metadata_in_derived_citations():
    memory = retrieve_memory_evidence(
        question="做重要决定前我该如何安排自己？",
        memories=[
            {
                "id": "m1",
                "text": f"做重要决定前，我需要先独处整理思绪。{'补充记录。' * 600}",
                "enabled": True,
            }
        ],
    )
    assert memory[0]["memoryExcerpted"] is True
    output = js_json(
        {
            "text": "把先独处整理思绪作为可执行的准备。",
            "references": [
                {
                    "evidenceId": "memory:m1",
                    "cardId": None,
                    "position": None,
                    "claim": "先独处整理思绪",
                }
            ],
            "actions": [
                {
                    "text": "今天先独处十分钟。",
                    "reason": "先独处整理思绪。",
                    "evidenceIds": ["memory:m1"],
                }
            ],
        }
    )
    parsed = parse_reading_output(output, {"cards": [CARDS[0]], "evidence": memory})
    assert parsed["references"][0]["memoryExcerpted"] is True
    assert parsed["actions"][0]["evidence"][0]["memoryExcerpted"] is True


def test_personal_memory_cannot_ground_the_top_level_reading_text():
    memory = retrieve_memory_evidence(
        question="做重要决定前我该如何安排自己？",
        memories=[
            {"id": "m1", "text": "做重要决定前，我需要先独处整理思绪。", "enabled": True}
        ],
    )
    output = js_json(
        {
            "text": "先独处整理思绪。",
            "references": [
                {
                    "evidenceId": "memory:m1",
                    "cardId": None,
                    "position": None,
                    "claim": "先独处整理思绪",
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="解读正文与证据不匹配"):
        parse_reading_output(
            output,
            {"cards": [CARDS[0]], "evidence": memory, "requireTextSupport": True},
        )


def test_plain_text_follow_ups_cannot_use_personal_memory_as_sole_body_support():
    memory = retrieve_memory_evidence(
        question="做重要决定前我该如何安排自己？",
        memories=[
            {"id": "m1", "text": "做重要决定前，我需要先独处整理思绪。", "enabled": True}
        ],
    )
    with pytest.raises(ValueError, match="追问正文与证据不匹配"):
        parse_reading_output(
            "先独处整理思绪。",
            {
                "cards": [CARDS[0]],
                "evidence": memory,
                "requireTextSupport": True,
                "isFollowUp": True,
            },
        )


def test_structured_references_retain_fixed_source_provenance():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    waite = find(evidence, kind="waite")
    output = js_json(
        {
            "text": "以原典作为对照。",
            "references": [
                {
                    "evidenceId": waite["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "Fortitude",
                }
            ],
        }
    )
    parsed = parse_reading_output(output, {"cards": [CARDS[0]], "evidence": evidence})
    assert parsed["references"][0]["url"] == waite["url"]
    assert parsed["references"][0]["source"] == "waite"
    assert parsed["references"][0]["sourceType"] == "external_reference"
    assert parsed["references"][0]["sourceAuthority"] == "historical_reference"
    assert parsed["references"][0]["evidenceExcerpt"] == waite["text"]


def test_evidence_source_types_stay_stable_across_fixed_external_and_unknown_sources():
    assert evidence_source_type("editorial") == "fixed_card_meaning"
    assert evidence_source_type("corpora") == "external_reference"
    assert evidence_source_type("future-source") == "other"
    assert evidence_source_authority("editorial") == "canonical_fixed"
    assert evidence_source_authority("memory") == "user_context"


def test_first_reading_output_must_cover_every_selected_card_with_grounded_evidence():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=CARDS)
    refs = [
        {
            "evidenceId": find_card_kind(evidence, card["id"], "orientation")["evidenceId"],
            "cardId": card["id"],
            "position": card["position"],
            "claim": find_card_kind(evidence, card["id"], "orientation")["text"][:4],
        }
        for card in CARDS
    ]
    valid = js_json(
        {
            "text": "逐张说明并综合关系。",
            "references": refs,
            "cardReadings": [
                {
                    "cardId": card["id"],
                    "position": card["position"],
                    "reading": "结合牌位说明一个可观察的角度。",
                    "evidenceIds": [
                        find([ref for ref in refs if ref["cardId"] == card["id"]])[
                            "evidenceId"
                        ]
                    ],
                }
                for card in CARDS
            ],
        }
    )
    assert (
        len(
            parse_reading_output(
                valid, {"cards": CARDS, "evidence": evidence, "requireCoverage": True}
            )["cardReadings"]
        )
        == 2
    )
    missing = js_json(
        {
            "text": "只解释一张牌。",
            "references": [refs[0]],
            "cardReadings": [
                {
                    "cardId": CARDS[0]["id"],
                    "position": CARDS[0]["position"],
                    "reading": "只解释第一张。",
                    "evidenceIds": [refs[0]["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="没有覆盖全部牌面"):
        parse_reading_output(
            missing, {"cards": CARDS, "evidence": evidence, "requireCoverage": True}
        )


def test_card_readings_carry_the_locked_card_orientation_for_the_ui():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[1]])
    output = js_json(
        {
            "text": "逐牌说明。",
            "cardReadings": [
                {
                    "cardId": "c06",
                    "position": "关系挑战",
                    "reading": "观察一个可验证的角度。",
                    "evidenceIds": [find(evidence, kind="orientation")["evidenceId"]],
                }
            ],
        }
    )
    parsed = parse_reading_output(output, {"cards": [CARDS[1]], "evidence": evidence})
    assert parsed["cardReadings"][0]["orientation"] == "逆位"


def test_card_readings_reject_text_with_no_meaningful_overlap_with_cited_evidence():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    output = js_json(
        {
            "text": "逐牌说明。",
            "cardReadings": [
                {
                    "cardId": "m08",
                    "position": "建议",
                    "reading": "这张牌保证对方一定会回来。",
                    "evidenceIds": [find(evidence, kind="orientation")["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="逐牌解读内容与证据不匹配"):
        parse_reading_output(
            output,
            {"cards": [CARDS[0]], "evidence": evidence, "requireCardReadingSupport": True},
        )


def test_first_actions_reject_vague_text_without_an_observable_completion_marker():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    output = js_json(
        {
            "text": "行动建议。",
            "actions": [
                {
                    "text": "做点什么。",
                    "evidenceIds": [find(evidence, kind="orientation")["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="行动建议必须包含可观察的完成标准"):
        parse_reading_output(
            output,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireActions": True,
                "requireConcreteActions": True,
            },
        )


def test_first_actions_require_a_reason_that_explains_their_connection_to_the_reading():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    output = js_json(
        {
            "text": "先观察再沟通。",
            "actions": [
                {
                    "text": "今天记录一次具体沟通。",
                    "evidenceIds": [find(evidence, kind="orientation")["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="行动建议必须说明与牌面相关的理由"):
        parse_reading_output(
            output,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireActions": True,
                "requireActionReasons": True,
            },
        )


def test_first_action_reasons_must_overlap_the_cited_evidence():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    output = js_json(
        {
            "text": "先观察再沟通。",
            "actions": [
                {
                    "text": "今天记录一次具体沟通。",
                    "reason": "这会保证对方一定会回来。",
                    "evidenceIds": [find(evidence, kind="orientation")["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="行动理由与牌面证据不匹配"):
        parse_reading_output(
            output,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireActions": True,
                "requireActionReasons": True,
                "requireActionReasonSupport": True,
            },
        )


def test_first_action_text_must_overlap_the_cited_evidence():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    output = js_json(
        {
            "text": "先观察再沟通。",
            "actions": [
                {
                    "text": "今天购买一台相机并在一周后复盘。",
                    "reason": "依据牌面稳定、明确的行动线索。",
                    "evidenceIds": [find(evidence, kind="orientation")["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="行动建议内容与证据不匹配"):
        parse_reading_output(
            output,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireActions": True,
                "requireConcreteActions": True,
                "requireActionReasons": True,
                "requireActionReasonSupport": True,
                "requireActionTextSupport": True,
            },
        )


def test_first_action_text_cannot_pass_on_generic_action_words_alone():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    output = js_json(
        {
            "text": "先观察再沟通。",
            "actions": [
                {
                    "text": "今天做一个行动并观察结果。",
                    "reason": "依据牌面稳定、明确的行动线索。",
                    "evidenceIds": [find(evidence, kind="orientation")["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="行动建议内容与证据不匹配"):
        parse_reading_output(
            output,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireActions": True,
                "requireConcreteActions": True,
                "requireActionReasons": True,
                "requireActionReasonSupport": True,
                "requireActionTextSupport": True,
            },
        )


def test_first_action_reasons_cannot_pass_on_generic_words_alone():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    output = js_json(
        {
            "text": "先观察再沟通。",
            "actions": [
                {
                    "text": "今天记录一次稳定节奏的具体行动。",
                    "reason": "这是一条行动建议，并观察结果。",
                    "evidenceIds": [find(evidence, kind="orientation")["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="行动理由与牌面证据不匹配"):
        parse_reading_output(
            output,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireActions": True,
                "requireConcreteActions": True,
                "requireActionReasons": True,
                "requireActionReasonSupport": True,
                "requireActionTextSupport": True,
            },
        )


def test_structured_reading_prose_cannot_pass_on_generic_evidence_words_alone():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    card_output = js_json(
        {
            "text": "先观察再沟通。",
            "cardReadings": [
                {
                    "cardId": "m08",
                    "position": "建议",
                    "reading": "观察一个方向并说明结果。",
                    "evidenceIds": [find(evidence, kind="orientation")["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="逐牌解读内容与证据不匹配"):
        parse_reading_output(
            card_output,
            {"cards": [CARDS[0]], "evidence": evidence, "requireCardReadingSupport": True},
        )
    synthesis_output = js_json(
        {
            "text": "先观察再沟通。",
            "synthesis": {
                "text": "说明方向并观察结果。",
                "evidenceIds": [find(evidence, kind="orientation")["evidenceId"]],
            },
        }
    )
    with pytest.raises(ValueError, match="综合解读内容与证据不匹配"):
        parse_reading_output(
            synthesis_output,
            {"cards": [CARDS[0]], "evidence": evidence, "requireSynthesisSupport": True},
        )


def test_structured_prose_rejects_an_unsupported_trailing_sentence():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    orientation = find(evidence, kind="orientation")
    card_output = js_json(
        {
            "text": "先观察再沟通。",
            "cardReadings": [
                {
                    "cardId": "m08",
                    "position": "建议",
                    "reading": "先以稳定节奏观察。对方已经搬去火星。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="逐牌解读内容与证据不匹配"):
        parse_reading_output(
            card_output,
            {"cards": [CARDS[0]], "evidence": evidence, "requireCardReadingSupport": True},
        )
    action_output = js_json(
        {
            "text": "先观察再沟通。",
            "actions": [
                {
                    "text": "今天记录一次稳定节奏的行动。对方已经搬去火星。",
                    "reason": "依据牌面稳定、明确的行动线索。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="行动建议内容与证据不匹配"):
        parse_reading_output(
            action_output,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireActions": True,
                "requireActionReasons": True,
                "requireActionReasonSupport": True,
                "requireActionTextSupport": True,
            },
        )


def test_synthesis_rejects_prose_with_no_meaningful_overlap_with_cited_evidence():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    output = js_json(
        {
            "text": "综合判断。",
            "synthesis": {
                "text": "这意味着对方一定会回来。",
                "evidenceIds": [find(evidence, kind="orientation")["evidenceId"]],
            },
        }
    )
    with pytest.raises(ValueError, match="综合解读内容与证据不匹配"):
        parse_reading_output(
            output,
            {"cards": [CARDS[0]], "evidence": evidence, "requireSynthesisSupport": True},
        )


def test_reference_claims_reject_an_unsupported_trailing_sentence():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    output = js_json(
        {
            "text": "先观察再沟通。",
            "references": [
                {
                    "evidenceId": "m08:orientation",
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "稳定、温柔。对方已经搬去火星。",
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="引用说明与证据不匹配"):
        parse_reading_output(
            output,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireReferenceClaims": True,
                "requireReferenceSupport": True,
            },
        )


def test_first_reading_text_must_overlap_the_retrieved_evidence():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    output = js_json(
        {
            "text": "对方已经中奖并马上搬去火星。",
            "references": [
                {
                    "evidenceId": "m08:orientation",
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "稳定",
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="解读正文与证据不匹配"):
        parse_reading_output(
            output, {"cards": [CARDS[0]], "evidence": evidence, "requireTextSupport": True}
        )


def test_first_reading_text_rejects_an_unsupported_trailing_sentence():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    output = js_json(
        {
            "text": "把练习拆成稳定的小步。对方已经搬去火星。",
            "references": [
                {
                    "evidenceId": "m08:orientation",
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "稳定",
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="解读正文与证据不匹配"):
        parse_reading_output(
            output, {"cards": [CARDS[0]], "evidence": evidence, "requireTextSupport": True}
        )


def test_first_reading_text_cannot_borrow_support_from_non_reference_fields():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    orientation = find(evidence, kind="orientation")
    relationships = find(evidence, kind="relationships")
    output = js_json(
        {
            "text": "平静说出感受和底线。",
            "references": [
                {
                    "evidenceId": orientation["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "稳定、温柔",
                }
            ],
            "actions": [
                {
                    "text": "记录一次沟通。",
                    "reason": "依据关系中的边界。",
                    "evidenceIds": [relationships["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="解读正文与证据不匹配"):
        parse_reading_output(
            output, {"cards": [CARDS[0]], "evidence": evidence, "requireTextSupport": True}
        )
    synthesis_output = js_json(
        {
            "text": "平静说出感受和底线。",
            "references": [
                {
                    "evidenceId": orientation["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "稳定、温柔",
                }
            ],
            "synthesis": {
                "text": "把关系中的边界纳入观察。",
                "evidenceIds": [relationships["evidenceId"]],
            },
        }
    )
    with pytest.raises(ValueError, match="解读正文与证据不匹配"):
        parse_reading_output(
            synthesis_output,
            {"cards": [CARDS[0]], "evidence": evidence, "requireTextSupport": True},
        )


def test_first_reading_text_cannot_pass_on_generic_evidence_words_alone():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    output = js_json(
        {
            "text": "说明方向并观察结果。",
            "references": [
                {
                    "evidenceId": "m08:orientation",
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "稳定",
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="解读正文与证据不匹配"):
        parse_reading_output(
            output, {"cards": [CARDS[0]], "evidence": evidence, "requireTextSupport": True}
        )


def test_first_reading_card_explanations_require_available_position_evidence():
    card = {"id": "m08", "reversed": False, "position": "阻碍"}
    evidence = retrieve_reading_evidence(question="我正在整理工作方向。", cards=[card])
    anchor = find(evidence, kind="orientation")
    position_evidence = next(
        item
        for item in evidence
        if item.get("retrievalReasons")
        and "position_match" in item["retrievalReasons"]
    )
    assert anchor and position_evidence
    missing = js_json(
        {
            "text": "逐牌说明。",
            "cardReadings": [
                {
                    "cardId": "m08",
                    "position": "阻碍",
                    "reading": "结合稳定节奏观察一个可验证角度。",
                    "evidenceIds": [anchor["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="牌位语义证据"):
        parse_reading_output(
            missing,
            {
                "cards": [card],
                "evidence": evidence,
                "requireCoverage": True,
                "requirePositionEvidence": True,
            },
        )
    grounded = js_json(
        {
            "text": "逐牌说明。",
            "cardReadings": [
                {
                    "cardId": "m08",
                    "position": "阻碍",
                    "reading": "结合稳定节奏观察工作行动的阻碍。",
                    "evidenceIds": [anchor["evidenceId"], position_evidence["evidenceId"]],
                }
            ],
        }
    )
    assert (
        position_evidence["evidenceId"]
        in parse_reading_output(
            grounded,
            {
                "cards": [card],
                "evidence": evidence,
                "requireCoverage": True,
                "requirePositionEvidence": True,
            },
        )["cardReadings"][0]["evidenceIds"]
    ) is True


def test_first_reading_card_explanations_must_cite_a_core_anchor():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    application = find(evidence, kind="relationships")
    output = js_json(
        {
            "text": "逐牌说明。",
            "cardReadings": [
                {
                    "cardId": "m08",
                    "position": "建议",
                    "reading": "只引用应用语义。",
                    "evidenceIds": [application["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="核心锚点"):
        parse_reading_output(
            output,
            {"cards": [CARDS[0]], "evidence": evidence, "requireCoverage": True},
        )


def test_first_structured_reading_requires_a_top_level_reference_for_every_card():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=CARDS)
    refs = [
        {
            "evidenceId": find_card_kind(evidence, card["id"], "orientation")["evidenceId"],
            "cardId": card["id"],
            "position": card["position"],
            "claim": find_card_kind(evidence, card["id"], "orientation")["text"][:4],
        }
        for card in CARDS
    ]
    missing_reference = js_json(
        {
            "text": "逐张说明并综合关系。",
            "cardReadings": [
                {
                    "cardId": card["id"],
                    "position": card["position"],
                    "reading": "结合牌位说明一个可观察的角度。",
                    "evidenceIds": [
                        find([ref for ref in refs if ref["cardId"] == card["id"]])[
                            "evidenceId"
                        ]
                    ],
                }
                for card in CARDS
            ],
            "actions": [
                {
                    "text": "先记录一次具体沟通，再复盘结果。",
                    "evidenceIds": [refs[0]["evidenceId"]],
                }
            ],
            "references": [refs[0]],
        }
    )
    with pytest.raises(ValueError, match="引用没有覆盖全部牌面"):
        parse_reading_output(
            missing_reference,
            {
                "cards": CARDS,
                "evidence": evidence,
                "requireCoverage": True,
                "requireActions": True,
                "requireReferences": True,
            },
        )


def test_first_structured_references_require_a_core_anchor_for_every_card():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=CARDS)
    application_refs = [
        {
            "evidenceId": find_card_kind(evidence, card["id"], "relationships")["evidenceId"],
            "cardId": card["id"],
            "position": card["position"],
            "claim": find_card_kind(evidence, card["id"], "relationships")["text"][:4],
        }
        for card in CARDS
    ]
    output = js_json(
        {
            "text": "逐张说明并综合关系。",
            "cardReadings": [
                {
                    "cardId": card["id"],
                    "position": card["position"],
                    "reading": "结合牌位说明一个可观察的角度。",
                    "evidenceIds": [
                        find_card_kind(evidence, card["id"], "orientation")["evidenceId"]
                    ],
                }
                for card in CARDS
            ],
            "actions": [
                {
                    "text": "先记录一次具体沟通，再复盘结果。",
                    "evidenceIds": [evidence[0]["evidenceId"]],
                }
            ],
            "references": application_refs,
        }
    )
    with pytest.raises(ValueError, match="核心锚点"):
        parse_reading_output(
            output,
            {
                "cards": CARDS,
                "evidence": evidence,
                "requireCoverage": True,
                "requireActions": True,
                "requireReferences": True,
                "requireReferenceClaims": True,
            },
        )


def test_first_structured_citations_require_a_concise_support_claim():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    orientation = find(evidence, kind="orientation")
    output = js_json(
        {
            "text": "先观察再沟通。",
            "cardReadings": [
                {
                    "cardId": "m08",
                    "position": "建议",
                    "reading": "观察一个可验证的角度。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
            "actions": [
                {
                    "text": "今天记录一次沟通并在一周后复盘。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
            "references": [
                {"evidenceId": orientation["evidenceId"], "cardId": "m08", "position": "建议"}
            ],
        }
    )
    with pytest.raises(ValueError, match="引用说明不能为空"):
        parse_reading_output(
            output,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireCoverage": True,
                "requireActions": True,
                "requireReferences": True,
                "requireReferenceClaims": True,
            },
        )
    unsupported = js_json(
        {
            "text": "先观察再沟通。",
            "references": [
                {
                    "evidenceId": orientation["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "保证一定复合",
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="引用说明与证据不匹配"):
        parse_reading_output(
            unsupported,
            {"cards": [CARDS[0]], "evidence": evidence, "requireReferenceSupport": True},
        )
    generic = js_json(
        {
            "text": "先观察再沟通。",
            "references": [
                {
                    "evidenceId": orientation["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "行动建议",
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="引用说明与证据不匹配"):
        parse_reading_output(
            generic,
            {"cards": [CARDS[0]], "evidence": evidence, "requireReferenceSupport": True},
        )


def test_grounding_does_not_accept_broad_relationship_words_as_unsupported_facts():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="我该怎么处理这段关系？", cards=[card])
    with pytest.raises(ValueError, match="追问正文与证据不匹配"):
        parse_reading_output(
            "关系会在三天后复合。",
            {"cards": [card], "evidence": evidence, "isFollowUp": True, "requireTextSupport": True},
        )
    with pytest.raises(ValueError, match="追问正文与证据不匹配"):
        parse_reading_output(
            "对方会持续伤害我。",
            {"cards": [card], "evidence": evidence, "isFollowUp": True, "requireTextSupport": True},
        )
    parse_reading_output(
        "理解对方不意味着容忍持续伤害。",
        {"cards": [card], "evidence": evidence, "isFollowUp": True, "requireTextSupport": True},
    )


def test_question_routing_covers_relationship_states_core_meaning_and_fit_questions():
    assert analyze_reading_question("他还爱不爱我？")["goals"] == ["forecast"]
    assert analyze_reading_question("他对我有没有感觉？")["goals"] == ["forecast"]
    assert analyze_reading_question("这段关系的核心问题是什么？")["goals"] == ["explanation"]
    assert analyze_reading_question("我适不适合换工作？")["goals"] == ["comparison"]
    assert analyze_reading_question("未来有什么变化？")["goals"] == ["forecast"]


def test_question_routing_covers_colloquial_state_and_path_questions():
    assert analyze_reading_question("他爱我吗？")["goals"] == ["forecast"]
    assert analyze_reading_question("他对我有好感吗？")["goals"] == ["forecast"]
    assert analyze_reading_question("他对我是什么感觉？")["goals"] == ["forecast"]
    assert analyze_reading_question("留在这里还是离开？")["goals"] == ["comparison"]
    assert analyze_reading_question("这段关系会怎么发展？")["goals"] == ["forecast"]
    assert analyze_reading_question("我只是想了解这张牌")["goals"] == ["explanation"]


def test_question_routing_covers_productive_colloquial_intent_forms():
    assert analyze_reading_question("他在想什么？")["goals"] == ["explanation"]
    assert analyze_reading_question("他有没有想我？")["goals"] == ["forecast"]
    assert analyze_reading_question("选择哪一个更好？")["goals"] == ["comparison"]
    assert analyze_reading_question("换不换工作？")["goals"] == ["comparison"]
    assert analyze_reading_question("这张牌想告诉我什么？")["goals"] == ["explanation"]
    assert analyze_reading_question("我需要注意什么？")["goals"] == ["advice"]
    assert analyze_reading_question("我怎么做比较好？")["goals"] == ["advice"]
    assert analyze_reading_question("我今年能找到工作吗？")["goals"] == ["forecast"]
    assert analyze_reading_question("他会回来找我吗？")["goals"] == ["forecast"]


def test_question_routing_keeps_separate_clauses_in_mixed_goals():
    assert analyze_reading_question("这段关系会怎么发展，我该怎么做？")["goals"] == [
        "advice",
        "forecast",
    ]
    assert analyze_reading_question("我怎么做比较好？")["goals"] == ["advice"]


def test_question_routing_treats_action_suffixes_as_advice_instead_of_forecast():
    assert analyze_reading_question("关系如何处理？")["goals"] == ["advice"]
    assert analyze_reading_question("感情和工作如何平衡？")["goals"] == ["advice"]
    assert analyze_reading_question("工作如何发展？")["goals"] == ["forecast"]


def test_question_routing_keeps_selection_language_in_the_comparison_goal():
    assert analyze_reading_question("两个工作机会怎么选？")["goals"] == ["comparison"]
    assert analyze_reading_question("两个方案怎么选择？")["goals"] == ["comparison"]


def test_question_routing_keeps_paired_option_outcomes_in_the_comparison_goal():
    paired = analyze_reading_question("如果选择A会怎样，选择B会怎样？")
    assert paired["goals"] == ["forecast", "comparison"]
    assert "选项结果比较" in paired["matchedGoalTerms"]


def test_question_routing_sends_causal_yes_or_no_phrasing_to_explanation():
    assert analyze_reading_question("是不是因为我们冷战？")["goals"] == ["explanation"]
    assert analyze_reading_question("会不会是因为压力太大？")["goals"] == ["explanation"]
    assert analyze_reading_question("是因为工作太忙吗？")["goals"] == ["explanation"]
    assert analyze_reading_question("我想知道是什么导致现在的状态。")["goals"] == ["explanation"]
    assert analyze_reading_question("是不是会有变化？")["goals"] == ["forecast"]


def test_question_routing_normalizes_colloquial_option_comparisons():
    assert analyze_reading_question("是选A还是选B？")["goals"] == ["comparison"]
    assert analyze_reading_question("我应该选哪个方案？")["goals"] == ["comparison"]
    assert analyze_reading_question("哪一种发展更适合我？")["goals"] == ["comparison"]
    assert analyze_reading_question("未来会更好吗？")["goals"] == ["forecast"]


def test_first_reading_synthesis_must_cite_every_selected_card():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=CARDS)
    refs = [
        {
            "evidenceId": find_card_kind(evidence, card["id"], "orientation")["evidenceId"],
            "cardId": card["id"],
            "position": card["position"],
            "claim": find_card_kind(evidence, card["id"], "orientation")["text"][:4],
        }
        for card in CARDS
    ]
    base = {
        "text": "逐张说明并综合关系。",
        "cardReadings": [
            {
                "cardId": card["id"],
                "position": card["position"],
                "reading": "结合牌位说明一个可观察的角度。",
                "evidenceIds": [
                    find([ref for ref in refs if ref["cardId"] == card["id"]])["evidenceId"]
                ],
            }
            for card in CARDS
        ],
        "actions": [
            {
                "text": "先记录一次具体沟通，再复盘结果。",
                "evidenceIds": [refs[0]["evidenceId"]],
            }
        ],
        "references": refs,
    }
    valid = js_json(
        {
            **base,
            "synthesis": {
                "text": "第一张牌提示用稳定、温柔的方式行动；第二张牌提醒比较过去与当前事实。",
                "evidenceIds": [ref["evidenceId"] for ref in refs],
            },
        }
    )
    assert (
        len(
            parse_reading_output(
                valid,
                {
                    "cards": CARDS,
                    "evidence": evidence,
                    "requireCoverage": True,
                    "requireActions": True,
                    "requireReferences": True,
                    "requireReferenceClaims": True,
                    "requireSynthesis": True,
                    "requireSynthesisCardSupport": True,
                },
            )["synthesis"]["evidenceIds"]
        )
        == 2
    )
    with pytest.raises(ValueError, match="综合解读没有覆盖全部牌面"):
        parse_reading_output(
            js_json(
                {
                    **base,
                    "synthesis": {
                        "text": "只谈第一张牌。",
                        "evidenceIds": [refs[0]["evidenceId"]],
                    },
                }
            ),
            {
                "cards": CARDS,
                "evidence": evidence,
                "requireCoverage": True,
                "requireActions": True,
                "requireReferences": True,
                "requireReferenceClaims": True,
                "requireSynthesis": True,
            },
        )


def test_first_synthesis_prose_must_support_every_cited_card():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=CARDS)
    refs = [
        {
            "evidenceId": find_card_kind(evidence, card["id"], "orientation")["evidenceId"],
            "cardId": card["id"],
            "position": card["position"],
            "claim": find_card_kind(evidence, card["id"], "orientation")["text"][:4],
        }
        for card in CARDS
    ]
    output = js_json(
        {
            "text": "逐张说明并综合关系。",
            "synthesis": {
                "text": "只复述第一张牌的稳定与温柔。",
                "evidenceIds": [ref["evidenceId"] for ref in refs],
            },
            "references": refs,
        }
    )
    with pytest.raises(ValueError, match="综合解读内容与证据不匹配"):
        parse_reading_output(
            output,
            {
                "cards": CARDS,
                "evidence": evidence,
                "requireSynthesis": True,
                "requireSynthesisSupport": True,
                "requireSynthesisCardSupport": True,
            },
        )


def test_first_synthesis_must_cite_a_core_anchor_for_every_selected_card():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=CARDS)
    references = [
        find_card_kind(evidence, card["id"], "orientation")["evidenceId"] for card in CARDS
    ]
    reference_only = [
        find_card_kind(evidence, card["id"], "waite")["evidenceId"] for card in CARDS
    ]
    output = js_json(
        {
            "text": "逐张说明并综合关系。",
            "synthesis": {
                "text": "原典与当前问题形成一个观察线索。",
                "evidenceIds": reference_only,
            },
            "cardReadings": [
                {
                    "cardId": card["id"],
                    "position": card["position"],
                    "reading": "结合牌位说明一个可观察的角度。",
                    "evidenceIds": [
                        next(value for value in references if value.startswith(f"{card['id']}:"))
                    ],
                }
                for card in CARDS
            ],
            "actions": [
                {"text": "先记录一次具体沟通，再复盘结果。", "evidenceIds": [references[0]]}
            ],
            "references": [
                {
                    "evidenceId": next(
                        value for value in references if value.startswith(f"{card['id']}:")
                    ),
                    "cardId": card["id"],
                    "position": card["position"],
                    "claim": "稳定节奏",
                }
                for card in CARDS
            ],
            "uncertainty": "牌面不能确认结果。",
        }
    )
    with pytest.raises(ValueError, match="综合解读必须引用每张牌的核心锚点"):
        parse_reading_output(
            output,
            {
                "cards": CARDS,
                "evidence": evidence,
                "requireCoverage": True,
                "requireActions": True,
                "requireReferences": True,
                "requireReferenceClaims": True,
                "requireSynthesis": True,
                "requireSynthesisAnchors": True,
            },
        )


def test_clarification_responses_may_pause_interpretation_while_keeping_strict_validation_available():
    evidence = retrieve_reading_evidence(question="我最近想看看牌。", cards=[CARDS[0]])
    clarification = js_json(
        {
            "text": "我想先确认你真正想探索的方向。",
            "needsClarification": True,
            "clarification": "这次更想看关系、事业，还是一个具体决定？",
            "followUp": "请选择一个最想靠近的主题。",
        }
    )
    parsed = parse_reading_output(
        clarification,
        {
            "cards": [CARDS[0]],
            "evidence": evidence,
            "requireCoverage": True,
            "requireActions": True,
            "requireReferences": True,
        },
    )
    assert parsed["needsClarification"] is True
    assert parsed["clarification"] == "这次更想看关系、事业，还是一个具体决定？"
    assert parsed["cardReadings"] == []
    with pytest.raises(ValueError, match="澄清问题格式不正确"):
        parse_reading_output(
            js_json({"text": "请补充方向。", "needsClarification": True}),
            {"cards": [CARDS[0]], "evidence": evidence, "requireCoverage": True},
        )


def test_clarification_must_contain_a_concrete_question_cue():
    evidence = retrieve_reading_evidence(question="我最近想看看牌。", cards=[CARDS[0]])
    vague = js_json({"text": "请补充方向。", "needsClarification": True, "clarification": "请补充。"})
    with pytest.raises(ValueError, match="澄清问题格式不正确"):
        parse_reading_output(
            vague, {"cards": [CARDS[0]], "evidence": evidence, "requireCoverage": True}
        )


def test_clarification_cannot_carry_a_partial_structured_reading():
    evidence = retrieve_reading_evidence(question="我最近想看看牌。", cards=[CARDS[0]])
    output = js_json(
        {
            "text": "我先确认方向。",
            "needsClarification": True,
            "clarification": "这次更想看关系还是事业？",
            "cardReadings": [
                {
                    "cardId": "m08",
                    "position": "建议",
                    "reading": "先观察一个角度。",
                    "evidenceIds": [find(evidence, kind="orientation")["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="澄清时不能同时返回结构化解读"):
        parse_reading_output(output, {"cards": [CARDS[0]], "evidence": evidence})


def test_focused_first_readings_cannot_use_clarification_to_bypass_coverage():
    evidence = retrieve_reading_evidence(question="我该如何处理这段关系？", cards=[CARDS[0]])
    output = js_json(
        {"text": "请补充方向。", "needsClarification": True, "clarification": "你最想先看哪一部分？"}
    )
    with pytest.raises(ValueError, match="明确主题不允许跳过首轮解读"):
        parse_reading_output(
            output,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireCoverage": True,
                "requireActions": True,
                "requireReferences": True,
                "allowClarification": False,
            },
        )


def test_open_goals_with_an_explicit_theme_cannot_smuggle_in_a_prediction():
    evidence = retrieve_reading_evidence(question="这段关系", cards=[CARDS[0]])
    unsafe = js_json({"text": "你们可能会复合。"})
    with pytest.raises(ValueError, match="目标未明确时不能擅自预测"):
        parse_reading_output(
            unsafe,
            {"cards": [CARDS[0]], "evidence": evidence, "requireOpenGoalBoundary": True},
        )
    grounded = js_json({"text": "牌面提示先观察稳定而明确的互动。"})
    parse_reading_output(
        grounded,
        {"cards": [CARDS[0]], "evidence": evidence, "requireOpenGoalBoundary": True},
    )


def test_open_goals_reject_colloquial_outcome_and_mind_reading_predictions():
    evidence = retrieve_reading_evidence(question="这段关系", cards=[CARDS[0]])
    for text in ["你们还有机会在一起。", "这段关系很有戏。", "对方可能对你有感觉。"]:
        with pytest.raises(ValueError, match="目标未明确时不能擅自预测"):
            parse_reading_output(
                js_json({"text": text}),
                {"cards": [CARDS[0]], "evidence": evidence, "requireOpenGoalBoundary": True},
            )
    with pytest.raises(ValueError, match="目标未明确时不能擅自预测"):
        parse_reading_output(
            js_json({"text": "先观察稳定互动。", "clarification": "你想知道你们会不会复合？"}),
            {"cards": [CARDS[0]], "evidence": evidence, "requireOpenGoalBoundary": True},
        )


def test_structured_actions_must_cite_evidence_from_the_current_reading():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    valid = js_json(
        {
            "text": "先观察再沟通。",
            "actions": [
                {
                    "text": "记录一次具体沟通中的事实与感受。",
                    "reason": "把抽象担忧变成可观察材料。",
                    "evidenceIds": [evidence[0]["evidenceId"]],
                }
            ],
        }
    )
    parsed = parse_reading_output(valid, {"cards": [CARDS[0]], "evidence": evidence})
    assert parsed["actions"][0]["evidenceIds"][0] == evidence[0]["evidenceId"]
    with pytest.raises(ValueError, match="行动建议引用无效"):
        parse_reading_output(
            js_json({"text": "x", "actions": [{"text": "做点什么。", "evidenceIds": ["fake"]}]}),
            {"cards": [CARDS[0]], "evidence": evidence},
        )


def test_first_reading_requires_at_least_one_structured_action():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    orientation = find(evidence, kind="orientation")
    output = js_json(
        {
            "text": "先观察再沟通。",
            "cardReadings": [
                {
                    "cardId": "m08",
                    "position": "建议",
                    "reading": "观察一个可验证的角度。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
            "references": [
                {"evidenceId": orientation["evidenceId"], "cardId": "m08", "position": "建议"}
            ],
        }
    )
    with pytest.raises(ValueError, match="首轮解读需要行动建议"):
        parse_reading_output(
            output,
            {"cards": [CARDS[0]], "evidence": evidence, "requireCoverage": True, "requireActions": True},
        )


def test_first_reading_limits_structured_actions_to_three():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    orientation = find(evidence, kind="orientation")
    output = js_json(
        {
            "text": "先观察再沟通。",
            "cardReadings": [
                {
                    "cardId": "m08",
                    "position": "建议",
                    "reading": "观察一个可验证的角度。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
            "actions": [
                {"text": f"记录第{index + 1}次沟通。", "evidenceIds": [orientation["evidenceId"]]}
                for index in range(4)
            ],
        }
    )
    with pytest.raises(ValueError, match="行动建议格式不正确"):
        parse_reading_output(
            output,
            {"cards": [CARDS[0]], "evidence": evidence, "requireCoverage": True, "requireActions": True},
        )


def test_high_stakes_questions_require_an_explicit_reality_based_boundary():
    evidence = retrieve_reading_evidence(question="这项投资要不要买？", cards=[CARDS[0]])
    assert requires_professional_boundary("这项投资要不要买？") is True
    assert requires_professional_boundary("这段关系如何沟通？") is False
    no_boundary = js_json({"text": "可以放心买入。", "references": []})
    with pytest.raises(ValueError, match="高风险问题需要现实依据说明"):
        parse_reading_output(
            no_boundary,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireUncertainty": True,
                "requireRealityBoundary": True,
            },
        )
    grounded = js_json(
        {
            "text": "牌面只能作为反思线索。",
            "uncertainty": "投资决定请依据风险承受能力、产品资料和持牌专业意见。",
        }
    )
    assert (
        parse_reading_output(
            grounded, {"cards": [CARDS[0]], "evidence": evidence, "requireUncertainty": True}
        )["uncertainty"]
        == "投资决定请依据风险承受能力、产品资料和持牌专业意见。"
    )


def test_high_stakes_actions_must_carry_their_own_reality_check():
    evidence = retrieve_reading_evidence(question="这项投资要不要买？", cards=[CARDS[0]])
    orientation = find(evidence, kind="orientation")
    unsafe = js_json(
        {
            "text": "牌面提示可以继续推进。",
            "actions": [
                {
                    "text": "今天直接买入。",
                    "reason": "把牌面线索落实为行动。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
            "uncertainty": "投资决定请依据风险承受能力、产品资料和持牌专业意见。",
        }
    )
    with pytest.raises(ValueError, match="高风险行动必须先核实现实资料或咨询专业人士"):
        parse_reading_output(
            unsafe,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireRealityBoundary": True,
                "requireProfessionalActionBoundary": True,
            },
        )
    grounded = js_json(
        {
            "text": "牌面提示先整理条件。",
            "actions": [
                {
                    "text": "今天先查阅产品资料并咨询持牌顾问，再记录风险承受能力。",
                    "reason": "先用现实资料核验牌面线索，再决定是否继续。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
            "uncertainty": "投资决定请依据风险承受能力、产品资料和持牌专业意见。",
        }
    )
    parse_reading_output(
        grounded,
        {
            "cards": [CARDS[0]],
            "evidence": evidence,
            "requireRealityBoundary": True,
            "requireProfessionalActionBoundary": True,
        },
    )


def test_colloquial_housing_actions_use_the_same_professional_action_boundary():
    evidence = retrieve_reading_evidence(question="现在适合买房吗？", cards=[CARDS[0]])
    orientation = find(evidence, kind="orientation")
    unsafe = js_json(
        {
            "text": "牌面提示可以推进。",
            "actions": [
                {
                    "text": "今天先执行买房决定。",
                    "reason": "把牌面线索落实为行动。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
            "uncertainty": "买房决定请依据合同资料、贷款条件和专业意见。",
        }
    )
    with pytest.raises(ValueError, match="高风险行动必须先核实现实资料或咨询专业人士"):
        parse_reading_output(
            unsafe,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireRealityBoundary": True,
                "requireProfessionalActionBoundary": True,
            },
        )
    grounded = js_json(
        {
            "text": "牌面提示先整理条件。",
            "actions": [
                {
                    "text": "今天先核实购房合同和贷款条件，再咨询专业人士。",
                    "reason": "先用现实资料核验牌面线索，再决定是否继续。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
            "uncertainty": "买房决定请依据合同资料、贷款条件和专业意见。",
        }
    )
    parse_reading_output(
        grounded,
        {
            "cards": [CARDS[0]],
            "evidence": evidence,
            "requireRealityBoundary": True,
            "requireProfessionalActionBoundary": True,
        },
    )


def test_professional_boundary_recognizes_common_financial_legal_and_clinical_phrasings():
    assert requires_professional_boundary("这套房贷现在该不该申请？") is True
    assert requires_professional_boundary("这份检查报告代表什么？") is True
    assert requires_professional_boundary("离婚协议要怎么处理？") is True
    assert requires_professional_boundary("我想看看这段关系怎么沟通。") is False


def test_professional_boundary_recognizes_colloquial_high_stakes_wording():
    assert requires_professional_boundary("我最近胸口疼怎么办？") is True
    assert requires_professional_boundary("我能不能停药？") is True
    assert requires_professional_boundary("对方起诉我怎么办？") is True
    assert requires_professional_boundary("现在适合买房吗？") is True
    assert requires_professional_boundary("我每天只睡四小时会怎样？") is True
    assert requires_professional_boundary("我最近很焦虑怎么办？") is False


def test_mind_reading_questions_require_an_uncertainty_boundary_about_observable_reality():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="他的真实想法是什么？", cards=[card])
    assert requires_perspective_boundary("他的真实想法是什么？") is True
    assert requires_perspective_boundary("我该如何处理这段关系？") is False
    vague = js_json({"text": "牌面提示他内心仍然在意。", "uncertainty": "牌面只能提供趋势线索。"})
    with pytest.raises(ValueError, match="他人内心"):
        parse_reading_output(
            vague, {"cards": [card], "evidence": evidence, "requirePerspectiveBoundary": True}
        )
    grounded = js_json(
        {
            "text": "牌面只能作为理解互动的线索。",
            "uncertainty": "牌面不能确认对方的真实想法，需要通过沟通和现实互动核验。",
        }
    )
    assert (
        parse_reading_output(
            grounded,
            {"cards": [card], "evidence": evidence, "requirePerspectiveBoundary": True},
        )["uncertainty"]
        == "牌面不能确认对方的真实想法，需要通过沟通和现实互动核验。"
    )


def test_mind_reading_boundary_recognizes_colloquial_feeling_questions():
    assert requires_perspective_boundary("对方是不是喜欢我？") is True
    assert requires_perspective_boundary("他有没有感觉？") is True
    assert requires_perspective_boundary("他对我有好感吗？") is True
    assert requires_perspective_boundary("我喜欢他吗？") is False


def test_mind_reading_boundary_recognizes_colloquial_inner_state_questions():
    assert requires_perspective_boundary("他到底在想什么？") is True
    assert requires_perspective_boundary("对方现在是什么心态？") is True
    assert requires_perspective_boundary("她什么意思？") is True
    assert requires_perspective_boundary("他对我态度如何？") is True
    assert requires_perspective_boundary("对方怎么看我？") is True
    assert requires_perspective_boundary("我现在是什么心态？") is False


def test_high_stakes_boundary_accumulates_user_history_but_ignores_assistant_prose():
    assert (
        requires_professional_boundary(
            "我想继续聊关系。", [{"role": "user", "text": "这项投资要不要买？"}]
        )
        is True
    )
    assert (
        requires_professional_boundary(
            "我想继续聊关系。", [{"role": "assistant", "text": "这项投资要不要买？"}]
        )
        is False
    )


def test_high_stakes_boundary_rejects_a_domain_only_disclaimer():
    output = js_json({"text": "请谨慎。", "uncertainty": "投资需要谨慎。"})
    with pytest.raises(ValueError, match="高风险问题需要现实依据说明"):
        parse_reading_output(
            output, {"cards": [CARDS[0]], "evidence": [], "requireRealityBoundary": True}
        )


def test_high_stakes_uncertainty_must_name_a_reality_check_rather_than_a_vague_disclaimer():
    evidence = retrieve_reading_evidence(question="这项投资要不要买？", cards=[CARDS[0]])
    output = js_json({"text": "请谨慎。", "uncertainty": "不确定。"})
    with pytest.raises(ValueError, match="高风险问题需要现实依据说明"):
        parse_reading_output(
            output,
            {"cards": [CARDS[0]], "evidence": evidence, "requireRealityBoundary": True},
        )


def test_anchor_only_retrieval_requires_an_explicit_evidence_limitation():
    evidence = [
        item
        for item in retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
        if item["tier"] == "anchor"
    ]
    vague = js_json({"text": "先观察。", "uncertainty": "牌面不能确认结果。"})
    with pytest.raises(ValueError, match="证据覆盖不足"):
        parse_reading_output(
            vague,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireUncertainty": True,
                "requireCoverageBoundary": True,
            },
        )
    with pytest.raises(ValueError, match="证据覆盖不足"):
        parse_reading_output(
            vague,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireUncertainty": True,
                "requireCoverageBoundary": True,
                "isFollowUp": True,
            },
        )
    grounded = js_json(
        {
            "text": "先观察。",
            "uncertainty": "当前只有核心牌义，关系应用证据不足，需要结合现实资料。",
        }
    )
    assert (
        parse_reading_output(
            grounded,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireUncertainty": True,
                "requireCoverageBoundary": True,
            },
        )["uncertainty"]
        == "当前只有核心牌义，关系应用证据不足，需要结合现实资料。"
    )


def test_missing_forecast_evidence_requires_the_same_uncertainty_boundary():
    question = "我之后会怎样发展？"
    card = {"id": "m08", "reversed": False, "position": "建议"}
    full = retrieve_reading_evidence(question=question, cards=[card])
    evidence = [item for item in full if item["tier"] == "anchor"]
    vague = js_json({"text": "趋势会很清晰。", "uncertainty": "牌面不能确认结果。"})
    with pytest.raises(ValueError, match="证据覆盖不足"):
        parse_reading_output(
            vague,
            {
                "cards": [card],
                "evidence": evidence,
                "requireUncertainty": True,
                "requireCoverageBoundary": True,
            },
        )
    grounded = js_json(
        {"text": "先观察趋势。", "uncertainty": "当前缺少预测参考资料，牌面只能提供有限的趋势线索。"}
    )
    assert (
        parse_reading_output(
            grounded,
            {
                "cards": [card],
                "evidence": evidence,
                "requireUncertainty": True,
                "requireCoverageBoundary": True,
            },
        )["uncertainty"]
        == "当前缺少预测参考资料，牌面只能提供有限的趋势线索。"
    )


def test_coverage_boundary_names_the_missing_goal_layer_instead_of_only_saying_information_is_limited():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = [
        item
        for item in retrieve_reading_evidence(question="我之后会怎样发展？", cards=[card])
        if item["tier"] == "anchor"
    ]
    generic = js_json({"text": "先观察趋势。", "uncertainty": "当前资料有限，需要谨慎核实。"})
    with pytest.raises(ValueError, match="证据覆盖不足"):
        parse_reading_output(
            generic,
            {
                "cards": [card],
                "evidence": evidence,
                "requireUncertainty": True,
                "requireCoverageBoundary": True,
                "coverageBoundaryGoals": ["forecast"],
            },
        )
    grounded = js_json(
        {"text": "先观察趋势。", "uncertainty": "当前缺少预测参考资料，牌面只能提供有限的趋势线索。"}
    )
    parse_reading_output(
        grounded,
        {
            "cards": [card],
            "evidence": evidence,
            "requireUncertainty": True,
            "requireCoverageBoundary": True,
            "coverageBoundaryGoals": ["forecast"],
        },
    )


def test_forecast_readings_require_a_matching_reference_tier_citation_when_available():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="我之后会怎样发展？", cards=[card])
    orientation = find(evidence, kind="orientation")
    forecast_reference = next(
        item
        for item in evidence
        if item["tier"] == "reference" and "forecast" in item["retrievalGoals"]
    )
    assert forecast_reference
    missing = js_json(
        {
            "text": "先观察趋势。",
            "references": [
                {
                    "evidenceId": orientation["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "核心牌义",
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="首轮引用没有覆盖当前回答目标"):
        parse_reading_output(
            missing,
            {"cards": [card], "evidence": evidence, "requiredGoalEvidence": ["forecast"]},
        )
    valid = js_json(
        {
            "text": "先观察趋势。",
            "references": [
                {
                    "evidenceId": orientation["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "核心牌义",
                },
                {
                    "evidenceId": forecast_reference["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "未来趋势",
                },
            ],
        }
    )
    assert (
        len(
            parse_reading_output(
                valid,
                {"cards": [card], "evidence": evidence, "requiredGoalEvidence": ["forecast"]},
            )["references"]
        )
        == 2
    )


def test_forecast_top_level_text_must_use_the_routed_reference_concept():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="我之后会怎样发展？", cards=[card])
    orientation = find(evidence, kind="orientation")
    forecast_reference = next(
        item
        for item in evidence
        if item["tier"] == "reference" and "forecast" in item["retrievalGoals"]
    )
    assert orientation and forecast_reference
    detached = js_json(
        {
            "text": "未来先观察现实反馈，保持平静。",
            "references": [
                {
                    "evidenceId": orientation["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "稳定、温柔而明确",
                },
                {
                    "evidenceId": forecast_reference["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "Fortitude 的力量与勇气",
                },
            ],
        }
    )
    with pytest.raises(ValueError, match="回答正文没有覆盖当前目标证据"):
        parse_reading_output(
            detached,
            {
                "cards": [card],
                "evidence": evidence,
                "requiredGoalEvidence": ["forecast"],
                "requireGoalReferenceCoverage": True,
                "requireReferenceClaims": True,
                "requireReferenceSupport": True,
                "requireGoalTextCoverage": True,
            },
        )
    grounded = js_json(
        {
            "text": "未来可以以 Fortitude 的力量与勇气作为趋势参考，再观察现实反馈。",
            "references": [
                {
                    "evidenceId": orientation["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "稳定、温柔而明确",
                },
                {
                    "evidenceId": forecast_reference["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "Fortitude 的力量与勇气",
                },
            ],
        }
    )
    parse_reading_output(
        grounded,
        {
            "cards": [card],
            "evidence": evidence,
            "requiredGoalEvidence": ["forecast"],
            "requireGoalReferenceCoverage": True,
            "requireReferenceClaims": True,
            "requireReferenceSupport": True,
            "requireGoalTextCoverage": True,
        },
    )


def test_mixed_first_readings_require_one_grounded_section_per_routed_goal():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(
        question="我之后会怎样发展？同时我该怎么安排下一步？", cards=[card]
    )
    advice_application = next(
        item
        for item in evidence
        if item["tier"] == "application" and "advice" in item["retrievalGoals"]
    )
    assert advice_application
    valid = js_json(
        {
            "text": "分别看下一步与趋势。",
            "goalSections": [
                {
                    "goal": "advice",
                    "text": "先照顾情绪，再把下一步落实为不被情绪牵着走的行动。",
                    "evidenceIds": [advice_application["evidenceId"]],
                },
                {
                    "goal": "forecast",
                    "text": "以 Fortitude 的力量与勇气作为趋势参考。",
                    "evidenceIds": ["m08:waite"],
                },
            ],
        }
    )
    parsed = parse_reading_output(
        valid,
        {
            "cards": [card],
            "evidence": evidence,
            "requiredGoalSections": ["advice", "forecast"],
            "requireGoalSections": True,
        },
    )
    assert [item["goal"] for item in parsed["goalSections"]] == ["advice", "forecast"]
    wrong_order = js_json(
        {
            "text": "先讲趋势，再讲建议。",
            "goalSections": [
                {
                    "goal": "forecast",
                    "text": "以 Fortitude 的力量与勇气作为趋势参考。",
                    "evidenceIds": ["m08:waite"],
                },
                {
                    "goal": "advice",
                    "text": "先照顾情绪，再把下一步落实为不被情绪牵着走的行动。",
                    "evidenceIds": [advice_application["evidenceId"]],
                },
            ],
        }
    )
    with pytest.raises(ValueError, match="目标分段顺序不符合"):
        parse_reading_output(
            wrong_order,
            {
                "cards": [card],
                "evidence": evidence,
                "requiredGoalSections": ["advice", "forecast"],
                "requireGoalSections": True,
            },
        )
    missing = js_json(
        {
            "text": "只回答建议。",
            "goalSections": [
                {
                    "goal": "advice",
                    "text": "先照顾情绪，再把下一步落实为不被情绪牵着走的行动。",
                    "evidenceIds": [advice_application["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="必须按目标分别返回目标分段"):
        parse_reading_output(
            missing,
            {
                "cards": [card],
                "evidence": evidence,
                "requiredGoalSections": ["advice", "forecast"],
                "requireGoalSections": True,
            },
        )
    wrong_evidence = js_json(
        {
            "text": "目标依据不匹配。",
            "goalSections": [
                {
                    "goal": "advice",
                    "text": "以 Fortitude 的力量作为建议。",
                    "evidenceIds": ["m08:waite"],
                },
                {
                    "goal": "forecast",
                    "text": "以 Fortitude 的力量与勇气作为趋势参考。",
                    "evidenceIds": ["m08:waite"],
                },
            ],
        }
    )
    with pytest.raises(ValueError, match="目标分段引用无效"):
        parse_reading_output(
            wrong_evidence,
            {
                "cards": [card],
                "evidence": evidence,
                "requiredGoalSections": ["advice", "forecast"],
                "requireGoalSections": True,
            },
        )
    wrong_tier = js_json(
        {
            "text": "预测分段缺少参考层级。",
            "goalSections": [
                {
                    "goal": "advice",
                    "text": "把稳定、温柔而明确的方式落实为下一步。",
                    "evidenceIds": ["m08:orientation"],
                },
                {
                    "goal": "forecast",
                    "text": "以稳定线索作为趋势参考。",
                    "evidenceIds": ["m08:orientation"],
                },
            ],
        }
    )
    with pytest.raises(ValueError, match="目标分段缺少目标层级证据"):
        parse_reading_output(
            wrong_tier,
            {
                "cards": [card],
                "evidence": evidence,
                "requiredGoalSections": ["advice", "forecast"],
                "requireGoalSections": True,
            },
        )
    unrequested = js_json(
        {
            "text": "加入未请求目标。",
            "goalSections": [
                {
                    "goal": "advice",
                    "text": "先照顾情绪，再把下一步落实为不被情绪牵着走的行动。",
                    "evidenceIds": [advice_application["evidenceId"]],
                },
                {
                    "goal": "forecast",
                    "text": "以 Fortitude 的力量与勇气作为趋势参考。",
                    "evidenceIds": ["m08:waite"],
                },
                {
                    "goal": "comparison",
                    "text": "比较条件与代价。",
                    "evidenceIds": ["m08:modern"],
                },
            ],
        }
    )
    with pytest.raises(ValueError, match="目标分段目标未被本轮路由"):
        parse_reading_output(
            unrequested,
            {
                "cards": [card],
                "evidence": evidence,
                "requiredGoalSections": ["advice", "forecast"],
                "requireGoalSections": True,
            },
        )


def test_mixed_first_reading_top_level_text_must_cover_every_routed_goal():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(
        question="我之后会怎样发展？同时我该怎么安排下一步？", cards=[card]
    )
    advice = next(
        item
        for item in evidence
        if item["tier"] == "application" and "advice" in item["retrievalGoals"]
    )
    forecast = next(
        item
        for item in evidence
        if item["tier"] == "reference" and "forecast" in item["retrievalGoals"]
    )
    assert advice and forecast
    sections = [
        {
            "goal": "advice",
            "text": "先照顾情绪，再把下一步落实为不被情绪牵着走的行动。",
            "evidenceIds": [advice["evidenceId"]],
        },
        {
            "goal": "forecast",
            "text": "以 Fortitude 的力量与勇气作为趋势参考。",
            "evidenceIds": [forecast["evidenceId"]],
        },
    ]
    missing = js_json({"text": "用稳定、温柔而明确的方式面对下一步。", "goalSections": sections})
    with pytest.raises(ValueError, match="混合目标正文没有覆盖每个回答目标"):
        parse_reading_output(
            missing,
            {
                "cards": [card],
                "evidence": evidence,
                "requiredGoalSections": ["advice", "forecast"],
                "requireGoalSections": True,
                "requireGoalTextCoverage": True,
                "requireTextSupport": True,
            },
        )
    covered = js_json(
        {
            "text": "先照顾情绪，再不被它牵着走，并以 Fortitude 的力量与勇气观察发展。",
            "goalSections": sections,
        }
    )
    assert [
        item["goal"]
        for item in parse_reading_output(
            covered,
            {
                "cards": [card],
                "evidence": evidence,
                "requiredGoalSections": ["advice", "forecast"],
                "requireGoalSections": True,
                "requireGoalTextCoverage": True,
                "requireTextSupport": True,
            },
        )["goalSections"]
    ] == ["advice", "forecast"]


def test_single_goal_readings_reject_an_unrequested_goal_section():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="我该怎么处理这段关系？", cards=[card])
    output = js_json(
        {
            "text": "先回答当前目标。",
            "goalSections": [
                {"goal": "forecast", "text": "补充一段预测。", "evidenceIds": ["m08:orientation"]}
            ],
        }
    )
    with pytest.raises(ValueError, match="目标分段目标未被本轮路由"):
        parse_reading_output(
            output, {"cards": [card], "evidence": evidence, "allowedGoalSections": ["advice"]}
        )


def test_single_goal_goal_sections_must_also_use_specific_evidence_terms():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="我该怎么处理这段关系？", cards=[card])
    advice_application = next(
        item
        for item in evidence
        if item["tier"] == "application" and "advice" in item["retrievalGoals"]
    )
    output = js_json(
        {
            "text": "先回答当前目标。",
            "goalSections": [
                {
                    "goal": "advice",
                    "text": "说明方向并观察结果。",
                    "evidenceIds": [advice_application["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="目标分段内容与证据不匹配"):
        parse_reading_output(
            output, {"cards": [card], "evidence": evidence, "allowedGoalSections": ["advice"]}
        )


def test_first_reading_goal_sections_require_the_routed_goal_evidence_tier():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="我该怎么处理这段关系？", cards=[card])
    orientation = find(evidence, kind="orientation")
    output = js_json(
        {
            "text": "先回答当前目标。",
            "goalSections": [
                {
                    "goal": "advice",
                    "text": "以稳定节奏落实下一步。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="目标分段缺少目标层级证据"):
        parse_reading_output(
            output, {"cards": [card], "evidence": evidence, "allowedGoalSections": ["advice"]}
        )


def test_calibration_rejects_absolute_predictive_claims_even_when_the_output_is_structured():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    output = js_json(
        {
            "text": "这张牌保证你们一定会复合。",
            "cardReadings": [
                {
                    "cardId": "m08",
                    "position": "建议",
                    "reading": "把稳定节奏作为观察线索。",
                    "evidenceIds": [find(evidence, kind="orientation")["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="绝对断言"):
        parse_reading_output(
            output,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireCardReadingSupport": True,
                "requireCalibratedLanguage": True,
            },
        )


def test_calibration_rejects_absolute_claims_in_actions_and_goal_sections():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    orientation = find(evidence, kind="orientation")
    action_output = js_json(
        {
            "text": "保持稳定节奏。",
            "actions": [
                {
                    "text": "今天记录一次稳定行动。",
                    "reason": "这保证对方一定会回来。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="绝对断言"):
        parse_reading_output(
            action_output,
            {"cards": [CARDS[0]], "evidence": evidence, "requireCalibratedLanguage": True},
        )
    advice = next(
        (
            item
            for item in evidence
            if item["tier"] == "application"
            and item.get("retrievalGoals")
            and "advice" in item["retrievalGoals"]
        ),
        orientation,
    )
    goal_output = js_json(
        {
            "text": "保持稳定节奏。",
            "goalSections": [
                {"goal": "advice", "text": "平静一定会解决问题。", "evidenceIds": [advice["evidenceId"]]}
            ],
        }
    )
    with pytest.raises(ValueError, match="绝对断言"):
        parse_reading_output(
            goal_output,
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "allowedGoalSections": ["advice"],
                "requireCalibratedLanguage": True,
            },
        )


def test_calibration_allows_a_negated_boundary_around_an_absolute_prediction():
    output = js_json({"text": "牌面不能保证一定会复合，仍需观察现实沟通。"})
    parsed = parse_reading_output(output, {"requireCalibratedLanguage": True})
    assert parsed["text"] == "牌面不能保证一定会复合，仍需观察现实沟通。"


def test_calibration_rejects_deterministic_timing_claims_but_allows_timed_actions():
    timed_prediction = js_json({"text": "三天后他会主动联系你。", "uncertainty": "牌面不能确认具体日期。"})
    with pytest.raises(ValueError, match="确定时间"):
        parse_reading_output(timed_prediction, {"requireCalibratedLanguage": True})
    bounded_timing = js_json({"text": "牌面不能保证三天后会发生这件事。", "uncertainty": "仍需观察现实反馈。"})
    parse_reading_output(bounded_timing, {"requireCalibratedLanguage": True})
    timed_action = js_json(
        {
            "text": "把稳定节奏作为观察线索。",
            "actions": [
                {
                    "text": "未来三天记录一次现实反馈。",
                    "reason": "用稳定节奏核对现实互动。",
                    "evidenceIds": ["m08:orientation"],
                }
            ],
        }
    )
    parse_reading_output(
        timed_action,
        {
            "cards": [{"id": "m08", "position": "建议"}],
            "evidence": [
                {
                    "evidenceId": "m08:orientation",
                    "cardId": "m08",
                    "position": "建议",
                    "tier": "anchor",
                    "text": "用稳定节奏观察现实反馈。",
                }
            ],
            "requireCalibratedLanguage": True,
        },
    )


def test_plain_text_provider_responses_stay_backward_compatible_without_inventing_references():
    parsed = parse_reading_output("保持稳定练习。", {"cards": CARDS, "evidence": []})
    assert parsed == {
        "text": "保持稳定练习。",
        "synthesis": {"text": "", "evidenceIds": []},
        "goalSections": [],
        "references": [],
        "cardReadings": [],
        "actions": [],
        "needsClarification": False,
        "clarification": "",
        "followUp": "",
        "uncertainty": "",
    }


def test_plain_text_follow_ups_still_require_a_concrete_evidence_overlap():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    assert (
        parse_reading_output(
            "保持温柔而稳定的练习。",
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "isFollowUp": True,
                "requireTextSupport": True,
            },
        )["text"]
        == "保持温柔而稳定的练习。"
    )
    with pytest.raises(ValueError, match="追问正文与证据不匹配"):
        parse_reading_output(
            "对方已经搬去火星。",
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "isFollowUp": True,
                "requireTextSupport": True,
            },
        )
    with pytest.raises(ValueError, match="确定时间"):
        parse_reading_output(
            "稳定节奏会在三天后出现。",
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "isFollowUp": True,
                "requireTextSupport": True,
                "requireCalibratedLanguage": True,
            },
        )


def test_structured_follow_ups_require_top_level_text_support_from_cited_evidence():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="继续聊聊", cards=[card])
    orientation = find(evidence, kind="orientation")
    generic = js_json(
        {
            "text": "对方已经搬去火星。",
            "references": [
                {
                    "evidenceId": orientation["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "稳定节奏",
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="追问正文与证据不匹配"):
        parse_reading_output(
            generic,
            {
                "cards": [card],
                "evidence": evidence,
                "requireReferenceClaims": True,
                "requireReferenceSupport": True,
                "isFollowUp": True,
            },
        )
    grounded = js_json(
        {
            "text": "继续用稳定、温柔的方式观察现实回应。",
            "references": [
                {
                    "evidenceId": orientation["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "稳定节奏",
                }
            ],
        }
    )
    assert (
        parse_reading_output(
            grounded,
            {
                "cards": [card],
                "evidence": evidence,
                "requireReferenceClaims": True,
                "requireReferenceSupport": True,
                "isFollowUp": True,
            },
        )["text"]
        == "继续用稳定、温柔的方式观察现实回应。"
    )


def test_structured_follow_ups_can_ground_top_level_text_through_goal_sections():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="我该如何处理这段关系？", cards=[card])
    orientation = find(evidence, kind="orientation")
    output = js_json(
        {
            "text": "继续用稳定、温柔的方式观察下一步。",
            "goalSections": [
                {
                    "goal": "advice",
                    "text": "把稳定、温柔的方式落实为下一步。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
        }
    )
    parsed = parse_reading_output(
        output,
        {
            "cards": [card],
            "evidence": evidence,
            "allowedGoalSections": ["advice"],
            "isFollowUp": True,
        },
    )
    assert parsed["goalSections"][0]["goal"] == "advice"


def test_structured_follow_up_actions_must_stay_grounded_in_their_evidence():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="继续聊聊", cards=[card])
    orientation = find(evidence, kind="orientation")
    unsupported = js_json(
        {
            "text": "保持稳定、温柔而明确。",
            "actions": [
                {
                    "text": "对方已经搬去火星。",
                    "reason": "依据稳定、温柔的牌面线索。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="行动建议内容与证据不匹配"):
        parse_reading_output(
            unsupported,
            {"cards": [card], "evidence": evidence, "isFollowUp": True, "requireTextSupport": True},
        )
    grounded = js_json(
        {
            "text": "保持稳定、温柔而明确。",
            "actions": [
                {
                    "text": "今天记录一次稳定、温柔而明确的沟通。",
                    "reason": "依据稳定、温柔的牌面线索。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
        }
    )
    assert (
        len(
            parse_reading_output(
                grounded,
                {
                    "cards": [card],
                    "evidence": evidence,
                    "isFollowUp": True,
                    "requireTextSupport": True,
                },
            )["actions"]
        )
        == 1
    )


def test_structured_advice_follow_up_actions_require_available_application_evidence():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="我该如何处理这段关系？", cards=[card])
    orientation = find(evidence, kind="orientation")
    application = find(evidence, kind="relationships")
    output = js_json(
        {
            "text": "继续用稳定、温柔的方式观察现实回应。",
            "actions": [
                {
                    "text": "今天记录一次稳定、温柔的沟通。",
                    "reason": "依据稳定、温柔的牌面线索。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="首轮行动建议缺少当前目标的应用证据"):
        parse_reading_output(
            output,
            {
                "cards": [card],
                "evidence": evidence,
                "requiredActionGoalEvidence": ["advice"],
                "isFollowUp": True,
                "requireTextSupport": True,
            },
        )
    valid = js_json(
        {
            "text": "继续用稳定、温柔的方式观察现实回应。",
            "actions": [
                {
                    "text": "今天记录一次稳定、温柔的沟通。",
                    "reason": "依据稳定、温柔的牌面线索。",
                    "evidenceIds": [orientation["evidenceId"], application["evidenceId"]],
                }
            ],
        }
    )
    assert (
        len(
            parse_reading_output(
                valid,
                {
                    "cards": [card],
                    "evidence": evidence,
                    "requiredActionGoalEvidence": ["advice"],
                    "isFollowUp": True,
                    "requireTextSupport": True,
                },
            )["actions"]
        )
        == 1
    )


def test_rejects_a_grounded_response_that_does_not_answer_the_explicit_question_domain():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="我该如何处理这段关系？", cards=[card])
    orientation = find(evidence, kind="orientation")
    output = js_json(
        {
            "text": "继续用稳定、温柔而明确的方式面对恐惧。",
            "actions": [
                {
                    "text": "今天记录一次稳定的行动。",
                    "reason": "稳定节奏可以帮助继续观察。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="没有直接回应本轮问题"):
        parse_reading_output(
            output,
            {
                "cards": [card],
                "evidence": evidence,
                "activeQuestion": "我该如何处理这段关系？",
                "requireQuestionRelevance": True,
                "requireTextSupport": True,
                "isFollowUp": True,
            },
        )
    relevant = js_json(
        {
            "text": "这段关系可以继续用稳定、温柔而明确的方式面对恐惧。",
            "actions": [
                {
                    "text": "今天记录一次稳定的行动。",
                    "reason": "稳定节奏可以帮助继续观察。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
        }
    )
    parse_reading_output(
        relevant,
        {
            "cards": [card],
            "evidence": evidence,
            "activeQuestion": "我该如何处理这段关系？",
            "requireQuestionRelevance": True,
            "requireTextSupport": True,
            "isFollowUp": True,
        },
    )


def test_accepts_a_same_domain_synonym_in_active_question_relevance():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="我该如何准备考试？", cards=[card])
    orientation = find(evidence, kind="orientation")
    output = js_json(
        {
            "text": "学习安排可以继续用稳定、温柔而明确的方式面对恐惧。",
            "actions": [
                {
                    "text": "今天记录一次学习中的稳定节奏行动。",
                    "reason": "稳定节奏可以帮助继续观察。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
        }
    )
    parse_reading_output(
        output,
        {
            "cards": [card],
            "evidence": evidence,
            "activeQuestion": "我该如何准备考试？",
            "requireQuestionRelevance": True,
            "requireTextSupport": True,
            "isFollowUp": True,
        },
    )


def test_requires_every_explicit_topic_in_a_mixed_active_question():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="这段感情和工作如何平衡？", cards=[card])
    orientation = find(evidence, kind="orientation")
    work = find(evidence, kind="work")
    missing = js_json(
        {
            "text": "这段感情可以继续用稳定、温柔而明确的方式面对恐惧。",
            "actions": [
                {
                    "text": "今天记录一次稳定的行动。",
                    "reason": "稳定节奏可以帮助继续观察。",
                    "evidenceIds": [orientation["evidenceId"], work["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="没有直接回应本轮问题"):
        parse_reading_output(
            missing,
            {
                "cards": [card],
                "evidence": evidence,
                "activeQuestion": "这段感情和工作如何平衡？",
                "requireQuestionRelevance": True,
                "requireTextSupport": True,
                "isFollowUp": True,
            },
        )
    complete = js_json(
        {
            "text": "这段感情与工作安排都可以继续用稳定、温柔而明确的方式面对恐惧。",
            "actions": [
                {
                    "text": "今天记录一次稳定的行动。",
                    "reason": "稳定节奏可以帮助继续观察。",
                    "evidenceIds": [orientation["evidenceId"], work["evidenceId"]],
                }
            ],
        }
    )
    parse_reading_output(
        complete,
        {
            "cards": [card],
            "evidence": evidence,
            "activeQuestion": "这段感情和工作如何平衡？",
            "requireQuestionRelevance": True,
            "requireTextSupport": True,
            "isFollowUp": True,
        },
    )


def test_requires_the_top_level_answer_to_honor_an_explicit_response_goal():
    output = js_json({"text": "把稳定节奏拆成今天可以执行的小步。"})
    with pytest.raises(ValueError, match="回答没有遵守本轮目标模式"):
        parse_reading_output(
            output, {"requiredOutputGoals": ["forecast"], "requireGoalAlignment": True}
        )
    observation_only = js_json({"text": "先观察现实反馈，再保持稳定节奏。"})
    with pytest.raises(ValueError, match="回答没有遵守本轮目标模式"):
        parse_reading_output(
            observation_only,
            {"requiredOutputGoals": ["forecast"], "requireGoalAlignment": True},
        )
    valid = js_json({"text": "趋势仍可能变化，先观察现实反馈再复盘。"})
    parse_reading_output(
        valid, {"requiredOutputGoals": ["forecast"], "requireGoalAlignment": True}
    )


def test_comparison_answers_must_name_a_side_and_a_trade_off():
    vague = js_json({"text": "比较并做决定。"})
    with pytest.raises(ValueError, match="回答没有遵守本轮目标模式"):
        parse_reading_output(
            vague, {"requiredOutputGoals": ["comparison"], "requireGoalAlignment": True}
        )
    grounded = js_json({"text": "比较主动联系与等待的条件和代价，再根据现实反馈选择。"})
    parse_reading_output(
        grounded, {"requiredOutputGoals": ["comparison"], "requireGoalAlignment": True}
    )


def test_checks_each_mixed_goal_section_against_its_own_response_mode():
    evidence = [
        {
            "evidenceId": "advice:application",
            "retrievalGoals": ["advice"],
            "tier": "application",
            "text": "稳定节奏可以落实为今天的一步行动。",
        },
        {
            "evidenceId": "advice:wrong",
            "retrievalGoals": ["advice"],
            "tier": "application",
            "text": "趋势可能变化，先观察现实反馈。",
        },
        {
            "evidenceId": "forecast:reference",
            "retrievalGoals": ["forecast"],
            "tier": "reference",
            "text": "趋势可能变化，先观察现实反馈。",
        },
    ]
    output = js_json(
        {
            "text": "先给出下一步，再说明趋势。",
            "goalSections": [
                {
                    "goal": "advice",
                    "text": "先把稳定节奏落实为今天的一步行动。",
                    "evidenceIds": ["advice:application"],
                },
                {
                    "goal": "forecast",
                    "text": "趋势可能变化，先观察现实反馈。",
                    "evidenceIds": ["forecast:reference"],
                },
            ],
        }
    )
    parse_reading_output(
        output,
        {
            "evidence": evidence,
            "requiredOutputGoals": ["advice", "forecast"],
            "requireGoalAlignment": True,
        },
    )
    wrong = js_json(
        {
            "text": "先给出下一步，再说明趋势。",
            "goalSections": [
                {
                    "goal": "advice",
                    "text": "趋势可能变化，先观察现实反馈。",
                    "evidenceIds": ["advice:wrong"],
                },
                {
                    "goal": "forecast",
                    "text": "趋势可能变化，先观察现实反馈。",
                    "evidenceIds": ["forecast:reference"],
                },
            ],
        }
    )
    with pytest.raises(ValueError, match="回答没有遵守本轮目标模式"):
        parse_reading_output(
            wrong,
            {
                "evidence": evidence,
                "requiredOutputGoals": ["advice", "forecast"],
                "requireGoalAlignment": True,
            },
        )


def test_requires_an_optional_follow_up_to_be_one_concrete_question():
    vague = js_json({"text": "把稳定节奏拆成可执行的小步。", "followUp": "还有什么想问的吗？"})
    with pytest.raises(ValueError, match="追问问题格式不正确"):
        parse_reading_output(vague, {"requireFollowUpQuestion": True})
    multiple = js_json(
        {"text": "把稳定节奏拆成可执行的小步。", "followUp": "你想先看关系吗？还是要继续问事业？"}
    )
    with pytest.raises(ValueError, match="追问问题格式不正确"):
        parse_reading_output(multiple, {"requireFollowUpQuestion": True})
    focused = js_json({"text": "把稳定节奏拆成可执行的小步。", "followUp": "你最容易在哪个时段中断？"})
    parse_reading_output(focused, {"requireFollowUpQuestion": True})


def test_grounding_rejects_an_unsupported_comma_clause_after_a_supported_clause():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="我每天学习两小时，如何保持？", cards=[card])
    orientation = find(evidence, kind="orientation")
    work = find(evidence, kind="work")
    unsupported = js_json(
        {
            "text": "保持稳定节奏。",
            "actions": [
                {
                    "text": "保持稳定节奏，但对方已经搬去火星。",
                    "evidenceIds": [orientation["evidenceId"], work["evidenceId"]],
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="行动建议内容与证据不匹配"):
        parse_reading_output(
            unsupported,
            {"cards": [card], "evidence": evidence, "isFollowUp": True, "requireTextSupport": True},
        )
    grounded = js_json(
        {
            "text": "保持稳定节奏。",
            "actions": [
                {
                    "text": "今天记录一次稳定节奏，并练习克制情绪。",
                    "evidenceIds": [orientation["evidenceId"], work["evidenceId"]],
                }
            ],
        }
    )
    assert (
        len(
            parse_reading_output(
                grounded,
                {
                    "cards": [card],
                    "evidence": evidence,
                    "isFollowUp": True,
                    "requireTextSupport": True,
                },
            )["actions"]
        )
        == 1
    )


def test_grounding_rejects_unsupported_conjunction_and_enumeration_clauses():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[card])
    orientation = find(evidence, kind="orientation")
    for text in [
        "保持稳定然而对方已经搬去火星。",
        "保持稳定、对方已经搬去火星。",
        "保持稳定并且对方已经搬去火星。",
        "保持稳定而对方已经搬去火星。",
        "保持稳定且对方已经搬去火星。",
        "保持稳定并对方已经搬去火星。",
        "保持稳定以及对方已经搬去火星。",
        "保持稳定也对方已经搬去火星。",
        "保持稳定所以对方已经搬去火星。",
        "保持稳定因此对方已经搬去火星。",
        "保持稳定因为对方已经搬去火星。",
    ]:
        unsupported = js_json(
            {
                "text": "保持稳定。",
                "cardReadings": [
                    {
                        "cardId": "m08",
                        "position": "建议",
                        "reading": text,
                        "evidenceIds": [orientation["evidenceId"]],
                    }
                ],
            }
        )
        with pytest.raises(ValueError, match="逐牌解读内容与证据不匹配"):
            parse_reading_output(
                unsupported,
                {"cards": [card], "evidence": evidence, "requireCardReadingSupport": True},
            )
    grounded = js_json(
        {
            "text": "保持稳定。",
            "cardReadings": [
                {
                    "cardId": "m08",
                    "position": "建议",
                    "reading": "保持稳定、温柔而明确。",
                    "evidenceIds": [orientation["evidenceId"]],
                }
            ],
        }
    )
    assert (
        len(
            parse_reading_output(
                grounded,
                {"cards": [card], "evidence": evidence, "requireCardReadingSupport": True},
            )["cardReadings"]
        )
        == 1
    )


def test_mixed_structured_follow_ups_must_cover_every_returned_goal_in_top_level_text():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(
        question="我之后会怎样发展？同时我该怎么安排下一步？", cards=[card]
    )
    advice = next(
        item
        for item in evidence
        if item["tier"] == "application" and "advice" in item["retrievalGoals"]
    )
    forecast = next(
        item
        for item in evidence
        if item["tier"] == "reference" and "forecast" in item["retrievalGoals"]
    )
    assert advice and forecast
    sections = [
        {
            "goal": "advice",
            "text": "先照顾情绪，再把下一步落实为不被情绪牵着走的行动。",
            "evidenceIds": [advice["evidenceId"]],
        },
        {
            "goal": "forecast",
            "text": "以 Fortitude 作为趋势参考。",
            "evidenceIds": [forecast["evidenceId"]],
        },
    ]
    missing = js_json({"text": "先照顾情绪，再不被它牵着走。", "goalSections": sections})
    with pytest.raises(ValueError, match="混合目标正文没有覆盖每个回答目标"):
        parse_reading_output(
            missing,
            {
                "cards": [card],
                "evidence": evidence,
                "allowedGoalSections": ["advice", "forecast"],
                "requireGoalTextCoverage": True,
                "requireTextSupport": True,
                "isFollowUp": True,
            },
        )
    covered = js_json(
        {
            "text": "先照顾情绪，再不被它牵着走，并以 Fortitude 作为趋势参考。",
            "goalSections": sections,
        }
    )
    assert [
        item["goal"]
        for item in parse_reading_output(
            covered,
            {
                "cards": [card],
                "evidence": evidence,
                "allowedGoalSections": ["advice", "forecast"],
                "requireGoalTextCoverage": True,
                "requireTextSupport": True,
                "isFollowUp": True,
            },
        )["goalSections"]
    ] == ["advice", "forecast"]


def test_structured_follow_ups_require_the_routed_goal_evidence_tier():
    card = {"id": "m08", "reversed": False, "position": "建议"}
    evidence = retrieve_reading_evidence(question="我之后会怎样发展？", cards=[card])
    orientation = find(evidence, kind="orientation")
    forecast = next(
        item
        for item in evidence
        if item["tier"] == "reference"
        and item.get("retrievalGoals")
        and "forecast" in item["retrievalGoals"]
    )
    missing = js_json(
        {
            "text": "保持稳定节奏。",
            "references": [
                {
                    "evidenceId": orientation["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "稳定节奏",
                }
            ],
        }
    )
    with pytest.raises(ValueError, match="追问引用没有覆盖当前回答目标"):
        parse_reading_output(
            missing,
            {
                "cards": [card],
                "evidence": evidence,
                "requiredGoalEvidence": ["forecast"],
                "requireGoalReferenceCoverage": True,
                "requireReferenceClaims": True,
                "requireReferenceSupport": True,
                "isFollowUp": True,
            },
        )
    valid = js_json(
        {
            "text": "保持稳定、温柔而明确。",
            "references": [
                {
                    "evidenceId": orientation["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "稳定节奏",
                },
                {
                    "evidenceId": forecast["evidenceId"],
                    "cardId": "m08",
                    "position": "建议",
                    "claim": "Fortitude",
                },
            ],
        }
    )
    assert (
        len(
            parse_reading_output(
                valid,
                {
                    "cards": [card],
                    "evidence": evidence,
                    "requiredGoalEvidence": ["forecast"],
                    "requireGoalReferenceCoverage": True,
                    "requireReferenceClaims": True,
                    "requireReferenceSupport": True,
                    "isFollowUp": True,
                },
            )["references"]
        )
        == 2
    )
    section_only = js_json(
        {
            "text": "Fortitude 提供一条趋势参考。",
            "goalSections": [
                {
                    "goal": "forecast",
                    "text": "以 Fortitude 作为趋势参考。",
                    "evidenceIds": [forecast["evidenceId"]],
                }
            ],
        }
    )
    assert (
        parse_reading_output(
            section_only,
            {
                "cards": [card],
                "evidence": evidence,
                "requiredGoalEvidence": ["forecast"],
                "requireGoalReferenceCoverage": True,
                "allowedGoalSections": ["forecast"],
                "isFollowUp": True,
            },
        )["goalSections"][0]["goal"]
        == "forecast"
    )


def test_first_readings_reject_plain_text_so_the_grounding_contract_cannot_be_bypassed():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=[CARDS[0]])
    with pytest.raises(ValueError, match="首轮解读必须返回结构化 JSON"):
        parse_reading_output(
            "保持稳定练习。",
            {
                "cards": [CARDS[0]],
                "evidence": evidence,
                "requireCoverage": True,
                "requireActions": True,
                "requireReferences": True,
                "requireReferenceClaims": True,
            },
        )

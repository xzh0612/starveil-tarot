"""Regression tests for the reading-rag retrieval contract.

Translated from ``server-js-reference/tests/reading-rag.test.mjs`` (lines 1-563)
so the Python port keeps the same coverage as the JavaScript original. Each test
asserts exactly what its JavaScript counterpart asserts, with the same inputs and
the same expectations.
"""

from __future__ import annotations

import re

from backend.reading_rag import (
    GOAL_REFERENCE_TIERS,
    READING_CORPUS_STATUS,
    analyze_reading_question,
    can_ask_clarification,
    evidence_source_authority,
    reading_query_for,
    reading_retrieval_for,
    rerank_reading_evidence,
    requires_professional_boundary,
    retrieve_reading_evidence,
    summarize_reading_evidence,
    validate_reading_corpus,
)

# The two-card spread used by most of the original suite.
CARDS = [
    {"id": "m08", "reversed": False, "position": "建议"},
    {"id": "c06", "reversed": True, "position": "关系挑战"},
]


def find(items, **match):
    """`items.find(item => ...)` — first match, or fail loudly like the JS does."""
    for item in items:
        if all(item[key] == value for key, value in match.items()):
            return item
    raise AssertionError(f"no evidence chunk matching {match!r}")


def is_frozen(mapping):
    """`Object.isFrozen`: true when callers cannot add a key to the contract."""
    try:
        mapping["__freeze_probe__"] = "probe"
    except TypeError:
        return True
    del mapping["__freeze_probe__"]
    return False


def test_goal_evidence_tiers_use_one_shared_immutable_contract():
    assert GOAL_REFERENCE_TIERS == {
        "advice": "application",
        "comparison": "application",
        "forecast": "reference",
        "explanation": "anchor",
    }
    assert is_frozen(GOAL_REFERENCE_TIERS) is True


def test_source_authority_keeps_fixed_card_meaning_above_supplemental_context():
    assert evidence_source_authority("editorial") == "canonical_fixed"
    assert evidence_source_authority("waite") == "historical_reference"
    assert evidence_source_authority("corpora") == "contextual_reference"
    assert evidence_source_authority("memory") == "user_context"
    assert evidence_source_authority("unknown") == "unknown"
    evidence = retrieve_reading_evidence(question="我们之间的沟通要怎么调整？", cards=[CARDS[0]])
    assert find(evidence, kind="orientation")["sourceAuthority"] == "canonical_fixed"
    assert find(evidence, kind="waite")["sourceAuthority"] == "historical_reference"


def test_reading_corpus_contains_complete_fixed_and_reference_material_for_all_78_cards():
    status = validate_reading_corpus()
    assert status == READING_CORPUS_STATUS
    assert status["ok"] is True
    assert {
        "cards": status["cardCount"],
        "guides": status["guideCount"],
        "references": status["referenceCount"],
    } == {"cards": 78, "guides": 78, "references": 78}
    assert status["missingGuides"] == []
    assert status["missingReferences"] == []
    assert status["orphanGuides"] == []
    assert status["orphanReferences"] == []


def test_question_analysis_exposes_transparent_routing_hints_without_inventing_a_theme():
    relationship = analyze_reading_question("我们之间的沟通和边界要怎么调整？")
    assert relationship["themes"] == ["relationship"]
    assert relationship["confidence"] == "focused"
    assert "沟通" in relationship["matchedTerms"]
    assert relationship["themeScores"]["relationship"] > 0
    open_question = analyze_reading_question("我最近想看看牌。")
    assert open_question["themes"] == []
    assert open_question["ambiguous"] is True
    assert open_question["confidence"] == "open"


def test_question_routing_prefers_explicit_career_terms_over_weak_relationship_pronouns():
    career = analyze_reading_question("他对我的工作评价，下一步怎么做？")
    assert career["themes"] == ["career"]
    assert career["confidence"] == "focused"
    assert career["themeScores"]["career"] > career["themeScores"]["relationship"]
    pronoun = analyze_reading_question("他最近会联系我吗？")
    assert pronoun["themes"] == ["relationship"]
    assert pronoun["confidence"] == "focused"


def test_weak_only_follow_ups_inherit_the_original_retrieval_theme():
    weak = analyze_reading_question("他呢？")
    assert weak["weakOnly"] is True
    assert weak["strongMatchedTerms"] == []
    assert weak["weakMatchedTerms"] == ["他"]
    result = reading_retrieval_for(
        "我该如何规划这次转行？",
        [
            {"role": "assistant", "text": "上一轮回答"},
            {"role": "user", "text": "他呢？"},
        ],
    )
    assert result[0] == "他呢？"
    assert result[3] is True
    assert result[1] == "我该如何规划这次转行？"
    assert result[2]["themes"] == ["career"]


def test_follow_up_routing_separates_inherited_context_from_the_current_goal():
    explicit = reading_retrieval_for(
        "我该如何处理这段关系？",
        [
            {"role": "assistant", "text": "上一轮回答"},
            {"role": "user", "text": "会有结果吗？"},
        ],
    )
    assert explicit[3] is True
    assert explicit[1] == "我该如何处理这段关系？\n会有结果吗？"
    assert explicit[2]["themes"] == ["relationship"]
    assert explicit[2]["goals"] == ["forecast"]
    context_only = reading_retrieval_for(
        "我该如何处理这段关系？",
        [
            {"role": "assistant", "text": "上一轮回答"},
            {"role": "user", "text": "未来呢？"},
        ],
    )
    assert context_only[3] is True
    assert context_only[2]["themes"] == ["relationship", "future"]
    assert context_only[2]["goals"] == ["advice"]
    domain_switch = reading_retrieval_for(
        "我该如何处理这段关系？",
        [
            {"role": "assistant", "text": "上一轮回答"},
            {"role": "user", "text": "那事业呢？"},
        ],
    )
    assert domain_switch[3] is False
    assert domain_switch[2]["themes"] == ["career"]
    assert domain_switch[2]["goals"] == ["advice"]
    routed_evidence = retrieve_reading_evidence(
        question=domain_switch[1], cards=[CARDS[0]], routing=domain_switch[2]
    )
    assert any(
        item["kind"] == "work" and "advice" in item["retrievalGoals"]
        for item in routed_evidence
    )
    routed_summary = summarize_reading_evidence(
        routed_evidence,
        [CARDS[0]],
        themes=domain_switch[2]["themes"],
        goals=domain_switch[2]["goals"],
    )
    assert routed_summary["missingGoalCoverage"] == []


def test_question_routing_recognizes_common_synonyms_across_reading_intents():
    career = analyze_reading_question("我想跳槽，怎么准备面试？")
    assert career["themes"] == ["career"]
    assert "跳槽" in career["matchedTerms"]
    relationship = analyze_reading_question("我们最近冷战，如何重新联系？")
    assert relationship["themes"] == ["relationship"]
    reflection = analyze_reading_question("我最近很焦虑，也感到疲惫，怎么调整？")
    assert reflection["themes"] == ["reflection"]
    how = analyze_reading_question("我怎样处理这段关系？")
    assert how["goals"] == ["advice"]


def test_question_routing_covers_colloquial_outcome_scenario_and_decision_phrasing():
    relationship = analyze_reading_question("我和她还有戏吗？")
    assert relationship["themes"] == ["relationship"]
    assert relationship["goals"] == ["forecast"]
    career = analyze_reading_question("这份 offer 值不值得接？")
    assert career["themes"] == ["career"]
    assert career["goals"] == ["comparison"]
    sleep = analyze_reading_question("我最近总是睡不好，该怎么办？")
    assert sleep["themes"] == ["reflection"]
    assert sleep["goals"] == ["advice"]
    assert requires_professional_boundary("我最近总是睡不好，该怎么办？") is True
    assert analyze_reading_question("这个官司最后能赢吗？")["goals"] == ["forecast"]
    assert requires_professional_boundary("这个官司最后能赢吗？") is True
    assert analyze_reading_question("这张牌放在阻碍位说明什么？")["goals"] == ["explanation"]
    assert analyze_reading_question("我该先联系他还是等他？")["goals"] == ["comparison"]
    assert analyze_reading_question("未来三个月工作会怎么走？")["goals"] == ["forecast"]
    assert analyze_reading_question("我想问一下下个月的财运")["goals"] == ["forecast"]
    assert requires_professional_boundary("我想问一下下个月的财运") is True


def test_question_routing_covers_thought_stance_continuation_and_admission_phrasing():
    thought = analyze_reading_question("他的真实想法是什么？")
    assert thought["themes"] == ["relationship"]
    assert thought["goals"] == ["explanation"]
    viewpoint = analyze_reading_question("他对我态度如何？")
    assert viewpoint["themes"] == ["relationship"]
    assert viewpoint["goals"] == ["explanation"]
    view = analyze_reading_question("对方怎么看我？")
    assert view["goals"] == ["explanation"]
    assert analyze_reading_question("她对我到底是什么态度？")["goals"] == ["explanation"]
    assert analyze_reading_question("我到底应该不应该继续？")["goals"] == ["comparison"]
    admission = analyze_reading_question("我会不会被录取？")
    assert admission["themes"] == ["career"]
    assert admission["goals"] == ["forecast"]


def test_question_routing_distinguishes_the_requested_response_goal():
    advice = analyze_reading_question("我该怎么和对方沟通？")
    assert advice["goals"] == ["advice"]
    assert advice["goalConfidence"] == "focused"
    forecast = analyze_reading_question("我们之后会不会复合？")
    assert forecast["goals"] == ["forecast"]
    future = analyze_reading_question("我之后会怎样发展？")
    assert future["goals"] == ["forecast"]
    temporal_context_only = analyze_reading_question("我想看看未来。")
    assert temporal_context_only["goals"] == []
    assert temporal_context_only["goalConfidence"] == "open"
    future_advice = analyze_reading_question("未来我该怎么办？")
    assert future_advice["goals"] == ["advice"]
    future_advice_card = {"id": "m08", "reversed": False, "position": "建议"}
    future_advice_evidence = retrieve_reading_evidence(
        question="未来我该怎么办？", cards=[future_advice_card]
    )
    assert any(
        item["kind"] == "reflection" and "advice" in item["retrievalGoals"]
        for item in future_advice_evidence
    )
    future_advice_summary = summarize_reading_evidence(
        future_advice_evidence,
        [future_advice_card],
        themes=future_advice["themes"],
        goals=future_advice["goals"],
    )
    assert future_advice_summary["missingGoalCoverage"] == []
    comparison = analyze_reading_question("两个机会哪个利弊更合适？")
    assert comparison["goals"] == ["comparison"]


def test_clarification_is_reserved_for_open_topics_without_explicit_goals():
    open_question = analyze_reading_question("我最近想看看牌。")
    assert can_ask_clarification(open_question) is True
    mixed = analyze_reading_question("我之后会怎样发展？同时我该怎么安排下一步？")
    assert mixed["confidence"] == "focused"
    assert mixed["goalConfidence"] == "mixed"
    assert can_ask_clarification(mixed) is False
    assert can_ask_clarification(mixed, has_prior_assistant=True) is True


def test_question_routing_recognizes_common_possibility_phrasing_as_forecast():
    relationship = analyze_reading_question("我们能不能复合？")
    assert relationship["goals"] == ["forecast"]
    career = analyze_reading_question("这次有没有机会被录取？")
    assert career["goals"] == ["forecast"]
    evidence = retrieve_reading_evidence(question="我们能不能复合？", cards=[CARDS[0]])
    assert any(
        item["tier"] == "reference" and "forecast" in item["retrievalGoals"]
        for item in evidence
    )


def test_question_routing_prefers_longer_explanation_phrases_over_generic_advice_words():
    explanation = analyze_reading_question("我怎么看这段关系？")
    assert explanation["goals"] == ["explanation"]
    understanding = analyze_reading_question("我怎么理解这张牌？")
    assert understanding["goals"] == ["explanation"]
    advice = analyze_reading_question("我怎么处理这段关系？")
    assert advice["goals"] == ["advice"]


def test_question_routing_recognizes_explanation_phrases_about_thoughts_and_card_meaning():
    other_thoughts = analyze_reading_question("我想知道对方心里怎么想")
    assert other_thoughts["goals"] == ["explanation"]
    card_meaning = analyze_reading_question("这张牌怎么解释？")
    assert card_meaning["goals"] == ["explanation"]
    unchanged_advice = analyze_reading_question("我下一步怎么做？")
    assert unchanged_advice["goals"] == ["advice"]


def test_question_routing_recognizes_common_should_i_decision_forms():
    relationship_decision = analyze_reading_question("我是不是应该联系他？")
    assert relationship_decision["goals"] == ["comparison"]
    career_decision = analyze_reading_question("我是否应该换工作？")
    assert career_decision["goals"] == ["comparison"]
    continuation_decision = analyze_reading_question("我是不是要继续这段关系？")
    assert continuation_decision["goals"] == ["comparison"]


def test_question_routing_covers_binary_decision_and_prediction_phrasing():
    need_decision = analyze_reading_question("我是否需要主动联系？")
    assert need_decision["goals"] == ["comparison"]
    desire_decision = analyze_reading_question("我想不想继续这段关系？")
    assert desire_decision["goals"] == ["comparison"]
    other_state = analyze_reading_question("对方是不是喜欢我？")
    assert other_state["goals"] == ["forecast"]


def test_question_routing_covers_natural_forecast_explanation_and_advice_phrasing():
    contact_forecast = analyze_reading_question("他会主动联系我吗？")
    assert contact_forecast["goals"] == ["forecast"]
    career_forecast = analyze_reading_question("未来三个月事业如何？")
    assert career_forecast["goals"] == ["forecast"]
    meaning = analyze_reading_question("这张牌是什么意思？")
    assert meaning["goals"] == ["explanation"]
    explicit_explanation = analyze_reading_question("请解释这段关系？")
    assert explicit_explanation["goals"] == ["explanation"]
    next_step = analyze_reading_question("我应该先做什么？")
    assert next_step["goals"] == ["advice"]
    temporal_forecast = analyze_reading_question("未来如何？")
    assert temporal_forecast["themes"] == ["future"]
    assert temporal_forecast["goals"] == ["forecast"]


def test_question_routing_ignores_negated_intent_phrases_without_suppressing_real_goals():
    explanation = analyze_reading_question("我不想比较选项，只想知道为什么会这样？")
    assert explanation["goals"] == ["explanation"]
    advice = analyze_reading_question("我不是想问会不会复合，我想知道怎么处理？")
    assert advice["goals"] == ["advice"]
    negated_forecast = analyze_reading_question("不是问他会不会回来，我想知道我要怎么面对。")
    assert negated_forecast["goals"] == ["advice"]
    decision = analyze_reading_question("我不知道要不要主动联系他。")
    assert decision["goals"] == ["comparison"]


def test_question_routing_recognizes_explicit_path_and_option_comparisons():
    path = analyze_reading_question("我该选哪条路径？")
    assert path["goals"] == ["comparison"]
    option = analyze_reading_question("哪种方案更适合我？")
    assert option["goals"] == ["comparison"]


def test_question_routing_treats_yes_or_no_decisions_as_comparison_goals():
    contact = analyze_reading_question("我要不要主动联系他？")
    assert contact["goals"] == ["comparison"]
    career = analyze_reading_question("我该不该换工作？")
    assert career["goals"] == ["comparison"]
    evidence = retrieve_reading_evidence(question="我要不要主动联系他？", cards=[CARDS[0]])
    assert any(
        item["kind"] == "relationships" and "comparison" in item["retrievalGoals"]
        for item in evidence
    )


def test_mixed_theme_retrieval_excludes_unrelated_application_domains():
    relationship_choice = retrieve_reading_evidence(
        question="我不知道要不要主动联系他。", cards=[CARDS[0]]
    )
    assert any(item["kind"] == "relationships" for item in relationship_choice)
    assert not any(item["kind"] == "work" for item in relationship_choice)
    assert not any(item["kind"] == "reflection" for item in relationship_choice)
    reflective_forecast = retrieve_reading_evidence(
        question="我现在很迷茫，未来会怎样？", cards=[CARDS[0]]
    )
    assert any(item["kind"] == "reflection" for item in reflective_forecast)
    assert not any(item["kind"] == "work" for item in reflective_forecast)


def test_active_reading_query_follows_the_latest_real_user_message():
    history = [
        {"role": "assistant", "text": "之前的回答"},
        {"role": "user", "text": "我的工作压力很大，下一步怎么安排？"},
    ]
    assert reading_query_for("原始关系问题", history) == "我的工作压力很大，下一步怎么安排？"
    assert (
        reading_query_for("原始关系问题", [{"role": "assistant", "text": "只有回答"}])
        == "原始关系问题"
    )


def test_generic_follow_ups_inherit_the_original_theme_for_retrieval_continuity():
    result = reading_retrieval_for(
        "我该如何处理这段关系？",
        [
            {"role": "assistant", "text": "上一轮回答", "source": "ai"},
            {"role": "user", "text": "那我该怎么做？"},
        ],
    )
    assert result[0] == "那我该怎么做？"
    assert result[3] is True
    assert "我该如何处理这段关系？" in result[1]
    assert result[2]["themes"] == ["relationship"]


def test_retrieval_always_grounds_each_selected_card_in_orientation_and_provenance():
    evidence = retrieve_reading_evidence(question="我该怎样处理这段关系？", cards=CARDS)
    assert 4 <= len(evidence) <= 12
    assert {item["cardId"] for item in evidence} == {"m08", "c06"}
    assert any(item["cardId"] == "m08" and item["kind"] == "orientation" for item in evidence)
    assert all(item["evidenceId"] and item["source"] and item["text"] for item in evidence)


def test_retrieval_labels_evidence_hierarchy_and_deterministic_reasons():
    evidence = retrieve_reading_evidence(
        question="关系中如何平静说出感受和底线？", cards=[CARDS[0]]
    )
    anchor = find(evidence, kind="orientation")
    application = find(evidence, kind="relationships")
    assert anchor["tier"] == "anchor"
    assert "required_anchor" in anchor["retrievalReasons"]
    assert application["tier"] == "application"
    assert "theme_match" in application["retrievalReasons"]
    assert "感受" in application["retrievalTerms"]
    assert application["retrievalThemes"] == ["relationship"]
    assert application["retrievalMethod"] == "bm25+rules+expansion-v2"
    assert "感受" in application["retrievalDirectTerms"]
    assert isinstance(application["retrievalScore"], (int, float))
    assert any("keyword_match" in item["retrievalReasons"] for item in evidence)


def test_retrieval_exposes_response_goal_signals_for_application_evidence():
    evidence = retrieve_reading_evidence(
        question="我该怎么在这段关系里和对方平静说出感受？", cards=[CARDS[0]]
    )
    application = find(evidence, kind="relationships")
    assert "advice" in application["retrievalGoals"]
    assert "goal_match" in application["retrievalReasons"]


def test_retrieval_keeps_direct_and_low_weight_lexicon_expansion_terms_separate():
    evidence = retrieve_reading_evidence(
        question="我想跳槽，怎么准备？",
        cards=[{"id": "m00", "reversed": False, "position": "建议"}],
    )
    work = find(evidence, kind="work")
    assert "辞职" in work["retrievalExpandedTerms"]
    assert "辞职" not in work["retrievalDirectTerms"]


def test_retrieval_does_not_treat_generic_question_words_as_topical_evidence():
    evidence = retrieve_reading_evidence(
        question="未来会怎样发展？同时我该怎么安排下一步？",
        cards=[{"id": "m08", "reversed": False, "position": "建议"}],
    )
    reflection = find(evidence, kind="reflection")
    assert reflection
    assert "怎样" not in reflection["retrievalDirectTerms"]
    assert "怎么" not in reflection["retrievalDirectTerms"]


def test_retrieval_scores_lexical_relevance_against_the_whole_spread_corpus():
    question = "我该如何处理这段关系？"

    def score(draws):
        return find(
            retrieve_reading_evidence(question=question, cards=draws),
            evidenceId="m08:symbolism",
        )["retrievalScore"]

    # The second card changes document frequency/average length, not this
    # candidate's text, position, routing or fixed rule boosts.
    assert score(CARDS) != score([CARDS[0]])
    assert score(CARDS) == score(list(reversed(CARDS)))


def test_retrieval_selects_relationship_context_for_relationship_questions():
    evidence = retrieve_reading_evidence(
        question="我们之间的沟通和边界要怎么调整？", cards=[CARDS[0]]
    )
    assert any(item["kind"] == "relationships" for item in evidence)
    assert not any(item["kind"] == "work" for item in evidence)


def test_retrieval_uses_spread_position_semantics_for_domain_neutral_positions():
    work_evidence = retrieve_reading_evidence(
        question="我正在整理工作方向。",
        cards=[{"id": "m08", "reversed": False, "position": "阻碍"}],
    )
    work = find(work_evidence, kind="work")
    assert work
    assert "position_match" in work["retrievalReasons"]
    assert "work" in work["retrievalPositionKinds"]
    reflection_evidence = retrieve_reading_evidence(
        question="我最近想看看牌。",
        cards=[{"id": "m08", "reversed": False, "position": "自我状态"}],
    )
    reflection = find(reflection_evidence, kind="reflection")
    assert reflection
    assert "position_match" in reflection["retrievalReasons"]
    assert "reflection" in reflection["retrievalPositionKinds"]


def test_future_only_retrieval_preserves_application_evidence_selected_by_the_spread_position():
    evidence = retrieve_reading_evidence(
        question="未来会怎样？",
        cards=[{"id": "m08", "reversed": False, "position": "建议"}],
    )
    work = find(evidence, kind="work")
    assert work
    assert "position_match" in work["retrievalReasons"]
    assert "work" in work["retrievalPositionKinds"]


def test_focused_career_retrieval_excludes_unrelated_relationship_application_chunks():
    evidence = retrieve_reading_evidence(
        question="我该如何规划这次转行和下一步行动？", cards=[CARDS[0]]
    )
    assert any(item["kind"] == "work" for item in evidence)
    assert not any(item["kind"] == "relationships" for item in evidence)


def test_domain_neutral_advice_retrieval_keeps_only_reflective_application_context():
    question = "我该怎么办？"
    evidence = retrieve_reading_evidence(question=question, cards=[CARDS[0]])
    assert any(item["kind"] == "reflection" for item in evidence)
    assert not any(item["kind"] == "relationships" for item in evidence)
    assert not any(item["kind"] == "work" for item in evidence)


def test_open_retrieval_does_not_invent_an_application_domain_from_a_generic_advice_position():
    evidence = retrieve_reading_evidence(
        question="帮我看看",
        cards=[{"id": "m08", "reversed": False, "position": "建议"}],
    )
    assert any(item["tier"] == "application" for item in evidence) is False


def test_generic_explanation_retrieval_does_not_borrow_position_application_domains():
    evidence = retrieve_reading_evidence(
        question="这张牌是什么意思？",
        cards=[{"id": "m08", "reversed": False, "position": "建议"}],
    )
    assert any(item["tier"] == "application" for item in evidence) is False


def test_high_stakes_questions_without_a_supported_domain_do_not_borrow_application_prose():
    cards = [{"id": "m08", "reversed": False, "position": "建议"}]
    evidence = retrieve_reading_evidence(question="这项投资要不要买？", cards=cards)
    assert any(item["tier"] == "application" for item in evidence) is False
    routing = analyze_reading_question("这项投资要不要买？")
    summary = summarize_reading_evidence(
        evidence, cards, themes=routing["themes"], goals=routing["goals"]
    )
    assert summary["coverageStatus"] == "anchor_only"
    assert summary["missingApplicationKindsByCard"] == {"m08": ["reflection"]}


def test_mixed_questions_retain_one_application_chunk_for_each_explicit_domain():
    evidence = retrieve_reading_evidence(
        question="我该如何处理这段关系，同时规划接下来的工作？",
        cards=[CARDS[0]],
        max_per_card=5,
    )
    assert any(item["kind"] == "relationships" for item in evidence)
    assert any(item["kind"] == "work" for item in evidence)


def test_choice_only_questions_reserve_reflective_decision_context():
    question = "方案 A 还是方案 B？"
    evidence = retrieve_reading_evidence(question=question, cards=[CARDS[0]], max_per_card=3)
    assert any(item["kind"] == "reflection" for item in evidence)
    anchors = [item for item in evidence if item["tier"] == "anchor"]
    summary = summarize_reading_evidence(
        anchors, [CARDS[0]], themes=analyze_reading_question(question)["themes"]
    )
    assert summary["expectedApplicationKinds"] == ["reflection"]
    assert summary["missingApplicationCardIds"] == ["m08"]
    assert summary["coverageStatus"] == "anchor_only"


def test_mixed_theme_coverage_reports_every_missing_application_domain():
    question = "我该如何处理这段关系，同时规划接下来的工作？"
    card = CARDS[0]
    routing = analyze_reading_question(question)
    evidence = retrieve_reading_evidence(question=question, cards=[card], max_per_card=3)
    summary = summarize_reading_evidence(
        evidence, [card], themes=routing["themes"], goals=routing["goals"]
    )
    assert summary["expectedApplicationKinds"] == ["relationships", "work"]
    assert summary["missingApplicationKindsByCard"] == {"m08": ["work"]}
    assert summary["missingApplicationCardIds"] == ["m08"]
    assert summary["coverageStatus"] == "anchor_only"


def test_global_evidence_budget_keeps_anchors_for_every_card_before_optional_chunks():
    evidence = retrieve_reading_evidence(
        question="我该如何处理这段关系？", cards=CARDS, max_per_card=5, max_total_evidence=5
    )
    assert len(evidence) == 5
    assert len([item for item in evidence if item["retrievalRequired"]]) == 4
    for card in CARDS:
        assert any(item["cardId"] == card["id"] and item["kind"] == "symbolism" for item in evidence)
        assert any(item["cardId"] == card["id"] and item["kind"] == "orientation" for item in evidence)


def test_modern_reference_retrieval_follows_card_orientation():
    upright = find(
        retrieve_reading_evidence(
            question="我想理解这张牌的意义。",
            cards=[{"id": "m08", "reversed": False, "position": "现在"}],
            max_per_card=7,
        ),
        kind="modern",
    )
    reversed_chunk = find(
        retrieve_reading_evidence(
            question="我想理解这张牌的意义。",
            cards=[{"id": "m08", "reversed": True, "position": "现在"}],
            max_per_card=7,
        ),
        kind="modern",
    )
    assert re.search(r"Imposing restrictions", upright["text"])
    assert not re.search(r"Indulging weakness", upright["text"])
    assert re.search(r"Indulging weakness", reversed_chunk["text"])
    assert not re.search(r"Imposing restrictions", reversed_chunk["text"])


def test_question_routing_covers_common_outcome_meaning_and_suitability_phrases():
    reunion = analyze_reading_question("我们会复合吗？")
    assert reunion["goals"] == ["forecast"]
    return_question = analyze_reading_question("他还会回来吗？")
    assert return_question["goals"] == ["forecast"]
    timing = analyze_reading_question("多久能复合？")
    assert timing["goals"] == ["forecast"]
    meaning = analyze_reading_question("这张牌说明了什么？")
    assert meaning["goals"] == ["explanation"]
    relationship_choice = analyze_reading_question("这段关系值得继续吗？")
    assert relationship_choice["goals"] == ["comparison"]
    job_fit = analyze_reading_question("这份工作适合我吗？")
    assert job_fit["goals"] == ["comparison"]


def test_global_evidence_budget_reserves_position_matches_before_generic_references():
    evidence = retrieve_reading_evidence(
        question="我正在整理工作方向。",
        cards=[{"id": "m08", "reversed": False, "position": "阻碍"}],
        max_per_card=7,
        max_total_evidence=3,
        semantic_scores={"m08:modern": 1},
        semantic_weight=20,
    )
    assert len(evidence) == 3
    assert any(
        item["evidenceId"] == "m08:work" and "position_match" in item["retrievalReasons"]
        for item in evidence
    )


def test_semantic_reranker_hook_changes_optional_ordering_without_displacing_anchors():
    base = retrieve_reading_evidence(
        question="我该如何处理这段关系？",
        cards=[{"id": "m08", "reversed": False, "position": "建议"}],
        max_per_card=7,
        max_total_evidence=4,
    )
    assert len(base) == 4
    assert base[0]["retrievalRequired"] is True
    boosted = retrieve_reading_evidence(
        question="我该如何处理这段关系？",
        cards=[{"id": "m08", "reversed": False, "position": "建议"}],
        max_per_card=7,
        max_total_evidence=4,
        semantic_scores={"m08:modern": 1},
    )
    assert len(boosted) == 4
    assert boosted[0]["retrievalRequired"] is True
    modern = find(boosted, kind="modern")
    assert modern["retrievalSemanticScore"] == 1
    assert modern["retrievalMethod"].endswith("+semantic-v1")
    assert modern["retrievalScore"] == 9
    direct = rerank_reading_evidence(
        [
            {
                "evidenceId": "x",
                "retrievalScore": 2,
                "retrievalRequired": False,
                "retrievalMethod": "test",
            }
        ],
        semantic_scores={"x": 2},
        max_total_evidence=1,
        semantic_weight=4,
    )
    assert direct[0]["retrievalSemanticScore"] == 1
    assert direct[0]["retrievalScore"] == 6
    malformed = rerank_reading_evidence(
        [
            {
                "evidenceId": "bad",
                "retrievalScore": "not-a-number",
                "retrievalRequired": False,
                "retrievalMethod": "test",
            }
        ],
        max_total_evidence=1,
    )
    assert malformed[0]["retrievalScore"] == 0


def test_global_optional_selection_rotates_across_cards_before_taking_a_second_chunk():
    evidence = retrieve_reading_evidence(
        question="我该如何处理这段关系？",
        cards=[
            {"id": "m08", "reversed": False, "position": "建议"},
            {"id": "c06", "reversed": True, "position": "关系挑战"},
            {"id": "w01", "reversed": False, "position": "过去"},
        ],
        max_per_card=7,
        max_total_evidence=9,
    )
    optional = [item for item in evidence if not item["retrievalRequired"]]
    assert len(optional) == 3
    assert len({item["cardId"] for item in optional}) == 3


def test_default_evidence_budget_reserves_one_required_tier_per_routed_goal():
    spread = [
        {"id": "m08", "reversed": False, "position": "建议"},
        {"id": "c06", "reversed": True, "position": "关系挑战"},
        {"id": "w01", "reversed": False, "position": "过去"},
    ]
    question = "我之后会怎样发展？同时两个机会哪个更适合我？"
    evidence = retrieve_reading_evidence(question=question, cards=spread)
    assert any(
        item["tier"] == "reference" and "forecast" in item["retrievalGoals"]
        for item in evidence
    )
    assert any(
        item["tier"] == "application" and "comparison" in item["retrievalGoals"]
        for item in evidence
    )
    tight = retrieve_reading_evidence(question=question, cards=spread, max_total_evidence=6)
    assert len(tight) == 6


def test_goal_evidence_reservation_chooses_the_highest_scored_matching_chunk():
    evidence = [
        {
            "evidenceId": "anchor",
            "tier": "anchor",
            "retrievalRequired": True,
            "retrievalScore": 10,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "low",
            "tier": "reference",
            "retrievalRequired": False,
            "retrievalGoals": ["forecast"],
            "retrievalScore": 1,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "high",
            "tier": "reference",
            "retrievalRequired": False,
            "retrievalGoals": ["forecast"],
            "retrievalScore": 9,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "filler",
            "tier": "reference",
            "retrievalRequired": False,
            "retrievalGoals": [],
            "retrievalScore": 100,
            "retrievalMethod": "test",
        },
    ]
    selected = rerank_reading_evidence(
        evidence, required_goal_evidence=["forecast"], max_total_evidence=2
    )
    assert [item["evidenceId"] for item in selected] == ["anchor", "high"]


def test_per_card_goal_reservation_keeps_required_tier_evidence_across_a_tight_spread():
    evidence = [
        {
            "evidenceId": "a:anchor",
            "cardId": "a",
            "tier": "anchor",
            "retrievalRequired": True,
            "retrievalScore": 10,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "b:anchor",
            "cardId": "b",
            "tier": "anchor",
            "retrievalRequired": True,
            "retrievalScore": 10,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "a:reference",
            "cardId": "a",
            "tier": "reference",
            "retrievalRequired": False,
            "retrievalGoals": ["forecast"],
            "retrievalScore": 2,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "b:reference",
            "cardId": "b",
            "tier": "reference",
            "retrievalRequired": False,
            "retrievalGoals": ["forecast"],
            "retrievalScore": 1,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "filler",
            "cardId": "a",
            "tier": "reference",
            "retrievalRequired": False,
            "retrievalGoals": [],
            "retrievalScore": 100,
            "retrievalMethod": "test",
        },
    ]
    selected = rerank_reading_evidence(
        evidence,
        required_goal_evidence=["forecast"],
        max_total_evidence=4,
        reserve_goal_evidence_per_card=True,
    )
    assert [item["evidenceId"] for item in selected] == [
        "a:anchor",
        "b:anchor",
        "a:reference",
        "b:reference",
    ]


def test_position_evidence_stays_ahead_of_per_card_goal_evidence_when_the_budget_is_exhausted():
    evidence = [
        {
            "evidenceId": "a:anchor",
            "cardId": "a",
            "tier": "anchor",
            "retrievalRequired": True,
            "retrievalScore": 10,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "b:anchor",
            "cardId": "b",
            "tier": "anchor",
            "retrievalRequired": True,
            "retrievalScore": 10,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "a:position",
            "cardId": "a",
            "tier": "application",
            "retrievalRequired": False,
            "retrievalReasons": ["position_match"],
            "retrievalScore": 1,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "b:position",
            "cardId": "b",
            "tier": "application",
            "retrievalRequired": False,
            "retrievalReasons": ["position_match"],
            "retrievalScore": 1,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "a:reference",
            "cardId": "a",
            "tier": "reference",
            "retrievalRequired": False,
            "retrievalGoals": ["forecast"],
            "retrievalScore": 9,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "b:reference",
            "cardId": "b",
            "tier": "reference",
            "retrievalRequired": False,
            "retrievalGoals": ["forecast"],
            "retrievalScore": 8,
            "retrievalMethod": "test",
        },
    ]
    selected = rerank_reading_evidence(
        evidence,
        required_goal_evidence=["forecast"],
        max_total_evidence=4,
        reserve_goal_evidence_per_card=True,
    )
    assert [item["evidenceId"] for item in selected] == [
        "a:anchor",
        "b:anchor",
        "a:position",
        "b:position",
    ]


def test_mixed_goal_reservation_rotates_across_cards_before_stacking_goal_layers():
    evidence = [
        {
            "evidenceId": "a:anchor",
            "cardId": "a",
            "tier": "anchor",
            "retrievalRequired": True,
            "retrievalScore": 10,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "b:anchor",
            "cardId": "b",
            "tier": "anchor",
            "retrievalRequired": True,
            "retrievalScore": 10,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "a:advice",
            "cardId": "a",
            "tier": "application",
            "retrievalRequired": False,
            "retrievalGoals": ["advice"],
            "retrievalScore": 4,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "b:advice",
            "cardId": "b",
            "tier": "application",
            "retrievalRequired": False,
            "retrievalGoals": ["advice"],
            "retrievalScore": 3,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "a:forecast",
            "cardId": "a",
            "tier": "reference",
            "retrievalRequired": False,
            "retrievalGoals": ["forecast"],
            "retrievalScore": 9,
            "retrievalMethod": "test",
        },
        {
            "evidenceId": "b:forecast",
            "cardId": "b",
            "tier": "reference",
            "retrievalRequired": False,
            "retrievalGoals": ["forecast"],
            "retrievalScore": 8,
            "retrievalMethod": "test",
        },
    ]
    selected = rerank_reading_evidence(
        evidence,
        required_goal_evidence=["advice", "forecast"],
        max_total_evidence=4,
        reserve_goal_evidence_per_card=True,
    )
    assert [item["evidenceId"] for item in selected] == [
        "a:anchor",
        "b:anchor",
        "a:advice",
        "b:forecast",
    ]


def test_default_evidence_budget_expands_for_large_mixed_spreads():
    cards_for_spread = [
        {"id": f"m{index:02d}", "reversed": index % 2 == 1, "position": f"位置 {index + 1}"}
        for index in range(12)
    ]
    question = "我该如何处理这段关系，同时规划接下来的工作，也想调整自己的状态？"
    evidence = retrieve_reading_evidence(question=question, cards=cards_for_spread)
    analysis = analyze_reading_question(question)
    summary = summarize_reading_evidence(
        evidence,
        cards_for_spread,
        themes=analysis["themes"],
        goals=analysis["goals"],
    )
    assert len(evidence) == 60
    assert summary["missingApplicationCardIds"] == []

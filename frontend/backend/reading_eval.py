"""Offline evaluation harness, ported from `server-js-reference/reading-eval.mjs`.

Three rubrics live here: retrieval coverage against expected evidence kinds,
positions and goals; the stable prompt contract at the message boundary; and the
end-to-end first-reading / follow-up JSON contract. None of them calls a paid
model, so a prompt or retrieval rewrite can be reviewed in CI.

The rubrics delegate all grounding work to `reading_rag`; this module only
scores what that module returns.
"""

from __future__ import annotations

import json
import math
import re
from typing import Any

from .reading_rag import (
    analyze_reading_question,
    can_ask_clarification,
    parse_reading_output,
    requires_perspective_boundary,
    requires_professional_boundary,
    retrieve_reading_evidence,
    summarize_reading_evidence,
)

#: Verbs that make an action line count as actionable; `/u` needs no Python flag.
ACTION_WORDS = re.compile(r'建议|可以|先|尝试|记录|核实|安排|沟通|复盘|拆分|设定|观察|练习|下一步')


def score_checks(checks: list[Any]) -> int:
    """Percentage of truthy checks, rounded the way `Math.round` rounds."""
    passed = sum(1 for check in checks if check)
    # `Math.round` rounds halves toward +Infinity while Python's `round` rounds to
    # even, so 12.5 must become 13 here rather than 12.
    return math.floor((passed / len(checks)) * 100 + 0.5)


def evaluate_retrieval_case(case: Any = None) -> dict[str, Any]:
    """Deterministic retrieval regression rubric.

    This checks grounding coverage, not whether a symbolic interpretation is
    objectively true.
    """
    if not isinstance(case, dict):
        case = {}
    question = case.get('question')
    cards = case.get('cards')
    # Destructuring defaults apply to a missing key only; an explicit null stays null.
    required_kinds = case.get('requiredKinds', [])
    required_position_kinds = case.get('requiredPositionKinds', [])
    required_goals = case.get('requiredGoals', [])
    expected_goals = case.get('expectedGoals')

    evidence = retrieve_reading_evidence(question=question, cards=cards)
    routing = analyze_reading_question(question)
    kinds = {item.get('kind') for item in evidence}
    missing_kinds = [kind for kind in dict.fromkeys(required_kinds) if kind not in kinds]
    position_kinds = list(dict.fromkeys(
        kind
        for item in evidence
        for kind in (item.get('retrievalPositionKinds') if isinstance(item.get('retrievalPositionKinds'), list) else [])
    ))
    missing_position_kinds = [kind for kind in dict.fromkeys(required_position_kinds) if kind not in position_kinds]
    missing_goals = [goal for goal in dict.fromkeys(required_goals) if goal not in routing['goals']]
    expected_goal_list = list(dict.fromkeys(expected_goals)) if isinstance(expected_goals, list) else None
    goal_route_matches = (
        expected_goal_list is None
        or json.dumps(routing['goals'], ensure_ascii=False, separators=(',', ':'))
        == json.dumps(expected_goal_list, ensure_ascii=False, separators=(',', ':'))
    )
    missing_cards = [
        card.get('id') if isinstance(card, dict) else None
        for card in (cards if cards is not None else [])
        if not any(
            item.get('cardId') == (card.get('id') if isinstance(card, dict) else None)
            and item.get('kind') == 'orientation'
            for item in evidence
        )
    ]
    # `.filter(Boolean)` also drops an empty card id.
    missing_cards = [card_id for card_id in missing_cards if card_id]
    issues = [
        *[f'missing_evidence:{kind}' for kind in missing_kinds],
        *[f'missing_position_kind:{kind}' for kind in missing_position_kinds],
        *[f'missing_goal:{goal}' for goal in missing_goals],
        *([] if goal_route_matches else ['goal_route_mismatch']),
        *[f'missing_card:{card_id}' for card_id in missing_cards],
    ]
    checks = [
        len(evidence) > 0,
        len(missing_kinds) == 0,
        len(missing_position_kinds) == 0,
        len(missing_goals) == 0,
        goal_route_matches,
        len(missing_cards) == 0,
    ]
    return {
        'ok': len(issues) == 0,
        'score': score_checks(checks),
        'issues': issues,
        'missingKinds': missing_kinds,
        'positionKinds': position_kinds,
        'missingPositionKinds': missing_position_kinds,
        'goals': routing['goals'],
        'expectedGoals': expected_goal_list,
        'goalRouteMatches': goal_route_matches,
        'missingGoals': missing_goals,
        'missingCards': missing_cards,
        'evidence': evidence,
    }


def evaluate_retrieval_suite(cases: Any = None) -> dict[str, Any]:
    """Scores every case and averages their scores; an empty suite is never ok."""
    if cases is None:
        cases = []
    results: list[dict[str, Any]] = []
    for item in cases:
        name = item.get('name') if isinstance(item, dict) else None
        results.append({'name': '' if name is None else name, **evaluate_retrieval_case(item)})
    score = math.floor((sum(result['score'] for result in results) / len(results)) + 0.5) if results else 0
    failed = sum(1 for result in results if not result['ok'])
    return {'ok': len(results) > 0 and failed == 0, 'score': score, 'failed': failed, 'results': results}


def evaluate_prompt_contract(messages: Any = None) -> dict[str, Any]:
    """Checks the stable prompt contract at the message boundary.

    The rubric is intentionally small so a prompt rewrite can be reviewed in CI
    without calling a paid model.
    """
    if messages is None:
        messages = []
    system_message = next(
        (message for message in messages if isinstance(message, dict) and message.get('role') == 'system'),
        None,
    )
    system = system_message.get('content') if isinstance(system_message, dict) else None
    if system is None:
        system = ''
    user_message = next(
        (message for message in messages if isinstance(message, dict) and message.get('role') == 'user'),
        None,
    )
    user = user_message.get('content') if isinstance(user_message, dict) else None
    if user is None:
        user = ''
    issues: list[str] = []
    if not re.search(r'evidence|证据|引用', system, re.IGNORECASE):
        issues.append('missing_system_evidence_rule')
    if not re.search(r'starveil_history[\s\S]{0,700}(?:不可信|不能当作当前牌义|不能替代)', system, re.IGNORECASE):
        issues.append('missing_history_trust_boundary')
    if not re.search(r'safetyMeta[\s\S]{0,900}requiresPerspectiveBoundary[\s\S]{0,900}(?:他人|内心|沟通|现实互动)', system, re.IGNORECASE):
        issues.append('missing_perspective_boundary_rule')
    if not re.search(r'sourceAuthority[\s\S]{0,700}canonical_fixed[\s\S]{0,700}(?:不能覆盖|权威|冲突)', system, re.IGNORECASE):
        issues.append('missing_source_authority_rule')
    if not re.search(r'memoryExcerpted=true[\s\S]{0,240}不能把省略部分补写成事实', system):
        issues.append('missing_memory_excerpt_rule')
    if not re.search(r'tier|层级|retrievalReasons', system, re.IGNORECASE):
        issues.append('missing_evidence_hierarchy')
    if not re.search(r'json|结构化', system, re.IGNORECASE):
        issues.append('missing_json_contract')
    if not re.search(r'synthesis|综合解读', system, re.IGNORECASE):
        issues.append('missing_synthesis_contract')
    if not re.search(r'goal|目标', system, re.IGNORECASE):
        issues.append('missing_goal_routing')
    if not re.search(r'retrievalMethod|retrievalScore|retrievalSemanticScore', system, re.IGNORECASE):
        issues.append('missing_ranker_metadata')
    if not re.search(r'evidenceMeta', system, re.IGNORECASE):
        issues.append('missing_evidence_diagnostics')
    if not re.search(r'evidencePlan[^\n]{0,500}(?:引用索引|anchor|application|reference)', system, re.IGNORECASE):
        issues.append('missing_evidence_plan_rule')
    if not re.search(r'evidencePlan[^\n]{0,900}positionEvidenceIds[^\n]{0,600}(?:必须|优先)', system, re.IGNORECASE):
        issues.append('missing_position_evidence_rule')
    if not re.search(r'coverageStatus', system, re.IGNORECASE):
        issues.append('missing_coverage_status')
    if not re.search(r'missingApplicationKindsByCard', system, re.IGNORECASE):
        issues.append('missing_application_domain_diagnostics')
    if not re.search(r'goalCoverage', system, re.IGNORECASE) or not re.search(r'missingGoalCoverage', system, re.IGNORECASE):
        issues.append('missing_goal_coverage_rule')
    if not re.search(r'goalCoverageByCard[\s\S]{0,500}missingGoalCoverageByCard[\s\S]{0,500}coverageBoundaryGoals', system, re.IGNORECASE):
        issues.append('missing_per_card_goal_coverage_rule')
    if not re.search(r'responsePlan[^\n]{0,500}(?:goal|emphasis)', system, re.IGNORECASE):
        issues.append('missing_response_plan_goal_rule')
    if not re.search(r'responsePlan[^\n]{0,700}directAnswer', system, re.IGNORECASE):
        issues.append('missing_direct_answer_plan_rule')
    if not re.search(r'responsePlan[^\n]{0,1000}actionGuidance', system, re.IGNORECASE):
        issues.append('missing_action_guidance_plan_rule')
    if not re.search(r'responsePlan\.goal=open[\s\S]{0,300}clarificationMeta\.allowClarification=false[\s\S]{0,500}(?:不能|不得).{0,20}(?:预测|复合|联系|成功)', system):
        issues.append('missing_open_goal_boundary_rule')
    if not re.search(r'goalPlan[^\n]{0,700}(?:order|evidenceIds|逐一回应)', system, re.IGNORECASE):
        issues.append('missing_goal_plan_rule')
    if not re.search(r'goalSections[^\n]{0,700}(?:目标|goal|分段|evidenceIds)', system, re.IGNORECASE):
        issues.append('missing_goal_sections_rule')
    if not re.search(r'首轮[^\n]{0,120}(?:直接回应|先回答) activeQuestion[^\n]{0,160}(?:goalPlan|牌位)', system):
        issues.append('missing_direct_answer_order_rule')
    if not re.search(r'synthesis[^\n]{0,900}(?:多牌阵|每张牌|分别|逐张)[^\n]{0,300}(?:核心|概念|证据)', system, re.IGNORECASE):
        issues.append('missing_synthesis_per_card_rule')
    if not re.search(r'<starveil_workflow>[\s\S]*?(?:activeQuestion|逐牌解读)[\s\S]*?(?:synthesis|合读)[\s\S]*?(?:自检|自查)[\s\S]*?<\/starveil_workflow>', system, re.IGNORECASE):
        issues.append('missing_prompt_workflow')
    if not re.search(r'claim|引用说明', system, re.IGNORECASE):
        issues.append('missing_claim_support')
    if not re.search(r'(?:逐句都能被该证据支持的简短 claim|claim[^\n]{0,180}(?:逐句|每句)[^\n]{0,180}(?:证据|evidence))', system, re.IGNORECASE):
        issues.append('missing_claim_sentence_support_rule')
    if not re.search(r'(?:保证|必然|绝对|断言)[^\n]{0,500}(?:goalSections|actions|references|用户可见)', system, re.IGNORECASE):
        issues.append('missing_calibration_rule')
    if not re.search(r'(?:确定日期|确定时间|具体日期)', system):
        issues.append('missing_timing_calibration_rule')
    if not re.search(r'synthesis[^\n]{0,600}(?:核心锚点|retrievalRequired)', system, re.IGNORECASE):
        issues.append('missing_synthesis_anchor_rule')
    if not re.search(r'澄清分支[^\n]{0,300}(?:必须为空|不得同时返回)', system):
        issues.append('missing_clarification_exclusivity')
    if not re.search(r'action[^\n]{0,600}(?:reason|理由)[^\n]{0,300}(?:必须|非空|说明)', system, re.IGNORECASE):
        issues.append('missing_action_reason_rule')
    if not re.search(r'action[^\n]{0,900}(?:reason|理由)[^\n]{0,900}(?:证据|evidence)', system, re.IGNORECASE):
        issues.append('missing_action_reason_support_rule')
    if not re.search(r'首轮每条 action 的正文和 reason (?:(?:都必须(?:分别)?与)|(?:也必须逐句(?:、逐个分句)?与))(?:其 evidenceIds 的证据|所引 evidence)\s*共享具体、非通用概念', system, re.IGNORECASE):
        issues.append('missing_action_specific_reason_rule')
    if not re.search(r'action[^\n]{0,900}(?:正文|内容)[^\n]{0,900}(?:证据|evidence)', system, re.IGNORECASE):
        issues.append('missing_action_text_support_rule')
    if not re.search(r'首轮每条 action 的正文和 reason (?:(?:都必须(?:分别)?与)|(?:也必须逐句(?:、逐个分句)?与))(?:其 evidenceIds 的证据|所引 evidence)\s*共享具体、非通用概念', system, re.IGNORECASE):
        issues.append('missing_action_specific_text_rule')
    if not re.search(r'追问返回 actions，其正文的每个实质句和逗号分句必须与 action\.evidenceIds 的证据共享具体、非通用概念，reason 若提供也必须逐句、逐个分句被同一组证据支持', system):
        issues.append('missing_followup_action_support_rule')
    if not re.search(r'(?:goalSections、cardReadings、synthesis 的正文都必须分别复述所引 evidence 中的(?:具体、非通用|非通用)概念|只要返回 goalSections、cardReadings 或 synthesis，即使是单目标或结构化追问，(?:其中)?每个实质句都必须与所引 evidence 共享具体、非通用概念|只要返回 goalSections、cardReadings 或 synthesis，即使是单目标或结构化追问，正文也必须分别复述所引 evidence 中的(?:具体、非通用|非通用)概念)', system, re.IGNORECASE):
        issues.append('missing_structured_specific_support_rule')
    if not re.search(r'首轮 goalSections 还必须优先使用该目标的 requiredEvidenceTier', system, re.IGNORECASE):
        issues.append('missing_goal_section_tier_rule')
    if not re.search(r'结构化追问若本轮有明确 goal，也必须在 references 或对应 goalSections 中优先引用该目标的 requiredEvidenceTier', system):
        issues.append('missing_followup_goal_tier_rule')
    if not re.search(r'advice 或 comparison 目标有可用 application 证据时，每条首轮(?:或结构化追问)? action 至少引用一个对应目标的 application ID', system):
        issues.append('missing_action_goal_evidence_rule')
    if not re.search(r'action[\s\S]{0,500}(?:买入|卖出|下单|签约|起诉|停药|用药|转账|借贷)[\s\S]{0,500}(?:核实|风险|专业人士)', system):
        issues.append('missing_professional_action_rule')
    if not re.search(r'text[^\n]{0,700}(?:正文|内容)[^\n]{0,700}(?:证据|evidence)', system, re.IGNORECASE):
        issues.append('missing_text_support_rule')
    if not re.search(r'(?:text 正文(?:也)?必须与(?:本轮引用|所引) evidence 共享具体、非通用概念|text 正文的每个实质句都必须与本轮引用 evidence 共享具体、非通用概念)', system, re.IGNORECASE):
        issues.append('missing_text_specific_support_rule')
    if not re.search(r'activeQuestion 明确包含关系、事业或自我主题时，顶层 text 还必须直接回应每个明确主题，并为每个主题复述至少一个主题词', system):
        issues.append('missing_question_relevance_rule')
    if not re.search(r'advice 要落到下一步行动，forecast 要区分趋势与现实核验，explanation 要说明原因或牌面线索，comparison 要并列条件、代价或取舍', system):
        issues.append('missing_goal_alignment_rule')
    if not re.search(r'comparison 还必须点出至少一侧或一个选项，不能只写“比较一下”', system):
        issues.append('missing_comparison_side_rule')
    if not re.search(r'followUp[，,\s\S]{0,220}(?:一个|单问句)[，,\s\S]{0,220}(?:一个问号|泛问|多个问题)', system):
        issues.append('missing_followup_question_rule')
    if not re.search(r'逗号、顿号和常见转折\/并列\/因果连接词分句也必须分别与所引 evidence 共享具体、非通用概念，不得在已命中的分句后追加证据之外的事实', system):
        issues.append('missing_clause_support_rule')
    if not re.search(r'首轮 text 的关键判断必须能在 references 或 goalSections 的 evidenceIds 中找到', system, re.IGNORECASE):
        issues.append('missing_text_reference_scope_rule')
    if not re.search(r'每个有可用 requiredEvidenceTier 的目标都必须在 text 中复述该层级 evidence 的一个具体概念', system):
        issues.append('missing_goal_text_tier_rule')
    if not re.search(r'mixed 模式的 text（首轮必须，追问若返回多个 goalSections 也必须）还必须分别复述每个 goalSections 目标至少一个具体概念，不能只覆盖其中一个目标', system, re.IGNORECASE):
        issues.append('missing_mixed_text_goal_coverage_rule')
    if not re.search(r'anchor_only[^\n]{0,500}(?:证据|资料)[^\n]{0,500}(?:不足|限制|不确定)', system, re.IGNORECASE):
        issues.append('missing_coverage_boundary_rule')
    if not re.search(r'missingGoalCoverage[^\n]{0,900}(?:advice 要点明应用|forecast 要点明预测|explanation 要点明解释|comparison 要点明选项)', system):
        issues.append('missing_goal_specific_coverage_rule')
    if not re.search(r'retrievalRequired', system, re.IGNORECASE):
        issues.append('missing_anchor_metadata')
    if not re.search(r'question|cards|evidence', user, re.IGNORECASE) or not re.search(r'question', user, re.IGNORECASE) or not re.search(r'cards', user, re.IGNORECASE) or not re.search(r'evidence', user, re.IGNORECASE):
        issues.append('missing_grounded_context')
    if not re.search(r'<starveil_context>[\s\S]*<\/starveil_context>', user):
        issues.append('missing_context_fence')
    if not re.search(r'tier|retrievalReasons', user):
        issues.append('missing_evidence_metadata')
    if not re.search(r'goal|目标', user, re.IGNORECASE):
        issues.append('missing_goal_metadata')
    if not re.search(r'sourceType|sourceLabel', user) or not re.search(r'retrievalRequired', user):
        issues.append('missing_prompt_evidence_provenance')
    if not re.search(r'sourceAuthority', user):
        issues.append('missing_prompt_source_authority')
    if not re.search(r'safetyMeta', user) or not re.search(r'requiresPerspectiveBoundary', user):
        issues.append('missing_perspective_boundary_context')
    if not re.search(r'evidenceMeta', user):
        issues.append('missing_evidence_diagnostics_context')
    if not re.search(r'evidencePlan', user):
        issues.append('missing_evidence_plan_context')
    if not re.search(r'positionEvidenceIds', user):
        issues.append('missing_position_evidence_context')
    if not re.search(r'knowledgeMeta', user):
        issues.append('missing_knowledge_version_context')
    if not re.search(r'coverageStatus', user):
        issues.append('missing_coverage_status_context')
    if not re.search(r'missingApplicationKindsByCard', user):
        issues.append('missing_application_domain_diagnostics_context')
    if not re.search(r'goalCoverage', user) or not re.search(r'missingGoalCoverage', user):
        issues.append('missing_goal_coverage_context')
    if not re.search(r'responsePlan', user) or not re.search(r'goal', user) or not re.search(r'emphasis', user):
        issues.append('missing_response_plan_goal_context')
    if not re.search(r'responsePlan', user) or not re.search(r'directAnswer', user):
        issues.append('missing_direct_answer_plan_context')
    if not re.search(r'responsePlan', user) or not re.search(r'actionGuidance', user):
        issues.append('missing_action_guidance_plan_context')
    if not re.search(r'goalPlan', user) or not re.search(r'goalOrder|order', user):
        issues.append('missing_goal_plan_context')
    if not re.search(r'retrievalRequired', user):
        issues.append('missing_anchor_metadata_context')
    if not re.search(r'memoryExcerpted', user):
        issues.append('missing_memory_excerpt_context')
    checks = [
        'missing_system_evidence_rule' not in issues,
        'missing_history_trust_boundary' not in issues,
        'missing_perspective_boundary_rule' not in issues,
        'missing_source_authority_rule' not in issues,
        'missing_memory_excerpt_rule' not in issues,
        'missing_evidence_hierarchy' not in issues,
        'missing_json_contract' not in issues,
        'missing_synthesis_contract' not in issues,
        'missing_goal_routing' not in issues,
        'missing_ranker_metadata' not in issues,
        'missing_evidence_diagnostics' not in issues,
        'missing_evidence_plan_rule' not in issues,
        'missing_position_evidence_rule' not in issues,
        'missing_coverage_status' not in issues,
        'missing_application_domain_diagnostics' not in issues,
        'missing_goal_coverage_rule' not in issues,
        'missing_per_card_goal_coverage_rule' not in issues,
        'missing_response_plan_goal_rule' not in issues,
        'missing_direct_answer_plan_rule' not in issues,
        'missing_action_guidance_plan_rule' not in issues,
        'missing_open_goal_boundary_rule' not in issues,
        'missing_goal_plan_rule' not in issues,
        'missing_goal_sections_rule' not in issues,
        'missing_synthesis_per_card_rule' not in issues,
        'missing_prompt_workflow' not in issues,
        'missing_claim_support' not in issues,
        'missing_claim_sentence_support_rule' not in issues,
        'missing_calibration_rule' not in issues,
        'missing_synthesis_anchor_rule' not in issues,
        'missing_clarification_exclusivity' not in issues,
        'missing_action_reason_rule' not in issues,
        'missing_action_reason_support_rule' not in issues,
        'missing_action_specific_reason_rule' not in issues,
        'missing_action_text_support_rule' not in issues,
        'missing_action_specific_text_rule' not in issues,
        'missing_followup_action_support_rule' not in issues,
        'missing_structured_specific_support_rule' not in issues,
        'missing_goal_section_tier_rule' not in issues,
        'missing_followup_goal_tier_rule' not in issues,
        'missing_action_goal_evidence_rule' not in issues,
        'missing_professional_action_rule' not in issues,
        'missing_text_support_rule' not in issues,
        'missing_text_specific_support_rule' not in issues,
        'missing_question_relevance_rule' not in issues,
        'missing_goal_alignment_rule' not in issues,
        'missing_comparison_side_rule' not in issues,
        'missing_followup_question_rule' not in issues,
        'missing_clause_support_rule' not in issues,
        'missing_text_reference_scope_rule' not in issues,
        'missing_goal_text_tier_rule' not in issues,
        'missing_mixed_text_goal_coverage_rule' not in issues,
        'missing_coverage_boundary_rule' not in issues,
        'missing_goal_specific_coverage_rule' not in issues,
        'missing_anchor_metadata' not in issues,
        'missing_grounded_context' not in issues,
        'missing_context_fence' not in issues,
        'missing_evidence_metadata' not in issues,
        'missing_goal_metadata' not in issues,
        'missing_prompt_evidence_provenance' not in issues,
        'missing_prompt_source_authority' not in issues,
        'missing_perspective_boundary_context' not in issues,
        'missing_evidence_diagnostics_context' not in issues,
        'missing_evidence_plan_context' not in issues,
        'missing_position_evidence_context' not in issues,
        'missing_knowledge_version_context' not in issues,
        'missing_coverage_status_context' not in issues,
        'missing_application_domain_diagnostics_context' not in issues,
        'missing_goal_coverage_context' not in issues,
        'missing_response_plan_goal_context' not in issues,
        'missing_direct_answer_plan_context' not in issues,
        'missing_action_guidance_plan_context' not in issues,
        'missing_goal_plan_context' not in issues,
        'missing_anchor_metadata_context' not in issues,
        'missing_memory_excerpt_context' not in issues,
    ]
    return {'ok': len(issues) == 0, 'score': score_checks(checks), 'issues': issues}


def evaluate_reading_fixture(fixture: Any = None) -> dict[str, Any]:
    """Runs the offline end-to-end reading rubric against a captured provider response.

    It validates the same evidence and JSON contract used in the API.
    """
    if not isinstance(fixture, dict):
        fixture = {}
    question = fixture.get('question')
    cards = fixture.get('cards')
    output = fixture.get('output')
    required_kinds = fixture.get('requiredKinds', [])

    retrieval = evaluate_retrieval_case({'question': question, 'cards': cards, 'requiredKinds': required_kinds})
    issues = [*retrieval['issues']]
    allow_clarification = can_ask_clarification(analyze_reading_question(question))
    parsed = None
    relaxed = None
    try:
        routing = analyze_reading_question(question)
        evidence_meta = summarize_reading_evidence(
            retrieval['evidence'],
            cards,
            themes=routing['themes'],
            goals=routing['goals'],
        )
        requires_coverage_boundary = (
            evidence_meta['coverageStatus'] == 'anchor_only' or len(evidence_meta['coverageBoundaryGoals']) > 0
        )
        required_goal_evidence = [
            goal for goal in routing['goals'] if (evidence_meta['goalCoverage'].get(goal) or {}).get('ok')
        ]
        required_action_goal_evidence = [
            goal
            for goal in routing['goals']
            if goal in ('advice', 'comparison') and (evidence_meta['goalCoverage'].get(goal) or {}).get('ok')
        ]
        require_goal_sections = len(routing['goals']) > 1
        has_explicit_open_goal = not routing['goals'] and any(
            theme in ('relationship', 'career', 'reflection') for theme in routing['themes']
        )
        parsed = parse_reading_output(
            output,
            {
                'cards': cards,
                'evidence': retrieval['evidence'],
                'requiredGoalEvidence': required_goal_evidence,
                'requireGoalReferenceCoverage': True,
                'requiredActionGoalEvidence': required_action_goal_evidence,
                'requiredOutputGoals': routing['goals'],
                'requireGoalAlignment': True,
                'requireFollowUpQuestion': True,
                'allowedGoalSections': routing['goals'],
                'requiredGoalSections': routing['goals'] if require_goal_sections else [],
                'requireGoalSections': require_goal_sections,
                'requireGoalTextCoverage': len(routing['goals']) > 0,
                'requireCoverage': True,
                'requireActions': True,
                'requireReferences': True,
                'requireReferenceClaims': True,
                'requireReferenceSupport': True,
                'requireCardReadingSupport': True,
                'requireConcreteActions': True,
                'requireActionReasons': True,
                'requireActionReasonSupport': True,
                'requireActionTextSupport': True,
                'requireTextSupport': True,
                'activeQuestion': question,
                'requireQuestionRelevance': True,
                'requireSynthesis': True,
                'requireSynthesisSupport': True,
                'requireSynthesisCardSupport': True,
                'requireSynthesisAnchors': True,
                'requirePositionEvidence': True,
                'requireUncertainty': True,
                'requireRealityBoundary': requires_professional_boundary(question),
                'requireProfessionalActionBoundary': requires_professional_boundary(question),
                'requireOpenGoalBoundary': has_explicit_open_goal,
                'requirePerspectiveBoundary': requires_perspective_boundary(question),
                'requireCoverageBoundary': requires_coverage_boundary,
                'coverageBoundaryGoals': evidence_meta['coverageBoundaryGoals'],
                'requireCalibratedLanguage': True,
                'allowClarification': allow_clarification,
            },
        )
    except Exception:
        issues.append('output_contract')
        try:
            relaxed = parse_reading_output(
                output,
                {'cards': cards, 'evidence': retrieval['evidence'], 'requireCoverage': False},
            )
        except Exception:
            pass
    inspected = parsed if parsed is not None else relaxed
    # `inspected?.field` reads fields off an object only; anything else has none.
    found = inspected if isinstance(inspected, dict) else {}
    if found.get('needsClarification') is True:
        has_clarification = isinstance(found.get('clarification'), str) and len(found['clarification'].strip()) > 0
        if not has_clarification:
            issues.append('missing_clarification')
        unique_issues = list(dict.fromkeys(issues))
        checks = [retrieval['ok'], parsed is not None, has_clarification]
        return {
            'ok': len(unique_issues) == 0,
            'score': score_checks(checks),
            'issues': unique_issues,
            'parsed': parsed,
            'retrieval': retrieval,
        }
    references = found.get('references')
    if references is None:
        references = []
    has_reference_coverage = all(
        any(reference.get('cardId') == card.get('id') for reference in references)
        for card in (cards if cards is not None else [])
    )
    if not has_reference_coverage:
        issues.append('missing_references')
    actions = found.get('actions')
    if actions is None:
        actions = []
    has_actions = isinstance(actions, list) and len(actions) > 0
    if not has_actions:
        issues.append('missing_actions')
    text = found.get('text')
    if text is None:
        text = ''
    card_readings = found.get('cardReadings')
    if card_readings is None:
        card_readings = []
    # `Array.prototype.join` writes an empty string for null/undefined parts.
    reading_parts = [
        text,
        *[item.get('reading') for item in card_readings],
        *[item.get('text') for item in actions],
    ]
    reading_text = '\n'.join('' if part is None else str(part) for part in reading_parts)
    has_action_word = re.search(ACTION_WORDS, reading_text) is not None
    if not has_action_word:
        issues.append('missing_action')
    unique_issues = list(dict.fromkeys(issues))
    checks = [retrieval['ok'], parsed is not None, has_reference_coverage, has_actions, has_action_word]
    return {
        'ok': len(unique_issues) == 0,
        'score': score_checks(checks),
        'issues': unique_issues,
        'parsed': parsed,
        'retrieval': retrieval,
    }


def evaluate_followup_fixture(fixture: Any = None) -> dict[str, Any]:
    """Runs the same grounded parser contract for a structured follow-up.

    The follow-up path intentionally omits first-reading coverage requirements,
    but keeps goal-tier citations, claim support, calibration, and evidence
    limits.
    """
    if not isinstance(fixture, dict):
        fixture = {}
    question = fixture.get('question')
    cards = fixture.get('cards')
    output = fixture.get('output')
    required_kinds = fixture.get('requiredKinds', [])

    retrieval = evaluate_retrieval_case({'question': question, 'cards': cards, 'requiredKinds': required_kinds})
    routing = analyze_reading_question(question)
    evidence_meta = summarize_reading_evidence(
        retrieval['evidence'],
        cards,
        themes=routing['themes'],
        goals=routing['goals'],
    )
    required_goal_evidence = [
        goal for goal in routing['goals'] if (evidence_meta['goalCoverage'].get(goal) or {}).get('ok')
    ]
    requires_coverage_boundary = (
        evidence_meta['coverageStatus'] == 'anchor_only' or len(evidence_meta['coverageBoundaryGoals']) > 0
    )
    issues = [*retrieval['issues']]
    parsed = None
    try:
        parsed = parse_reading_output(
            output,
            {
                'cards': cards,
                'evidence': retrieval['evidence'],
                'requiredGoalEvidence': required_goal_evidence,
                'requireGoalReferenceCoverage': True,
                'requiredOutputGoals': routing['goals'],
                'requireGoalAlignment': True,
                'requireFollowUpQuestion': True,
                'allowedGoalSections': routing['goals'],
                'requireGoalTextCoverage': len(routing['goals']) > 0,
                'requireReferenceClaims': True,
                'requireReferenceSupport': True,
                'requireCardReadingSupport': True,
                'requireSynthesisSupport': True,
                'requireTextSupport': True,
                'activeQuestion': question,
                'requireQuestionRelevance': True,
                'requireRealityBoundary': requires_professional_boundary(question),
                'requirePerspectiveBoundary': requires_perspective_boundary(question),
                'requireCoverageBoundary': requires_coverage_boundary,
                'coverageBoundaryGoals': evidence_meta['coverageBoundaryGoals'],
                'requireCalibratedLanguage': True,
                'allowClarification': True,
                'isFollowUp': True,
            },
        )
    except Exception:
        issues.append('output_contract')
    unique_issues = list(dict.fromkeys(issues))
    checks = [retrieval['ok'], parsed is not None]
    return {
        'ok': len(unique_issues) == 0,
        'score': score_checks(checks),
        'issues': unique_issues,
        'parsed': parsed,
        'retrieval': retrieval,
    }

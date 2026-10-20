"""Dependency-free semantic reranker for reading evidence.

The reading agent already ships a pluggable ``semantic_reranker`` hook in
``reading_rag.retrieve_reading_evidence_async`` (an async callable that receives
``{"question", "cards", "evidence"}`` and returns ``{evidenceId: score in [0, 1]}``
within a short timeout), but production never wired a scorer into it. This module
supplies one that runs in-process with no extra dependencies.

It is a *lexical-semantic* hybrid rather than a dense embedding model:

* a small, curated Chinese synonym map bridges the paraphrase gap that plain
  BM25 cannot (e.g. a question about 转变 should still surface 变化/转化 cards);
* character-bigram overlap keeps the general relevance signal;
* a light theme/kind affinity nudges evidence that matches the routed theme.

Scores are normalised to ``[0, 1]`` so the existing ``semantic_weight`` blend in
``rerank_reading_evidence`` keeps its meaning. Replacing this with true dense
embeddings later only requires swapping the callable; the hook contract stays.
"""

from __future__ import annotations

import re
from typing import Any

from .reading_rag import analyze_reading_question

#: Curated paraphrase groups for the tarot/reflection domain.
#: A group only contributes when at least one member appears in the question.
SYNONYM_GROUPS: tuple[tuple[str, ...], ...] = (
    ("转变", "变化", "转化", "转折", "改变", "蜕变", "调整", "转向"),
    ("关系", "感情", "亲密", "伴侣", "连接", "互动", "相处", "他人"),
    ("工作", "事业", "职业", "职场", "项目", "任务", "岗位", "同事"),
    ("阻碍", "困难", "卡点", "挑战", "障碍", "瓶颈", "阻力", "卡住"),
    ("建议", "行动", "下一步", "做法", "方向", "尝试", "落实", "安排"),
    ("情绪", "心情", "感受", "焦虑", "不安", "压力", "紧张", "低落"),
    ("稳定", "踏实", "节奏", "平衡", "安定", "稳住", "沉淀", "边界"),
    ("选择", "取舍", "权衡", "选项", "比较", "利弊", "代价", "条件"),
    ("沟通", "交流", "表达", "对话", "说出", "坦诚", "商量"),
    ("边界", "限制", "底线", "原则", "分寸", "距离"),
    ("等待", "耐心", "时间", "时机", "放慢"),
    ("金钱", "财务", "收入", "投资", "资金", "成本", "开销"),
    ("学习", "成长", "练习", "提升", "积累", "经验"),
    ("冲突", "矛盾", "争执", "对抗", "摩擦", "分歧"),
    ("支持", "帮助", "资源", "依靠", "协助"),
    ("内在", "内心", "自我", "心理", "潜意识", "真实想法"),
    ("决定", "决策", "抉择", "定下来", "下决心"),
    ("观察", "核验", "现实", "反馈", "证据", "确认"),
    ("温柔", "温润", "柔和", "包容", "体贴"),
    ("恐惧", "害怕", "担忧", "畏惧", "不安", "担心"),
    ("冲动", "急躁", "莽撞", "情绪化", "克制", "节制", "自律"),
    ("韧性", "柔韧", "坚持", "耐力", "弹力", "承受"),
    ("力量", "能力", "实力", "能量", "底气"),
    ("磨练", "打磨", "锤炼", "锻炼", "积累", "沉淀"),
)

#: Theme -> evidence kinds that carry the application layer for that theme.
_THEME_KINDS: dict[str, frozenset[str]] = {
    "relationship": frozenset({"relationships", "symbolism", "orientation"}),
    "career": frozenset({"work", "symbolism", "orientation"}),
    "reflection": frozenset({"symbolism", "orientation"}),
}

_CLEAN_PATTERN = re.compile(r"[^\u4e00-\u9fffA-Za-z0-9]+")

#: Ignore normalisation noise below this raw score: with no real signal every
#: candidate would otherwise be inflated to 1.0 and dominate the lexical score.
_MIN_SIGNAL = 0.02


def _clean(text: Any) -> str:
    return _CLEAN_PATTERN.sub("", text if isinstance(text, str) else "")


def _bigrams(text: str) -> set[str]:
    if len(text) < 2:
        return {text} if text else set()
    return {text[index : index + 2] for index in range(len(text) - 1)}


def _raw_score(question: str, evidence_text: str, kind: str, theme_kinds: frozenset[str] | None) -> float:
    cleaned_evidence = _clean(evidence_text)
    if not cleaned_evidence:
        return 0.0
    query_bigrams = _bigrams(question)
    evidence_bigrams = _bigrams(cleaned_evidence)
    coverage = (
        len(query_bigrams & evidence_bigrams) / len(query_bigrams) if query_bigrams else 0.0
    )

    activated = [group for group in SYNONYM_GROUPS if any(term in question for term in group)]
    matched = [group for group in activated if any(term in cleaned_evidence for term in group)]
    synonym = len(matched) / len(activated) if activated else 0.0

    affinity = 1.0 if theme_kinds and kind in theme_kinds else 0.0

    return 0.55 * coverage + 0.30 * synonym + 0.15 * affinity


def score_evidence(question: str, cards: Any, evidence: Any) -> dict[str, float]:
    """Synchronous scoring core. Returns ``{evidenceId: score in [0, 1]}``."""
    if not isinstance(evidence, list) or not evidence:
        return {}
    cleaned_question = _clean(question)
    meta = analyze_reading_question(question) if question else {"themes": []}
    theme_kinds: frozenset[str] = frozenset()
    for theme in meta.get("themes") or []:
        theme_kinds |= _THEME_KINDS.get(theme, frozenset())

    raw: dict[str, float] = {}
    for item in evidence:
        evidence_id = item.get("evidenceId")
        if not evidence_id:
            continue
        raw[evidence_id] = _raw_score(
            cleaned_question,
            item.get("text"),
            item.get("kind"),
            theme_kinds,
        )

    peak = max(raw.values(), default=0.0)
    if peak <= _MIN_SIGNAL:
        # No usable semantic signal: return all-zero so the caller falls back to
        # the lexical score untouched (semantic_score * weight == 0).
        return {evidence_id: 0.0 for evidence_id in raw}
    return {evidence_id: round(value / peak, 6) for evidence_id, value in raw.items()}


async def rerank_evidence(payload: Any) -> dict[str, float]:
    """Async hook expected by ``retrieve_reading_evidence_async``.

    Malformed input returns an empty mapping, which the caller already treats as
    "no semantic signal" and therefore as a no-op.
    """
    if not isinstance(payload, dict):
        return {}
    question = payload.get("question")
    return score_evidence(
        question if isinstance(question, str) else "",
        payload.get("cards"),
        payload.get("evidence"),
    )

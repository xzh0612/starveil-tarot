"""Retrieval and validation core for the Starveil reading agent.

Ported from `frontend/server-js-reference/reading-rag.mjs`. This module owns the
knowledge corpus, the Chinese intent lexicon, evidence retrieval and the JSON
contract the model's output is validated against. `readings.py` is the caller:
it assembles the prompt from `retrieve_reading_evidence` / `summarize_reading_evidence`
and gates the provider response with `parse_reading_output`.

The port is a behaviour-preserving translation, not a rewrite. Two translation
decisions recur and are worth stating once:

* Every JSON key and user-visible string stays byte-identical to the
  JavaScript original; only Python identifiers are snake_case.
* JavaScript `Set` is translated as an insertion-ordered `dict` whenever the
  original iterates it (the order feeds `Map` construction and therefore
  floating-point summation order in BM25), and as a plain `set` when the
  original only calls `.has` / `.add`. `Map` is translated as `dict`.

`_to_number` maps a missing value (`undefined`) to NaN; the original only ever
coerces present numbers and numeric strings, so `Number(null) === 0` never
matters here.
"""

from __future__ import annotations

import asyncio
import json
import math
import re
from decimal import ROUND_HALF_UP, Decimal
from types import MappingProxyType
from typing import Any

from .deck import CARD_BY_ID, CARD_GUIDES, CARD_REFERENCES

READING_KNOWLEDGE_VERSION = "rws-1909-rag-v55"
MEMORY_RETRIEVAL_VERSION = "memory-keyword-v3"


# ---------------------------------------------------------------------------
# Translation plumbing
# ---------------------------------------------------------------------------


def _string(value: Any) -> str:
    """`String(value ?? '')` for the JSON primitives this module sees.

    JavaScript's boolean and integral-float string forms differ from Python's
    (`true`/`false`, `2` rather than `2.0`), so they are normalised explicitly.
    """
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return str(int(value))
    return str(value)


def _to_number(value: Any) -> Any:
    """`Number(value)`: numbers pass through, numeric strings are parsed, the rest is NaN."""
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return 0
        try:
            return float(text)
        except ValueError:
            return float("nan")
    return float("nan")


def _is_finite_number(value: Any) -> bool:
    """`Number.isFinite(value)` — true only for real numbers, never a bool or a string."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _is_boolean(value: Any) -> bool:
    """`typeof value === 'boolean'` — `True` is an `int` in Python, so `type` is used."""
    return type(value) is bool


def _js_fixed3(value: Any) -> Any:
    """`Number(value.toFixed(3))`.

    JavaScript rounds half away from zero on the exact binary value, which
    differs from Python's half-to-even `round`/format at exact ties. Retrieval
    scores are non-negative, so `ROUND_HALF_UP` reproduces `toFixed`.
    """
    rounded = Decimal(value).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    return int(rounded) if rounded == rounded.to_integral_value() else float(rounded)


def _js_num(value: Any) -> Any:
    """A JavaScript number as JSON serialises it: an integral value has no decimal part.

    JavaScript has one number type, so `2 * 1 + 1 * 0.5` serialises as `2`, not
    `2.0`. Scores reach the client outside the prompt, so this is normalised at
    the point of computation.
    """
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return int(value)
    return value


def _unique(values: Any) -> list[Any]:
    """`[...new Set(values)]` — first-seen order, deduped."""
    return list(dict.fromkeys(values))


def _as_list(value: Any) -> list[Any]:
    """`Array.isArray(value) ? value : []`."""
    return value if isinstance(value, list) else []


def _prop(obj: Any, key: str) -> Any:
    """`obj?.key` for JSON objects — None when the object is absent or the key is unset."""
    return obj.get(key) if isinstance(obj, dict) else None


# ---------------------------------------------------------------------------
# Provenance tables
# ---------------------------------------------------------------------------

# Keep provenance separate from the human-readable source name. The model and
# client can use this stable enum to tell fixed card meaning from external
# context and the user's private memory without parsing labels.
_SOURCE_TYPE_BY_SOURCE = {
    "editorial": "fixed_card_meaning",
    "memory": "personal_memory",
    "waite": "external_reference",
    "corpora": "external_reference",
}


def evidence_source_type(source: Any) -> str:
    return _SOURCE_TYPE_BY_SOURCE.get(source) or "other"


# Source type identifies where a chunk came from; authority explains how it
# may be used when two sources use different language for the same card.
# The fixed deck remains canonical, while external material is supplemental
# and personal memory is contextual rather than card meaning.
_SOURCE_AUTHORITY_BY_SOURCE = {
    "editorial": "canonical_fixed",
    "waite": "historical_reference",
    "corpora": "contextual_reference",
    "memory": "user_context",
}


def evidence_source_authority(source: Any) -> str:
    return _SOURCE_AUTHORITY_BY_SOURCE.get(source) or "unknown"


# ---------------------------------------------------------------------------
# Corpus validation
# ---------------------------------------------------------------------------

_REQUIRED_GUIDE_FIELDS = ["upright", "reversed", "symbolism", "relationships", "work", "question"]


def validate_reading_corpus() -> dict[str, Any]:
    card_ids = sorted(CARD_BY_ID)
    guide_ids = sorted(CARD_GUIDES)
    reference_ids = sorted(CARD_REFERENCES)
    missing_guides = [
        card_id
        for card_id in card_ids
        if any(
            not isinstance(_prop(CARD_GUIDES.get(card_id), field), str)
            or not CARD_GUIDES[card_id][field].strip()
            for field in _REQUIRED_GUIDE_FIELDS
        )
    ]

    def missing_reference(card_id: str) -> bool:
        reference = CARD_REFERENCES.get(card_id)
        if not reference:
            return True
        waite = reference.get("waite")
        return not isinstance(waite, str) or not waite.strip()

    missing_references = [card_id for card_id in card_ids if missing_reference(card_id)]
    orphan_guides = [guide_id for guide_id in guide_ids if not CARD_BY_ID.get(guide_id)]
    orphan_references = [reference_id for reference_id in reference_ids if not CARD_BY_ID.get(reference_id)]
    # The original froze this status object. Callers share it, so a MappingProxyType
    # keeps the same guarantee: mutating it raises TypeError instead of silently
    # changing what the next caller sees.
    return MappingProxyType({
        "ok": len(card_ids) == 78
        and len(guide_ids) == 78
        and len(reference_ids) == 78
        and not missing_guides
        and not missing_references
        and not orphan_guides
        and not orphan_references,
        "cardCount": len(card_ids),
        "guideCount": len(guide_ids),
        "referenceCount": len(reference_ids),
        "requiredGuideFields": list(_REQUIRED_GUIDE_FIELDS),
        "missingGuides": missing_guides,
        "missingReferences": missing_references,
        "orphanGuides": orphan_guides,
        "orphanReferences": orphan_references,
    })


READING_CORPUS_STATUS = validate_reading_corpus()
if not READING_CORPUS_STATUS["ok"]:
    raise ValueError("塔罗知识库不完整，已停止生成解读。")


# ---------------------------------------------------------------------------
# Safety boundaries
# ---------------------------------------------------------------------------

_PROFESSIONAL_BOUNDARY_WORDS = [
    "健康", "症状", "疾病", "诊断", "治疗", "药物", "医疗", "检查报告", "化验", "急诊", "自伤", "自杀", "成瘾",
    "法律", "律师", "诉讼", "官司", "起诉", "上诉", "仲裁", "合同", "纠纷", "离婚", "抚养", "监护", "投资", "股票",
    "基金", "理财", "财务", "财运", "借贷", "贷款", "房贷", "买房", "购房", "债务", "欠款", "保险", "理赔", "税务",
    "失眠", "睡眠", "睡不好", "睡不着", "睡眠不足", "睡不够", "睡四小时", "少睡", "疼痛", "胸痛", "胸口疼", "胸口痛",
    "头疼", "头痛", "腹痛", "发烧", "高烧", "咳嗽", "呼吸困难", "手术", "停药", "换药", "用药", "吃药", "服药", "就医",
    "副作用", "心理危机", "抑郁", "惊恐",
]


def requires_professional_boundary(question: Any, messages: Any = None) -> bool:
    texts = [_string(question)]
    if isinstance(messages, list):
        texts.extend(
            message["text"]
            for message in messages
            if _prop(message, "role") == "user" and isinstance(_prop(message, "text"), str)
        )
    return any(
        any(word in _string(text).lower() for word in _PROFESSIONAL_BOUNDARY_WORDS) for text in texts
    )


_PERSPECTIVE_BOUNDARY_WORDS = [
    "真实想法", "真实感受", "真实态度", "心里怎么想", "心里在想", "对方怎么想", "他怎么想", "她怎么想", "爱不爱我",
    "喜欢我吗", "在不在乎", "有没有想我", "对我是什么感觉",
]
_PERSPECTIVE_RELATION_PATTERN = re.compile(
    "(?:他|她|对方|对象|伴侣|前任|那个人)[^。！？?\\n]{0,10}"
    "(?:爱我|喜欢我|在乎我|想我|有好感|有感觉|什么态度|是什么态度|对我是什么感觉)"
)
_PERSPECTIVE_INNER_STATE_PATTERN = re.compile(
    "(?:他|她|对方|对象|伴侣|前任|那个人)[^。！？?\\n]{0,8}(?:到底|究竟|现在|目前)?[^。！？?\\n]{0,4}"
    "(?:在想什么|怎么想|什么心态|什么打算|怎么打算|什么意思|什么意图|是不是认真的|对我什么态度|态度如何|态度怎样"
    "|怎么看我|怎么评价我|怎么看待我)"
)


def requires_perspective_boundary(question: Any, messages: Any = None) -> bool:
    texts = [_string(question)]
    if isinstance(messages, list):
        texts.extend(
            message["text"]
            for message in messages
            if _prop(message, "role") == "user" and isinstance(_prop(message, "text"), str)
        )
    for text in texts:
        normalized = _string(text).lower()
        if any(word in normalized for word in _PERSPECTIVE_BOUNDARY_WORDS):
            return True
        if _PERSPECTIVE_RELATION_PATTERN.search(normalized):
            return True
        if _PERSPECTIVE_INNER_STATE_PATTERN.search(normalized):
            return True
    return False


# ---------------------------------------------------------------------------
# Intent lexicon
# ---------------------------------------------------------------------------

_THEMES = [
    {
        "name": "relationship",
        "words": ["关系", "感情", "恋爱", "爱情", "伴侣", "对象", "前任", "暧昧", "复合", "婚姻", "分手", "喜欢", "相处",
                  "沟通", "边界", "冷战", "联系", "聊天", "告白", "家庭", "朋友"],
        "weakWords": ["他", "她", "我们"],
    },
    {
        "name": "career",
        "words": ["工作", "事业", "职业", "学习", "备考", "复习", "考研", "考试", "创业", "项目", "领导", "同事", "收入",
                  "财务", "转行", "跳槽", "辞职", "换岗", "职场", "就业", "求职", "面试", "绩效", "薪资", "薪水", "待遇",
                  "升职", "技能", "论文", "升学", "录取", "上岸", "学校", "院校", "offer", "岗位", "职位", "公司", "入职"],
    },
    {
        "name": "choice",
        "words": ["选择", "要不要", "是否", "该不该", "决定", "比较", "哪个", "还是", "机会", "两条路", "取舍", "纠结", "路径"],
    },
    {
        "name": "future",
        "words": ["未来", "接下来", "趋势", "之后", "近期", "今年", "明年", "发展", "走向", "时间"],
    },
    {
        "name": "reflection",
        "words": ["自己", "自我", "迷茫", "成长", "情绪", "压力", "焦虑", "不安", "疲惫", "方向", "生活", "状态", "疗愈",
                  "内耗", "困惑", "意义", "自信", "睡眠", "失眠", "睡不好", "睡不着", "精力"],
    },
]

_GOALS = [
    {
        "name": "advice",
        "words": ["怎么办", "如何", "怎么做比较好", "怎么", "应该", "先做什么", "该做什么", "需要注意什么", "怎样处理",
                  "怎样调整", "怎样沟通", "怎样安排", "怎样做", "怎样面对", "怎样开始", "怎样改善", "怎样解决", "如何处理",
                  "如何调整", "如何沟通", "如何安排", "如何平衡", "如何兼顾", "如何规划", "怎么处理", "怎么调整", "怎么沟通",
                  "怎么安排", "怎么平衡", "怎么兼顾", "怎么规划", "建议", "下一步", "行动", "安排", "处理", "沟通", "平衡",
                  "兼顾", "规划", "开口", "调整", "改善", "应不应该"],
    },
    # Temporal context words such as “未来” or “接下来” qualify a question,
    # but do not by themselves ask for a prediction. Keep them low-weight so
    # “未来我该怎么办” routes to advice, while “未来会怎样” still routes to
    # forecast because it contains the explicit prediction phrase “会怎样”.
    {
        "name": "forecast",
        "words": ["会不会", "是否会", "是不是", "爱不爱我", "爱我吗", "还爱不爱我", "还爱我吗", "有没有想我", "想我吗",
                  "有没有感觉", "有感觉吗", "对我是什么感觉", "是什么感觉", "有好感吗", "还有感觉吗", "还有戏吗", "有戏吗",
                  "还有可能吗", "有可能吗", "有希望吗", "喜欢我吗", "还喜欢", "是否还在乎", "还在乎", "在乎我吗", "在不在乎我",
                  "还在不在乎我", "会主动联系", "会联系我吗", "会联系", "会复合吗", "会回来吗", "会回来找我", "还会回来吗",
                  "会发生什么", "会遇到什么", "会更好吗", "会怎么发展", "会怎么走", "有什么变化", "有没有变化", "状态如何",
                  "前景如何", "能找到工作吗", "今年能找到工作吗", "能考上吗", "考试能过吗", "能过吗", "能赢吗", "会赢吗",
                  "能成功吗", "能拿到吗", "会如何", "未来如何", "事业如何", "感情如何", "关系如何", "工作如何", "发展如何",
                  "结果如何", "财运如何", "财运", "能否", "能不能", "有没有可能", "有没有机会", "是否有机会", "有机会吗",
                  "何时", "什么时候", "多久", "多长时间", "几率", "结果", "趋势", "发展", "走向", "可能性", "会怎样", "怎么样"],
        "weakWords": ["未来", "之后", "接下来", "近期", "今年", "明年"],
    },
    {
        "name": "explanation",
        "words": ["为什么", "原因", "真相", "核心问题是什么", "问题是什么", "核心是什么", "启示", "警示", "提醒我什么",
                  "提示我什么", "提醒什么", "提示什么", "这张牌想告诉我什么", "告诉我什么", "在想什么", "心里怎么想",
                  "心里在想什么", "是不是因为", "是否是因为", "是否因为", "是不是由于", "是否由于", "会不会是因为",
                  "会不会因为", "是因为", "是什么导致", "什么导致", "导致什么", "是不是我做错了", "是不是做错了", "解释",
                  "解读", "想了解", "了解这张牌", "是什么意思", "什么意思", "是什么含义", "是什么想法", "是什么关系",
                  "真实想法", "真实的想法", "内心想法", "真实态度", "态度是什么", "是什么态度", "什么态度", "真实感受",
                  "想法是什么", "他怎么想", "她怎么想", "说明什么", "说明了什么", "阻碍位", "放在阻碍位", "哪里做错了",
                  "错在哪里", "做错了什么", "含义", "意义", "代表", "意味着", "怎么看", "怎么看我", "怎么看待我",
                  "怎么评价我", "如何看", "如何理解", "怎么理解", "怎么解释", "如何解释", "怎么想", "如何想", "对方怎么想",
                  "会怎么想", "对我什么态度", "对我态度如何", "对我态度怎样", "态度如何", "态度怎样", "理解"],
    },
    # Decision questions are often phrased without the words "比较" or
    # "哪个". Keep these yes-or-no forms in the comparison goal so retrieval
    # still supplies decision-oriented application evidence.
    {
        "name": "comparison",
        "words": ["比较", "区别", "哪个", "哪一个", "选择哪一个", "哪一个更好", "哪一个更适合我", "哪条", "哪种", "哪种发展",
                  "哪一种发展", "哪个发展", "哪一个发展", "选哪", "选什么", "怎么选", "怎么选择", "怎么挑", "该选什么",
                  "应该选哪个", "应该选哪一个", "应该选什么", "应该选择哪个", "应该选择哪一个", "应该选择什么", "哪种更好",
                  "哪一种更好", "哪种更适合我", "哪一种更适合我", "更适合我", "更适合", "哪个更好", "利弊", "优缺点", "取舍",
                  "怎么取舍", "要不要", "要不要继续", "想不想", "是否想", "是否需要", "是不是需要", "适不适合", "先联系",
                  "还是等", "先做哪一个", "留在这里还是离开", "留下还是离开", "留下还是继续", "继续不继续", "是否继续",
                  "还是离开", "换不换工作", "应该不应该", "应该留下吗", "该不该", "是不是应该", "是否应该", "是不是要",
                  "是否要", "值得继续吗", "值得吗", "适合我吗", "适合吗", "是否值得", "值不值得"],
    },
]

_GOAL_REQUIRED_TIERS = {
    "advice": "application",
    "comparison": "application",
    "forecast": "reference",
    "explanation": "anchor",
}

# Intent lexicon matches must respect a small set of Chinese negation
# patterns. Without this guard, phrases such as “不想比较” or “不是想问会不会”
# become active goals even though the user explicitly ruled them out. The
# bounded four-character tail keeps ordinary phrases such as “不知道要不要”
# active while avoiding a broad sentiment classifier.
_NEGATED_INTENT_PREFIX = re.compile(
    "(?:不想|不是想|不是要|不是问|不是要问|不用|(?<!要)不要|无需|并非|不在于|不问|不求|不考虑|不需要)[^。！？?\\n]{0,4}\\Z"
)
_GOAL_LEXICON_TERMS = _unique(
    [term for goal in _GOALS for term in [*(goal.get("words") or []), *(goal.get("weakWords") or [])]]
)
_ADVICE_CONTINUATION_TERMS = [
    "处理", "安排", "平衡", "兼顾", "调整", "改善", "沟通", "规划", "准备", "开始", "面对", "解决", "保持", "练习",
    "行动", "开口", "落实",
]
_PAIRED_OPTION_OUTCOME_PATTERN = re.compile(
    "(?:选择|选|方案|路径|选项)[^。！？?\\n]{0,16}(?:会怎样|会如何|怎么样|结果如何|有什么变化)"
    "[，,；;、和与及]+"
    "(?:选择|选|方案|路径|选项)[^。！？?\\n]{0,16}(?:会怎样|会如何|怎么样|结果如何|有什么变化)"
)
_OPTION_COMPARISON_PATTERN = re.compile(
    "(?:选|选择|方案|路径|选项|哪个|哪一个|哪种|哪一种)[^。！？?\\n]{0,16}(?:还是|更适合|更好|更值得)[^。！？?\\n]{0,16}"
)


def _has_paired_option_outcome(text: str) -> bool:
    return _PAIRED_OPTION_OUTCOME_PATTERN.search(text) is not None


def _has_option_comparison(text: str) -> bool:
    return _OPTION_COMPARISON_PATTERN.search(text) is not None


def _candidate_covers_index(text: str, candidate: str, index: int, term_length: int) -> bool:
    """Whether an occurrence of `candidate` in `text` fully contains `[index, index+term_length)`."""
    cursor = 0
    while cursor <= len(text):
        candidate_index = text.find(candidate, cursor)
        if candidate_index < 0:
            return False
        if index >= candidate_index and index + term_length <= candidate_index + len(candidate):
            return True
        cursor = candidate_index + max(1, len(candidate))
    return False


def _active_lexicon_terms(
    text: str, terms: list[str], *, prefer_longer_intent: bool = False, goal_name: str = ""
) -> list[str]:
    def keep(term: str) -> bool:
        # Prefer an explicit longer intent phrase over the shorter occurrence it
        # actually contains. Do this per occurrence rather than per question:
        # “会怎么发展，我该怎么做” must keep both forecast and advice.
        if prefer_longer_intent:
            candidates = [c for c in _GOAL_LEXICON_TERMS if len(c) > len(term) and term in c]
            positions = []
            cursor = 0
            while cursor <= len(text):
                index = text.find(term, cursor)
                if index < 0:
                    break
                positions.append(index)
                cursor = index + max(1, len(term))
            if positions and all(
                any(_candidate_covers_index(text, candidate, index, len(term)) for candidate in candidates)
                for index in positions
            ):
                return False
        offset = 0
        while offset <= len(text):
            index = text.find(term, offset)
            if index < 0:
                return False
            # Phrases such as “关系如何” or “工作如何” are forecast candidates only
            # when they stand on their own or continue into a trend/result word. If an
            # action verb follows, preserve the advice route instead of letting the
            # domain noun steal the user's “how should I handle it?” intent.
            if (
                goal_name == "forecast"
                and term.endswith("如何")
                and any(
                    text[index + len(term):index + len(term) + len(continuation)] == continuation
                    for continuation in _ADVICE_CONTINUATION_TERMS
                )
            ):
                offset = index + max(1, len(term))
                continue
            prefix = text[max(0, index - 8):index]
            if not _NEGATED_INTENT_PREFIX.search(prefix):
                return True
            offset = index + max(1, len(term))
        return False

    return [term for term in terms if keep(term)]


_POSITION_HINTS = [
    {"words": ["关系", "感受", "需求", "互动", "挑战", "阻碍", "对方", "联系", "情绪"], "kind": "relationships", "boost": 6},
    {"words": ["事业", "资源", "优势", "工作", "行动", "建议", "下一步", "阻碍", "机会", "路径", "发展", "任务"],
     "kind": "work", "boost": 6},
    {"words": ["过去", "现在", "趋势", "未来", "当下", "近期", "基础", "环境", "可能发展"], "kind": "orientation", "boost": 3},
    {"words": ["选择", "现状", "隐含因素", "意识目标", "自我状态", "希望", "担忧", "核心", "交叉影响"],
     "kind": "reflection", "boost": 5},
]


def analyze_reading_question(question: Any) -> dict[str, Any]:
    text = _string(question).strip().lower()
    scored = []
    for theme in _THEMES:
        strong_terms = _active_lexicon_terms(text, theme["words"])
        weak_terms = _active_lexicon_terms(text, theme.get("weakWords") or [])
        scored.append(
            {
                "name": theme["name"],
                "strongTerms": strong_terms,
                "weakTerms": weak_terms,
                "score": _js_num(len(strong_terms) * 2 + len(weak_terms) * 0.5),
            }
        )
    strong = [item for item in scored if item["score"] >= 2]
    active = strong if strong else [item for item in scored if item["score"] > 0]
    themes = [item["name"] for item in active]
    strong_matched_terms = _unique([term for item in active for term in item["strongTerms"]])
    weak_matched_terms = _unique([term for item in active for term in item["weakTerms"]])
    matched_terms = _unique([*strong_matched_terms, *weak_matched_terms])
    theme_scores = {item["name"]: item["score"] for item in scored}

    goal_scored = []
    for goal in _GOALS:
        terms = _active_lexicon_terms(
            text, goal["words"], prefer_longer_intent=True, goal_name=goal["name"]
        )
        weak_terms = _active_lexicon_terms(
            text, goal.get("weakWords") or [], prefer_longer_intent=True, goal_name=goal["name"]
        )
        goal_scored.append(
            {
                "name": goal["name"],
                "terms": terms,
                "weakTerms": weak_terms,
                "score": _js_num(len(terms) * 2 + len(weak_terms) * 0.5),
            }
        )
    paired_option_outcome = _has_paired_option_outcome(text)
    if paired_option_outcome:
        comparison_goal = next(item for item in goal_scored if item["name"] == "comparison")
        comparison_goal["terms"] = [*comparison_goal["terms"], "选项结果比较"]
        comparison_goal["score"] = max(comparison_goal["score"], 2)
    option_comparison = _has_option_comparison(text)
    if option_comparison:
        comparison_goal = next(item for item in goal_scored if item["name"] == "comparison")
        comparison_goal["terms"] = [*comparison_goal["terms"], "口语选项比较"]
        comparison_goal["score"] = max(comparison_goal["score"], 2)

    active_goals = [item for item in goal_scored if item["score"] >= 2]
    goal_fallback = [item for item in goal_scored if item["score"] > 0]
    # Weak temporal context alone should keep the question open. It may qualify
    # an explicit goal, but it must not manufacture a forecast route by itself.
    fallback_goals = [item for item in goal_fallback if len(item["terms"]) > 0]
    selected_goals = active_goals if active_goals else fallback_goals
    goals = [item["name"] for item in selected_goals]
    matched_goal_terms = _unique(
        [term for item in selected_goals for term in [*item["terms"], *item["weakTerms"]]]
    )
    goal_scores = {item["name"]: item["score"] for item in goal_scored}
    return {
        "themes": themes,
        "matchedTerms": matched_terms,
        "strongMatchedTerms": strong_matched_terms,
        "weakMatchedTerms": weak_matched_terms,
        "weakOnly": len(strong) == 0 and len(weak_matched_terms) > 0,
        "themeScores": theme_scores,
        "goals": goals,
        "matchedGoalTerms": matched_goal_terms,
        "goalScores": goal_scores,
        "goalConfidence": "open" if not goals else ("focused" if len(goals) == 1 else "mixed"),
        "ambiguous": len(themes) != 1,
        "confidence": "open" if not themes else ("focused" if len(themes) == 1 else "mixed"),
    }


def reading_query_for(question: Any, messages: Any = None) -> str:
    fallback = _string(question).strip()[:2_000]
    if not isinstance(messages, list):
        return fallback
    latest = None
    for message in reversed(messages):
        if (
            _prop(message, "role") == "user"
            and _prop(message, "source") != "demo"
            and isinstance(_prop(message, "text"), str)
            and message["text"].strip()
        ):
            latest = message
            break
    return latest["text"].strip()[:2_000] if latest is not None else fallback


_DOMAIN_THEMES = {"relationship", "career", "reflection"}


def _merge_followup_routing(
    original_meta: dict[str, Any], active_meta: dict[str, Any], retrieval_meta: dict[str, Any]
) -> dict[str, Any]:
    active_has_goal = len(active_meta.get("goals") or []) > 0
    if active_has_goal:
        goals = list(active_meta["goals"])
    else:
        goals = list(
            original_meta["goals"]
            if original_meta.get("goals")
            else (retrieval_meta.get("goals") or [])
        )
    goal_meta = (
        active_meta
        if active_has_goal
        else (original_meta if original_meta.get("goals") else retrieval_meta)
    )
    active_has_domain = not active_meta.get("weakOnly") and any(
        theme in _DOMAIN_THEMES for theme in (active_meta.get("themes") or [])
    )
    if active_has_domain:
        themes = list(active_meta.get("themes") or [])
    else:
        themes = _unique(
            [
                *(original_meta.get("themes") or []),
                *([] if active_meta.get("weakOnly") else (active_meta.get("themes") or [])),
            ]
        )
    return {
        **retrieval_meta,
        "themes": themes,
        "goals": goals,
        "matchedGoalTerms": list(goal_meta.get("matchedGoalTerms") or []),
        "goalScores": {**(goal_meta.get("goalScores") or {})},
        "goalConfidence": "open" if not goals else ("focused" if len(goals) == 1 else "mixed"),
        "ambiguous": len(themes) != 1,
        "confidence": "open" if not themes else ("focused" if len(themes) == 1 else "mixed"),
    }


def reading_retrieval_for(
    question: Any, messages: Any = None
) -> tuple[str, str, dict[str, Any], bool]:
    original = _string(question).strip()[:2_000]
    original_meta = analyze_reading_question(original)
    active_question = reading_query_for(original, messages)
    active_meta = analyze_reading_question(active_question)
    active_has_domain = any(theme in _DOMAIN_THEMES for theme in (active_meta.get("themes") or []))
    inherited_original = bool(
        original
        and active_question != original
        and (active_meta["confidence"] == "open" or active_meta["weakOnly"] or not active_has_domain)
    )
    retrieval_question = (
        f"{original}{'' if active_meta['weakOnly'] else chr(10) + active_question}"
        if inherited_original
        else active_question
    )[:4_000]
    retrieval_meta = analyze_reading_question(retrieval_question)
    preserve_previous_goal = bool(
        original
        and active_question != original
        and not active_meta["goals"]
        and original_meta["goals"]
    )
    return (
        active_question,
        retrieval_question,
        _merge_followup_routing(original_meta, active_meta, retrieval_meta)
        if (inherited_original or preserve_previous_goal)
        else retrieval_meta,
        inherited_original,
    )


# A mixed topic is not automatically ambiguous when the user has already
# named the response goals. For example, "未来会怎样，同时下一步怎么做"
# contains both forecast and advice goals and should receive both sections in
# the first answer. Reserve a clarification turn for genuinely open questions
# (or for an existing conversation where the user is refining the answer).
def can_ask_clarification(retrieval_meta: Any, *, has_prior_assistant: bool = False) -> bool:
    if has_prior_assistant:
        return True
    meta = retrieval_meta if isinstance(retrieval_meta, dict) else {}
    return meta.get("confidence") == "open" and meta.get("goalConfidence") == "open"


# ---------------------------------------------------------------------------
# Corpus chunking, BM25 scoring and retrieval
# ---------------------------------------------------------------------------

_TOKEN_PATTERN = re.compile(r"[a-z0-9]+|[\u4e00-\u9fff]{2,4}")
_CJK_CHAR_PATTERN = re.compile(r"[\u4e00-\u9fff]")


def _token_list(text: Any) -> list[str]:
    value = _string(text).lower()
    tokens = _TOKEN_PATTERN.findall(value)
    # Include overlapping bigrams so short Chinese questions can match source phrases.
    chars = [char for char in value if _CJK_CHAR_PATTERN.search(char)]
    for index in range(len(chars) - 1):
        tokens.append("".join(chars[index:index + 2]))
    return tokens


def _chinese_ngrams(text: Any) -> dict[str, None]:
    # An insertion-ordered set: several callers iterate the ngrams in order.
    return dict.fromkeys(_token_list(text))


def _query_expansion_terms(routing: dict[str, Any]) -> dict[str, None]:
    terms: dict[str, None] = {}
    for theme_name in routing.get("themes") or []:
        theme = next((item for item in _THEMES if item["name"] == theme_name), None)
        for term in (theme.get("words") if theme else None) or []:
            terms[term] = None
    for goal_name in routing.get("goals") or []:
        goal = next((item for item in _GOALS if item["name"] == goal_name), None)
        for term in (goal.get("words") if goal else None) or []:
            terms[term] = None
    return terms


# These words route intent, but do not identify the subject. Keeping them out
# of direct lexical evidence prevents a generic question form from outranking
# a topic-bearing phrase such as "关系" or "学习".
_GENERIC_QUERY_TERMS = {
    "现在", "目前", "什么", "如何", "怎么", "怎样", "是否", "会不会", "能不能", "可不可以", "为什么", "哪里", "哪个", "哪些",
}


def _weighted_query_terms(question: Any, routing: dict[str, Any]) -> dict[str, Any]:
    direct = dict.fromkeys(
        term for term in _chinese_ngrams(question) if term not in _GENERIC_QUERY_TERMS
    )
    expanded = _query_expansion_terms(routing)
    weights: dict[str, float] = {term: 1 for term in direct}
    for term in expanded:
        if term not in weights:
            weights[term] = 0.35
    return {"direct": direct, "expanded": expanded, "weights": weights}


def _bm25_score(text: Any, terms: Any, corpus: Any = None) -> float:
    corpus = corpus or []
    tokens = _token_list(text)
    length = len(tokens) or 1
    weighted = terms if isinstance(terms, dict) else {term: 1 for term in (terms or [])}
    if not weighted or not tokens or not corpus:
        return 0
    counts: dict[str, int] = {}
    for token in tokens:
        counts[token] = counts.get(token, 0) + 1
    documents = [set(_token_list(chunk["text"])) for chunk in corpus]
    average_length = sum(
        (len(_token_list(chunk["text"])) or 1) for chunk in corpus
    ) / max(1, len(corpus))
    k1 = 1.2
    b = 0.75
    total = len(corpus)
    score = 0
    for term, weight in weighted.items():
        frequency = counts.get(term, 0)
        if not frequency:
            continue
        document_frequency = sum(1 for document in documents if term in document)
        idf = math.log(1 + (total - document_frequency + 0.5) / (document_frequency + 0.5))
        denominator = frequency + k1 * (1 - b + b * length / max(1, average_length))
        score += weight * idf * (frequency * (k1 + 1) / denominator)
    return min(6, score)


def _themes_for(question: Any) -> list[str]:
    # Kept from the original, which defines `themesFor` without calling it.
    return analyze_reading_question(question)["themes"]


def _excerpt(text: Any, max_chars: int = 360) -> str:
    value = re.sub(r"\s+", " ", _string(text)).strip()
    return f"{value[:max_chars - 1]}…" if len(value) > max_chars else value


def _candidate_chunks(card: dict[str, Any], question: Any) -> list[dict[str, Any]]:
    del question
    guide = CARD_GUIDES[card["id"]]
    reference = CARD_REFERENCES.get(card["id"])
    orientation = "reversed" if card["reversed"] else "upright"
    modern_items = _prop(reference, "shadow" if card["reversed"] else "light")
    if modern_items is None:
        modern_items = []
    modern = "；".join(modern_items[:3])
    modern_label = "挑战面" if card["reversed"] else "建设面"
    chunks = [
        {"kind": "symbolism", "text": guide["symbolism"], "source": "editorial", "sourceLabel": "星幕编辑牌义", "base": 4},
        {
            "kind": "orientation",
            "text": guide[orientation],
            "source": "editorial",
            "sourceLabel": f"星幕编辑牌义 · {'逆位' if card['reversed'] else '正位'}",
            "base": 10,
        },
        {"kind": "relationships", "text": guide["relationships"], "source": "editorial", "sourceLabel": "星幕编辑牌义 · 关系与情感", "base": 2},
        {"kind": "work", "text": guide["work"], "source": "editorial", "sourceLabel": "星幕编辑牌义 · 事业与行动", "base": 2},
        {"kind": "reflection", "text": guide["question"], "source": "editorial", "sourceLabel": "星幕编辑牌义 · 反思问题", "base": 1},
    ]
    if _prop(reference, "waite"):
        chunks.append(
            {
                "kind": "waite",
                "text": _excerpt(_prop(reference, "waite")),
                "source": "waite",
                "sourceLabel": "A. E. Waite · The Pictorial Key to the Tarot",
                "url": _prop(reference, "waiteUrl"),
                "base": 2,
            }
        )
    if modern:
        chunks.append(
            {
                "kind": "modern",
                "text": _excerpt(f"{modern_label}：{modern}", 420),
                "source": "corpora",
                "sourceLabel": "Corpora · tarot interpretations",
                "url": _prop(reference, "modernUrl"),
                "base": 1,
            }
        )
    return chunks


def _goal_matches_chunk(goal: str, kind: str) -> bool:
    if goal == "advice":
        return kind in ("relationships", "work", "reflection", "orientation")
    if goal == "forecast":
        return kind in ("orientation", "waite", "modern")
    if goal == "explanation":
        return kind in ("symbolism", "orientation", "waite", "modern")
    if goal == "comparison":
        return kind in ("relationships", "work", "reflection", "modern")
    return False


def _theme_matches_kind(theme: str, kind: str) -> bool:
    if theme == "relationship":
        return kind == "relationships"
    if theme == "career":
        return kind == "work"
    if theme == "reflection":
        return kind in ("orientation", "reflection")
    if theme == "future":
        return kind in ("orientation", "waite")
    return False


def _term_list(terms: Any) -> list[str]:
    """`Map` keys, `Set` members or the array itself, in the original's order."""
    if isinstance(terms, dict):
        return list(terms)
    if isinstance(terms, list):
        return list(terms)
    return []


def _matching_signals(
    chunk: dict[str, Any], *, position: Any, terms: Any, themes: list[str], goals: Any = None, direct_terms: Any = None
) -> dict[str, Any]:
    goals = goals or []
    direct_terms = direct_terms if direct_terms is not None else {}
    text = chunk["text"].lower()
    term_list = _term_list(terms)
    matched_terms = [term for term in term_list if term in text][:8]
    matched_direct_terms = [term for term in matched_terms if term in direct_terms]
    matched_expanded_terms = [term for term in matched_terms if term not in direct_terms]
    matched_themes = [theme for theme in themes if _theme_matches_kind(theme, chunk["kind"])]
    matched_goals = [goal for goal in goals if _goal_matches_chunk(goal, chunk["kind"])]
    matched_position_kinds = _unique(
        [hint["kind"] for hint in _POSITION_HINTS if any(word in _string(position) for word in hint["words"])]
    )
    matched_position = chunk["kind"] in matched_position_kinds
    return {
        "matchedTerms": matched_terms,
        "matchedDirectTerms": matched_direct_terms,
        "matchedExpandedTerms": matched_expanded_terms,
        "matchedThemes": matched_themes,
        "matchedGoals": matched_goals,
        "matchedPosition": matched_position,
        "matchedPositionKinds": matched_position_kinds,
    }


def _score_chunk(
    chunk: dict[str, Any], *, position: Any, terms: Any, themes: list[str], goals: Any = None, corpus: Any = None, direct_terms: Any = None
) -> float:
    goals = goals or []
    corpus = corpus or []
    direct_terms = direct_terms if direct_terms is not None else {}
    score = chunk["base"]
    signals = _matching_signals(
        chunk, position=position, terms=terms, themes=themes, goals=goals, direct_terms=direct_terms
    )
    score += _bm25_score(chunk["text"], terms, corpus)
    for term in signals["matchedTerms"]:
        score += 1.4 if len(term) > 2 else 0.35
    for theme in signals["matchedThemes"]:
        score += 4 if theme == "reflection" else 3
    for goal in signals["matchedGoals"]:
        score += 1.6 if goal == "advice" else 1.2
    for hint in _POSITION_HINTS:
        if signals["matchedPosition"] and hint["kind"] == chunk["kind"]:
            score += hint["boost"]
    return score


def _evidence_tier(kind: str) -> str:
    if kind in ("symbolism", "orientation"):
        return "anchor"
    if kind in ("relationships", "work", "reflection"):
        return "application"
    return "reference"


def _retrieval_reasons(chunk: dict[str, Any], signals: dict[str, Any]) -> list[str]:
    reasons = []
    if chunk["kind"] in ("symbolism", "orientation"):
        reasons.append("required_anchor")
    if signals["matchedThemes"]:
        reasons.append("theme_match")
    if signals["matchedGoals"] and chunk["kind"] not in ("symbolism", "orientation"):
        reasons.append("goal_match")
    if signals["matchedPosition"]:
        reasons.append("position_match")
    if signals["matchedDirectTerms"]:
        reasons.append("keyword_match")
    if signals["matchedExpandedTerms"] and chunk["kind"] not in ("symbolism", "orientation"):
        reasons.append("expansion_match")
    if not reasons:
        reasons.append("fallback_context")
    return reasons


def _application_kinds_for_themes(themes: list[str], goals: Any = None) -> list[str]:
    goals = goals or []
    kinds = []
    for theme in themes:
        if theme == "relationship":
            kinds.append("relationships")
        if theme == "career":
            kinds.append("work")
        if theme == "reflection":
            kinds.append("reflection")
    # A choice or action-oriented question still needs an application layer. In
    # the absence of an explicit relationship, career, or reflection domain,
    # use the reflective guide as the safest context instead of inventing a
    # work/relationship interpretation from a temporal word such as “未来”.
    if not kinds and ("choice" in themes or any(goal in ("advice", "comparison") for goal in goals)):
        kinds.append("reflection")
    return _unique(kinds)


def _resolve_reading_evidence_budget(
    question: Any, cards: Any, max_total_evidence: Any, routing: Any = None
) -> int:
    if _is_finite_number(max_total_evidence):
        return math.floor(max_total_evidence)
    count = len(cards) if isinstance(cards, list) else 0
    resolved_routing = routing if routing is not None else analyze_reading_question(question)
    application_count = min(
        3,
        max(
            1,
            len(_application_kinds_for_themes(resolved_routing["themes"], resolved_routing["goals"])),
            1 if "forecast" in resolved_routing["goals"] else 0,
        ),
    )
    # Reserve two anchors plus one application/reference layer per card. Keep a
    # bounded floor for small spreads and a hard ceiling for prompt size.
    return min(96, max(48, count * (2 + application_count)))


def _semantic_lookup(scores: Any, evidence_id: str) -> Any:
    """`semanticScores instanceof Map ? semanticScores.get(id) : semanticScores?.[id]`."""
    if isinstance(scores, dict):
        return scores.get(evidence_id)
    return None


def rerank_reading_evidence(
    evidence: Any,
    *,
    semantic_scores: Any = None,
    max_total_evidence: Any = 48,
    semantic_weight: Any = 8,
    required_goal_evidence: Any = None,
    reserve_goal_evidence_per_card: bool = False,
) -> list[dict[str, Any]]:
    if not isinstance(evidence, list):
        return []
    semantic_scores = semantic_scores if semantic_scores is not None else {}
    required_goal_evidence = required_goal_evidence if isinstance(required_goal_evidence, list) else []

    def get_score(item: dict[str, Any]) -> Any:
        raw = _semantic_lookup(semantic_scores, item["evidenceId"])
        value = _to_number(raw)
        return _js_num(max(0, min(1, value))) if _is_finite_number(value) else 0

    weight = max(0, min(20, semantic_weight)) if _is_finite_number(semantic_weight) else 8
    ranked = []
    for item in evidence:
        semantic_score = get_score(item)
        lexical_score = _to_number(item["retrievalScore"])
        base_score = lexical_score if _is_finite_number(lexical_score) else 0
        score = _js_fixed3(base_score + semantic_score * weight)
        ranked.append(
            {
                **item,
                "retrievalScore": score,
                "retrievalSemanticScore": semantic_score,
                "retrievalMethod": (
                    f"{item['retrievalMethod']}+semantic-v1" if semantic_score > 0 else item["retrievalMethod"]
                ),
            }
        )
    required = [item for item in ranked if item["retrievalRequired"] is True]
    requested = math.floor(max_total_evidence) if _is_finite_number(max_total_evidence) else 48
    budget = max(len(required), min(96, max(1, requested)))
    reserved_ids = {item["evidenceId"] for item in required}
    position_reserved: list[dict[str, Any]] = []
    goal_reserved: list[dict[str, Any]] = []
    goal_list = _unique(required_goal_evidence)

    def by_rank(item: dict[str, Any]) -> tuple[float, str]:
        # `b.retrievalScore - a.retrievalScore || a.evidenceId.localeCompare(b.evidenceId)`
        return (-item["retrievalScore"], item["evidenceId"])

    def reserve_goal(goal: str, limit: int, card_id: Any = None) -> bool:
        if len(goal_reserved) >= limit:
            return False
        tier = _GOAL_REQUIRED_TIERS.get(goal)
        candidates = [
            item
            for item in ranked
            if item["evidenceId"] not in reserved_ids
            and item.get("tier") == tier
            and isinstance(item.get("retrievalGoals"), list)
            and goal in item["retrievalGoals"]
            and (card_id is None or item.get("cardId") == card_id)
        ]
        candidates.sort(key=by_rank)
        if not candidates:
            return False
        candidate = candidates[0]
        goal_reserved.append(candidate)
        reserved_ids.add(candidate["evidenceId"])
        return True

    def reserve_goals(limit: int, per_card: bool) -> None:
        if not limit or not goal_list:
            return
        card_ids = _unique([item.get("cardId") for item in ranked if item.get("cardId")])
        if per_card:
            # Give every card one chance before stacking multiple goal layers on the
            # first card. This keeps mixed-goal spreads readable when the budget only
            # leaves room for a subset of the per-card goal evidence.
            for round_index in range(len(card_ids)):
                if len(goal_reserved) >= limit:
                    break
                reserve_goal(goal_list[round_index % len(goal_list)], limit, card_ids[round_index])
            for round_index in range(len(card_ids)):
                if len(goal_reserved) >= limit:
                    break
                for goal in goal_list:
                    reserve_goal(goal, limit, card_ids[round_index])
        else:
            for goal in goal_list:
                reserve_goal(goal, limit)

    def reserve_positions(limit: int) -> None:
        position_card_ids = _unique(
            [
                item.get("cardId")
                for item in ranked
                if isinstance(item.get("retrievalReasons"), list)
                and "position_match" in item["retrievalReasons"]
            ]
        )
        for card_id in [value for value in position_card_ids if value]:
            candidates = [
                item
                for item in ranked
                if item["evidenceId"] not in reserved_ids
                and item.get("cardId") == card_id
                and isinstance(item.get("retrievalReasons"), list)
                and "position_match" in item["retrievalReasons"]
            ]
            candidates.sort(key=by_rank)
            if candidates and len(position_reserved) < limit:
                position_reserved.append(candidates[0])
                reserved_ids.add(candidates[0]["evidenceId"])

    if reserve_goal_evidence_per_card:
        reserve_positions(max(0, budget - len(required)))
        reserve_goals(max(0, budget - len(required) - len(position_reserved)), True)
    else:
        # An explicit budget is usually a deliberate tight prompt budget. Preserve
        # at least one routed goal layer before optional positional context so a
        # forecast/comparison answer still has the evidence tier it promises.
        reserve_goals(max(0, budget - len(required)), False)
        reserve_positions(max(0, budget - len(required) - len(goal_reserved)))
    optional = [item for item in ranked if item["evidenceId"] not in reserved_ids]
    optional.sort(key=by_rank)
    optional_budget = max(
        0, budget - len(required) - len(goal_reserved) - len(position_reserved)
    )
    remaining = list(optional)
    selected: list[dict[str, Any]] = []
    while len(selected) < optional_budget and remaining:
        represented = {
            item.get("cardId") if item.get("cardId") is not None else item["evidenceId"]
            for item in selected
        }
        fresh = [
            item
            for item in remaining
            if (item.get("cardId") if item.get("cardId") is not None else item["evidenceId"]) not in represented
        ]
        pool = fresh if fresh else remaining
        next_item = pool[0]
        selected.append(next_item)
        remaining.pop(next(index for index, item in enumerate(remaining) if item is next_item))
    return [*required, *position_reserved, *goal_reserved, *selected]


def _card_is_usable(card: Any) -> bool:
    position = _prop(card, "position")
    return (
        bool(CARD_BY_ID.get(_prop(card, "id")))
        and _is_boolean(_prop(card, "reversed"))
        and isinstance(position, str)
        and bool(position.strip())
    )


def collect_reading_evidence(
    *,
    question: Any = None,
    cards: Any = None,
    max_per_card: Any = 5,
    routing: Any = None,
    high_stakes: Any = None,
) -> list[dict[str, Any]]:
    if not isinstance(question, str) or not question.strip() or not isinstance(cards, list):
        return []
    resolved_routing = routing if routing is not None else analyze_reading_question(question)
    query_terms = _weighted_query_terms(question, resolved_routing)
    terms = query_terms["weights"]
    themes = resolved_routing["themes"]
    goals = resolved_routing["goals"]
    limit = max(3, min(7, max_per_card))
    resolved_high_stakes = (
        requires_professional_boundary(question) if high_stakes is None else bool(high_stakes)
    )
    has_supported_domain = any(
        theme in ("relationship", "career", "reflection") for theme in themes
    )
    explicit_application_kinds = (
        set(_application_kinds_for_themes(themes, [])) if has_supported_domain else set()
    )
    suppress_fallback_application = resolved_high_stakes and not explicit_application_kinds

    global_corpus: list[dict[str, Any]] = []
    for card in cards:
        if _card_is_usable(card):
            global_corpus.extend(_candidate_chunks(card, question))

    per_card: list[dict[str, Any]] = []
    for card in cards:
        canonical = CARD_BY_ID.get(_prop(card, "id"))
        if not _card_is_usable(card):
            continue
        raw_chunks = _candidate_chunks(card, question)
        chunks = []
        for index, chunk in enumerate(raw_chunks):
            signals = _matching_signals(
                chunk,
                position=card["position"],
                terms=terms,
                themes=themes,
                goals=goals,
                direct_terms=query_terms["direct"],
            )
            chunks.append(
                {
                    **chunk,
                    "score": _score_chunk(
                        chunk,
                        position=card["position"],
                        terms=terms,
                        themes=themes,
                        goals=goals,
                        corpus=global_corpus,
                        direct_terms=query_terms["direct"],
                    ),
                    "retrievalReasons": _retrieval_reasons(chunk, signals),
                    "matchedTerms": signals["matchedTerms"],
                    "matchedDirectTerms": signals["matchedDirectTerms"],
                    "matchedExpandedTerms": signals["matchedExpandedTerms"],
                    "matchedThemes": signals["matchedThemes"],
                    "matchedGoals": signals["matchedGoals"],
                    "matchedPositionKinds": signals["matchedPositionKinds"],
                    "index": index,
                }
            )
        sorted_chunks = list(chunks)
        sorted_chunks.sort(key=lambda item: (-item["score"], item["index"]))
        required = [chunk for chunk in chunks if chunk["kind"] in ("symbolism", "orientation")]
        # Mixed questions need one application chunk per explicit domain before
        # lower-priority reference chunks fill the remaining budget.
        application_kinds = _application_kinds_for_themes(themes, goals)
        # Keep application evidence inside the domains named by the question even
        # when more than one theme is active. Anchor and reference chunks remain
        # eligible, while unrelated application prose cannot crowd out the topic.
        # If a question has a named non-application theme (for example future),
        # leave the application layer empty instead of inventing a work/relationship
        # domain. An open question may use an application chunk only when the
        # position itself names a domain-specific role such as “自我状态” or
        # “关系挑战”; a generic “建议” position is not enough to invent a domain.
        allowed_applications = set() if suppress_fallback_application else set(application_kinds)
        # A forecast-only question has no application domain of its own, so a
        # spread position such as “建议” can safely contribute its application
        # context. Once advice/comparison already requested an application layer,
        # keep that explicit layer isolated instead of adding a second inferred
        # domain from the position label.
        position_kinds = {
            hint["kind"]
            for hint in _POSITION_HINTS
            if any(word in _string(card["position"]) for word in hint["words"])
        }
        allow_position_application = (
            not suppress_fallback_application
            and not has_supported_domain
            and not application_kinds
            and (
                "forecast" in goals
                or "relationships" in position_kinds
                or "reflection" in position_kinds
            )
        )
        candidates = [
            chunk
            for chunk in sorted_chunks
            if chunk["kind"] not in ("relationships", "work", "reflection")
            or chunk["kind"] in allowed_applications
            or (
                allow_position_application
                and isinstance(chunk.get("retrievalReasons"), list)
                and "position_match" in chunk["retrievalReasons"]
            )
        ]
        thematic = [
            next((chunk for chunk in candidates if chunk["kind"] == kind), None)
            for kind in application_kinds
        ]
        combined = [*required, *[chunk for chunk in thematic if chunk is not None], *candidates]
        chosen: list[dict[str, Any]] = []
        seen_kinds: set[str] = set()
        for chunk in combined:
            if chunk["kind"] in seen_kinds:
                continue
            seen_kinds.add(chunk["kind"])
            chosen.append(chunk)
        chosen = chosen[:limit]
        for chunk in chosen:
            per_card.append(
                {
                    "evidenceId": f"{card['id']}:{chunk['kind']}",
                    "cardId": card["id"],
                    "cardName": canonical["name"],
                    "position": card["position"],
                    "orientation": "逆位" if card["reversed"] else "正位",
                    "kind": chunk["kind"],
                    "tier": _evidence_tier(chunk["kind"]),
                    "retrievalReasons": chunk["retrievalReasons"],
                    "retrievalTerms": chunk["matchedTerms"],
                    "retrievalDirectTerms": chunk["matchedDirectTerms"],
                    "retrievalExpandedTerms": chunk["matchedExpandedTerms"],
                    "retrievalThemes": chunk["matchedThemes"],
                    "retrievalPositionKinds": chunk["matchedPositionKinds"],
                    "retrievalGoals": chunk["matchedGoals"],
                    "retrievalMethod": "bm25+rules+expansion-v2",
                    "retrievalScore": _js_fixed3(chunk["score"]),
                    "retrievalRequired": chunk["kind"] in ("symbolism", "orientation"),
                    "text": chunk["text"],
                    "source": chunk["source"],
                    "sourceType": evidence_source_type(chunk["source"]),
                    "sourceAuthority": evidence_source_authority(chunk["source"]),
                    "sourceLabel": chunk["sourceLabel"],
                    "url": chunk.get("url"),
                }
            )
    return per_card


def retrieve_reading_evidence(
    *,
    question: Any = None,
    cards: Any = None,
    max_per_card: Any = 5,
    max_total_evidence: Any = None,
    semantic_scores: Any = None,
    semantic_weight: Any = 8,
    routing: Any = None,
    high_stakes: Any = None,
) -> list[dict[str, Any]]:
    resolved_routing = routing if routing is not None else analyze_reading_question(question)
    evidence = collect_reading_evidence(
        question=question,
        cards=cards,
        max_per_card=max_per_card,
        routing=resolved_routing,
        high_stakes=high_stakes,
    )
    return rerank_reading_evidence(
        evidence,
        semantic_scores=semantic_scores if semantic_scores is not None else {},
        max_total_evidence=_resolve_reading_evidence_budget(
            question, cards, max_total_evidence, resolved_routing
        ),
        semantic_weight=semantic_weight,
        required_goal_evidence=resolved_routing["goals"],
        reserve_goal_evidence_per_card=max_total_evidence is None,
    )


async def retrieve_reading_evidence_async(
    *,
    question: Any = None,
    cards: Any = None,
    max_per_card: Any = 5,
    max_total_evidence: Any = None,
    semantic_scores: Any = None,
    semantic_weight: Any = 8,
    semantic_reranker: Any = None,
    semantic_timeout_ms: Any = 1_500,
    routing: Any = None,
    high_stakes: Any = None,
) -> list[dict[str, Any]]:
    resolved_routing = routing if routing is not None else analyze_reading_question(question)
    evidence = collect_reading_evidence(
        question=question,
        cards=cards,
        max_per_card=max_per_card,
        routing=resolved_routing,
        high_stakes=high_stakes,
    )
    resolved_scores = semantic_scores
    if callable(semantic_reranker):
        timeout = (
            max(0, min(10_000, semantic_timeout_ms))
            if _is_finite_number(semantic_timeout_ms)
            else 1_500
        )

        async def run_reranker() -> Any:
            try:
                return await semantic_reranker(
                    {"question": question, "cards": cards, "evidence": list(evidence)}
                )
            except Exception:
                # `.catch(()=>null)`: a failing reranker falls back to lexical scores.
                return None

        try:
            result = await asyncio.wait_for(run_reranker(), timeout / 1000)
        except asyncio.TimeoutError:
            result = None
        if isinstance(result, (dict, list)):
            resolved_scores = result
    return rerank_reading_evidence(
        evidence,
        semantic_scores=resolved_scores if resolved_scores is not None else {},
        max_total_evidence=_resolve_reading_evidence_budget(
            question, cards, max_total_evidence, resolved_routing
        ),
        semantic_weight=semantic_weight,
        required_goal_evidence=resolved_routing["goals"],
        reserve_goal_evidence_per_card=max_total_evidence is None,
    )


# ---------------------------------------------------------------------------
# Personal memory retrieval
# ---------------------------------------------------------------------------

# Conservative aliases improve recall for a private memory without turning
# every broad topic word into a match. A group expands only after the query
# contains one of its concrete terms; the expanded term remains lower-weight
# than the user's exact wording.
_MEMORY_ALIAS_GROUPS = [
    ["沟通", "交流", "聊天", "对话"],
    ["独处", "一个人", "静下来", "安静"],
    ["焦虑", "压力", "不安", "内耗"],
    ["学习", "复习", "备考", "考试"],
    ["工作", "职场", "职业", "事业"],
    ["决定", "选择", "取舍", "路径"],
]


def _expand_memory_query_terms(question: Any) -> dict[str, Any]:
    direct = _chinese_ngrams(question)
    expanded = dict(direct)
    for group in _MEMORY_ALIAS_GROUPS:
        if any(term in direct for term in group):
            for term in group:
                expanded[term] = None
    return {"direct": direct, "expanded": expanded}


def retrieve_memory_evidence(
    *,
    question: Any = None,
    memories: Any = None,
    max_items: Any = 6,
    max_total_chars: Any = 6_000,
) -> list[dict[str, Any]]:
    # `max_items` is the original's `max` option; renamed so it cannot shadow the builtin.
    if not isinstance(question, str) or not question.strip() or not isinstance(memories, list):
        return []
    query = _expand_memory_query_terms(question)
    direct = query["direct"]
    expanded = query["expanded"]
    max_number = _to_number(max_items)
    limit = max(1, min(10, max_number if _is_finite_number(max_number) else 6))
    budget_number = _to_number(max_total_chars)
    budget = max(1, min(12_000, budget_number if _is_finite_number(budget_number) else 6_000))
    generic_terms = {
        "如何", "怎么", "可以", "需要", "安排", "自己", "事情", "问题", "现在", "最近", "之后", "今天", "明天", "什么",
        "哪个", "是否", "还是", "一个", "进行",
    }
    noisy_term_pattern = re.compile(
        "^(?:我|你|他|她|它|我们|你们|他们|这|那|在|有|会|很|想|要|能|不|没|还|已|将|都|也|就|才|先|再|把|被|和|与|或"
        "|但|因为|所以|如果|最近|现在|之后|今天|明天|一个|一些|事情|问题|安排|自己|如何|怎么|是否|还是).{1,3}\\Z"
    )

    def is_informative_term(term: str) -> bool:
        return term not in generic_terms and noisy_term_pattern.search(term) is None

    ranked = []
    for index, memory in enumerate(
        [
            memory
            for memory in memories
            if memory
            and _prop(memory, "enabled") is True
            and isinstance(_prop(memory, "id"), str)
            and len(memory["id"]) <= 120
            and isinstance(_prop(memory, "text"), str)
            and memory["text"].strip()
        ]
    ):
        raw_text = memory["text"].strip()
        text = raw_text[:2_000]
        lower = text.lower()
        matched_direct_terms = [term for term in direct if term in lower]
        matched_expanded_terms = [term for term in expanded if term not in direct and term in lower]
        matched_terms = _unique([*matched_direct_terms, *matched_expanded_terms])
        score = 0
        for term in matched_direct_terms:
            score += 1.4 if len(term) > 2 else 0.35
        for term in matched_expanded_terms:
            score += 0.75 if len(term) > 2 else 0.2
        informative_terms = [term for term in matched_terms if is_informative_term(term)]
        strong_terms = [term for term in informative_terms if len(term) > 2]
        short_terms = [term for term in informative_terms if len(term) == 2]
        ranked.append(
            {
                "memory": memory,
                "index": index,
                "text": text,
                "textLength": len(raw_text),
                "score": score,
                "matchedTerms": matched_terms,
                "strongTerms": strong_terms,
                "shortTerms": short_terms,
                "matchedDirectTerms": matched_direct_terms,
                "matchedExpandedTerms": matched_expanded_terms,
            }
        )
    # A single generic two-character overlap is too weak to expose a private
    # record. Require one longer phrase or several independent short matches.
    ranked = [
        item
        for item in ranked
        if item["strongTerms"]
        or len(item["shortTerms"]) >= 2
        or any(term not in generic_terms for term in item["shortTerms"])
    ]
    ranked.sort(key=lambda item: (-item["score"], item["index"]))
    selected = []
    selected_chars = 0
    for item in ranked:
        if len(selected) >= limit or selected_chars >= budget:
            break
        remaining = budget - selected_chars
        bounded_text = item["text"][:remaining]
        if not bounded_text.strip():
            continue
        selected.append(
            {**item, "text": bounded_text, "memoryExcerpted": len(bounded_text) < item["textLength"]}
        )
        selected_chars += len(bounded_text)
    return [
        {
            "evidenceId": f"memory:{item['memory']['id']}",
            "cardId": None,
            "cardName": None,
            "position": None,
            "orientation": None,
            "kind": "memory",
            "tier": "personal",
            "retrievalReasons": [
                "memory_keyword_expansion" if item["matchedExpandedTerms"] else "memory_keyword_match"
            ],
            "retrievalTerms": item["matchedTerms"][:8],
            "retrievalMethod": MEMORY_RETRIEVAL_VERSION,
            "retrievalScore": _js_fixed3(item["score"]),
            "text": item["text"],
            "source": "memory",
            "sourceType": evidence_source_type("memory"),
            "sourceAuthority": evidence_source_authority("memory"),
            "sourceLabel": "你确认的知识库",
            "memoryStatus": "user_confirmed",
            "memoryUse": "context_only",
            "memoryExcerpted": item["memoryExcerpted"],
            "url": None,
        }
        for item in selected
    ]


# ---------------------------------------------------------------------------
# Evidence summary
# ---------------------------------------------------------------------------


def _counts_by(values: list[Any]) -> dict[Any, int]:
    return {value: values.count(value) for value in _unique(values)}


def summarize_reading_evidence(
    evidence: Any, cards: Any = None, *, themes: Any = None, goals: Any = None
) -> dict[str, Any]:
    items = evidence if isinstance(evidence, list) else []
    card_list = cards if isinstance(cards, list) else []
    expected = [
        card_id for card_id in _unique([_prop(card, "id") for card in card_list]) if card_id
    ]
    expected_application_kinds = _application_kinds_for_themes(
        themes if isinstance(themes, list) else [], goals if isinstance(goals, list) else []
    )
    routed_goals = _unique(
        [
            goal
            for goal in (goals if isinstance(goals, list) else [])
            if goal in ("advice", "forecast", "explanation", "comparison")
        ]
    )

    def summarize_goal(goal: str, source_items: list[Any]) -> dict[str, Any]:
        matched = [
            item
            for item in source_items
            if isinstance(_prop(item, "retrievalGoals"), list) and goal in item["retrievalGoals"]
        ]
        application_count = sum(1 for item in matched if item.get("tier") == "application")
        reference_count = sum(1 for item in matched if item.get("tier") == "reference")
        anchor_count = sum(1 for item in matched if item.get("tier") == "anchor")
        ok = (
            application_count > 0
            if goal in ("advice", "comparison")
            else reference_count > 0
            if goal == "forecast"
            else anchor_count > 0
        )
        return {
            "matchedCount": len(matched),
            "applicationCount": application_count,
            "referenceCount": reference_count,
            "anchorCount": anchor_count,
            "ok": ok,
        }

    selected_card_ids = [item for item in _unique([_prop(item, "cardId") for item in items]) if item]
    per_card: dict[Any, Any] = {}
    for card_id in expected:
        card_items = [item for item in items if _prop(item, "cardId") == card_id]
        kinds = {item["kind"] for item in card_items if isinstance(item, dict) and "kind" in item}
        per_card[card_id] = {
            "total": len(card_items),
            "anchorCount": sum(1 for item in card_items if item.get("tier") == "anchor"),
            "applicationKinds": sorted(
                _unique([item.get("kind") for item in card_items if item.get("tier") == "application"])
            ),
            "hasSymbolism": "symbolism" in kinds,
            "hasOrientation": "orientation" in kinds,
        }
    missing_anchor_card_ids = [
        card_id
        for card_id in expected
        if not per_card[card_id]["hasSymbolism"] or not per_card[card_id]["hasOrientation"]
    ]
    missing_application_kinds_by_card = {
        card_id: [
            kind
            for kind in expected_application_kinds
            if not any(_prop(item, "cardId") == card_id and _prop(item, "kind") == kind for item in items)
        ]
        for card_id in expected
    }
    missing_application_card_ids = [
        card_id for card_id in expected if missing_application_kinds_by_card[card_id]
    ]
    goal_coverage = {goal: summarize_goal(goal, items) for goal in routed_goals}
    goal_coverage_by_card = {
        card_id: {
            goal: summarize_goal(goal, [item for item in items if _prop(item, "cardId") == card_id])
            for goal in routed_goals
        }
        for card_id in expected
    }
    missing_goal_coverage_by_card = {
        card_id: missing
        for card_id, missing in (
            (
                card_id,
                [
                    goal
                    for goal in routed_goals
                    if goal_coverage_by_card[card_id].get(goal)
                    and not goal_coverage_by_card[card_id][goal]["ok"]
                ],
            )
            for card_id in expected
        )
        if missing
    }
    missing_goal_coverage = [
        goal for goal in routed_goals if goal_coverage.get(goal) and not goal_coverage[goal]["ok"]
    ]
    coverage_boundary_goals = _unique(
        [
            *missing_goal_coverage,
            *[goal for missing in missing_goal_coverage_by_card.values() for goal in missing],
        ]
    )
    return {
        "total": len(items),
        "requiredCount": sum(1 for item in items if _prop(item, "retrievalRequired") is True),
        "optionalCount": sum(1 for item in items if _prop(item, "retrievalRequired") is not True),
        "selectedCardIds": selected_card_ids,
        "expectedCardIds": expected,
        "missingAnchorCardIds": missing_anchor_card_ids,
        "expectedApplicationKinds": expected_application_kinds,
        "missingApplicationKindsByCard": missing_application_kinds_by_card,
        "missingApplicationCardIds": missing_application_card_ids,
        "goalCoverage": goal_coverage,
        "goalCoverageByCard": goal_coverage_by_card,
        "missingGoalCoverage": missing_goal_coverage,
        "missingGoalCoverageByCard": missing_goal_coverage_by_card,
        "coverageBoundaryGoals": coverage_boundary_goals,
        "coverageStatus": "incomplete"
        if missing_anchor_card_ids
        else "anchor_only"
        if missing_application_card_ids
        else "complete",
        "tiers": _counts_by([_prop(item, "tier") for item in items if _prop(item, "tier")]),
        "kinds": _counts_by([_prop(item, "kind") for item in items if _prop(item, "kind")]),
        "semanticCount": sum(
            1 for item in items if _to_number(_prop(item, "retrievalSemanticScore")) > 0
        ),
        "perCard": per_card,
    }


# ---------------------------------------------------------------------------
# Output contract
# ---------------------------------------------------------------------------

# Frozen in the original. This is the shared contract between the routed goal, the
# evidence tier a goal requires, and the validation gates below.
GOAL_REFERENCE_TIERS = MappingProxyType({
    "advice": "application",
    "comparison": "application",
    "forecast": "reference",
    "explanation": "anchor",
})
_READING_GOALS = set(GOAL_REFERENCE_TIERS)


def _has_goal_reference(
    goal: str, refs: list[Any], goal_sections: list[Any], evidence_by_id: dict[str, Any]
) -> bool:
    tier = GOAL_REFERENCE_TIERS[goal]
    evidence_ids = [
        *[reference["evidenceId"] for reference in refs],
        *[
            evidence_id
            for section in goal_sections
            if section["goal"] == goal
            for evidence_id in section["evidenceIds"]
        ],
    ]
    for evidence_id in evidence_ids:
        evidence = evidence_by_id.get(evidence_id)
        if (
            evidence is not None
            and evidence.get("tier") == tier
            and isinstance(evidence.get("retrievalGoals"), list)
            and goal in evidence["retrievalGoals"]
        ):
            return True
    return False


_CLAIM_STOPWORDS = {
    "牌面", "牌义", "牌位", "线索", "证据", "说明", "相关", "内容", "信息", "支持", "本次", "判断", "分析",
}
_CLAIM_GENERIC_TERMS = [
    "行动", "观察", "方式", "结果", "现实", "条件", "方向", "事情", "问题", "当前", "具体", "可能", "需要", "提供",
    "一种", "一个", "对方", "关系", "感情", "工作", "事业", "状态", "未来", "现在", "复合", "联系", "回来", "喜欢",
    "感觉", "持续", "伤害", "持续伤害",
]
_CLAIM_GENERIC_TERM_LIST = list(_CLAIM_GENERIC_TERMS)
_CLAIM_GENERIC_TERMS_SET = set(_CLAIM_GENERIC_TERMS)


def _is_generic_claim_term(term: str) -> bool:
    return term in _CLAIM_GENERIC_TERMS_SET or any(
        len(generic) > len(term) and term in generic for generic in _CLAIM_GENERIC_TERM_LIST
    )


def _question_relevance_theme_terms(question: Any) -> list[dict[str, Any]]:
    text = _string(question).strip().lower()
    active_themes = set(analyze_reading_question(text)["themes"])
    return [
        {
            "theme": theme["name"],
            "terms": _unique([term for term in (theme.get("words") or []) if len(term) >= 2]),
        }
        for theme in _THEMES
        if theme["name"] in ("relationship", "career", "reflection") and theme["name"] in active_themes
    ]


def _question_relevance_terms(question: Any) -> list[str]:
    return sorted(
        _unique([term for item in _question_relevance_theme_terms(question) for term in item["terms"]]),
        key=lambda term: (-len(term), term),
    )


def _question_text_supports(text: Any, question: Any) -> bool:
    value = _string(text).lower()
    themes = _question_relevance_theme_terms(question)
    terms = _question_relevance_terms(question)
    return not terms or all(any(term in value for term in item["terms"]) for item in themes)


_GOAL_OUTPUT_CUES = MappingProxyType({
    "advice": ["建议", "下一步", "行动", "安排", "调整", "记录", "练习", "拆成", "落实", "尝试", "沟通", "注意", "保持",
               "做法", "步骤", "面对", "说出", "复盘", "规划", "准备", "处理"],
    "forecast": ["可能", "趋势", "倾向", "发展", "未来", "近期", "观察", "核验", "结果", "走向", "变化", "不确定"],
    "explanation": ["因为", "原因", "线索", "说明", "显示", "反映", "核心", "解释", "理解", "阻碍", "提示", "代表",
                    "意味着", "为何"],
    "comparison": ["比较", "条件", "代价", "取舍", "差异", "适合", "选择", "一方", "另一方", "利弊", "优缺点", "权衡"],
})
_FORECAST_TREND_CUES = ["可能", "趋势", "倾向", "发展", "未来", "近期", "结果", "走向", "变化"]
_FORECAST_REALITY_CUES = ["观察", "核验", "现实", "事实", "反馈", "证据", "不确定", "不能确认", "需要验证"]
_COMPARISON_SIDE_CUES = ["比较", "选择", "选项", "方案", "一方", "另一方", "还是", "两个", "哪个", "哪一个", "哪种", "是否"]
_COMPARISON_TRADEOFF_CUES = ["条件", "代价", "取舍", "差异", "适合", "利弊", "优点", "缺点", "权衡", "成本", "风险", "机会"]


def _goal_output_supports(text: Any, goal: str, uncertainty: Any = "") -> bool:
    value = _string(text).lower()
    boundary = _string(uncertainty).lower()
    cues = _GOAL_OUTPUT_CUES.get(goal) or []
    if goal == "forecast":
        return any(cue in value for cue in _FORECAST_TREND_CUES) and (
            any(cue in value for cue in _FORECAST_REALITY_CUES)
            or any(cue in boundary for cue in _FORECAST_REALITY_CUES)
        )
    if goal == "comparison":
        return any(cue in value for cue in _COMPARISON_SIDE_CUES) and any(
            cue in value for cue in _COMPARISON_TRADEOFF_CUES
        )
    return not cues or any(cue in value for cue in cues)


def _output_goals_support(
    text: Any, goal_sections: Any, goals: Any, *, uncertainty: Any = ""
) -> bool:
    routed = _unique(
        [
            goal
            for goal in (goals if isinstance(goals, list) else [])
            if goal in _GOAL_OUTPUT_CUES
        ]
    )
    for goal in routed:
        section = (
            next((item for item in goal_sections if _prop(item, "goal") == goal), None)
            if isinstance(goal_sections, list)
            else None
        )
        section_text = _prop(section, "text")
        if section_text is None:
            section_text = text
        if not _goal_output_supports(section_text, goal, uncertainty):
            return False
    return True


_CLAIM_SPLIT_PATTERN = re.compile(
    "(?:[。！？!?；;，,、\\n]+|然而|但是|不过|同时|并且|而且|只是|然后|随后|因此|所以|以及|因为|并|而|且|还|也|但|却)"
)


def _claim_supported_by_evidence(
    claim: Any, evidence: Any, *, allow_generic: bool = False, require_sentence_support: bool = False
) -> bool:
    evidence_text = _prop(evidence, "text")
    evidence_terms = _chinese_ngrams("" if evidence_text is None else evidence_text)
    # A supported sentence must not smuggle an unsupported clause after
    # punctuation, enumeration commas, or an explicit contrast/joiner.
    sentences = [
        sentence
        for sentence in (item.strip() for item in _CLAIM_SPLIT_PATTERN.split(_string(claim)))
        if sentence
    ]
    if not sentences:
        return False
    meaningful = False
    for sentence in sentences:
        claim_terms = [
            term
            for term in _chinese_ngrams(sentence)
            if len(term) >= 2 and term not in _CLAIM_STOPWORDS
        ]
        specific_terms = (
            claim_terms if allow_generic else [term for term in claim_terms if not _is_generic_claim_term(term)]
        )
        if not specific_terms:
            continue
        meaningful = True
        supported = any(term in evidence_terms for term in specific_terms)
        if require_sentence_support and not supported:
            return False
        if not require_sentence_support and supported:
            return True
    return meaningful if require_sentence_support else False


_CLARIFICATION_CUE_PATTERN = re.compile("[哪什么如何怎么是否还是谁何时什么时候哪里多少为何为什么更想想看先看]")


def _is_concrete_clarification(text: Any) -> bool:
    value = _string(text).strip()
    if len(value) < 4:
        return False
    marks = len(re.findall(r"[？?]", value))
    if marks > 1:
        return False
    return marks == 1 or _CLARIFICATION_CUE_PATTERN.search(value) is not None


_GENERIC_FOLLOW_UP_PATTERN = re.compile(
    "还有(?:什么|其他|别的)(?:想问|问题)|还想问什么|需要我(?:继续|再)解读|有什么想问"
)


def _is_focused_follow_up(text: Any) -> bool:
    value = _string(text).strip()
    if len(value) < 4 or _GENERIC_FOLLOW_UP_PATTERN.search(value):
        return False
    marks = len(re.findall(r"[？?]", value))
    if marks != 1:
        return False
    return _FOCUSED_FOLLOW_UP_CUE_PATTERN.search(value) is not None


_FOCUSED_FOLLOW_UP_CUE_PATTERN = re.compile(
    "[哪什么如何怎么是否还是谁何时什么时候哪里多少为何为什么哪个哪种哪一步哪一部分]"
)

_ACTION_VERB_PATTERN = re.compile(
    "记录|列出|写下|核实|查阅|联系|沟通|安排|设定|拆分|练习|观察|复盘|比较|暂停|预约|整理|确认|测试|制定|检查|收集"
    "|测量|追踪|完成|行动|执行|买入|咨询|询问|阅读"
)
# JavaScript's `\d` is ASCII-only, so `[0-9]` is used instead of Python's Unicode `\d`.
_ACTION_MARKER_PATTERN = re.compile(
    "今天|明天|本周|这周|一周|七天|三天|一天|分钟|小时|一次|两次|第[0-9]+次|一项|一条|一个|每周|截止|结果|是否|回复"
    "|回应|复盘|完成|记录|写下|列出|确认"
)


def _is_concrete_action(text: Any) -> bool:
    value = _string(text).strip()
    return (
        len(value) >= 6
        and _ACTION_VERB_PATTERN.search(value) is not None
        and _ACTION_MARKER_PATTERN.search(value) is not None
    )


_REALITY_BOUNDARY_PATTERN = re.compile("现实|核实|资料|专业|医生|律师|持牌|风险|证据|咨询|法规|评估|审查|验证|确认")


def _has_reality_boundary(text: Any) -> bool:
    value = _string(text).strip()
    return len(value) >= 8 and _REALITY_BOUNDARY_PATTERN.search(value) is not None


_HIGH_STAKES_DECISION_ACTION_PATTERN = re.compile(
    "买入|卖出|下单|签约|签署|签合同|合同|买房|购房|起诉|上诉|仲裁|离婚|抚养|监护|停药|加药|减药|自行用药|服药|手术"
    "|转账|借贷|贷款|房贷|提交诉讼|直接投资|投资|理财|保险"
)


def _has_professional_action_boundary(text: Any) -> bool:
    value = _string(text).strip()
    return (
        _HIGH_STAKES_DECISION_ACTION_PATTERN.search(value) is None or _has_reality_boundary(value)
    )


_PERSPECTIVE_BOUNDARY_PATTERN = re.compile(
    "不能确认|无法知道|无法验证|不能读取|牌面不能判断|需要通过沟通|现实互动|直接询问|行为反馈|观察行动|不能代替沟通"
    "|只能作为反思"
)


def _has_perspective_boundary(text: Any) -> bool:
    value = _string(text).strip()
    return len(value) >= 12 and _PERSPECTIVE_BOUNDARY_PATTERN.search(value) is not None


_COVERAGE_BOUNDARY_PATTERN = re.compile("证据|资料|信息|应用|覆盖|不足|有限|缺少|仅有核心|只能依据核心")
_COVERAGE_GOAL_BOUNDARY_PATTERNS = MappingProxyType({
    "advice": re.compile("建议|行动|应用|下一步|可观察"),
    "forecast": re.compile("预测|趋势|参考资料"),
    "explanation": re.compile("解释|原因|线索|核心牌义"),
    "comparison": re.compile("比较|选项|取舍|条件|代价"),
})


def _has_coverage_boundary(text: Any, *, goals: Any = None) -> bool:
    value = _string(text).strip()
    if len(value) < 8 or _COVERAGE_BOUNDARY_PATTERN.search(value) is None:
        return False
    required = _unique(
        [
            goal
            for goal in (goals if isinstance(goals, list) else [])
            if _COVERAGE_GOAL_BOUNDARY_PATTERNS.get(goal)
        ]
    )
    return all(_COVERAGE_GOAL_BOUNDARY_PATTERNS[goal].search(value) for goal in required)


_ABSOLUTE_CLAIM_PATTERN = re.compile(
    "(?:百分之百|绝对|必然|肯定|一定|注定|保证)(?:.{0,4})"
    "(?:会|能|可以|不会|不能|复合|回来|联系|发生|实现|结婚|录取|升职|盈利|获利|解决|治愈|痊愈|安全|准确)"
)
_NEGATED_ABSOLUTE_PATTERN = re.compile(
    "(?:不能|无法|不会|不代表|并不|不是|不保证|不意味着|不说明|不要|别|不应|不等于).{0,8}\\Z"
)
_DETERMINISTIC_TIMING_PATTERN = re.compile(
    "(?:今天|明天|后天|三天后|几天后|数天后|一周后|几周后|几个月后|下周|下个月|本周|本周内|本月|月底|今年|明年"
    "|未来[0-9]{1,3}天|未来一周|未来一个月|[0-9]{1,3}天后|[0-9]{1,3}天内|[0-9]{1,2}周后|[0-9]{1,2}个月后|[0-9]{1,2}月"
    "|[0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日|[0-9]{1,2}月[0-9]{1,2}日).{0,16}"
    "(?:会|将|一定|必然|肯定|发生|出现|联系|复合|回来|录取|升职|成功|结婚|分手|找到|通过)"
)
_NEGATED_TIMING_PATTERN = re.compile(
    "(?:不能确认|无法确认|不确定|不能保证|不保证|不一定|未必|可能不会|也许不会|或许不会|不代表|不意味着)"
)
_SEGMENT_SPLIT_PATTERN = re.compile("[。！？!?；;\\n]+")


def _has_absolute_claim(text: Any) -> bool:
    for segment in _SEGMENT_SPLIT_PATTERN.split(_string(text)):
        match = _ABSOLUTE_CLAIM_PATTERN.search(segment)
        if not match:
            continue
        if _NEGATED_ABSOLUTE_PATTERN.search(segment[:match.start()]) is None:
            return True
    return False


def _has_deterministic_timing_claim(text: Any) -> bool:
    for segment in _SEGMENT_SPLIT_PATTERN.split(_string(text)):
        if _NEGATED_TIMING_PATTERN.search(segment):
            continue
        if _DETERMINISTIC_TIMING_PATTERN.search(segment):
            return True
    return False


_OPEN_GOAL_PREDICTION_PATTERN = re.compile(
    "(?:会|将|能|可以|可能|有可能|有机会|有望)\\s*"
    "(?:复合|回来|联系|发生|实现|结婚|分手|录取|升职|成功|找到|通过|有结果|改变|发展|在一起|继续|稳定)"
    "|(?:有戏|有希望|有结果|有机会|有可能|在一起|确定关系|关系发展)"
    "|(?:未来|结果|趋势|走向|前景).{0,10}(?:会|将|一定|必然|如何|怎样|什么)"
    "|(?:对方|他|她).{0,8}(?:喜欢|在乎|爱我|想我|有感觉|有好感|想联系|想继续)"
)
_NEGATED_OPEN_GOAL_PATTERN = re.compile(
    "(?:不能|无法|不代表|不确定|不保证|不意味着|可能不会|未必|不要|避免|不可|只能|仅能)"
)


def _has_open_goal_prediction(text: Any) -> bool:
    return any(
        _OPEN_GOAL_PREDICTION_PATTERN.search(segment)
        and not _NEGATED_OPEN_GOAL_PATTERN.search(segment)
        for segment in _SEGMENT_SPLIT_PATTERN.split(_string(text))
    )


def _valid_reference(
    item: Any, evidence_by_id: dict[str, Any], cards_by_id: dict[str, Any]
) -> dict[str, Any]:
    if not item or not isinstance(item, dict) or not isinstance(item.get("evidenceId"), str):
        raise ValueError("引用证据无效。")
    evidence = evidence_by_id.get(item["evidenceId"])
    if evidence is None:
        raise ValueError("引用证据无效。")
    if evidence.get("source") == "memory":
        # `!== null` is true for both `undefined` (a missing key) and any non-null value.
        if item.get("cardId") is not None or "cardId" not in item:
            raise ValueError("引用证据无效。")
        if item.get("position") is not None or "position" not in item:
            raise ValueError("引用证据无效。")
    else:
        card = cards_by_id.get(item.get("cardId"))
        if (
            card is None
            or evidence.get("cardId") != item.get("cardId")
            or evidence.get("position") != item.get("position")
        ):
            raise ValueError("引用证据无效。")
    return {
        "evidenceId": evidence["evidenceId"],
        "cardId": evidence.get("cardId"),
        "position": evidence.get("position"),
        "claim": _excerpt(item["claim"], 240) if isinstance(item.get("claim"), str) else "",
        "evidenceExcerpt": _excerpt(evidence.get("text"), 360),
        "kind": evidence.get("kind"),
        "tier": evidence.get("tier"),
        "source": evidence.get("source"),
        "sourceType": evidence.get("sourceType") or evidence_source_type(evidence.get("source")),
        "sourceAuthority": evidence.get("sourceAuthority")
        or evidence_source_authority(evidence.get("source")),
        "sourceLabel": evidence.get("sourceLabel"),
        "memoryStatus": evidence.get("memoryStatus") if evidence.get("memoryStatus") is not None else None,
        "memoryUse": evidence.get("memoryUse") if evidence.get("memoryUse") is not None else None,
        "memoryExcerpted": evidence.get("memoryExcerpted") is True,
        "url": evidence.get("url") if isinstance(evidence.get("url"), str) else None,
        "retrievalReasons": evidence.get("retrievalReasons")
        if evidence.get("retrievalReasons") is not None
        else [],
    }


def _evidence_details(
    evidence_ids: list[str], evidence_by_id: dict[str, Any], max_excerpt: int = 220
) -> list[dict[str, Any]]:
    details = []
    for evidence_id in evidence_ids:
        chunk = evidence_by_id.get(evidence_id)
        details.append(
            {
                "evidenceId": evidence_id,
                "kind": chunk.get("kind"),
                "tier": chunk.get("tier"),
                "sourceType": chunk.get("sourceType") or evidence_source_type(chunk.get("source")),
                "sourceAuthority": chunk.get("sourceAuthority")
                or evidence_source_authority(chunk.get("source")),
                "sourceLabel": chunk.get("sourceLabel"),
                "memoryStatus": chunk.get("memoryStatus") if chunk.get("memoryStatus") is not None else None,
                "memoryUse": chunk.get("memoryUse") if chunk.get("memoryUse") is not None else None,
                "memoryExcerpted": chunk.get("memoryExcerpted") is True,
                "evidenceExcerpt": _excerpt(chunk.get("text"), max_excerpt),
            }
        )
    return details


def _non_personal_evidence_ids(evidence_ids: list[str], evidence_by_id: dict[str, Any]) -> list[str]:
    return [
        evidence_id
        for evidence_id in evidence_ids
        if _prop(evidence_by_id.get(evidence_id), "source") != "memory"
    ]


def _reference_evidence_text(evidence_ids: list[str], evidence_by_id: dict[str, Any], separator: str) -> str:
    return separator.join(
        _string(_prop(evidence_by_id.get(evidence_id), "text")) for evidence_id in evidence_ids
    )


def parse_reading_output(content: Any, options: Any = None) -> dict[str, Any]:
    options = options if isinstance(options, dict) else {}
    cards = _as_list(options.get("cards"))
    evidence = _as_list(options.get("evidence"))
    required_goal_evidence = _as_list(options.get("requiredGoalEvidence"))
    required_action_goal_evidence = _as_list(options.get("requiredActionGoalEvidence"))
    required_output_goals = _as_list(options.get("requiredOutputGoals"))
    allowed_goal_sections = _as_list(options.get("allowedGoalSections"))
    required_goal_sections = _as_list(options.get("requiredGoalSections"))
    require_goal_sections = options.get("requireGoalSections")
    require_goal_text_coverage = options.get("requireGoalTextCoverage")
    require_goal_reference_coverage = options.get("requireGoalReferenceCoverage")
    require_goal_alignment = options.get("requireGoalAlignment")
    require_follow_up_question = options.get("requireFollowUpQuestion")
    require_coverage = options.get("requireCoverage")
    require_actions = options.get("requireActions")
    require_references = options.get("requireReferences")
    require_reference_claims = options.get("requireReferenceClaims")
    require_reference_support = options.get("requireReferenceSupport")
    require_card_reading_support = options.get("requireCardReadingSupport")
    require_concrete_actions = options.get("requireConcreteActions")
    require_action_reasons = options.get("requireActionReasons")
    require_action_reason_support = options.get("requireActionReasonSupport")
    require_action_text_support = options.get("requireActionTextSupport")
    require_text_support = options.get("requireTextSupport")
    require_synthesis = options.get("requireSynthesis")
    require_synthesis_support = options.get("requireSynthesisSupport")
    require_synthesis_card_support = options.get("requireSynthesisCardSupport")
    require_synthesis_anchors = options.get("requireSynthesisAnchors")
    require_uncertainty = options.get("requireUncertainty")
    require_reality_boundary = options.get("requireRealityBoundary")
    require_professional_action_boundary = options.get("requireProfessionalActionBoundary")
    require_open_goal_boundary = options.get("requireOpenGoalBoundary")
    require_perspective_boundary = options.get("requirePerspectiveBoundary")
    require_coverage_boundary = options.get("requireCoverageBoundary")
    coverage_boundary_goals = _as_list(options.get("coverageBoundaryGoals"))
    require_calibrated_language = options.get("requireCalibratedLanguage")
    require_position_evidence = options.get("requirePositionEvidence")
    active_question = options.get("activeQuestion")
    if active_question is None:
        active_question = ""
    require_question_relevance = options.get("requireQuestionRelevance")
    allow_clarification = options.get("allowClarification")
    if allow_clarification is None:
        allow_clarification = True
    is_follow_up = options.get("isFollowUp")

    text = content.strip() if isinstance(content, str) else ""
    if not text:
        raise ValueError("解读内容为空，请重试。")
    if not text.startswith("{"):
        if (
            require_coverage
            or require_actions
            or require_references
            or require_synthesis
            or require_uncertainty
            or require_reality_boundary
        ):
            raise ValueError("首轮解读必须返回结构化 JSON，请重试。")
        if (
            is_follow_up
            and require_text_support
            and not _claim_supported_by_evidence(
                text,
                {
                    "text": "；".join(
                        _string(_prop(item, "text"))
                        for item in evidence
                        if _prop(item, "source") != "memory"
                    )
                },
                require_sentence_support=True,
            )
        ):
            raise ValueError("追问正文与证据不匹配，请重试。")
        if require_calibrated_language and _has_absolute_claim(text):
            raise ValueError("解读包含无法由牌面确认的绝对断言，请重试。")
        if require_calibrated_language and _has_deterministic_timing_claim(text):
            raise ValueError("解读不能给出确定时间，请重试。")
        return {
            "text": text,
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
    try:
        data = json.loads(text)
    except ValueError:
        raise ValueError("解读格式不正确，请重试。") from None
    if (
        not data
        or not isinstance(data.get("text"), str)
        or not data["text"].strip()
        or len(data["text"]) > 20_000
    ):
        raise ValueError("解读格式不正确，请重试。")
    evidence_by_id = {item["evidenceId"]: item for item in evidence}
    cards_by_id = {item["id"]: item for item in cards}
    if "needsClarification" in data and not _is_boolean(data["needsClarification"]):
        raise ValueError("澄清问题格式不正确，请重试。")
    needs_clarification = data.get("needsClarification") is True
    clarification = _excerpt(
        data.get("clarification") if data.get("clarification") is not None else "", 500
    )
    if needs_clarification and allow_clarification is False:
        raise ValueError("明确主题不允许跳过首轮解读，请重试。")
    if needs_clarification and not _is_concrete_clarification(clarification):
        raise ValueError("澄清问题格式不正确，请重试。")
    if needs_clarification and (
        (isinstance(data.get("goalSections"), list) and len(data["goalSections"]) > 0)
        or (isinstance(data.get("cardReadings"), list) and len(data["cardReadings"]) > 0)
        or (isinstance(data.get("actions"), list) and len(data["actions"]) > 0)
        or (isinstance(data.get("references"), list) and len(data["references"]) > 0)
        or (
            isinstance(data.get("synthesis"), dict)
            and data["synthesis"]
            and (
                (
                    isinstance(data["synthesis"].get("text"), str)
                    and data["synthesis"]["text"].strip()
                )
                or (
                    isinstance(data["synthesis"].get("evidenceIds"), list)
                    and len(data["synthesis"]["evidenceIds"]) > 0
                )
            )
        )
    ):
        raise ValueError("澄清时不能同时返回结构化解读，请重试。")
    if "references" in data and not isinstance(data["references"], list):
        raise ValueError("解读引用格式不正确，请重试。")
    refs = []
    seen_reference_ids: set[str] = set()
    for item in _as_list(data.get("references")):
        reference = _valid_reference(item, evidence_by_id, cards_by_id)
        if reference["evidenceId"] in seen_reference_ids:
            continue
        seen_reference_ids.add(reference["evidenceId"])
        refs.append(reference)
        if len(refs) >= 24:
            break
    if (
        require_references
        and not needs_clarification
        and (
            len(refs) < len(cards)
            or any(
                not any(reference["cardId"] == card["id"] for reference in refs) for card in cards
            )
        )
    ):
        raise ValueError("首轮解读引用没有覆盖全部牌面，请重试。")
    if (
        require_references
        and not needs_clarification
        and any(
            not any(reference["cardId"] == card["id"] and reference["tier"] == "anchor" for reference in refs)
            for card in cards
        )
    ):
        raise ValueError("首轮引用必须包含每张牌的核心锚点，请重试。")
    if (
        require_reference_claims
        and not needs_clarification
        and any(not reference["claim"] for reference in refs)
    ):
        raise ValueError("引用说明不能为空，请重试。")
    if (
        require_reference_support
        and not needs_clarification
        and any(
            not _claim_supported_by_evidence(
                reference["claim"],
                evidence_by_id.get(reference["evidenceId"]),
                require_sentence_support=True,
            )
            for reference in refs
        )
    ):
        raise ValueError("引用说明与证据不匹配，请重试。")

    goal_sections: list[dict[str, Any]] = []
    if "goalSections" in data:
        if not isinstance(data["goalSections"], list) or len(data["goalSections"]) > 4:
            raise ValueError("目标分段格式不正确，请重试。")
        requested = _unique([goal for goal in required_goal_sections if goal in _READING_GOALS])
        allowed_source = allowed_goal_sections if allowed_goal_sections else requested
        allowed = _unique([goal for goal in allowed_source if goal in _READING_GOALS])
        allowed_goals = set(allowed)
        requested_goals = set(requested)
        seen_goals: set[str] = set()
        for index, item in enumerate(data["goalSections"]):
            if (
                not item
                or not isinstance(item, dict)
                or item.get("goal") not in _READING_GOALS
                or item.get("goal") in seen_goals
                or not isinstance(item.get("text"), str)
                or not item["text"].strip()
                or len(item["text"]) > 4_000
                or not isinstance(item.get("evidenceIds"), list)
                or len(item["evidenceIds"]) < 1
                or len(item["evidenceIds"]) > 8
                or any(not isinstance(evidence_id, str) for evidence_id in item["evidenceIds"])
            ):
                raise ValueError("目标分段格式不正确，请重试。")
            if allowed and item["goal"] not in allowed_goals:
                raise ValueError("目标分段目标未被本轮路由，请重试。")
            if require_goal_sections and item["goal"] not in requested_goals:
                raise ValueError("目标分段目标未被本轮路由，请重试。")
            if require_goal_sections and (
                index >= len(requested) or requested[index] != item["goal"]
            ):
                raise ValueError("目标分段顺序不符合本轮目标计划，请重试。")
            evidence_ids = []
            for evidence_id in item["evidenceIds"]:
                chunk = evidence_by_id.get(evidence_id)
                if (
                    chunk is None
                    or not isinstance(chunk.get("retrievalGoals"), list)
                    or item["goal"] not in chunk["retrievalGoals"]
                ):
                    raise ValueError("目标分段引用无效，请重试。")
                evidence_ids.append(chunk["evidenceId"])
            required_tier = GOAL_REFERENCE_TIERS[item["goal"]]
            has_available_required_tier = any(
                _prop(chunk, "tier") == required_tier
                and isinstance(_prop(chunk, "retrievalGoals"), list)
                and item["goal"] in chunk["retrievalGoals"]
                for chunk in evidence_by_id.values()
            )
            if (
                (not is_follow_up or require_goal_reference_coverage)
                and not needs_clarification
                and has_available_required_tier
                and not any(
                    _prop(evidence_by_id.get(evidence_id), "tier") == required_tier
                    for evidence_id in evidence_ids
                )
            ):
                raise ValueError("目标分段缺少目标层级证据，请重试。")
            if not needs_clarification and not _claim_supported_by_evidence(
                item["text"],
                {"text": _reference_evidence_text(evidence_ids, evidence_by_id, "；")},
                require_sentence_support=True,
            ):
                raise ValueError("目标分段内容与证据不匹配，请重试。")
            seen_goals.add(item["goal"])
            unique_ids = _unique(evidence_ids)
            goal_sections.append(
                {
                    "goal": item["goal"],
                    "text": _excerpt(item["text"], 4_000),
                    "evidenceIds": unique_ids,
                    "evidence": _evidence_details(unique_ids, evidence_by_id),
                }
            )
    if require_goal_sections and not needs_clarification:
        required = _unique([goal for goal in required_goal_sections if goal in _READING_GOALS])
        if any(not any(item["goal"] == goal for item in goal_sections) for goal in required):
            raise ValueError("首轮解读必须按目标分别返回目标分段，请重试。")

    def goal_text_coverage_error() -> str:
        requested = _unique(
            [
                goal
                for goal in (
                    required_goal_sections
                    if required_goal_sections
                    else [item["goal"] for item in goal_sections]
                )
                if goal in _READING_GOALS
            ]
        )
        available = _unique([goal for goal in required_goal_evidence if goal in _READING_GOALS])
        targets = _unique(
            [goal for goal in (available if available else requested) if goal in _READING_GOALS]
        )
        covered = True
        for goal in targets:
            required_tier = GOAL_REFERENCE_TIERS[goal]
            has_available_tier = any(
                _prop(item, "tier") == required_tier
                and isinstance(_prop(item, "retrievalGoals"), list)
                and goal in item["retrievalGoals"]
                for item in evidence_by_id.values()
            )
            if not has_available_tier:
                continue
            section = next(
                (item for item in goal_sections if _prop(item, "goal") == goal), None
            )
            section_ids = section["evidenceIds"] if section is not None else []
            reference_ids = [
                reference["evidenceId"]
                for reference in refs
                if _prop(evidence_by_id.get(reference["evidenceId"]), "source") != "memory"
                and isinstance(
                    _prop(evidence_by_id.get(reference["evidenceId"]), "retrievalGoals"), list
                )
                and goal in evidence_by_id[reference["evidenceId"]]["retrievalGoals"]
            ]
            goal_evidence_ids = [
                evidence_id
                for evidence_id in _unique([*section_ids, *reference_ids])
                if _prop(evidence_by_id.get(evidence_id), "tier") == required_tier
            ]
            goal_evidence = _reference_evidence_text(goal_evidence_ids, evidence_by_id, "；")
            if not goal_evidence or not _claim_supported_by_evidence(
                data["text"], {"text": goal_evidence}
            ):
                covered = False
        if covered:
            return ""
        routed_goals = available if available else requested
        return (
            "混合目标正文没有覆盖每个回答目标，请重试。"
            if len(_unique([goal for goal in routed_goals if goal in _READING_GOALS])) > 1
            else "回答正文没有覆盖当前目标证据，请重试。"
        )

    synthesis: dict[str, Any] = {"text": "", "evidenceIds": []}
    synthesis_support_ok = True
    if "synthesis" in data:
        if (
            not isinstance(data.get("synthesis"), dict)
            or not data["synthesis"]
            or not isinstance(data["synthesis"].get("text"), str)
            or not data["synthesis"]["text"].strip()
            or len(data["synthesis"]["text"]) > 4_000
            or not isinstance(data["synthesis"].get("evidenceIds"), list)
            or len(data["synthesis"]["evidenceIds"]) < 1
            or len(data["synthesis"]["evidenceIds"]) > 12
            or any(
                not isinstance(evidence_id, str)
                for evidence_id in data["synthesis"]["evidenceIds"]
            )
        ):
            raise ValueError("综合解读格式不正确，请重试。")
        evidence_ids = []
        for evidence_id in data["synthesis"]["evidenceIds"]:
            chunk = evidence_by_id.get(evidence_id)
            if (
                chunk is None
                or chunk.get("source") == "memory"
                or ("cardId" in chunk and chunk["cardId"] is None)
            ):
                raise ValueError("综合解读引用无效，请重试。")
            evidence_ids.append(chunk["evidenceId"])
        synthesis = {
            "text": _excerpt(data["synthesis"]["text"], 4_000),
            "evidenceIds": _unique(evidence_ids),
        }
        synthesis["evidence"] = _evidence_details(synthesis["evidenceIds"], evidence_by_id)
        if (
            require_synthesis_support
            and not needs_clarification
            and not _claim_supported_by_evidence(
                synthesis["text"],
                {"text": _reference_evidence_text(evidence_ids, evidence_by_id, "；")},
                require_sentence_support=True,
            )
        ):
            synthesis_support_ok = False
    if require_synthesis and not needs_clarification:
        covered_cards = {
            _prop(evidence_by_id.get(evidence_id), "cardId")
            for evidence_id in synthesis["evidenceIds"]
            if _prop(evidence_by_id.get(evidence_id), "cardId")
        }
        if (
            not synthesis["text"]
            or not synthesis["evidenceIds"]
            or (len(cards) > 1 and any(card["id"] not in covered_cards for card in cards))
        ):
            raise ValueError("首轮综合解读没有覆盖全部牌面，请重试。")
        if require_synthesis_anchors and any(
            not any(
                _prop(evidence_by_id.get(evidence_id), "cardId") == card["id"]
                and _prop(evidence_by_id.get(evidence_id), "retrievalRequired") is True
                for evidence_id in synthesis["evidenceIds"]
            )
            for card in cards
        ):
            raise ValueError("首轮综合解读必须引用每张牌的核心锚点，请重试。")
        if (
            require_synthesis_card_support
            and len(cards) > 1
            and any(
                not any(
                    _prop(evidence_by_id.get(evidence_id), "cardId") == card["id"]
                    and _claim_supported_by_evidence(
                        synthesis["text"], evidence_by_id.get(evidence_id)
                    )
                    for evidence_id in synthesis["evidenceIds"]
                )
                for card in cards
            )
        ):
            synthesis_support_ok = False

    card_readings: list[dict[str, Any]] = []
    card_reading_support_ok = True
    card_position_evidence_ok = True
    if require_coverage and not needs_clarification and "cardReadings" not in data:
        raise ValueError("首轮解读必须包含逐牌解读，请重试。")
    if "cardReadings" in data:
        if not isinstance(data["cardReadings"], list) or len(data["cardReadings"]) > 12:
            raise ValueError("逐牌解读格式不正确，请重试。")
        seen: set[str] = set()
        for item in data["cardReadings"]:
            if (
                not item
                or not isinstance(item, dict)
                or not isinstance(item.get("cardId"), str)
                or item["cardId"] in seen
                or item["cardId"] not in cards_by_id
                or not isinstance(item.get("position"), str)
                or not isinstance(item.get("reading"), str)
                or not item["reading"].strip()
                or len(item["reading"]) > 4_000
                or not isinstance(item.get("evidenceIds"), list)
                or len(item["evidenceIds"]) < 1
                or len(item["evidenceIds"]) > 8
            ):
                raise ValueError("逐牌解读格式不正确，请重试。")
            card = cards_by_id[item["cardId"]]
            if card.get("position") != item["position"]:
                raise ValueError("逐牌解读牌位不匹配。")
            orientation = (
                "逆位"
                if card.get("reversed") is True
                else "正位"
                if card.get("reversed") is False
                else (card.get("orientation") if card.get("orientation") is not None else "未知方向")
            )
            evidence_ids = []
            for evidence_id in item["evidenceIds"]:
                chunk = evidence_by_id.get(evidence_id)
                if (
                    chunk is None
                    or chunk.get("cardId") != item["cardId"]
                    or chunk.get("position") != item["position"]
                ):
                    raise ValueError("逐牌解读引用无效。")
                evidence_ids.append(chunk["evidenceId"])
            if (
                require_card_reading_support
                and not needs_clarification
                and not any(
                    _claim_supported_by_evidence(
                        item["reading"],
                        evidence_by_id.get(evidence_id),
                        require_sentence_support=True,
                    )
                    for evidence_id in evidence_ids
                )
            ):
                card_reading_support_ok = False
            if (
                require_coverage
                and not needs_clarification
                and not any(
                    _prop(evidence_by_id.get(evidence_id), "retrievalRequired") is True
                    for evidence_id in evidence_ids
                )
            ):
                raise ValueError("逐牌解读必须引用该牌的核心锚点，请重试。")
            if (
                require_position_evidence
                and not needs_clarification
                and any(
                    _prop(candidate, "cardId") == card.get("id")
                    and _prop(candidate, "position") == card.get("position")
                    and isinstance(_prop(candidate, "retrievalReasons"), list)
                    and "position_match" in candidate["retrievalReasons"]
                    for candidate in evidence
                )
                and not any(
                    isinstance(
                        _prop(evidence_by_id.get(evidence_id), "retrievalReasons"), list
                    )
                    and "position_match"
                    in evidence_by_id[evidence_id]["retrievalReasons"]
                    for evidence_id in evidence_ids
                )
            ):
                card_position_evidence_ok = False
            seen.add(item["cardId"])
            card_readings.append(
                {
                    "cardId": item["cardId"],
                    "position": item["position"],
                    "orientation": orientation,
                    "reading": _excerpt(item["reading"], 4_000),
                    "evidenceIds": evidence_ids,
                    "evidence": _evidence_details(evidence_ids, evidence_by_id),
                }
            )
        if (
            require_coverage
            and not needs_clarification
            and (
                len(card_readings) != len(cards)
                or any(card["id"] not in seen for card in cards)
            )
        ):
            raise ValueError("首轮解读没有覆盖全部牌面。")

    actions: list[dict[str, Any]] = []
    actions_concrete = True
    actions_reasoned = True
    actions_reason_supported = True
    actions_text_supported = True
    actions_goal_tier_supported = True
    professional_action_boundary_ok = True
    action_goals = _unique(
        [goal for goal in required_action_goal_evidence if goal in GOAL_REFERENCE_TIERS]
    )
    available_action_goals = [
        goal
        for goal in action_goals
        if any(
            _prop(item, "tier") == GOAL_REFERENCE_TIERS[goal]
            and isinstance(_prop(item, "retrievalGoals"), list)
            and goal in item["retrievalGoals"]
            for item in evidence_by_id.values()
        )
    ]
    if "actions" in data:
        action_limit = 3 if (require_actions and not needs_clarification) else 6
        if not isinstance(data["actions"], list) or len(data["actions"]) > action_limit:
            raise ValueError("行动建议格式不正确，请重试。")
        for item in data["actions"]:
            # The original also tests `typeof item.evidenceIds === undefined`, which is
            # always false (typeof yields a string); it is intentionally not translated.
            if (
                not item
                or not isinstance(item, dict)
                or not isinstance(item.get("text"), str)
                or not item["text"].strip()
                or len(item["text"]) > 600
                or not isinstance(item.get("evidenceIds"), list)
                or len(item["evidenceIds"]) < 1
                or len(item["evidenceIds"]) > 8
                or any(not isinstance(evidence_id, str) for evidence_id in item["evidenceIds"])
            ):
                raise ValueError("行动建议格式不正确，请重试。")
            evidence_ids = []
            for evidence_id in item["evidenceIds"]:
                if evidence_id not in evidence_by_id:
                    raise ValueError("行动建议引用无效，请重试。")
                evidence_ids.append(evidence_id)
            if not any(
                _prop(evidence_by_id.get(evidence_id), "tier") in ("anchor", "application", "personal")
                for evidence_id in evidence_ids
            ):
                raise ValueError("行动建议必须引用核心或应用证据，请重试。")
            if "reason" in item and not isinstance(item["reason"], str):
                raise ValueError("行动建议格式不正确，请重试。")
            if (
                require_action_reasons
                and not needs_clarification
                and (not item.get("reason") or not item["reason"].strip())
            ):
                actions_reasoned = False
            if (
                require_professional_action_boundary
                and not needs_clarification
                and not _has_professional_action_boundary(item["text"])
            ):
                professional_action_boundary_ok = False
            if (
                (require_action_reason_support or is_follow_up)
                and not needs_clarification
                and "reason" in item
                and not _claim_supported_by_evidence(
                    item["reason"],
                    {"text": _reference_evidence_text(evidence_ids, evidence_by_id, "")},
                    require_sentence_support=True,
                )
            ):
                actions_reason_supported = False
            if (
                (require_action_text_support or is_follow_up)
                and not needs_clarification
                and not _claim_supported_by_evidence(
                    item["text"],
                    {"text": _reference_evidence_text(evidence_ids, evidence_by_id, "")},
                    require_sentence_support=True,
                )
            ):
                actions_text_supported = False
            if (
                require_concrete_actions
                and not needs_clarification
                and not _is_concrete_action(item["text"])
            ):
                actions_concrete = False
            if (
                not needs_clarification
                and available_action_goals
                and not any(
                    any(
                        _prop(evidence_by_id.get(evidence_id), "tier") == GOAL_REFERENCE_TIERS[goal]
                        and isinstance(
                            _prop(evidence_by_id.get(evidence_id), "retrievalGoals"), list
                        )
                        and goal in evidence_by_id[evidence_id]["retrievalGoals"]
                        for goal in available_action_goals
                    )
                    for evidence_id in evidence_ids
                )
            ):
                actions_goal_tier_supported = False
            actions.append(
                {
                    "text": _excerpt(item["text"], 600),
                    "reason": _excerpt(
                        item["reason"] if item.get("reason") is not None else "", 500
                    ),
                    "evidenceIds": evidence_ids,
                    "evidence": _evidence_details(evidence_ids, evidence_by_id),
                }
            )
    if require_actions and not needs_clarification and len(actions) < 1:
        raise ValueError("首轮解读需要行动建议，请重试。")
    for value in ("followUp", "uncertainty"):
        if value in data and not isinstance(data[value], str):
            raise ValueError("解读格式不正确，请重试。")
    follow_up = _excerpt(data.get("followUp") if data.get("followUp") is not None else "", 500)
    if require_follow_up_question and not needs_clarification and follow_up and not _is_focused_follow_up(follow_up):
        raise ValueError("追问问题格式不正确，请重试。")
    uncertainty = _excerpt(
        data.get("uncertainty") if data.get("uncertainty") is not None else "", 500
    )
    if (
        (require_uncertainty or require_reality_boundary or require_perspective_boundary)
        and not needs_clarification
        and not uncertainty
    ):
        raise ValueError(
            "涉及他人内心的问题需要明确不可验证边界，请重试。"
            if require_perspective_boundary
            else "高风险问题需要现实依据说明，请重试。"
            if require_reality_boundary
            else "首轮解读必须包含不确定性说明，请重试。"
        )
    if require_reality_boundary and not needs_clarification and not _has_reality_boundary(uncertainty):
        raise ValueError("高风险问题需要现实依据说明，请重试。")
    if (
        require_perspective_boundary
        and not needs_clarification
        and not _has_perspective_boundary(uncertainty)
    ):
        raise ValueError("涉及他人内心的问题需要明确不可验证边界，请重试。")
    if (
        require_coverage_boundary
        and not needs_clarification
        and not _has_coverage_boundary(uncertainty, goals=coverage_boundary_goals)
    ):
        raise ValueError("证据覆盖不足时必须说明应用资料限制，请重试。")
    visible_output = "\n".join(
        item
        for item in [
            data["text"],
            *[item["text"] for item in goal_sections],
            synthesis["text"],
            *[item["reading"] for item in card_readings],
            *[text for item in actions for text in (item["text"], item["reason"])],
            *[reference["claim"] for reference in refs],
            follow_up,
            uncertainty,
            clarification,
        ]
        if item
    )
    if require_open_goal_boundary and not needs_clarification and _has_open_goal_prediction(visible_output):
        raise ValueError("目标未明确时不能擅自预测，请重试。")
    if require_card_reading_support and not needs_clarification and not card_reading_support_ok:
        raise ValueError("逐牌解读内容与证据不匹配，请重试。")
    if require_synthesis_support and not needs_clarification and not synthesis_support_ok:
        raise ValueError("综合解读内容与证据不匹配，请重试。")
    if require_concrete_actions and not needs_clarification and not actions_concrete:
        raise ValueError("行动建议必须包含可观察的完成标准，请重试。")
    if require_action_reasons and not needs_clarification and not actions_reasoned:
        raise ValueError("首轮行动建议必须说明与牌面相关的理由，请重试。")
    if (
        require_professional_action_boundary
        and not needs_clarification
        and not professional_action_boundary_ok
    ):
        raise ValueError("高风险行动必须先核实现实资料或咨询专业人士，请重试。")
    if (
        (require_action_reason_support or is_follow_up)
        and not needs_clarification
        and not actions_reason_supported
    ):
        raise ValueError("行动理由与牌面证据不匹配，请重试。")
    if not needs_clarification and available_action_goals and not actions_goal_tier_supported:
        raise ValueError("首轮行动建议缺少当前目标的应用证据，请重试。")
    if require_position_evidence and not needs_clarification and not card_position_evidence_ok:
        raise ValueError("逐牌解读必须引用可用的牌位语义证据，请重试。")
    if require_goal_text_coverage and not needs_clarification and len(goal_sections) > 1:
        goal_text_error = goal_text_coverage_error()
        if goal_text_error:
            raise ValueError(goal_text_error)
    structured_follow_up = (
        is_follow_up
        and not needs_clarification
        and (
            len(refs) > 0
            or len(goal_sections) > 0
            or len(card_readings) > 0
            or len(synthesis["evidenceIds"]) > 0
            or len(actions) > 0
        )
    )
    if (require_text_support or structured_follow_up) and not needs_clarification:
        if is_follow_up:
            grounded_source = [
                *[item["evidenceId"] for item in refs],
                *[evidence_id for item in goal_sections for evidence_id in item["evidenceIds"]],
                *synthesis["evidenceIds"],
                *[evidence_id for item in card_readings for evidence_id in item["evidenceIds"]],
                *[evidence_id for item in actions for evidence_id in item["evidenceIds"]],
            ]
        else:
            grounded_source = [
                *[item["evidenceId"] for item in refs],
                *[evidence_id for item in goal_sections for evidence_id in item["evidenceIds"]],
            ]
        grounded_evidence_ids = _non_personal_evidence_ids(_unique(grounded_source), evidence_by_id)
        grounded_text = _reference_evidence_text(grounded_evidence_ids, evidence_by_id, "；")
        if not _claim_supported_by_evidence(
            data["text"], {"text": grounded_text}, require_sentence_support=True
        ):
            raise ValueError(
                "追问正文与证据不匹配，请重试。"
                if structured_follow_up
                else "解读正文与证据不匹配，请重试。"
            )
    if (
        (require_action_text_support or is_follow_up)
        and not needs_clarification
        and not actions_text_supported
    ):
        raise ValueError("行动建议内容与证据不匹配，请重试。")
    calibrated_text = "\n".join(
        item
        for item in [
            data["text"],
            *[item["text"] for item in goal_sections],
            synthesis["text"],
            *[item["reading"] for item in card_readings],
            *[reference["claim"] for reference in refs],
            data.get("followUp"),
            uncertainty,
            data.get("clarification"),
        ]
        if item
    )
    if require_calibrated_language and not needs_clarification and _has_absolute_claim(
        "\n".join(
            item
            for item in [
                calibrated_text,
                *[text for item in actions for text in (item["text"], item["reason"])],
            ]
            if item
        )
    ):
        raise ValueError("解读包含无法由牌面确认的绝对断言，请重试。")
    if (
        require_calibrated_language
        and not needs_clarification
        and _has_deterministic_timing_claim(calibrated_text)
    ):
        raise ValueError("解读不能给出确定时间，请重试。")
    enforce_goal_reference_coverage = (not is_follow_up) or require_goal_reference_coverage
    if (
        not needs_clarification
        and enforce_goal_reference_coverage
        and ((not is_follow_up) or structured_follow_up)
    ):
        goals = _unique([goal for goal in required_goal_evidence if goal in GOAL_REFERENCE_TIERS])
        missing = [
            goal
            for goal in goals
            if any(
                isinstance(_prop(item, "retrievalGoals"), list)
                and goal in item["retrievalGoals"]
                and item.get("tier") == GOAL_REFERENCE_TIERS[goal]
                for item in evidence_by_id.values()
            )
            and not _has_goal_reference(goal, refs, goal_sections, evidence_by_id)
        ]
        if missing:
            raise ValueError(
                "追问引用没有覆盖当前回答目标，请重试。"
                if is_follow_up
                else "首轮引用没有覆盖当前回答目标，请重试。"
            )
    if (
        require_question_relevance
        and not needs_clarification
        and not _question_text_supports(data["text"], active_question)
    ):
        raise ValueError("当前回答没有直接回应本轮问题，请重试。")
    if (
        require_goal_alignment
        and not needs_clarification
        and not _output_goals_support(
            data["text"], goal_sections, required_output_goals, uncertainty=uncertainty
        )
    ):
        raise ValueError("回答没有遵守本轮目标模式，请重试。")
    if require_goal_text_coverage and not needs_clarification and len(goal_sections) <= 1:
        goal_text_error = goal_text_coverage_error()
        if goal_text_error:
            raise ValueError(goal_text_error)
    return {
        "text": data["text"].strip(),
        "synthesis": synthesis,
        "goalSections": goal_sections,
        "references": refs,
        "cardReadings": card_readings,
        "actions": actions,
        "needsClarification": needs_clarification,
        "clarification": clarification,
        "followUp": follow_up,
        "uncertainty": uncertainty,
    }

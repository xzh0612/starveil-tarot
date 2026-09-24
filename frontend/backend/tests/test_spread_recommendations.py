"""Spread recommendation regression tests.

Translated from ``server-js-reference/tests/spread-recommendation.test.mjs`` so
the Python port keeps the same 5 cases as the JavaScript original. Every test
asserts the same thing its JavaScript counterpart asserts, with the same inputs
and the same expectations. Names are derived from the JavaScript test sentences
so the two suites stay traceable.

``recommendLocalSpreads`` still lives in the frontend JavaScript bundle (it runs
in the browser and was deliberately not ported), so those cases drive it through
a Node subprocess instead of dropping the coverage.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from backend.deck import SPREADS
from backend.spread_recommendations import parse_recommendations

FRONTEND = Path(__file__).resolve().parents[2]


def js_json(value):
    """`JSON.stringify(v)` — no non-ASCII escaping and no separator spaces."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def recommend_local_spreads(question):
    """Calls the frontend JavaScript recommender, which is not part of the port."""
    script = (
        "import('./src/spread-recommendation.js').then(m=>"
        "Promise.resolve(m.recommendLocalSpreads(process.argv[1]))).then(r=>console.log(JSON.stringify(r)))"
    )
    result = subprocess.run(
        ["node", "-e", script, question],
        cwd=FRONTEND,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def test_local_recommendations_prioritize_relationship_questions_with_a_useful_reason():
    result = recommend_local_spreads("我和她还有机会继续发展吗？")
    assert 2 <= len(result) <= 3
    assert result[0]["id"] == "love"
    assert len(result[0]["reason"]) >= 20
    assert any(spread["id"] == result[0]["id"] for spread in SPREADS)


def test_local_recommendations_prioritize_career_questions_and_remain_deterministic():
    question = "我该不该换工作，下一步职业方向是什么？"
    first = recommend_local_spreads(question)
    second = recommend_local_spreads(question)
    assert first == second
    assert first[0]["id"] == "career"
    assert len({item["id"] for item in first}) == len(first)


def test_local_recommendations_use_a_broad_reflective_spread_for_an_open_question():
    result = recommend_local_spreads("最近有点迷茫，想知道现在该如何整理自己")
    assert result[0]["id"] in ["three", "one", "time"]
    assert all(item["reason"] and len(item["reason"]) <= 300 for item in result)


def test_empty_or_whitespace_questions_return_no_recommendations():
    assert recommend_local_spreads("   ") == []
    assert recommend_local_spreads("") == []


def test_ai_recommendation_reasons_must_be_grounded_in_catalog_positions():
    valid = js_json(
        {
            "recommendations": [
                {"id": "choice", "reason": "把两条选择的机会和挑战并列起来，适合比较条件与代价。"},
                {"id": "career", "reason": "从优势、阻碍和下一步逐层梳理职业方向。"},
            ]
        }
    )
    assert parse_recommendations(valid, "两个工作机会该如何比较？")[0]["id"] == "choice"

    generic = js_json(
        {
            "recommendations": [
                {"id": "choice", "reason": "这个牌阵很适合你，值得优先考虑。"},
                {"id": "career", "reason": "这个牌阵也很适合你，可以试试看。"},
            ]
        }
    )
    with pytest.raises(ValueError, match="牌阵推荐理由"):
        parse_recommendations(generic)

    off_topic = js_json(
        {
            "recommendations": [
                {"id": "choice", "reason": "从现状与两条道路的挑战中观察代价与变化。"},
                {"id": "career", "reason": "关注你的优势、阻碍和下一步。"},
            ]
        }
    )
    with pytest.raises(ValueError, match="问题不相关"):
        parse_recommendations(off_topic, "两个工作机会该如何比较？")

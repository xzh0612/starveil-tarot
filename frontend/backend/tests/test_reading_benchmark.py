"""Regression gate for the human-annotated retrieval benchmark.

`test_reading_eval.py` proves the protocol is *self-consistent*; this file proves
retrieval still finds the evidence a human judged necessary. Both matter: the
first catches prompt/contract drift, the second catches silently worse recall.
"""

from __future__ import annotations

from backend.reading_benchmark import load_benchmark, run_benchmark, score_case

# 两处已知偏差，已记录在案，不算新增回归：
# - relationship-reunion：两张牌时第二张的应用证据（c09:relationships）被四条
#   引用类证据挤到第 9 位，超出召回窗口，但仍在生产预算内。
# - self-procrastination：问题明显属于反思类，但“拖延”没有进反思词表，路由
#   判成无线索，导致应用层为空。
KNOWN_IMPERFECT = {"relationship-reunion", "self-procrastination"}


def test_benchmark_gate_passes_and_covers_every_case():
    report = run_benchmark()
    assert report["cases"] >= 30
    assert report["ok"] is True
    assert report["anchorRecall"] == 1.0, "每张牌的象征与正逆位牌义必须全部命中"
    assert report["recall"] >= report["recallFloor"]
    assert report["offTopicRate"] <= report["offTopicCeiling"]


def test_no_new_case_regresses_beyond_the_recorded_two():
    report = run_benchmark()
    unexpected = sorted(set(report["imperfect"]) - KNOWN_IMPERFECT)
    assert unexpected == [], f"新增未达标案例：{unexpected}"


def test_scorer_is_not_vacuous():
    """A core pair that the spread cannot produce must drag recall below 1."""
    data = load_benchmark()
    case = next(item for item in data["cases"] if item["id"] == "open-vague")
    impossible = {**case, "core": [*case["core"], ["m11", "reflection"]]}
    result = score_case(impossible, data["k"])
    assert result["recall"] < 1.0
    assert "m11:reflection" in result["missed"]

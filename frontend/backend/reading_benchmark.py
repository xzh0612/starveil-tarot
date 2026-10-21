"""Human-annotated retrieval benchmark for the tarot reading agent.

The older `evaluate_reading.py` suite only asserts that *a* chunk of the required
kind showed up somewhere. That cannot tell a useful answer from one that cites
the wrong card's symbol, and it cannot detect off-topic application evidence
crowding out the relevant layer. This benchmark adds per-case relevance labels:

* ``core``       — the (cardId, kind) evidence pairs a reader must see to answer
                   the question honestly.
* ``themeKinds`` — the application layer the question actually needs. Application
                   evidence outside this set counts as off-topic (跑题).

Metrics: Recall@k over ``core``, anchor recall, and off-topic rate. The labels
were judged by hand against the card guides; they are a seed set and should be
reviewed by someone who knows the deck before being treated as ground truth.

    cd frontend && backend/.venv/bin/python -m backend.reading_benchmark

Exits non-zero when the aggregate falls under the configured floor so CI can
gate on it. Raise/lower the floors with STARVEIL_BENCH_RECALL /
STARVEIL_BENCH_OFFTOPIC when the annotation set changes.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from .reading_rag import retrieve_reading_evidence

DATA_PATH = Path(__file__).with_name("data") / "reading_benchmark.json"
APPLICATION_KINDS = ("relationships", "work", "reflection")
ANCHOR_KINDS = ("symbolism", "orientation")

DEFAULT_RECALL_FLOOR = 0.9
DEFAULT_OFFTOPIC_CEILING = 0.05


def load_benchmark(path: Path | str = DATA_PATH) -> dict[str, Any]:
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict) or not isinstance(data.get("cases"), list):
        raise ValueError("benchmark file must contain a cases array")
    return data


def _floor(name: str, fallback: float) -> float:
    try:
        return float(os.environ.get(name, fallback))
    except (TypeError, ValueError):
        return fallback


def score_case(case: dict[str, Any], k: int) -> dict[str, Any]:
    """Scores one annotated case against the live retrieval path."""
    pool = retrieve_reading_evidence(question=case["question"], cards=case["cards"])
    top = pool[:k]
    top_pairs = {(item.get("cardId"), item.get("kind")) for item in top}
    core = [(pair[0], pair[1]) for pair in case.get("core", []) if isinstance(pair, (list, tuple)) and len(pair) == 2]
    missed = [pair for pair in core if pair not in top_pairs]
    anchors = [pair for pair in core if pair[1] in ANCHOR_KINDS]
    missed_anchors = [pair for pair in anchors if pair not in top_pairs]
    expected = set(case.get("themeKinds") or [])
    off_topic = [
        item
        for item in top
        if item.get("kind") in APPLICATION_KINDS and item.get("kind") not in expected
    ]
    application_count = sum(1 for item in top if item.get("kind") in APPLICATION_KINDS)
    return {
        "id": case.get("id", ""),
        "recall": (len(core) - len(missed)) / len(core) if core else 1.0,
        "anchorRecall": (len(anchors) - len(missed_anchors)) / len(anchors) if anchors else 1.0,
        "offTopicRate": len(off_topic) / application_count if application_count else 0.0,
        "pool": len(pool),
        "missed": [f"{cardId}:{kind}" for cardId, kind in missed],
        "offTopic": [f"{item.get('cardId')}:{item.get('kind')}" for item in off_topic],
    }


def run_benchmark(
    path: Path | str = DATA_PATH,
    recall_floor: float | None = None,
    offtopic_ceiling: float | None = None,
) -> dict[str, Any]:
    data = load_benchmark(path)
    k = int(data.get("k") or 6)
    recall_floor = _floor("STARVEIL_BENCH_RECALL", DEFAULT_RECALL_FLOOR) if recall_floor is None else recall_floor
    offtopic_ceiling = (
        _floor("STARVEIL_BENCH_OFFTOPIC", DEFAULT_OFFTOPIC_CEILING) if offtopic_ceiling is None else offtopic_ceiling
    )
    results = [score_case(case, k) for case in data["cases"]]
    recall = sum(item["recall"] for item in results) / len(results) if results else 0.0
    anchor_recall = sum(item["anchorRecall"] for item in results) / len(results) if results else 0.0
    off_topic = sum(item["offTopicRate"] for item in results) / len(results) if results else 0.0
    failures = [item["id"] for item in results if item["recall"] < 1.0 or item["offTopicRate"] > 0]
    ok = bool(results) and recall >= recall_floor and off_topic <= offtopic_ceiling
    return {
        "ok": ok,
        "version": data.get("version"),
        "k": k,
        "cases": len(results),
        "recall": round(recall, 4),
        "anchorRecall": round(anchor_recall, 4),
        "offTopicRate": round(off_topic, 4),
        "recallFloor": recall_floor,
        "offTopicCeiling": offtopic_ceiling,
        "imperfect": failures,
        "results": results,
    }


def main() -> None:
    report = run_benchmark()
    compact = {key: report[key] for key in ("ok", "version", "k", "cases", "recall", "anchorRecall", "offTopicRate", "recallFloor", "offTopicCeiling")}
    print(json.dumps(compact, ensure_ascii=False, indent=2))
    if report["imperfect"]:
        print("\n未满分的案例：")
        for item in report["results"]:
            if item["id"] in report["imperfect"]:
                print(
                    f"- {item['id']}: recall={item['recall']:.2f} missed={item['missed']} "
                    f"offTopic={item['offTopic']}"
                )
    if not report["ok"]:
        sys.exit(1)


if __name__ == "__main__":
    main()

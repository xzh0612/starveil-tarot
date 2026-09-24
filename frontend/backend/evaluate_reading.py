"""Offline retrieval, prompt and reading evaluation.

Ported from `frontend/scripts/evaluate-reading.mjs`. Runs without network access
and without an API key: it reuses the same retrieval and validation code paths the
live agent uses, so the quality gate checks the real protocol rather than a copy.

    cd frontend && backend/.venv/bin/python -m backend.evaluate_reading

Exits non-zero when any evaluation fails, which is what the CI step relies on.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from .reading_eval import (
    evaluate_followup_fixture,
    evaluate_prompt_contract,
    evaluate_reading_fixture,
    evaluate_retrieval_suite,
)
from .reading_rag import retrieve_reading_evidence
from .readings import build_reading_messages

QUESTION = "我们之间的沟通和边界要怎么调整？"
CARDS = [
    {"id": "m08", "reversed": False, "position": "建议"},
    {"id": "c06", "reversed": True, "position": "关系挑战"},
]

RETRIEVAL_CASES = [
    {"name": "relationship", "question": "我们之间的沟通和边界要怎么调整？", "cards": CARDS, "requiredKinds": ["orientation", "symbolism", "relationships"]},
    {"name": "career", "question": "我该如何规划这次转行和下一步行动？", "cards": [CARDS[0]], "requiredKinds": ["orientation", "symbolism", "work"]},
    {"name": "choice", "question": "两个机会应该如何比较，哪个更适合我？", "cards": [CARDS[0]], "requiredKinds": ["orientation", "symbolism"]},
    {"name": "future", "question": "接下来三个月的发展趋势是什么？", "cards": [CARDS[0]], "requiredKinds": ["orientation", "symbolism"]},
    {"name": "possibility", "question": "我们能不能复合？", "cards": [CARDS[0]], "requiredKinds": ["orientation", "symbolism", "waite"]},
    {"name": "colloquial-state", "question": "他对我是什么感觉？", "cards": [CARDS[0]], "requiredKinds": ["orientation", "symbolism", "waite"], "requiredGoals": ["forecast"], "expectedGoals": ["forecast"]},
    {"name": "path-comparison", "question": "留在这里还是离开？", "cards": [CARDS[0]], "requiredKinds": ["orientation", "symbolism", "reflection"], "requiredGoals": ["comparison"], "expectedGoals": ["comparison"]},
    {"name": "growth-forecast", "question": "这段关系会怎么发展？", "cards": CARDS, "requiredKinds": ["orientation", "symbolism", "waite", "relationships"], "requiredGoals": ["forecast"], "expectedGoals": ["forecast"]},
    {"name": "mixed-growth-action", "question": "这段关系会怎么发展，我该怎么做？", "cards": CARDS, "requiredKinds": ["orientation", "symbolism", "waite", "relationships"], "requiredGoals": ["advice", "forecast"], "expectedGoals": ["advice", "forecast"]},
    {"name": "card-explanation", "question": "我只是想了解这张牌", "cards": [CARDS[0]], "requiredKinds": ["orientation", "symbolism", "waite"], "requiredGoals": ["explanation"], "expectedGoals": ["explanation"]},
    {"name": "reflection", "question": "我为什么总是感到迷茫和内耗？", "cards": [CARDS[0]], "requiredKinds": ["orientation", "symbolism", "reflection"]},
    {"name": "position-semantics", "question": "我正在整理工作方向。", "cards": [{"id": "m08", "reversed": False, "position": "阻碍"}], "requiredKinds": ["orientation", "symbolism", "work"], "requiredPositionKinds": ["work"]},
]

FOLLOWUP_OUTPUT = {
    "text": "Fortitude 作为趋势参考，保持稳定、温柔而明确。",
    "references": [
        {"evidenceId": "m08:orientation", "cardId": "m08", "position": "建议", "claim": "稳定节奏"},
        {"evidenceId": "m08:waite", "cardId": "m08", "position": "建议", "claim": "Fortitude"},
    ],
    "uncertainty": "趋势仍需结合现实核验。",
}


def _first(items: list[dict[str, Any]], **match: Any) -> dict[str, Any]:
    return next(
        item for item in items if all(item.get(key) == value for key, value in match.items())
    )


def _optional(items: list[dict[str, Any]], **match: Any) -> dict[str, Any] | None:
    return next(
        (item for item in items if all(item.get(key) == value for key, value in match.items())),
        None,
    )


def build_reading_output(evidence: list[dict[str, Any]]) -> str:
    """Builds the same first-reading fixture the JavaScript evaluator used."""
    synthesis_ids = [
        _first(evidence, cardId=card["id"], kind="orientation")["evidenceId"] for card in CARDS
    ]
    card_readings = []
    for card in CARDS:
        item = _first(evidence, cardId=card["id"], kind="orientation")
        reading = (
            "用稳定、温柔而明确的方式面对情绪，并练习克制。"
            if card["id"] == "m08"
            else "比较记忆和当前事实，再不因熟悉就忽略已经发生的变化。"
        )
        position = next(
            (
                candidate
                for candidate in evidence
                if candidate.get("cardId") == card["id"]
                and "position_match" in (candidate.get("retrievalReasons") or [])
            ),
            None,
        )
        card_readings.append(
            {
                "cardId": card["id"],
                "position": card["position"],
                "reading": reading,
                "evidenceIds": [item["evidenceId"], *([position["evidenceId"]] if position else [])],
            }
        )
    orientation = next(item for item in evidence if item.get("kind") == "orientation")
    relationship = _first(evidence, cardId="m08", kind="relationships")
    actions = [
        {
            "text": "今天记录一次感受和底线，并练习克制情绪。",
            "reason": "依据稳定、温柔而明确的方式，把情绪交给克制。",
            "evidenceIds": [orientation["evidenceId"], relationship["evidenceId"]],
        }
    ]
    references: list[dict[str, Any]] = []
    for card in CARDS:
        item = _first(evidence, cardId=card["id"], kind="orientation")
        application = _optional(evidence, cardId=card["id"], kind="relationships")
        references.append(
            {
                "evidenceId": item["evidenceId"],
                "cardId": card["id"],
                "position": card["position"],
                "claim": item["text"][:4],
            }
        )
        if application:
            references.append(
                {
                    "evidenceId": application["evidenceId"],
                    "cardId": card["id"],
                    "position": card["position"],
                    "claim": application["text"][:4],
                }
            )
    return json.dumps(
        {
            "text": "先在沟通中比较记忆和当前事实，再平静说出感受和边界，并观察当下互动是否健康。",
            "synthesis": {
                "text": "稳定、温柔而明确的方式与克制情绪相连，也要比较记忆和当前事实。",
                "evidenceIds": synthesis_ids,
            },
            "cardReadings": card_readings,
            "actions": actions,
            "references": references,
            "followUp": "你希望先讨论哪一次沟通？",
            "uncertainty": "牌面不能确认对方的真实想法。",
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )


def run_evaluation() -> dict[str, Any]:
    evidence = retrieve_reading_evidence(question=QUESTION, cards=CARDS)
    messages = build_reading_messages({"question": QUESTION, "cards": CARDS, "messages": []})
    return {
        "prompt": evaluate_prompt_contract(messages),
        "retrieval": evaluate_retrieval_suite(RETRIEVAL_CASES),
        "reading": evaluate_reading_fixture(
            {
                "question": QUESTION,
                "cards": CARDS,
                "output": build_reading_output(evidence),
                "requiredKinds": ["relationships"],
            }
        ),
        "followUp": evaluate_followup_fixture(
            {
                "question": "我之后会怎样发展？",
                "cards": [{"id": "m08", "reversed": False, "position": "建议"}],
                "output": json.dumps(FOLLOWUP_OUTPUT, ensure_ascii=False, separators=(",", ":")),
            }
        ),
    }


def main() -> None:
    report = run_evaluation()
    compact = {
        "prompt": report["prompt"],
        "retrieval": {
            "ok": report["retrieval"]["ok"],
            "score": report["retrieval"]["score"],
            "failed": report["retrieval"]["failed"],
        },
        "reading": {
            "ok": report["reading"]["ok"],
            "score": report["reading"]["score"],
            "issues": report["reading"]["issues"],
        },
        "followUp": {
            "ok": report["followUp"]["ok"],
            "score": report["followUp"]["score"],
            "issues": report["followUp"]["issues"],
        },
    }
    print(json.dumps(compact, ensure_ascii=False, indent=2))
    if not all(
        report[key]["ok"] for key in ("prompt", "retrieval", "reading", "followUp")
    ):
        sys.exit(1)


if __name__ == "__main__":
    main()

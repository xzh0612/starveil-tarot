"""Re-baseline a single golden prompt case from the Python implementation.

Use only for cases where the Python port intentionally diverges from the frozen
JavaScript snapshot. Pass the case name(s) to re-freeze.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from backend.readings import build_reading_messages  # noqa: E402

FIXTURE = ROOT / "backend/tests/fixtures/prompt-golden.json"


def main(names: list[str]) -> int:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    known = {case["name"] for case in data["cases"]}
    unknown = [name for name in names if name not in known]
    if unknown:
        print(f"unknown case(s): {', '.join(unknown)}")
        return 1
    for case in data["cases"]:
        if case["name"] not in names:
            continue
        messages = build_reading_messages(
            case["body"],
            include_retrieval_diagnostics=case["includeRetrievalDiagnostics"],
        )
        case["expected"] = {
            "messages": messages,
            "promptChars": sum(len(message["content"]) for message in messages),
        }
        print(f"re-froze {case['name']}: {case['expected']['promptChars']} chars, "
              f"{len(messages)} messages")
    FIXTURE.write_text(
        json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(f"wrote {FIXTURE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

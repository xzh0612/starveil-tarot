"""FastAPI transport for the Starveil reading agent.

This is a thin adapter. Every request rule — loopback restriction, origin check,
method gate, content-type gate, body cap, rate limiting, provider mapping — lives
in `ReadingService` so the decision order matches the original middleware 1:1.
Here we only translate HTTP in and out.

Run it from the `frontend` directory:

    python -m backend.app
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import Response

from .readings import READING_PROMPT_VERSION, REQUEST_BODY_LIMIT, ReadingService

_PACKAGE_DIR = Path(__file__).resolve().parent
_ENV_FILE = _PACKAGE_DIR.parent / ".env.local"

AGENT_PATHS = (
    "/api/readings/interpret",
    "/api/readings/debug",
    "/api/readings/status",
    "/api/spreads/recommend",
)

#: Default port the Vite dev server proxies `/api` to.
DEFAULT_PORT = 8787


def load_env_file(path: Path) -> dict[str, str]:
    """Minimal `.env` reader, matching how Vite parsed `frontend/.env.local`."""
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values[key.strip()] = value
    return values


def resolve_settings() -> dict[str, Any]:
    """Environment variables win over `.env.local`, exactly as the Vite build did."""
    file_values = load_env_file(_ENV_FILE)

    def setting(name: str, fallback: str | None = None) -> str | None:
        return os.environ.get(name) or file_values.get(name) or fallback

    return {
        "api_key": setting("DEEPSEEK_API_KEY"),
        "model": setting("DEEPSEEK_MODEL", "deepseek-flash"),
        "port": int(setting("STARVEIL_AGENT_PORT", str(DEFAULT_PORT)) or DEFAULT_PORT),
    }


def serialize(payload: Any) -> str:
    """Compact JSON without ASCII escaping, matching `JSON.stringify`."""
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def create_app(service: ReadingService | None = None, settings: dict[str, Any] | None = None) -> FastAPI:
    # Settings — and therefore the API key file — are only read when the caller did
    # not already supply a service. Tests inject their own service and never touch
    # `frontend/.env.local`.
    if service is None:
        settings = settings if settings is not None else resolve_settings()
        service = ReadingService(api_key=settings["api_key"], model=settings["model"])
    app = FastAPI(title="Starveil reading agent", version=READING_PROMPT_VERSION)
    app.state.service = service

    async def _read_body(request: Request) -> bytes:
        """Read at most one byte past the cap, so the service can answer 413."""
        chunks: list[bytes] = []
        size = 0
        async for chunk in request.stream():
            chunks.append(chunk)
            size += len(chunk)
            if size > REQUEST_BODY_LIMIT:
                break
        return b"".join(chunks)

    @app.api_route(
        "/{path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    )
    async def agent_route(request: Request, path: str) -> Response:
        client = request.client
        status, payload = await service.handle(
            "/" + path,
            request.method,
            {key.lower(): value for key, value in request.headers.items()},
            client.host if client else None,
            await _read_body(request),
            is_disconnected=request.is_disconnected,
        )
        return Response(
            content=serialize(payload),
            status_code=status,
            media_type="application/json; charset=utf-8",
            headers={"Cache-Control": "no-store"},
        )

    return app


def main() -> None:
    import uvicorn

    settings = resolve_settings()
    if not settings["api_key"]:
        print("提醒：未检测到 DEEPSEEK_API_KEY，解读接口会返回 provider_not_configured。")
    print(f"Starveil agent listening on http://127.0.0.1:{settings['port']}")
    uvicorn.run(
        create_app(settings=settings),
        host="127.0.0.1",
        port=settings["port"],
        log_level="warning",
    )


if __name__ == "__main__":
    main()

"""Local agent configuration endpoint.

The reading agent authenticates to DeepSeek with `DEEPSEEK_API_KEY`, which the
user previously had to place in `frontend/.env.local` by hand. This module adds a
loopback-only endpoint that does the same write from the app's own settings UI.

**Why this is not part of `ReadingService`.** `backend/README.md` records a
non-negotiable: `readings.py` is a behaviour-preserving port of the JavaScript
original, and every validation gate, error message and ordering rule must stay
comparable line by line. A new endpoint is new behaviour, so it lives beside the
service instead of inside it, and `readings.py` is left untouched.

Threat model. `/api/readings/config` writes a credential, so it needs to be
reachable only from a page the user actually opened on this machine:

* the TCP client must be loopback (same rule as `ReadingService`);
* `Origin`, when present, must match the `Host` header (same rule as the service);
* the `Host` header itself must name a loopback host. This is the check the
  service does not have, and the one that matters here: under DNS rebinding a
  hostile page makes `evil.example` resolve to 127.0.0.1, which makes `Origin`
  and `Host` agree with each other, so the origin comparison alone lets it pass.
  A Host allowlist is not spoofable that way.

The key is written to disk and never sent back to the browser — no echo, no mask.
The UI only learns whether a key exists, where it came from, and whether this
endpoint may change it.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from .readings import ReadingService, _parse_origin

API_KEY_NAME = "DEEPSEEK_API_KEY"
MODEL_NAME = "DEEPSEEK_MODEL"
DEFAULT_MODEL = "deepseek-flash"

#: Path the Vite dev server proxies to this agent.
CONFIG_PATH = "/api/readings/config"

#: A provider key and a model id are single-line tokens; anything else is either a
#: mistake or an attempt to inject extra lines into `.env.local`.
MAX_KEY_CHARS = 512
MAX_MODEL_CHARS = 64
MAX_BODY_BYTES = 4_096
MODEL_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")

#: Host names this endpoint accepts. The app is opened on one of these; the Vite
#: proxy forwards the browser's `Host` header unchanged (`changeOrigin: false`).
DEFAULT_ALLOWED_HOSTS = ("localhost", "127.0.0.1", "[::1]", "::1", "terminal.local")
ALLOWED_HOSTS_ENV = "STARVEIL_CONFIG_HOSTS"

#: Sentinel for "this key was not present in the request body".
_MISSING = object()


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


def update_env_file(path: Path, updates: dict[str, str | None]) -> None:
    """Set or remove keys in a `.env` file, preserving every other line.

    `None` removes the key. Comments, blank lines, ordering and unrelated
    variables are kept byte for byte, because this is a file the user also edits
    by hand. The write is atomic and the file is created with 0600.
    """
    remaining = dict(updates)
    written: list[str] = []
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            name = stripped.partition("=")[0].strip() if "=" in stripped and not stripped.startswith("#") else None
            if name is not None and name in remaining:
                value = remaining.pop(name)
                if value is not None:
                    written.append(f"{name}={value}")
                continue
            written.append(line)
    for name, value in remaining.items():
        if value is not None:
            written.append(f"{name}={value}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text("\n".join(written) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def allowed_hosts(environ: dict[str, str] | None = None) -> set[str]:
    """Loopback host names, plus anything listed in `STARVEIL_CONFIG_HOSTS`.

    Entries are normalized the same way `Host` headers are, so a value may be
    written with or without a port (`starveil.local` and `starveil.local:5173`
    both work).
    """
    extra = (environ if environ is not None else os.environ).get(ALLOWED_HOSTS_ENV) or ""
    names = {host_name(name) for name in extra.split(",") if name.strip()}
    return {host_name(name) for name in DEFAULT_ALLOWED_HOSTS} | names


def host_name(host_header: str) -> str:
    """Strip the port from a `Host` header, keeping IPv6 addresses intact."""
    host = (host_header or "").strip().lower()
    if host.startswith("["):
        return host.partition("]")[0] + "]"
    if host.count(":") > 1:
        # A bare IPv6 literal: every colon belongs to the address, not a port.
        return host
    return host.partition(":")[0]


class AgentConfigEndpoint:
    """Reads and writes the local agent credentials the settings UI can change."""

    def __init__(
        self,
        service: ReadingService,
        env_path: Path,
        environ: dict[str, str] | None = None,
        allowed_host_names: set[str] | None = None,
    ) -> None:
        self.service = service
        self.env_path = env_path
        self.environ = environ if environ is not None else os.environ
        self.allowed_host_names = allowed_host_names if allowed_host_names is not None else allowed_hosts(self.environ)

    # -- state -------------------------------------------------------------

    def _env_key(self) -> str | None:
        return self.environ.get(API_KEY_NAME) or None

    def _file_values(self) -> dict[str, str]:
        return load_env_file(self.env_path)

    def snapshot(self) -> dict[str, Any]:
        """What the UI is allowed to know. Never includes the key itself."""
        file_values = self._file_values()
        env_key = self._env_key()
        file_key = file_values.get(API_KEY_NAME) or None
        if env_key:
            source = "env"
        elif file_key:
            source = "file"
        else:
            source = "none"
        # `configured` describes the running service, not the file: a key typed
        # into `.env.local` by hand after startup is on disk but not in memory.
        configured = bool(self.service.api_key)
        return {
            "configured": configured,
            "model": self.service.model,
            "source": source,
            "editable": not env_key,
            "restartRequired": bool(file_key) and not configured and not env_key,
        }

    # -- request handling --------------------------------------------------

    async def handle(
        self,
        method: str,
        headers: dict[str, str],
        client_host: str | None,
        body_bytes: bytes,
    ) -> tuple[int, dict[str, Any]]:
        if method not in ("GET", "POST", "DELETE"):
            return 405, {"error": "请使用 GET、POST 或 DELETE 请求。"}
        if client_host not in ReadingService.LOOPBACK_ADDRESSES:
            return 403, {"error": "此配置接口仅供本机使用。"}
        origin = headers.get("origin")
        if origin:
            parsed = _parse_origin(origin)
            if parsed is None:
                return 403, {"error": "请求来源无效。"}
            origin_host, scheme = parsed
            if origin_host != headers.get("host") or scheme not in ("http:", "https:"):
                return 403, {"error": "不允许跨站调用。"}
        if host_name(headers.get("host", "")) not in self.allowed_host_names:
            return 403, {
                "error": "配置文件只接受本机地址访问，请用 http://localhost:5173 打开后再设置。",
                "code": "config_host_not_allowed",
            }
        if method == "GET":
            return 200, self.snapshot()

        if self._env_key():
            return 409, {
                "error": "当前密钥由启动时的环境变量提供，界面写入不会生效。请先取消该环境变量，或继续用环境变量管理密钥。",
                "code": "config_env_locked",
            }
        if method == "DELETE":
            # A bodyless DELETE carries no Content-Type, so this comes before the gate.
            return 200, self._apply({API_KEY_NAME: None})
        if not (headers.get("content-type") or "").startswith("application/json"):
            return 415, {"error": "请发送 JSON 请求。"}
        if len(body_bytes) > MAX_BODY_BYTES:
            return 413, {"error": "配置内容过长。"}

        try:
            body = json.loads(body_bytes.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return 400, {"error": "请求内容不是有效 JSON。"}
        if not isinstance(body, dict):
            return 400, {"error": "请求内容不是有效 JSON。"}

        key: str | None | object = body.get("apiKey", _MISSING)
        model = body.get("model", _MISSING)
        if key is _MISSING and model is _MISSING:
            return 400, {"error": "没有需要保存的配置。"}

        updates: dict[str, str | None] = {}
        if key is not _MISSING:
            if key is not None and not isinstance(key, str):
                return 400, {"error": "密钥格式不正确。"}
            cleaned = (key or "").strip()
            if cleaned and len(cleaned) > MAX_KEY_CHARS:
                return 400, {"error": "密钥过长，请确认复制完整。"}
            if cleaned != cleaned.replace("\n", "").replace("\r", "") or any(ord(char) < 32 for char in cleaned):
                return 400, {"error": "密钥不能包含换行或控制字符。"}
            updates[API_KEY_NAME] = cleaned or None
        if model is not _MISSING:
            if model is not None and not isinstance(model, str):
                return 400, {"error": "模型名称格式不正确。"}
            cleaned_model = (model or "").strip()
            if not MODEL_PATTERN.match(cleaned_model):
                return 400, {"error": "模型名称只能包含字母、数字、点、下划线、冒号和连字符。"}
            updates[MODEL_NAME] = cleaned_model
        return 200, self._apply(updates)

    def _apply(self, updates: dict[str, str | None]) -> dict[str, Any]:
        """Write the file and hot-reload the running service. No restart needed."""
        update_env_file(self.env_path, updates)
        if API_KEY_NAME in updates:
            self.service.api_key = updates[API_KEY_NAME] or None
        if MODEL_NAME in updates and updates[MODEL_NAME]:
            self.service.model = updates[MODEL_NAME]
        return self.snapshot()

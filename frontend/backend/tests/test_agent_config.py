"""Tests for the local agent configuration endpoint (`backend/agent_config.py`).

This suite is new, not a port: `/api/readings/config` has no JavaScript original.

Two levels are exercised on purpose.

* Real HTTP for everything that touches the wire — status codes, the origin gate,
  body limits, the JSON envelope — using the same uvicorn-based harness as the
  ported suite.
* Direct `AgentConfigEndpoint.handle` calls for the TCP client rule, because a
  test cannot make uvicorn believe the connection came from another host.

Every test points the endpoint at a temporary `.env.local`; the real one is never
read or written.

Run from `frontend`:

    backend/.venv/bin/python -m pytest backend/tests/test_agent_config.py -q
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest
import uvicorn

from backend.agent_config import CONFIG_PATH, AgentConfigEndpoint, update_env_file
from backend.app import create_app
from backend.readings import ReadingService

SECRET = "sk-secret-value-that-must-never-be-echoed"
HOST_HEADERS = {"Host": "localhost:5173"}


class RunningConfigAgent:
    """A real HTTP server whose config endpoint writes to `env_path`."""

    def __init__(
        self,
        env_path: Path,
        api_key: str | None = None,
        environ: dict[str, str] | None = None,
        transport=None,
    ):
        self.service = ReadingService(api_key=api_key, model="deepseek-flash", transport=transport)
        self.endpoint = AgentConfigEndpoint(service=self.service, env_path=env_path, environ=environ or {})
        config = uvicorn.Config(
            create_app(service=self.service, settings={}, config_path=env_path, environ=environ or {}),
            host="127.0.0.1",
            port=0,
            log_level="error",
        )
        self.server = uvicorn.Server(config)
        self.thread = threading.Thread(target=self.server.run, daemon=True)

    def __enter__(self):
        self.thread.start()
        deadline = time.monotonic() + 10
        while not self.server.started:
            if time.monotonic() > deadline:
                raise RuntimeError("agent did not start")
            time.sleep(0.02)
        port = self.server.servers[0].sockets[0].getsockname()[1]
        self.url = f"http://127.0.0.1:{port}"
        return self

    def __exit__(self, *exc):
        self.server.should_exit = True
        self.thread.join(timeout=10)

    def send(self, method, path, body=None, headers=None):
        payload = None
        if body is not None:
            payload = body.encode("utf-8") if isinstance(body, str) else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            self.url + path,
            data=payload,
            headers={"Content-Type": "application/json", **HOST_HEADERS, **(headers or {})},
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read().decode("utf-8"))

    def get(self, path=CONFIG_PATH, headers=None):
        return self.send("GET", path, None, headers)

    def post(self, body, headers=None, path=CONFIG_PATH):
        return self.send("POST", path, body, headers)

    def delete(self, path=CONFIG_PATH, headers=None):
        return self.send("DELETE", path, None, headers)


@pytest.fixture()
def env_path(tmp_path: Path) -> Path:
    """A `.env.local` that already holds the user's own lines."""
    path = tmp_path / ".env.local"
    path.write_text(
        "# 本机配置\nDEEPSEEK_MODEL=deepseek-flash\nVITE_READING_ENDPOINT=/api/readings/interpret\n",
        encoding="utf-8",
    )
    return path


def test_status_reports_missing_configuration_without_a_key(env_path: Path):
    with RunningConfigAgent(env_path) as agent:
        status, result = agent.get()
    assert status == 200
    assert result == {
        "configured": False,
        "model": "deepseek-flash",
        "source": "none",
        "editable": True,
        "restartRequired": False,
    }


def test_saving_a_key_writes_the_env_file_and_keeps_the_users_own_lines(env_path: Path):
    with RunningConfigAgent(env_path) as agent:
        status, result = agent.post({"apiKey": f"  {SECRET}  "})
    assert status == 200
    assert result["configured"] is True
    assert result["source"] == "file"
    assert result["editable"] is True
    # Comments, ordering and unrelated variables survive the rewrite.
    assert env_path.read_text(encoding="utf-8") == (
        "# 本机配置\n"
        "DEEPSEEK_MODEL=deepseek-flash\n"
        "VITE_READING_ENDPOINT=/api/readings/interpret\n"
        f"DEEPSEEK_API_KEY={SECRET}\n"
    )
    # The secret file is not world readable.
    assert oct(env_path.stat().st_mode)[-3:] == "600"


def test_saving_a_key_updates_the_running_service_without_a_restart(env_path: Path):
    def transport(*, url, headers, body, timeout_seconds):
        """Records that the provider was reached, then fails authentication."""
        assert headers["Authorization"] == f"Bearer {SECRET}"
        return 401, "upstream auth failure"

    with RunningConfigAgent(env_path, transport=transport) as agent:
        assert agent.service.api_key is None
        agent.post({"apiKey": SECRET, "model": "deepseek-chat"})
        assert agent.service.api_key == SECRET
        assert agent.service.model == "deepseek-chat"
        # `interpret` is live immediately: the key reaches the provider, so the
        # answer is an auth failure rather than `provider_not_configured`.
        status, result = agent.post(
            {"question": "我该如何安排这周？", "cards": [{"id": "m08", "reversed": False, "position": "建议"}]},
            path="/api/readings/interpret",
        )
    assert status == 502
    assert result["code"] == "provider_auth"


def test_saving_a_partial_update_keeps_the_other_values(env_path: Path):
    with RunningConfigAgent(env_path) as agent:
        agent.post({"apiKey": SECRET})
        _, result = agent.post({"model": "deepseek-reasoner"})
    assert result == {
        "configured": True,
        "model": "deepseek-reasoner",
        "source": "file",
        "editable": True,
        "restartRequired": False,
    }
    text = env_path.read_text(encoding="utf-8")
    assert "DEEPSEEK_MODEL=deepseek-reasoner" in text
    assert f"DEEPSEEK_API_KEY={SECRET}" in text


def test_clearing_the_key_removes_only_the_key_line(env_path: Path):
    with RunningConfigAgent(env_path) as agent:
        agent.post({"apiKey": SECRET})
        status, result = agent.delete()
        assert status == 200
        assert result["configured"] is False
        assert result["source"] == "none"
        assert agent.service.api_key is None
    assert env_path.read_text(encoding="utf-8") == (
        "# 本机配置\nDEEPSEEK_MODEL=deepseek-flash\nVITE_READING_ENDPOINT=/api/readings/interpret\n"
    )


def test_a_bodyless_delete_works_without_a_content_type(env_path: Path):
    with RunningConfigAgent(env_path) as agent:
        agent.post({"apiKey": SECRET})
        status, _ = agent.send("DELETE", CONFIG_PATH, None, {"Content-Type": ""})
    assert status == 200
    assert "DEEPSEEK_API_KEY" not in env_path.read_text(encoding="utf-8")


def test_saved_key_is_never_echoed_back_to_the_browser(env_path: Path):
    with RunningConfigAgent(env_path) as agent:
        _, saved = agent.post({"apiKey": SECRET})
        _, read = agent.get()
    assert SECRET not in json.dumps(saved, ensure_ascii=False)
    assert SECRET not in json.dumps(read, ensure_ascii=False)
    assert set(saved) == {"configured", "model", "source", "editable", "restartRequired"}


def test_environment_variables_lock_the_endpoint_against_writes(env_path: Path):
    original = env_path.read_text(encoding="utf-8")
    with RunningConfigAgent(env_path, api_key="sk-from-env", environ={"DEEPSEEK_API_KEY": "sk-from-env"}) as agent:
        _, read = agent.get()
        post_status, post_result = agent.post({"apiKey": SECRET})
        delete_status, _ = agent.delete()
    assert read["source"] == "env"
    assert read["editable"] is False
    assert post_status == 409
    assert post_result["code"] == "config_env_locked"
    assert delete_status == 409
    assert env_path.read_text(encoding="utf-8") == original


def test_hand_edited_file_is_reported_as_needing_a_restart(env_path: Path):
    with RunningConfigAgent(env_path) as agent:
        # Written while the service is running: on disk, but not in memory.
        env_path.write_text(env_path.read_text(encoding="utf-8") + f"DEEPSEEK_API_KEY={SECRET}\n", encoding="utf-8")
        _, result = agent.get()
    assert result["configured"] is False
    assert result["source"] == "file"
    assert result["restartRequired"] is True


def test_rejects_keys_that_would_inject_extra_env_lines(env_path: Path):
    original = env_path.read_text(encoding="utf-8")
    with RunningConfigAgent(env_path) as agent:
        for payload in ("a\nDEEPSEEK_MODEL=hacked", "a\r\nDEEPSEEK_MODEL=hacked", "a\x00b"):
            status, result = agent.post({"apiKey": payload})
            assert status == 400, payload
            assert "换行" in result["error"] or "控制字符" in result["error"]
        assert env_path.read_text(encoding="utf-8") == original


def test_rejects_malformed_models_and_oversized_keys(env_path: Path):
    with RunningConfigAgent(env_path) as agent:
        assert agent.post({"model": "bad model!"})[0] == 400
        assert agent.post({"model": ""})[0] == 400
        assert agent.post({"apiKey": "x" * 513})[0] == 400
        assert agent.post({})[0] == 400


def test_rejects_unparsable_and_oversized_bodies(env_path: Path):
    with RunningConfigAgent(env_path) as agent:
        assert agent.post("{")[0] == 400
        assert agent.post(json.dumps({"apiKey": "x" * 5_000}))[0] == 413
        assert agent.post([1, 2, 3])[0] == 400
        assert agent.post({"apiKey": SECRET}, {"Content-Type": "text/plain"})[0] == 415


def test_blocks_cross_origin_writes(env_path: Path):
    original = env_path.read_text(encoding="utf-8")
    with RunningConfigAgent(env_path) as agent:
        status, result = agent.post({"apiKey": SECRET}, {"Origin": "https://outside.example"})
    assert status == 403
    assert result["error"] == "不允许跨站调用。"
    assert env_path.read_text(encoding="utf-8") == original


def test_allows_the_matching_origin_it_was_served_from(env_path: Path):
    with RunningConfigAgent(env_path) as agent:
        status, _ = agent.post({"apiKey": SECRET}, {"Origin": "http://localhost:5173"})
    assert status == 200


def test_only_get_post_and_delete_are_accepted(env_path: Path):
    with RunningConfigAgent(env_path) as agent:
        status, _ = agent.send("PUT", CONFIG_PATH, {"apiKey": SECRET})
    assert status == 405


def test_other_agent_paths_are_unaffected_by_the_config_endpoint(env_path: Path):
    with RunningConfigAgent(env_path, api_key="test-secret") as agent:
        assert agent.get("/api/readings/status")[1] == {
            "configured": True,
            "provider": "DeepSeek",
            "model": "deepseek-flash",
        }


def test_unknown_paths_still_answer_404(env_path: Path):
    with RunningConfigAgent(env_path) as agent:
        assert agent.get("/api/readings/config-typo")[0] == 404


def handle(endpoint: AgentConfigEndpoint, method: str, headers: dict, client: str | None, body=None):
    """Call the endpoint without HTTP, for rules the transport cannot simulate."""
    payload = b"" if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode("utf-8"))
    return asyncio.run(endpoint.handle(method, headers, client, payload))


def test_rejects_hosts_that_are_not_loopback(env_path: Path):
    """Under DNS rebinding `Origin` and `Host` agree, so the host list is the gate."""
    endpoint = AgentConfigEndpoint(service=ReadingService(), env_path=env_path, environ={})
    status, result = handle(
        endpoint,
        "POST",
        {"content-type": "application/json", "host": "evil.example", "origin": "http://evil.example"},
        "127.0.0.1",
        {"apiKey": SECRET},
    )
    assert status == 403
    assert result["code"] == "config_host_not_allowed"
    assert not env_path.read_text(encoding="utf-8").endswith(f"DEEPSEEK_API_KEY={SECRET}\n")


def test_accepts_the_loopback_host_forms_the_app_is_served_on(env_path: Path):
    for host in ("localhost:5173", "127.0.0.1:5173", "[::1]:5173", "terminal.local:5173"):
        endpoint = AgentConfigEndpoint(service=ReadingService(), env_path=env_path, environ={})
        status, _ = handle(
            endpoint,
            "POST",
            {"content-type": "application/json", "host": host, "origin": f"http://{host}"},
            "127.0.0.1",
            {"apiKey": SECRET},
        )
        assert status == 200, host


def test_extra_hosts_can_be_opted_in_by_environment(env_path: Path):
    endpoint = AgentConfigEndpoint(
        service=ReadingService(),
        env_path=env_path,
        environ={"STARVEIL_CONFIG_HOSTS": "starveil.local:5173"},
    )
    status, _ = handle(
        endpoint,
        "POST",
        {"content-type": "application/json", "host": "starveil.local:5173"},
        "127.0.0.1",
        {"apiKey": SECRET},
    )
    assert status == 200


def test_rejects_clients_that_are_not_on_loopback(env_path: Path):
    endpoint = AgentConfigEndpoint(service=ReadingService(), env_path=env_path, environ={})
    for client in ("192.168.1.9", "10.0.0.4", None):
        status, result = handle(
            endpoint,
            "POST",
            {"content-type": "application/json", "host": "localhost:5173"},
            client,
            {"apiKey": SECRET},
        )
        assert status == 403, client
        assert result["error"] == "此配置接口仅供本机使用。"


def test_update_env_file_can_create_the_file(env_path: Path):
    missing = env_path.parent / "nested" / ".env.local"
    update_env_file(missing, {"DEEPSEEK_API_KEY": SECRET, "DEEPSEEK_MODEL": None})
    assert missing.read_text(encoding="utf-8") == f"DEEPSEEK_API_KEY={SECRET}\n"
    assert oct(missing.stat().st_mode)[-3:] == "600"

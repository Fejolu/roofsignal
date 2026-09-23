import json
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace

import pytest

from tools import supabase_release

ROOT = Path(__file__).resolve().parents[1]


def test_invoice_automation_is_part_of_the_controlled_release():
    manifest = json.loads((ROOT / "supabase" / "release-manifest.json").read_text())
    assert "process-scheduled-invoices" in manifest["functions"]
    assert "INVOICE_AUTOMATION_SECRET" in manifest["required_secrets"]


def test_captured_command_keeps_stderr_out_of_json(monkeypatch, capsys):
    def fake_run(*args, **kwargs):
        assert kwargs["stdout"] is supabase_release.subprocess.PIPE
        assert kwargs["stderr"] is supabase_release.subprocess.PIPE
        return SimpleNamespace(
            returncode=0,
            stdout='[{"id":"roofsignal-project"}]\n',
            stderr="A newer Supabase CLI is available.\n",
        )

    monkeypatch.setattr(supabase_release.subprocess, "run", fake_run)

    output = supabase_release.run(["supabase", "projects", "list"], capture=True)

    assert output == '[{"id":"roofsignal-project"}]\n'
    assert "newer Supabase CLI" in capsys.readouterr().err


def test_regular_command_captures_diagnostics_and_echoes_success(monkeypatch, capsys):
    def fake_run(*args, **kwargs):
        assert kwargs["stdout"] is supabase_release.subprocess.PIPE
        assert kwargs["stderr"] is supabase_release.subprocess.PIPE
        return SimpleNamespace(returncode=0, stdout="migration applied\n", stderr="")

    monkeypatch.setattr(supabase_release.subprocess, "run", fake_run)

    output = supabase_release.run(["supabase", "db", "push"])

    assert output == "migration applied\n"
    assert "migration applied" in capsys.readouterr().out


def test_failed_command_reports_stdout_and_stderr(monkeypatch):
    def fake_run(*args, **kwargs):
        return SimpleNamespace(returncode=1, stdout="stdout detail\n", stderr="stderr detail\n")

    monkeypatch.setattr(supabase_release.subprocess, "run", fake_run)

    try:
        supabase_release.run(["supabase", "projects", "list"], capture=True)
    except supabase_release.ReleaseError as error:
        message = str(error)
    else:
        raise AssertionError("ReleaseError expected")

    assert "stdout detail" in message
    assert "stderr detail" in message


@pytest.mark.parametrize("failure", [
    ConnectionResetError(104, "Connection reset by peer"),
    supabase_release.urllib.error.URLError("timed out"),
    404, 408, 429, 503,
])
def test_smoke_check_recovers_from_temporary_failure_without_sending_mail(monkeypatch, failure):
    requests = []
    delays = []

    def fake_urlopen(request, *, timeout):
        requests.append(request)
        assert timeout == 15
        if len(requests) == 1:
            if isinstance(failure, int):
                raise supabase_release.urllib.error.HTTPError(request.full_url, failure, "temporary", {}, None)
            raise failure
        return nullcontext(SimpleNamespace(status=200))

    monkeypatch.setattr(supabase_release.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(supabase_release.time, "sleep", delays.append)

    supabase_release.smoke_test_functions({"project_ref": "test", "functions": ["send-lead-notification"]})

    assert len(requests) == 2
    assert delays == [2]
    assert all(request.get_method() == "OPTIONS" and request.data is None for request in requests)


@pytest.mark.parametrize("failure", [ConnectionResetError("connection reset"), 404, 429, 503])
def test_smoke_check_still_fails_on_persistent_errors_and_checks_other_functions(monkeypatch, failure):
    requests = []
    delays = []

    def fake_urlopen(request, *, timeout):
        requests.append(request.full_url)
        if request.full_url.endswith("/healthy"):
            return nullcontext(SimpleNamespace(status=200))
        if isinstance(failure, int):
            raise supabase_release.urllib.error.HTTPError(request.full_url, failure, "unavailable", {}, None)
        raise failure

    monkeypatch.setattr(supabase_release.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(supabase_release.time, "sleep", delays.append)

    with pytest.raises(supabase_release.ReleaseError, match=r"unavailable: .*na 3 poging"):
        supabase_release.smoke_test_functions({"project_ref": "test", "functions": ["unavailable", "healthy"]})

    assert len(requests) == 4
    assert requests[-1].endswith("/healthy")
    assert delays == [2, 5]


@pytest.mark.parametrize("status", [200, 204, 401, 403, 405])
def test_smoke_check_accepts_reachable_protected_or_post_only_endpoint(monkeypatch, status):
    def fake_urlopen(request, *, timeout):
        if status >= 400:
            raise supabase_release.urllib.error.HTTPError(request.full_url, status, "protected", {}, None)
        return nullcontext(SimpleNamespace(status=status))

    monkeypatch.setattr(supabase_release.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(supabase_release.time, "sleep", lambda _: pytest.fail("Unexpected retry"))
    supabase_release.smoke_test_functions({"project_ref": "test", "functions": ["protected"]})


def test_smoke_check_rejects_unexpected_client_error_without_retry(monkeypatch):
    def fake_urlopen(request, *, timeout):
        raise supabase_release.urllib.error.HTTPError(request.full_url, 400, "bad request", {}, None)

    monkeypatch.setattr(supabase_release.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(supabase_release.time, "sleep", lambda _: pytest.fail("Unexpected retry"))
    with pytest.raises(supabase_release.ReleaseError, match=r"HTTP 400 .*na 1 poging"):
        supabase_release.smoke_test_functions({"project_ref": "test", "functions": ["bad-request"]})

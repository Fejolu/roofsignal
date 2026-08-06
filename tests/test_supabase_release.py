from types import SimpleNamespace

from tools import supabase_release


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

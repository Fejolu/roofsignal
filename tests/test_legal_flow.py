from pathlib import Path
import subprocess


def test_legal_and_privacy_behavior():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(['node', '--test', 'tests/legal-flow.test.mjs'], cwd=root,
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr

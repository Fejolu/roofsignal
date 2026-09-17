"""Run the actual shared request/confirmation logic with Node's built-in test runner."""
from pathlib import Path
import subprocess


def test_parken_offer_request_and_confirmation_behavior():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(['node', '--test', 'tests/parken-offer.test.mjs'], cwd=root,
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr

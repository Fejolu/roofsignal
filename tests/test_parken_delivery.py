import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_parken_delivery_behaviour():
    node = shutil.which('node')
    assert node, 'Node.js is required to verify the booking delivery contract.'
    result = subprocess.run([node, '--test', 'tests/parken-delivery.test.mjs'], cwd=ROOT,
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr

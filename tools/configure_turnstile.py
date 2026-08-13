#!/usr/bin/env python3
"""Set the public Turnstile sitekey without ever handling the secret key."""

from pathlib import Path
import re
import sys

path = Path(__file__).resolve().parents[1] / "assets" / "supabase-config.js"
sitekey = sys.argv[1].strip() if len(sys.argv) > 1 else ""
if not re.fullmatch(r"[A-Za-z0-9_-]{20,80}", sitekey):
    raise SystemExit("Geef een geldige publieke Turnstile sitekey op.")
source = path.read_text(encoding="utf-8")
source, count = re.subn(r'turnstileSiteKey: "[^"]*"', f'turnstileSiteKey: "{sitekey}"', source)
if count != 1:
    raise SystemExit("Turnstile-configuratieregel niet eenduidig gevonden.")
path.write_text(source, encoding="utf-8")
print("Publieke Turnstile sitekey ingesteld.")

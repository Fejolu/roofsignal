#!/usr/bin/env python3
"""Deliver pending KVK budget warnings without making KVK API requests."""
import json
import os
import re
from pathlib import Path
import urllib.error
import urllib.request

PROJECT = "kakpticlxlaxtebhsuoh"


def request_json(url, headers, body=None):
    request = urllib.request.Request(
        url,
        headers=headers,
        data=None if body is None else json.dumps(body).encode(),
    )
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"KVK warning worker HTTP {error.code}") from None
    except (urllib.error.URLError, ValueError):
        # Provider error bodies may contain credentials. Keep action logs generic.
        raise RuntimeError("KVK warning worker request failed") from None


def main():
    token = os.environ["SUPABASE_ACCESS_TOKEN"]
    keys = request_json(
        f"https://api.supabase.com/v1/projects/{PROJECT}/api-keys",
        {"Authorization": f"Bearer {token}"},
    )
    service_key = next(key["api_key"] for key in keys if key["name"] == "service_role")
    config = (Path(__file__).resolve().parents[1] / 'assets/supabase-config.js').read_text()
    public_key = re.search(r'anonKey:\s*"([^"]+)"', config).group(1)
    result = request_json(
        f"https://{PROJECT}.supabase.co/functions/v1/vve-kvk/budget-alerts",
        {"Authorization": f"Bearer {public_key}", "apikey": public_key, "x-roofsignal-budget-worker": service_key, "Content-Type": "application/json"},
        {},
    )
    if not isinstance(result.get("sent"), bool):
        raise RuntimeError("KVK warning worker returned an invalid result")
    print("Budget warning delivered" if result["sent"] else "No pending budget warning")


if __name__ == "__main__":
    main()

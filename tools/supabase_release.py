#!/usr/bin/env python3
"""Fail-safe Supabase preflight and production release for RoofSignal."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SUPABASE = ROOT / "supabase"
MANIFEST_PATH = SUPABASE / "release-manifest.json"
MIGRATION_RE = re.compile(r"^(\d{14})_[a-z0-9_]+\.sql$")
SECRET_PATTERNS = (
    re.compile(r"sbp_[A-Za-z0-9_-]{20,}"),
    re.compile(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}"),
)


class ReleaseError(RuntimeError):
    pass


def run(command: list[str], *, env: dict[str, str] | None = None, capture: bool = False) -> str:
    printable = " ".join(command)
    print(f"→ {printable}")
    result = subprocess.run(
        command,
        cwd=ROOT,
        env=env,
        check=False,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
    )
    if result.returncode:
        detail = (result.stdout or "").strip()
        raise ReleaseError(f"Commando mislukt ({result.returncode}): {printable}\n{detail}")
    return result.stdout or ""


def load_manifest() -> dict:
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ReleaseError(f"Ongeldig release-manifest: {exc}") from exc
    if not manifest.get("project_ref") or not manifest.get("functions"):
        raise ReleaseError("Het release-manifest mist project_ref of functions.")
    return manifest


def static_preflight(manifest: dict) -> None:
    errors: list[str] = []
    migrations = sorted((SUPABASE / "migrations").glob("*.sql"))
    timestamps: dict[str, str] = {}
    if not migrations:
        errors.append("Geen database-migraties gevonden.")
    for migration in migrations:
        match = MIGRATION_RE.match(migration.name)
        if not match:
            errors.append(f"Ongeldige migratienaam: {migration.name}")
            continue
        timestamp = match.group(1)
        if timestamp in timestamps:
            errors.append(f"Dubbele migratievolgorde: {timestamps[timestamp]} en {migration.name}")
        timestamps[timestamp] = migration.name

    function_root = SUPABASE / "functions"
    actual = sorted(
        path.name for path in function_root.iterdir()
        if path.is_dir() and not path.name.startswith("_") and (path / "index.ts").exists()
    )
    expected = sorted(manifest["functions"])
    if actual != expected:
        errors.append(
            "Functielijst wijkt af van het manifest. "
            f"Ontbrekend in manifest: {sorted(set(actual) - set(expected))}; "
            f"ontbrekend op schijf: {sorted(set(expected) - set(actual))}."
        )

    for path in list(SUPABASE.rglob("*.sql")) + list(function_root.rglob("*.ts")):
        content = path.read_text(encoding="utf-8", errors="ignore")
        if any(pattern.search(content) for pattern in SECRET_PATTERNS):
            errors.append(f"Mogelijk geheim aangetroffen in {path.relative_to(ROOT)}")

    linked_ref = SUPABASE / ".temp" / "project-ref"
    if linked_ref.exists():
        value = linked_ref.read_text(encoding="utf-8").strip()
        if value != manifest["project_ref"]:
            errors.append(f"Project is gekoppeld aan {value}, verwacht {manifest['project_ref']}.")

    if errors:
        raise ReleaseError("Voorcontrole mislukt:\n- " + "\n- ".join(errors))
    print(f"✓ {len(migrations)} migraties en {len(actual)} Edge Functions gecontroleerd")


def check_cli_and_project(manifest: dict, env: dict[str, str] | None = None) -> None:
    if not shutil.which("supabase"):
        raise ReleaseError("Supabase CLI is niet geïnstalleerd.")
    run(["supabase", "--version"])
    if not (env or os.environ).get("SUPABASE_ACCESS_TOKEN"):
        print("! Online projectcontrole overgeslagen; zet SUPABASE_ACCESS_TOKEN voor die controle.")
        return
    projects = run(
        ["supabase", "projects", "list", "--output", "json"],
        env=env,
        capture=True,
    )
    try:
        project_refs = {item["id"] for item in json.loads(projects)}
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise ReleaseError("Projectlijst van Supabase kon niet worden gelezen.") from exc
    if manifest["project_ref"] not in project_refs:
        raise ReleaseError("Ingelogde Supabase-gebruiker heeft geen toegang tot het RoofSignal-project.")
    print("✓ Supabase-account en projectkoppeling gecontroleerd")


def require_release_credentials() -> dict[str, str]:
    missing = [name for name in ("SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD") if not os.getenv(name)]
    if missing:
        raise ReleaseError(
            "Publicatie afgebroken; ontbrekende tijdelijke omgevingsvariabelen: " + ", ".join(missing)
        )
    return os.environ.copy()


def check_remote_secrets(manifest: dict, env: dict[str, str]) -> None:
    output = run(
        ["supabase", "secrets", "list", "--project-ref", manifest["project_ref"], "--output", "json"],
        env=env,
        capture=True,
    )
    try:
        items = json.loads(output)
        available = {item["name"] for item in items}
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise ReleaseError("De ingestelde Supabase-secrets konden niet worden gecontroleerd.") from exc
    missing = sorted(set(manifest["required_secrets"]) - available)
    if missing:
        raise ReleaseError("Publicatie afgebroken; ontbrekende Supabase-secrets: " + ", ".join(missing))
    print("✓ Benodigde productie-secrets zijn aanwezig (waarden niet uitgelezen)")


def smoke_test_functions(manifest: dict) -> None:
    failures: list[str] = []
    for function in manifest["functions"]:
        url = f"https://{manifest['project_ref']}.supabase.co/functions/v1/{function}"
        request = urllib.request.Request(url, method="OPTIONS")
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                status = response.status
        except urllib.error.HTTPError as exc:
            status = exc.code
        except OSError as exc:
            failures.append(f"{function}: {exc}")
            continue
        if status == 404 or status >= 500:
            failures.append(f"{function}: HTTP {status}")
        else:
            print(f"✓ {function}: bereikbaar (HTTP {status})")
    if failures:
        raise ReleaseError("Rooktest mislukt:\n- " + "\n- ".join(failures))


def main() -> int:
    parser = argparse.ArgumentParser(description="Controleer of publiceer de RoofSignal Supabase-backend.")
    parser.add_argument("--deploy", action="store_true", help="Publiceer na alle controles naar productie.")
    parser.add_argument("--skip-tests", action="store_true", help="Sla alleen de lokale Python-tests over.")
    args = parser.parse_args()

    try:
        manifest = load_manifest()
        static_preflight(manifest)
        if not args.skip_tests:
            run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"])
        check_cli_and_project(manifest)
        if not args.deploy:
            print("✓ Voorcontrole geslaagd; er is niets gepubliceerd.")
            return 0

        env = require_release_credentials()
        check_cli_and_project(manifest, env)
        check_remote_secrets(manifest, env)
        run(["supabase", "link", "--project-ref", manifest["project_ref"]], env=env)
        run(["supabase", "db", "push", "--dry-run", "--linked"], env=env)
        run(["supabase", "db", "push", "--linked"], env=env)
        for function in manifest["functions"]:
            run(["supabase", "functions", "deploy", function, "--project-ref", manifest["project_ref"]], env=env)
        run(["supabase", "config", "push", "--project-ref", manifest["project_ref"]], env=env)
        smoke_test_functions(manifest)
        print("✓ RoofSignal Supabase-release volledig afgerond.")
        return 0
    except ReleaseError as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

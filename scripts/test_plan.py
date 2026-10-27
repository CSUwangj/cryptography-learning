#!/usr/bin/env python3
"""Plan existing checks from changed paths for local handoff and push CI."""

import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

# Maintainers add exact throwaway prototype paths here. Shared production and
# broad demo directories must remain outside this registry.
PROTOTYPE_ONLY_PATHS = frozenset({
    "frontend/demos/UiOptimizationPrototype.tsx",
    "frontend/demos/LearningShellPrototype.tsx",
    "frontend/demos/Aes192OverlayPrototype.tsx",
    "frontend/demos/aes192OverlayPrototypeData.ts",
    "frontend/demos/uiOptimizationPrototypeFixture.ts",
})


def check(identifier, cwd, argv, reason):
    item = {"id": identifier, "cwd": cwd, "argv": argv, "reasons": [reason]}
    if identifier == "frontend_build":
        item["env"] = {"VITE_FEEDBACK_URL": "https://github.com/CSUAuroraLab/ISSUE-COLLECTOR/issues/new/choose"}
    return item


def _frontend(paths, *, repo=ROOT, full=False, reason="frontend source changed"):
    if full:
        selected = []
    else:
        selected = sorted({
            path for path in paths
            if path.endswith((".test.ts", ".test.tsx")) and Path(repo / path).is_file()
        })
        if not selected:
            roots = {path.split("/", 3)[2] for path in paths if path.startswith("frontend/src/")}
            selected = sorted({
                str(path.relative_to(repo)) for root in roots
                for path in (repo / "frontend/src" / root).rglob("*.test.ts*")
            })
    argv = ["npm", "test", "--", "--maxWorkers=1", "--passWithNoTests=false", *selected]
    argv[5:] = [path.removeprefix("frontend/") for path in argv[5:]]
    return check("frontend-tests", "frontend", argv, reason)


def plan_paths(paths, repo=ROOT):
    paths = sorted(set(os.fsdecode(path) for path in paths))
    if not paths:
        raise ValueError("no changed paths; refusing an accidental empty check plan")
    repo = Path(repo).resolve()
    checks = {}
    prototype_paths = set(paths) & PROTOTYPE_ONLY_PATHS
    omissions = []

    def add(identifier, cwd, argv, reason):
        item = checks.get(identifier)
        if item is None:
            item = checks[identifier] = check(identifier, cwd, argv, reason)
        elif identifier == "frontend-tests":
            current, added = item["argv"][5:], argv[5:]
            if current and added:
                item["argv"] = [*item["argv"][:5], *sorted(set(current) | set(added))]
            elif not current:
                pass
            else:
                item["argv"] = argv
        if reason not in item["reasons"]:
            item["reasons"].append(reason)

    def frontend(selected, full=False, reason="frontend source changed"):
        item = _frontend(selected, repo=repo, full=full, reason=reason)
        add(item["id"], item["cwd"], item["argv"], reason)

    def image_check(mode, reason):
        add(
            "image_smoke" if mode == "smoke" else "image_acceptance",
            ".",
            ["./acceptance/run.sh", "cryptography-learning-web-tier:ci", "--mode", mode],
            reason,
        )

    for path in paths:
        if path.startswith("baseline/content/"):
            image_check("smoke", "mounted content is runtime fixture data")
            continue
        if (
            path.startswith("frontend/src/lesson_runtime/fixture/")
            or (path.startswith("frontend/demos/") and not path.endswith(".md"))
        ):
            frontend(["frontend/src/lesson_runtime/index.test.ts", "frontend/src/visualizers/index.test.ts", "frontend/src/visualizers/migration.test.tsx"], reason="runtime demo or fixture consumers changed")
            if path.startswith("frontend/demos/") and path not in prototype_paths:
                add("demo_browser", "frontend", ["npx", "playwright", "test", "--project=chromium", "e2e/visualizers.spec.ts", "e2e/aes-cipher-demo.spec.ts"], "runtime demos have Vite browser consumers")
                if path.endswith((".ts", ".tsx")):
                    add("frontend_typecheck", "frontend", ["npm", "run", "typecheck"], "TypeScript demo changed")
            elif path.startswith("frontend/src/lesson_runtime/fixture/"):
                add("demo_browser", "frontend", ["npx", "playwright", "test", "--project=chromium", "e2e/visualizers.spec.ts", "e2e/aes-cipher-demo.spec.ts"], "real Lesson fixtures have Vite browser consumers")
            continue
        if path.endswith(".md"):
            continue
        if path.startswith(("tests/", "scripts/review_handoff.py", "scripts/test_plan.py", ".github/workflows/")):
            add("tooling", ".", ["python3", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"], "repository tooling or workflow contract changed")
        elif path.startswith("backend/apps/completion-relay/"):
            add("relay_fmt", "backend", ["cargo", "fmt", "--all", "--", "--check"], "completion relay package changed")
            add("relay_clippy", "backend", ["cargo", "clippy", "--locked", "-p", "completion-relay", "--all-targets", "--", "-D", "warnings"], "completion relay package changed")
            add("relay", "backend", ["cargo", "test", "--locked", "-p", "completion-relay", "--", "--nocapture"], "completion relay package changed")
        elif path.startswith("backend/crates/completion-claims/"):
            add("claims", "backend", ["cargo", "test", "--locked", "-p", "completion-claims", "-p", "completion-relay", "-p", "cryptography-learning-backend", "--", "--nocapture"], "shared claims crate consumers changed")
        elif path.startswith("backend/apps/web-server/"):
            add("backend", "backend", ["cargo", "test", "--locked", "-p", "cryptography-learning-backend", "--", "--nocapture"], "web server package changed")
            if path.endswith(("model.rs", "schema.gql")) or path.endswith("model.rs"):
                frontend(["frontend/schema/schema.gql"], full=True, reason="GraphQL schema contract changed")
                add("backend_schema", "backend", ["cargo", "test", "--locked", "-p", "cryptography-learning-backend", "--test", "schema_parity", "--", "--nocapture"], "backend SDL must match the client schema")
                add("frontend_codegen", "frontend", ["npm", "run", "gen"], "GraphQL schema/codegen contract changed")
                add("frontend_typecheck", "frontend", ["npm", "run", "typecheck"], "GraphQL schema/codegen contract changed")
        elif path.startswith(("backend/", "Cargo.toml", "Cargo.lock", "rust-toolchain.toml")):
            add("backend_fmt", "backend", ["cargo", "fmt", "--all", "--", "--check"], "Rust workspace or toolchain changed")
            add("backend_clippy", "backend", ["cargo", "clippy", "--locked", "--all-targets", "--", "-D", "warnings"], "Rust workspace or toolchain changed")
            add("backend_tests", "backend", ["cargo", "test", "--locked", "--", "--nocapture"], "Rust workspace or toolchain changed")
            add("backend_build", "backend", ["cargo", "build", "--locked", "--release"], "Rust workspace or toolchain changed")
        elif path.startswith("frontend/"):
            if path in {"frontend/package.json", "frontend/package-lock.json", "frontend/.nvmrc", "frontend/vite.config.mts", "frontend/vite.demos.config.mts", "frontend/tsconfig.json", "frontend/.codegen.yml"}:
                frontend(paths, full=True, reason="frontend toolchain or shared configuration changed")
                add("frontend_typecheck", "frontend", ["npm", "run", "typecheck"], "frontend shared configuration changed")
                add("frontend_build", "frontend", ["npm", "run", "build"], "frontend shared configuration changed")
                if path in {"frontend/package.json", "frontend/package-lock.json", "frontend/.nvmrc"}:
                    add("frontend_install", "frontend", ["npm", "ci"], "frontend dependency or Node pin changed")
                if path == "frontend/.codegen.yml":
                    add("frontend_codegen", "frontend", ["npm", "run", "gen"], "GraphQL codegen configuration changed")
            elif path in {"frontend/index.html", "frontend/terminal-harness.html"} or path.startswith("frontend/public/"):
                frontend(paths, full=True, reason="frontend entrypoint or public assets changed")
                add("frontend_build", "frontend", ["npm", "run", "build"], "frontend entrypoint or public assets changed")
                if path == "frontend/terminal-harness.html":
                    add("browser_terminal", "frontend", ["npx", "playwright", "test", "--project=chromium", "terminal.spec.ts"], "terminal browser entrypoint changed")
            elif path.startswith(("frontend/schema/", "frontend/src/transport/generated/")) or path.endswith((".gql", ".graphql")):
                frontend(paths, full=True, reason="GraphQL schema/codegen contract changed")
                add("backend_schema", "backend", ["cargo", "test", "--locked", "-p", "cryptography-learning-backend", "--test", "schema_parity", "--", "--nocapture"], "client schema must match the backend SDL")
                add("frontend_codegen", "frontend", ["npm", "run", "gen"], "GraphQL schema/codegen contract changed")
                add("frontend_typecheck", "frontend", ["npm", "run", "typecheck"], "GraphQL client contract changed")
            elif path.startswith("frontend/src/"):
                if (
                    path not in prototype_paths
                    and not path.endswith((".test.ts", ".test.tsx"))
                    and path.startswith(("frontend/src/visualizers/", "frontend/src/lesson_runtime/"))
                ):
                    add("demo_browser", "frontend", ["npx", "playwright", "test", "--project=chromium", "e2e/visualizers.spec.ts", "e2e/aes-cipher-demo.spec.ts"], "real lesson runtime or visualizer behavior changed")
                parts = path.split("/")
                mod = parts[2] if len(parts) > 3 else ""
                if not mod:
                    frontend(paths, full=True, reason="frontend module-level source changed")
                    if path.endswith((".ts", ".tsx", ".d.ts")):
                        add("frontend_typecheck", "frontend", ["npm", "run", "typecheck"], "top-level frontend TypeScript changed")
                    if path in {"frontend/src/index.tsx", "frontend/src/index.css"}:
                        add("frontend_build", "frontend", ["npm", "run", "build"], "frontend application entrypoint or global stylesheet changed")
                    continue
                if mod == "crypto_graph":
                    selected = ["frontend/src/crypto_graph/index.test.ts", "frontend/src/lesson_runtime/bitFlip.test.ts", "frontend/src/lesson_runtime/index.test.ts", "frontend/src/visualizers/ClassicalReadability.test.tsx", "frontend/src/visualizers/index.test.ts", "frontend/src/visualizers/migration.test.tsx"]
                    if path.endswith("worker.ts") or "worker_adapter" in path:
                        add("browser_crypto-graph-worker", "frontend", ["npx", "playwright", "test", "--project=chromium", "e2e/crypto-graph-worker.spec.ts"], "real Worker transport behavior changed")
                elif mod == "lesson_runtime":
                    selected = ["frontend/src/lesson_runtime/bitFlip.test.ts", "frontend/src/lesson_runtime/index.test.ts", "frontend/src/visualizers/index.test.ts", "frontend/src/visualizers/migration.test.tsx"]
                elif mod in ("ui", "learning"):
                    selected = ["frontend/src/ui/learning/index.test.tsx", "frontend/src/learning/LearningPage.test.ts"]
                elif mod == "practice":
                    selected = [
                        "frontend/src/practice/map.test.ts",
                        "frontend/src/app/PracticeNavigation.routes.test.tsx",
                    ]
                elif mod == "completion_board":
                    selected = [
                        "frontend/src/completion_board/map.test.ts",
                        "frontend/src/completion_board/export.test.ts",
                        "frontend/src/app/CompletionRecords.routes.test.tsx",
                    ]
                elif mod in ("app", "terminal", "transport"):
                    selected = sorted(str(p.relative_to(repo)) for p in (repo / "frontend/src").rglob("*.test.ts*") if mod in str(p.relative_to(repo)))
                    if mod == "terminal" and "/browser/" in path:
                        add("browser_terminal", "frontend", ["npx", "playwright", "test", "--project=chromium", "terminal.spec.ts"], "terminal browser harness changed")
                else:
                    selected = sorted(str(p.relative_to(repo)) for p in (repo / "frontend/src" / mod).rglob("*.test.ts*"))
                existing = [name for name in selected if (repo / name).is_file()]
                if path.endswith((".test.ts", ".test.tsx")):
                    existing = [path]
                if not existing and mod not in {"crypto_graph", "lesson_runtime", "ui", "learning", "practice", "completion_board", "app", "terminal", "transport"}:
                    frontend(paths, full=True, reason=f"unknown frontend module {mod}; broad fallback")
                    add("frontend_typecheck", "frontend", ["npm", "run", "typecheck"], f"unknown frontend module {mod}; broad fallback")
                    add("frontend_build", "frontend", ["npm", "run", "build"], f"unknown frontend module {mod}; broad fallback")
                else:
                    item = _frontend(existing, repo=repo, reason=f"tests for frontend module {mod} changed")
                    add(item["id"], item["cwd"], item["argv"], item["reasons"][0])
                if path.endswith((".ts", ".tsx")):
                    add("frontend_typecheck", "frontend", ["npm", "run", "typecheck"], "frontend TypeScript changed")
            elif path.startswith("frontend/e2e/"):
                spec = Path(path).name
                if path.endswith("v2-default-trace-browser.tsx"):
                    add("browser_crypto-graph-worker", "frontend", ["npx", "playwright", "test", "--project=chromium", "crypto-graph-worker.spec.ts"], "browser Worker helper changed")
                elif path.endswith("fixtures/browser_terminal_fixture.py"):
                    add("browser_terminal", "frontend", ["npx", "playwright", "test", "--project=chromium", "terminal.spec.ts"], "terminal browser fixture changed")
                elif spec == "web-tier.spec.ts":
                    add("image_acceptance", ".", ["./acceptance/run.sh", "cryptography-learning-web-tier:ci", "--mode", "pr"], "served-image browser test changed")
                elif spec == "completion-records.spec.ts":
                    add("completion_acceptance", ".", ["./acceptance/completion/run.sh", "cryptography-learning-web-tier:ci", "cryptography-learning-completion-relay:ci"], "relay-to-board browser test changed")
                elif not spec.endswith(".spec.ts"):
                    frontend(paths, full=True, reason="unknown browser helper; broad frontend fallback")
                    add("frontend_typecheck", "frontend", ["npm", "run", "typecheck"], "unknown browser helper; broad frontend fallback")
                    add("frontend_build", "frontend", ["npm", "run", "build"], "unknown browser helper; broad frontend fallback")
                else:
                    add(f"browser_{spec.removesuffix('.spec.ts')}", "frontend", ["npx", "playwright", "test", "--project=chromium", spec], "Vite-compatible browser test changed")
            else:
                frontend(paths, full=True, reason="unknown frontend executable path; broad fallback")
                add("frontend_typecheck", "frontend", ["npm", "run", "typecheck"], "unknown frontend executable path; broad fallback")
                add("frontend_build", "frontend", ["npm", "run", "build"], "unknown frontend executable path; broad fallback")
        elif path.startswith(("baseline/tests/", "baseline/terminal/")):
            image_check(
                "pr" if path.startswith("baseline/terminal/") else "smoke",
                "deployed baseline test or terminal fixture changed",
            )
        elif path.startswith("baseline/fixtures/graphql/"):
            frontend(["frontend/src/practice/map.test.ts"], reason="external GraphQL fixtures have frontend mapping consumers")
            add("image_acceptance", ".", ["./acceptance/run.sh", "cryptography-learning-web-tier:ci", "--mode", "pr"], "external GraphQL fixtures have served-image consumers")
        elif path.startswith("acceptance/completion/"):
            add("completion_acceptance", ".", ["./acceptance/completion/run.sh", "cryptography-learning-web-tier:ci", "cryptography-learning-completion-relay:ci"], "completion relay acceptance harness changed")
            add("tooling", ".", ["python3", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"], "acceptance harness contract changed")
        elif path.startswith("acceptance/") or path in {"Dockerfile", "docker-compose.yml", "start-web-tier.sh"}:
            image_check("smoke", "image or acceptance harness changed")
            add("tooling", ".", ["python3", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"], "acceptance harness contract changed")
        else:
            if path.startswith("scripts/"):
                add("tooling", ".", ["python3", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"], f"unknown executable path fallback: {path}")
            else:
                add("tooling", ".", ["python3", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"], f"unknown executable path fallback: {path}")
                add("backend_tests", "backend", ["cargo", "test", "--locked", "--", "--nocapture"], f"unknown root executable path fallback: {path}")
                add("backend_fmt", "backend", ["cargo", "fmt", "--all", "--", "--check"], f"unknown root executable path fallback: {path}")
                add("backend_clippy", "backend", ["cargo", "clippy", "--locked", "--all-targets", "--", "-D", "warnings"], f"unknown root executable path fallback: {path}")
                add("backend_build", "backend", ["cargo", "build", "--locked", "--release"], f"unknown root executable path fallback: {path}")
                frontend(paths, full=True, reason=f"unknown root executable path fallback: {path}")
                add("frontend_typecheck", "frontend", ["npm", "run", "typecheck"], f"unknown root executable path fallback: {path}")
                add("frontend_build", "frontend", ["npm", "run", "build"], f"unknown root executable path fallback: {path}")

    if prototype_paths and "demo_browser" not in checks:
        omissions.append({
            "id": "demo_browser",
            "status": "not-run",
            "reason": "registered UI prototype does not change the real demo contract",
        })
    plan = {
        "kind": "checks" if checks else "docs-only",
        "paths": paths,
        "checks": sorted(checks.values(), key=lambda item: (item["id"] != "frontend_install", item["id"])),
        "omissions": omissions,
    }
    return plan


def _git(repo, *args):
    result = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, check=False)
    if result.returncode:
        raise ValueError((result.stderr or result.stdout).decode(errors="replace").strip())
    return result.stdout


def plan_range(repo, before, after):
    repo = Path(repo).resolve()
    try:
        _git(repo, "rev-parse", "--verify", f"{before}^{{commit}}")
        _git(repo, "rev-parse", "--verify", f"{after}^{{commit}}")
        output = _git(repo, "diff", "--name-status", "-z", "--find-renames", before, after)
    except (OSError, ValueError):
        plan = plan_paths(["Cargo.toml", "frontend/package.json", "scripts/test_plan.py"], repo)
        plan["fallback"] = f"comparison base unavailable: {before}..{after}"
        return plan
    fields = output.split(b"\0")
    records = []
    index = 0
    while index < len(fields) and fields[index]:
        status = os.fsdecode(fields[index]); index += 1
        count = 2 if status.startswith("R") or status.startswith("C") else 1
        names = [os.fsdecode(value) for value in fields[index:index + count]]
        index += count
        records.append((status, *names))
    if not records:
        return {"kind": "docs-only", "paths": [], "checks": [], "omissions": []}
    return plan_records(records, repo=repo)


def plan_records(records, repo=ROOT):
    paths = set()
    for record in records:
        paths.update(record[1:])
    return plan_paths(paths, repo)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="action", required=True)
    plan_parser = subs.add_parser("range")
    plan_parser.add_argument("before"); plan_parser.add_argument("after")
    plan_parser.add_argument("--repo", type=Path, default=ROOT)
    local = subs.add_parser("local")
    local.add_argument("--repo", type=Path, default=ROOT)
    runner = subs.add_parser("run")
    runner.add_argument("--plan", required=True, help="base64-encoded JSON plan")
    runner.add_argument("--id", required=True)
    runner.add_argument("--repo", type=Path, default=ROOT)
    args = parser.parse_args()
    if args.action == "range":
        result = plan_range(args.repo, args.before, args.after)
    elif args.action == "local":
        repo = args.repo.resolve()
        names = set(os.fsdecode(p) for p in _git(repo, "diff", "--no-renames", "--name-only", "-z", "HEAD").split(b"\0") if p)
        names.update(os.fsdecode(p) for p in _git(repo, "ls-files", "--others", "--exclude-standard", "-z").split(b"\0") if p)
        result = plan_paths(names, repo)
    elif args.action == "run":
        plan = json.loads(base64.b64decode(args.plan))
        selected = next((item for item in plan["checks"] if item["id"] == args.id), None)
        if selected is None:
            raise ValueError(f"check is not selected by plan: {args.id}")
        result = subprocess.run(selected["argv"], cwd=args.repo.resolve() / selected["cwd"], env={**os.environ, **selected.get("env", {})}, check=False)
        if result.returncode == 0 and args.id == "frontend_codegen":
            result = subprocess.run(["git", "status", "--porcelain", "--", "frontend/src/transport/generated"], cwd=args.repo, capture_output=True, check=False)
            if result.returncode == 0 and result.stdout:
                result.returncode = 1
        return result.returncode
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

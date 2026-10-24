#!/usr/bin/env python3
"""Pin a staged snapshot and record checks, formal reviews and finding dispositions."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

import test_plan


REVIEW_AXES = ("standards", "spec")
REVIEW_STATUSES = ("pending", "passed", "changes-required", "disputed")
FINDING_STATUSES = ("open", "disputed", "resolved", "withdrawn", "non-blocking")


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def git(repo: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", "--literal-pathspecs", "-C", str(repo), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"},
        check=False,
    )
    if result.returncode:
        message = (result.stderr or result.stdout).decode(errors="replace").strip()
        raise ValueError(message or f"git command failed with exit code {result.returncode}")
    return result.stdout


def paths(output: bytes) -> list[str]:
    return sorted(os.fsdecode(part) for part in output.split(b"\0") if part)


def snapshot(repo: Path, base: str, targets: list[str], excluded: dict) -> dict:
    if git(repo, "rev-parse", "HEAD").decode().strip() != base:
        raise ValueError("HEAD differs from base; create a new handoff for the intended base")
    if git(repo, "ls-files", "--unmerged", "-z"):
        raise ValueError("resolve unmerged entries before handing off")
    diff = ("diff", "--no-ext-diff", "--no-textconv", "--no-renames")
    staged = paths(git(repo, *diff, "--cached", base, "--name-only", "-z"))
    unstaged = paths(git(repo, *diff, "--name-only", "-z"))
    untracked = paths(git(repo, "ls-files", "--others", "--exclude-standard", "-z"))
    if not targets or not set(targets) <= set(staged):
        raise ValueError("every target must be an exact staged file path changed from base")
    if set(targets) & set(unstaged):
        raise ValueError("target files have unstaged changes; stage the final version first")
    outside = (set(staged) | set(unstaged) | set(untracked)) - set(targets)
    if outside != set(excluded) or any(not reason.strip() for reason in excluded.values()):
        raise ValueError(
            "classify every non-target change with --exclude PATH REASON; "
            f"unclassified={sorted(outside - set(excluded))}, "
            f"invalid exclusions={sorted(set(excluded) - outside)}"
        )
    git(repo, *diff, "--cached", base, "--check", "--", *targets)
    untracked_state = {}
    for name in untracked:
        file = repo / name
        content = os.fsencode(os.readlink(file)) if file.is_symlink() else file.read_bytes()
        untracked_state[name] = {
            "sha256": digest(content),
            "mode": file.lstat().st_mode,
        }
    return {
        "staged_paths": staged,
        "unstaged_paths": unstaged,
        "untracked": untracked_state,
        "index_sha256": digest(git(repo, "ls-files", "--stage", "-z")),
        "unstaged_sha256": digest(git(repo, *diff, "--binary", "--full-index")),
        "target_diff_sha256": digest(git(
            repo, *diff, "--cached", base, "--binary", "--full-index", "--", *targets
        )),
    }


def save(file: Path, data: dict, *, new: bool = False) -> None:
    with file.open("x" if new else "w", encoding="utf-8") as stream:
        json.dump(data, stream, indent=2, ensure_ascii=True)
        stream.write("\n")


def outside_repo(file: Path, repo: Path) -> None:
    if file.is_relative_to(repo):
        raise ValueError("keep handoff files and logs outside the reviewed worktree")


def snapshot_id(data: dict) -> str:
    keys = ("repo", "base", "issue", "paths", "excluded", "snapshot")
    identity = {key: data[key] for key in keys}
    if "plan" in data:
        identity["plan"] = data["plan"]
    return digest(json.dumps(identity, sort_keys=True).encode())


def required_checks(targets: list[str], repo: Path) -> set[str]:
    return {item["id"] for item in test_plan.plan_paths(targets, repo)["checks"]}


def packet_plan(data: dict) -> dict:
    return data.get("plan") or test_plan.plan_paths(data["paths"], Path(data["repo"]))


def check_identity(data: dict, name: str) -> tuple[list[str], str] | None:
    planned = next((item for item in packet_plan(data)["checks"] if item["id"] == name), None)
    if planned:
        return planned["argv"], str((Path(data["repo"]) / planned["cwd"]).resolve())
    attempts = data["checks"][name]
    return (attempts[0]["command"], attempts[0]["cwd"]) if attempts else None


def check_contract_errors(data: dict) -> list[str]:
    errors = [f"missing required check: {name}"
              for name in sorted(required_checks(packet_plan(data)["paths"], Path(data["repo"])) - data["checks"].keys())]
    for name, attempts in data["checks"].items():
        identity = check_identity(data, name)
        if any((attempt["command"], attempt["cwd"]) != identity for attempt in attempts):
            errors.append(f"{name}: command or working directory changed; use separate diagnostic evidence")
    return errors


def create(args: argparse.Namespace) -> int:
    repo = Path(git(args.repo.resolve(), "rev-parse", "--show-toplevel").decode().strip()).resolve()
    base = git(repo, "rev-parse", "--verify", f"{args.base}^{{commit}}").decode().strip()
    targets = sorted(set(args.paths))
    if len(targets) != len(args.paths):
        raise ValueError("target paths must be unique")
    excluded = dict(args.exclude)
    if len(excluded) != len(args.exclude):
        raise ValueError("exclusion paths must be unique")
    if len(set(args.check)) != len(args.check):
        raise ValueError("check names must be unique")
    all_paths = targets
    plan = test_plan.plan_paths(all_paths, repo)
    missing = required_checks(all_paths, repo) - set(args.check)
    if missing:
        raise ValueError("missing required check: " + ", ".join(sorted(missing)))
    notes = args.notes.read_text(encoding="utf-8").strip()
    if not args.issue.strip() or not notes:
        raise ValueError("issue and acceptance/evidence notes are required")
    output = args.output.resolve()
    outside_repo(output, repo)
    data = {
        "schema": 1,
        "issue": args.issue,
        "repo": str(repo),
        "base": base,
        "paths": targets,
        "excluded": excluded,
        "plan": plan,
        "notes": notes,
        "diff_command": shlex.join([
            "git", "--literal-pathspecs", "-C", str(repo), "diff", "--cached",
            "--no-ext-diff", "--no-textconv", "--no-renames", base, "--", *targets,
        ]),
        "snapshot": snapshot(repo, base, targets, excluded),
        "checks": {name: [] for name in args.check},
        "reviews": {axis: [] for axis in REVIEW_AXES},
    }
    data["snapshot_id"] = snapshot_id(data)
    save(output, data, new=True)
    print(f"Created {output}; checks have not run. Snapshot ID: {data['snapshot_id']}\nReview command:\n{data['diff_command']}")
    return 0


def load(file: Path) -> dict:
    data = json.loads(file.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("schema") != 1:
        raise ValueError("unsupported handoff schema")
    outside_repo(file, Path(data["repo"]))
    return data


def verify_snapshot(data: dict) -> None:
    if data.get("snapshot_id") and data["snapshot_id"] != snapshot_id(data):
        raise ValueError("handoff plan or identity changed; create a new handoff")
    current = snapshot(Path(data["repo"]), data["base"], data["paths"], data["excluded"])
    if current != data["snapshot"]:
        raise ValueError("review snapshot changed; create a new handoff and recheck affected evidence")


def verify_logs(data: dict) -> None:
    for attempts in data["checks"].values():
        for attempt in attempts:
            log = Path(attempt["log"])
            if not log.is_file():
                raise ValueError(f"missing check log: {log}")
            if attempt.get("log_sha256") and digest(log.read_bytes()) != attempt["log_sha256"]:
                raise ValueError(f"check log changed: {log}")
            if attempt["status"] in ("passed", "failed") and not attempt.get("log_sha256"):
                raise ValueError(f"completed check has no log fingerprint: {log}")


def statuses(data: dict) -> dict:
    return {
        name: attempts[-1]["status"] if attempts else "not-run"
        for name, attempts in data["checks"].items()
    }


def review_statuses(data: dict) -> tuple[dict, dict]:
    reviews = {}
    findings = {}
    identity = snapshot_id(data)
    for axis in REVIEW_AXES:
        attempts = data.get("reviews", {}).get(axis, [])
        reviews[axis] = "pending"
        for attempt in attempts:
            if attempt.get("snapshot_id") != identity:
                raise ValueError(f"{axis} review snapshot ID differs from packet")
            if attempt.get("status") not in REVIEW_STATUSES or not attempt.get("evidence", "").strip():
                raise ValueError(f"{axis} review requires a valid status and nonempty evidence")
            reviews[axis] = attempt["status"]
            for name, status in attempt["findings"].items():
                if not name.strip() or status not in FINDING_STATUSES:
                    raise ValueError(f"invalid finding disposition: {axis}:{name}")
                findings[f"{axis}:{name}"] = status
    return reviews, findings


def verify(args: argparse.Namespace) -> int:
    data = load(args.packet.resolve())
    verify_snapshot(data)
    verify_logs(data)
    results = statuses(data)
    print(f"Snapshot ID: {snapshot_id(data)}")
    print("Snapshot matches. Check status: " + json.dumps(results, sort_keys=True))
    history = {
        name: {
            "attempts": len(attempts),
            "previous_failed": sum(a["status"] == "failed" for a in attempts[:-1]),
            "previous_unavailable": sum(a["status"] == "unavailable" for a in attempts[:-1]),
        }
        for name, attempts in data["checks"].items()
    }
    print("Check history: " + json.dumps(history, sort_keys=True))
    incomplete = sorted(
        {name for name, status in results.items() if status != "passed"}
        | (required_checks(packet_plan(data)["paths"], Path(data["repo"])) - results.keys())
    )
    print("Incomplete checks: " + json.dumps(incomplete))
    errors = check_contract_errors(data)
    print("Check contract errors: " + json.dumps(errors))
    reviews, findings = review_statuses(data)
    print("Formal review status: " + json.dumps(reviews, sort_keys=True))
    unresolved = {name: status for name, status in findings.items() if status in ("open", "disputed")}
    print("Unresolved findings: " + json.dumps(unresolved, sort_keys=True))
    if args.require_passed and errors:
        raise ValueError("; ".join(errors))
    if args.require_passed and (not results or any(s != "passed" for s in results.values())):
        raise ValueError("not all planned checks passed; snapshot validity is not acceptance")
    if args.require_reviewed and any(s != "passed" for s in reviews.values()):
        raise ValueError("both formal-review axes must pass on this snapshot")
    if args.require_reviewed and unresolved:
        raise ValueError("unresolved findings: " + ", ".join(sorted(unresolved)))
    print("Coverage, excluded-file impact, and requirements still require independent review.")
    return 0


def record_review(args: argparse.Namespace) -> int:
    file = args.packet.resolve()
    data = load(file)
    verify_snapshot(data)
    verify_logs(data)
    review_statuses(data)
    identity = snapshot_id(data)
    if args.snapshot != identity:
        raise ValueError("review snapshot ID differs from packet; review the current snapshot")
    evidence_file = args.evidence.resolve()
    outside_repo(evidence_file, Path(data["repo"]))
    evidence = evidence_file.read_text(encoding="utf-8").strip()
    if not evidence:
        raise ValueError("review evidence must not be empty")
    findings = dict(args.finding)
    if len(findings) != len(args.finding):
        raise ValueError("finding IDs must be unique within a review entry")
    if any(not name.strip() or status not in FINDING_STATUSES for name, status in findings.items()):
        raise ValueError("finding requires an ID and one of: " + ", ".join(FINDING_STATUSES))
    entry = {
        "status": args.status,
        "snapshot_id": identity,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "evidence_path": str(evidence_file),
        "evidence": evidence,
        "findings": findings,
    }
    data.setdefault("reviews", {}).setdefault(args.axis, []).append(entry)
    verify_snapshot(data)
    save(file, data)
    print(f"Recorded formal {args.axis} review: {args.status}")
    return 0


def run_check(args: argparse.Namespace) -> int:
    file = args.packet.resolve()
    data = load(file)
    verify_snapshot(data)
    verify_logs(data)
    if args.label not in data["checks"]:
        raise ValueError("check name was not declared at create time")
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        raise ValueError("run requires a command after --")
    repo = Path(data["repo"])
    cwd = (repo / args.cwd).resolve()
    if not cwd.is_relative_to(repo) or not cwd.is_dir():
        raise ValueError("check cwd must be a directory inside the reviewed worktree")
    attempts = data["checks"][args.label]
    planned = next((item for item in packet_plan(data)["checks"] if item["id"] == args.label), {})
    identity = check_identity(data, args.label)
    if identity is not None and (command, str(cwd)) != identity:
        raise ValueError(
            f"{args.label}: command or working directory changed; "
            f"expected cwd={identity[1]}, command={shlex.join(identity[0])}; "
            "use separate diagnostic evidence"
        )
    log = file.with_name(f"{file.stem}-{args.label}-{len(attempts) + 1}.log")
    attempt = {
        "command": command,
        "cwd": str(cwd),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "unavailable",
        "exit_code": None,
        "reason": "No completion recorded; a startup header is not a passing check.",
        "log": str(log),
    }
    with log.open("xb") as stream:
        attempts.append(attempt)
        save(file, data)
        print(f"Running {args.label}; log: {log}", flush=True)
        try:
            local_command = command
            if Path(command[0]).name in {"npm", "npx", "node"}:
                local_command = ["fish", "-lc", "nvm use; and " + shlex.join(command)]
            result = subprocess.run(local_command, cwd=cwd, env={**os.environ, **planned.get("env", {})}, stdout=stream, stderr=subprocess.STDOUT, check=False)
            attempt.update(
                exit_code=result.returncode,
                status="passed" if result.returncode == 0 else "failed",
                reason="",
            )
        except (OSError, KeyboardInterrupt) as error:
            attempt["reason"] = str(error) or "Check interrupted."
    attempt["log_sha256"] = digest(log.read_bytes())
    try:
        verify_snapshot(data)
    except (OSError, ValueError) as error:
        attempt.update(status="unavailable", reason=f"Snapshot verification after check: {error}")
    save(file, data)
    print(json.dumps(attempt, indent=2))
    return 0 if attempt["status"] == "passed" else 1


def check_name(value: str) -> str:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]*", value):
        raise argparse.ArgumentTypeError("use letters, numbers, underscores or hyphens for check names")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    creator = commands.add_parser("create", help="record a staged target; refuse to overwrite a handoff")
    creator.add_argument("--repo", type=Path, default=Path.cwd())
    creator.add_argument("--base", required=True)
    creator.add_argument("--issue", required=True)
    creator.add_argument("--notes", type=Path, required=True)
    creator.add_argument("--output", type=Path, required=True)
    creator.add_argument("--paths", nargs="+", required=True)
    creator.add_argument("--exclude", nargs=2, action="append", default=[], metavar=("PATH", "REASON"))
    creator.add_argument("--check", type=check_name, action="append", required=True)
    creator.set_defaults(handler=create)
    runner = commands.add_parser("run", help="capture one check and its exit code; retain previous attempts")
    runner.add_argument("packet", type=Path)
    runner.add_argument("--label", type=check_name, required=True)
    runner.add_argument("--cwd", type=Path, default=Path("."))
    runner.set_defaults(handler=run_check)
    reviewer = commands.add_parser("review", help="record one formal-review axis against its reviewed snapshot")
    reviewer.add_argument("packet", type=Path)
    reviewer.add_argument("--axis", choices=REVIEW_AXES, required=True)
    reviewer.add_argument("--status", choices=REVIEW_STATUSES, required=True)
    reviewer.add_argument("--snapshot", required=True, help="snapshot ID supplied to the reviewer")
    reviewer.add_argument("--evidence", type=Path, required=True)
    reviewer.add_argument("--finding", nargs=2, action="append", default=[], metavar=("ID", "STATUS"),
                          help="record a finding disposition: " + ", ".join(FINDING_STATUSES))
    reviewer.set_defaults(handler=record_review)
    verifier = commands.add_parser("verify", help="check snapshot/log identity; does not run tests")
    verifier.add_argument("packet", type=Path)
    verifier.add_argument("--require-passed", action="store_true")
    verifier.add_argument("--require-reviewed", action="store_true", help="require both formal-review axes to pass with no unresolved findings")
    verifier.set_defaults(handler=verify)
    argv = sys.argv[1:]
    command = []
    if argv[:1] == ["run"] and "--" in argv:
        separator = argv.index("--")
        command, argv = argv[separator + 1:], argv[:separator]
    args = parser.parse_args(argv)
    args.command = command
    try:
        return args.handler(args)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"handoff error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Serialize cooperative heavyweight local checks across worktrees."""

from contextlib import contextmanager
import argparse
import ctypes
import fcntl
import json
import os
from pathlib import Path
import shlex
import signal
import subprocess
import sys
import time

HEAVYWEIGHT_OWNER = "CRYPTOGRAPHY_HEAVY_CHECK_OWNER"
PR_SET_CHILD_SUBREAPER = 36


def is_heavy(command, cwd):
    program = Path(command[0]).name
    if program.startswith("python") and command[1:3] == ["-m", "unittest"]:
        return False
    if program == "cargo" and command[1:2] == ["fmt"]:
        return False
    if program == "npm":
        args = command[2:] if command[1:2] == ["run"] else command[1:]
        if args[:1] in (["typecheck"], ["gen"]):
            return False
        if args[:1] == ["test"]:
            # shortcut: unknown test arguments take the slot; extend only for another needed focused form.
            unit_args = [
                arg for arg in args[1:]
                if arg != "--" and not arg.startswith(("--maxWorkers=", "--passWithNoTests="))
            ]
            if not unit_args or not all(
                not arg.startswith("-") and arg.endswith((".test.ts", ".test.tsx"))
                and (cwd / arg).is_file()
                for arg in unit_args
            ):
                return True
            unit_tests = {
                path.resolve() for root in ("src", "demos")
                for path in (cwd / root).rglob("*.test.ts*")
                if path.is_file() and path.name.endswith((".test.ts", ".test.tsx"))
                and not {"node_modules", "dist", "e2e"}.intersection(path.relative_to(cwd).parts)
            }
            filters = {
                value.lower() for arg in unit_args
                for value in (arg, os.path.relpath(cwd / arg, cwd))
            }
            # Existing named filters can together select the whole suite; an empty inventory proves no exemption.
            return all(
                any(value in os.path.relpath(path, cwd).lower() for value in filters)
                for path in unit_tests
            )
    return True


@contextmanager
def execution_slot(heavyweight, timing):
    if not heavyweight:
        timing["wait_seconds"] = 0.0
        yield
        return
    started = time.monotonic()
    try:
        if os.environ.get(HEAVYWEIGHT_OWNER):
            raise ValueError("Nested heavyweight entry is not supported; run each heavy command from the outer caller.")
        lock = Path.home() / ".cache/cryptography-learning/heavy-check.lock"
        lock.parent.mkdir(parents=True, exist_ok=True)
        with lock.open("a") as stream:
            print("Waiting for heavyweight slot: " + str(lock), file=sys.stderr, flush=True)
            fcntl.flock(stream, fcntl.LOCK_EX)
            timing["wait_seconds"] = time.monotonic() - started
            os.environ[HEAVYWEIGHT_OWNER] = str(os.getpid())
            try:
                yield
            finally:
                os.environ.pop(HEAVYWEIGHT_OWNER, None)
    finally:
        timing.setdefault("wait_seconds", time.monotonic() - started)


@contextmanager
def cancellation():
    def interrupt(signum, frame):
        raise KeyboardInterrupt

    previous = {sig: signal.signal(sig, interrupt) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        yield
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


def stop_owned_children():
    previous = {sig: signal.signal(sig, signal.SIG_IGN) for sig in (signal.SIGINT, signal.SIGTERM)}
    signalled = set()
    try:
        children_file = Path(f"/proc/self/task/{os.getpid()}/children")
        while children := children_file.read_text().split():
            for child in map(int, children):
                if child not in signalled:
                    try:
                        os.kill(child, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    signalled.add(child)
            os.waitpid(-1, 0)
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


def run_command(command, cwd, *, env=None, stdout=None):
    local_command = command
    if Path(command[0]).name in {"npm", "npx", "node"}:
        local_command = ["fish", "-lc", "nvm use; and " + shlex.join(command)]
    # Playwright detaches process groups, so adopt descendants before launching the command.
    if ctypes.CDLL(None, use_errno=True).prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0):
        raise OSError(ctypes.get_errno(), "Could not own check descendants")
    process = None
    try:
        process = subprocess.Popen(
            local_command, cwd=cwd, env={**os.environ, **(env or {})}, start_new_session=True,
            stdout=stdout, stderr=subprocess.STDOUT if stdout is not None else None,
        )
        return subprocess.CompletedProcess(command, process.wait())
    finally:
        stop_owned_children()
        if process is not None:
            process.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", nargs=argparse.REMAINDER, help="command argv after --; cwd is unchanged")
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("provide a check command after --")
    timing = {"exit_code": None}
    try:
        with cancellation(), execution_slot(is_heavy(command, Path.cwd()), timing):
            started = time.monotonic()
            result = run_command(command, Path.cwd())
            timing.update(exit_code=result.returncode, elapsed_seconds=time.monotonic() - started)
            return result.returncode
    except (OSError, ValueError, KeyboardInterrupt) as error:
        timing["reason"] = str(error) or "Check interrupted."
        return 1
    finally:
        print("Local check: " + json.dumps(timing), file=sys.stderr, flush=True)


if __name__ == "__main__":
    raise SystemExit(main())

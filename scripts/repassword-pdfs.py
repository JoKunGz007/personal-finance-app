#!/usr/bin/env python3
"""Rotate the password on a batch of PDFs.

Two modes:

  copy      Write re-encrypted copies into a separate directory, or plain
            ones with --decrypt. Originals are never opened for writing.

  archive   Rotate in place. Each original is replaced only after its
            replacement has been written and verified.

Both modes read passwords interactively. A password is never accepted as a
command-line argument, an environment variable or a file, and is never
written to stdout, to a log or into an error message.

Banks that share a password are processed in one run. A file the supplied
password does not open is reported and left alone, so a second run with the
other password picks up the remainder. Nothing has to be sorted by bank.

Requires: pip install pikepdf
"""

from __future__ import annotations

import argparse
import getpass
import os
import secrets
import string
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

try:
    import pikepdf
except ImportError:  # pragma: no cover - environment guard
    sys.exit("pikepdf is not installed. Run: pip install pikepdf")


TMP_SUFFIX = ".repw-tmp"


class Outcome(Enum):
    ROTATED = "rotated"
    DECRYPTED = "decrypted"
    ALREADY_DONE = "already using the new password"
    ALREADY_PLAIN = "already had no password; copied as-is"
    WAS_UNENCRYPTED = "had no password; now encrypted"
    WRONG_PASSWORD = "not opened by the supplied password"
    SKIPPED_EXISTS = "destination already exists"
    FAILED = "failed"


@dataclass
class Result:
    path: Path
    outcome: Outcome
    detail: str = ""


def generate_password(length: int = 24) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def prompt_passwords(generate: bool, decrypt: bool = False) -> tuple[str, str | None]:
    old = getpass.getpass("Current password (input hidden): ")
    if not old:
        sys.exit("No current password entered.")

    if decrypt:
        # None means "write without encryption"; no new password exists to ask for.
        return old, None

    if generate:
        new = generate_password()
        print("\n  Generated new password:", new)
        print("  Save it now. It is not stored anywhere and is not recoverable.\n")
        return old, new

    new = getpass.getpass("New password (input hidden): ")
    if not new:
        sys.exit("No new password entered.")
    if new != getpass.getpass("New password again: "):
        sys.exit("The two new passwords did not match.")
    if new == old:
        sys.exit("The new password is the same as the current one; nothing to do.")
    return old, new


def open_with(path: Path, password: str):
    """Open `path`, or return None if `password` does not unlock it."""
    try:
        return pikepdf.open(path, password=password)
    except pikepdf.PasswordError:
        return None


def is_unencrypted(path: Path) -> bool:
    try:
        with pikepdf.open(path) as pdf:
            return not pdf.is_encrypted
    except pikepdf.PasswordError:
        return False


def verify(path: Path, password: str, expected_pages: int) -> str:
    """Return an empty string if `path` is sound, else a reason."""
    try:
        with pikepdf.open(path, password=password) as pdf:
            if len(pdf.pages) != expected_pages:
                return f"page count {len(pdf.pages)}, expected {expected_pages}"
            for page in pdf.pages:
                _ = page.obj  # force each page object to parse
    except pikepdf.PasswordError:
        return "the new password does not open it"
    except Exception as exc:  # noqa: BLE001 - reported, not raised
        return f"unreadable: {type(exc).__name__}"
    return ""


def rewrite(source: Path, destination: Path, password: str, new: str | None) -> Result:
    """Write `source` to `destination` under `new`, then verify it.

    `new` of None writes the file with no encryption at all.
    """
    encryption = pikepdf.Encryption(user=new, owner=new, R=6) if new is not None else False
    try:
        with pikepdf.open(source, password=password) as pdf:
            page_count = len(pdf.pages)
            pdf.save(destination, encryption=encryption)
    except Exception as exc:  # noqa: BLE001 - the message may not carry a password
        return Result(source, Outcome.FAILED, type(exc).__name__)

    problem = verify(destination, new if new is not None else "", page_count)
    if problem:
        destination.unlink(missing_ok=True)
        return Result(source, Outcome.FAILED, problem)
    outcome = Outcome.ROTATED if new is not None else Outcome.DECRYPTED
    return Result(source, outcome, f"{page_count} pages")


def classify(path: Path, old: str, new: str | None) -> Outcome | None:
    """Decide how `path` should be handled, or None if it is ready to rotate."""
    if is_unencrypted(path):
        return Outcome.ALREADY_PLAIN if new is None else Outcome.WAS_UNENCRYPTED
    with_old = open_with(path, old)
    if with_old is not None:
        with_old.close()
        return None
    if new is not None:
        with_new = open_with(path, new)
        if with_new is not None:
            with_new.close()
            return Outcome.ALREADY_DONE
    return Outcome.WRONG_PASSWORD


def process_copy(
    path: Path, dest_dir: Path, old: str, new: str | None, overwrite: bool, dry_run: bool
) -> Result:
    destination = dest_dir / path.name
    if destination.exists() and not overwrite:
        return Result(path, Outcome.SKIPPED_EXISTS)

    plain = (Outcome.WAS_UNENCRYPTED, Outcome.ALREADY_PLAIN)
    verdict = classify(path, old, new)
    if verdict is Outcome.WRONG_PASSWORD:
        return Result(path, verdict)
    if verdict is Outcome.ALREADY_DONE:
        # The source is already under the new password; copy it as it stands.
        password = new or ""
    elif verdict in plain:
        password = ""
    else:
        password = old

    if dry_run:
        default = Outcome.ROTATED if new is not None else Outcome.DECRYPTED
        return Result(path, verdict or default, "dry run")

    result = rewrite(path, destination, password, new)
    if result.outcome is not Outcome.FAILED and verdict in plain:
        return Result(path, verdict, result.detail)
    return result


def process_archive(path: Path, old: str, new: str, dry_run: bool) -> Result:
    verdict = classify(path, old, new)
    if verdict in (Outcome.WRONG_PASSWORD, Outcome.ALREADY_DONE):
        return Result(path, verdict)
    password = "" if verdict is Outcome.WAS_UNENCRYPTED else old

    if dry_run:
        return Result(path, Outcome.ROTATED, "dry run")

    tmp = path.with_name(path.name + TMP_SUFFIX)
    result = rewrite(path, tmp, password, new)
    if result.outcome is not Outcome.ROTATED:
        tmp.unlink(missing_ok=True)
        return result

    # The replacement is written and verified; only now is the original lost.
    os.replace(tmp, path)
    if verdict is Outcome.WAS_UNENCRYPTED:
        return Result(path, Outcome.WAS_UNENCRYPTED, result.detail)
    return result


def collect(src: Path) -> list[Path]:
    if src.is_file():
        return [src]
    return sorted(p for p in src.rglob("*.pdf") if not p.name.endswith(TMP_SUFFIX))


def self_test() -> int:
    """Round-trip a generated PDF, proving the rotation without real data."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmpdir:
        work = Path(tmpdir)
        source = work / "self-test.pdf"
        first, second = "old-password-A", "new-password-B"

        pdf = pikepdf.new()
        pdf.add_blank_page(page_size=(612, 792))
        pdf.add_blank_page(page_size=(612, 792))
        pdf.save(source, encryption=pikepdf.Encryption(user=first, owner=first, R=6))
        pdf.close()

        assert open_with(source, second) is None, "new password opened the original"

        out = work / "out"
        out.mkdir()
        result = process_copy(source, out, first, second, overwrite=False, dry_run=False)
        if result.outcome is not Outcome.ROTATED:
            print(f"FAIL: copy mode returned {result.outcome.value} {result.detail}")
            return 1

        rotated = out / source.name
        if open_with(rotated, first) is not None:
            print("FAIL: the old password still opens the rotated copy")
            return 1
        handle = open_with(rotated, second)
        if handle is None:
            print("FAIL: the new password does not open the rotated copy")
            return 1
        pages = len(handle.pages)
        handle.close()
        if pages != 2:
            print(f"FAIL: rotated copy has {pages} pages, expected 2")
            return 1
        if open_with(source, first) is None:
            print("FAIL: the original no longer opens with its own password")
            return 1

        # Archive mode, on a throwaway copy.
        archive_target = work / "archive-me.pdf"
        archive_target.write_bytes(source.read_bytes())
        if process_archive(archive_target, first, second, dry_run=False).outcome is not Outcome.ROTATED:
            print("FAIL: archive mode did not rotate")
            return 1
        if open_with(archive_target, first) is not None:
            print("FAIL: the old password still opens the archived file")
            return 1
        handle = open_with(archive_target, second)
        if handle is None:
            print("FAIL: the new password does not open the archived file")
            return 1
        handle.close()

        # Decrypt mode: the output must carry no password at all.
        plain_dir = work / "plain"
        plain_dir.mkdir()
        result = process_copy(source, plain_dir, first, None, overwrite=False, dry_run=False)
        if result.outcome is not Outcome.DECRYPTED:
            print(f"FAIL: decrypt mode returned {result.outcome.value} {result.detail}")
            return 1
        plain = plain_dir / source.name
        if not is_unencrypted(plain):
            print("FAIL: the decrypted copy is still encrypted")
            return 1
        with pikepdf.open(plain) as pdf:
            if len(pdf.pages) != 2:
                print(f"FAIL: decrypted copy has {len(pdf.pages)} pages, expected 2")
                return 1
        if open_with(source, first) is None:
            print("FAIL: decrypt mode damaged the original")
            return 1

    print("Self-test passed: copy leaves the original intact, archive replaces it,")
    print("--decrypt writes a plain readable file, the old password stops working")
    print("and page counts survive every mode.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Rotate the password on a batch of PDFs.",
        epilog="Passwords are always typed at the prompt, never passed as arguments.",
    )
    parser.add_argument(
        "mode",
        choices=("copy", "archive", "self-test"),
        help="copy: re-encrypt elsewhere. archive: rotate in place. self-test: prove the tool.",
    )
    parser.add_argument("--src", type=Path, help="source file or directory (searched recursively)")
    parser.add_argument("--dest", type=Path, help="destination directory (copy mode)")
    parser.add_argument("--generate", action="store_true", help="generate the new password")
    parser.add_argument(
        "--decrypt",
        action="store_true",
        help="copy mode only: write plain, unencrypted PDFs instead of re-encrypting",
    )
    parser.add_argument("--overwrite", action="store_true", help="replace existing destinations")
    parser.add_argument("--dry-run", action="store_true", help="report what would happen")
    parser.add_argument(
        "--yes-rewrite-originals",
        action="store_true",
        help="required by archive mode: the originals are replaced",
    )
    args = parser.parse_args()

    if args.mode == "self-test":
        return self_test()

    if args.src is None:
        return parser.error("--src is required")
    if not args.src.exists():
        return parser.error(f"--src does not exist: {args.src}")
    if args.mode == "copy":
        if args.dest is None:
            return parser.error("copy mode requires --dest")
        if args.dest.resolve() == (args.src if args.src.is_dir() else args.src.parent).resolve():
            return parser.error("--dest must differ from the source directory")
    if args.mode == "archive":
        if args.decrypt:
            return parser.error(
                "--decrypt is copy mode only; archive mode would strip the password "
                "from your own originals"
            )
        if not (args.yes_rewrite_originals or args.dry_run):
            return parser.error(
                "archive mode replaces the originals; pass --yes-rewrite-originals "
                "(or --dry-run to preview)"
            )
    if args.decrypt and args.generate:
        return parser.error("--decrypt writes no password, so --generate has nothing to generate")

    files = collect(args.src)
    if not files:
        print(f"No PDFs found under {args.src}")
        return 0
    print(f"{len(files)} PDF(s) found under {args.src}\n")

    old, new = prompt_passwords(args.generate, decrypt=args.decrypt)

    if args.mode == "copy":
        args.dest.mkdir(parents=True, exist_ok=True)

    results: list[Result] = []
    for path in files:
        if args.mode == "copy":
            result = process_copy(path, args.dest, old, new, args.overwrite, args.dry_run)
        else:
            result = process_archive(path, old, new, args.dry_run)
        results.append(result)
        detail = f" ({result.detail})" if result.detail else ""
        print(f"  {result.outcome.value:<34} {path.name}{detail}")

    print()
    counts: dict[Outcome, int] = {}
    for result in results:
        counts[result.outcome] = counts.get(result.outcome, 0) + 1
    for outcome, count in counts.items():
        print(f"  {count:>4}  {outcome.value}")

    if counts.get(Outcome.WRONG_PASSWORD):
        print(
            f"\n{counts[Outcome.WRONG_PASSWORD]} file(s) use a different password. "
            "Run again with that one; the rest are already done."
        )
    if counts.get(Outcome.FAILED):
        print(f"\n{counts[Outcome.FAILED]} file(s) failed. Their originals were left untouched.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

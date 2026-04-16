#!/usr/bin/env python3
from __future__ import annotations

import argparse
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader, PdfWriter


DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "output" / "history-project-final-w-photos"
CLASS_HISTORY_PATTERN = re.compile(
    r"\b(?:The\s+)?History of the Class of\s+(?P<year>\d{4})\b",
    re.IGNORECASE,
)
EXPECTED_YEARS = tuple(range(1935, 2005))
HEAD_SCAN_CHAR_LIMIT = 450
HARDCODED_END_PAGES = {
    2004: 576,
}


@dataclass(frozen=True)
class ChapterMatch:
    year: int
    title: str
    start_page: int
    end_page: int = 0

    @property
    def file_name(self) -> str:
        return f"{self.title}.pdf"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Split the German Club history PDF into separate "
            "'History of the Class of XXXX' chapter PDFs."
        ),
    )
    parser.add_argument(
        "input_pdf",
        nargs="?",
        type=Path,
        help=f"Source PDF path.",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directory for generated chapter PDFs. Defaults to {DEFAULT_OUTPUT_DIR}",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing output PDFs if they already exist.",
    )
    return parser.parse_args()


def main() -> int:
    logging.getLogger("pypdf").setLevel(logging.ERROR)

    args = parse_args()
    input_pdf = args.input_pdf.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()

    if not input_pdf.is_file():
        raise SystemExit(f"Input PDF not found: {input_pdf}")

    reader = PdfReader(str(input_pdf))
    chapter_matches = find_class_history_starts(reader)

    if not chapter_matches:
        raise SystemExit("No class history chapters were detected in the source PDF.")

    validate_detected_years(chapter_matches)

    output_dir.mkdir(parents=True, exist_ok=True)
    write_chapter_pdfs(reader, chapter_matches, output_dir, force=args.force)

    print(f"Created {len(chapter_matches)} class-history PDFs in {output_dir}")
    for chapter in chapter_matches:
        print(
            f"- {chapter.file_name}: pages {chapter.start_page}-{chapter.end_page}",
        )

    return 0


def find_class_history_starts(reader: PdfReader) -> list[ChapterMatch]:
    matches_by_year: dict[int, ChapterMatch] = {}

    for page_index, page in enumerate(reader.pages, start=1):
        extracted_text = page.extract_text() or ""
        normalized_head = normalize_head_text(extracted_text)
        match = CLASS_HISTORY_PATTERN.search(normalized_head)

        if not match:
            continue

        year = int(match.group("year"))
        if year in matches_by_year:
            continue

        matches_by_year[year] = ChapterMatch(
            year=year,
            title=f"History of the Class of {year}",
            start_page=page_index,
        )

    ordered_matches = sorted(matches_by_year.values(), key=lambda chapter: chapter.start_page)
    completed_matches: list[ChapterMatch] = []

    for index, chapter in enumerate(ordered_matches):
        next_start_page = (
            ordered_matches[index + 1].start_page if index + 1 < len(ordered_matches) else len(reader.pages) + 1
        )
        end_page = HARDCODED_END_PAGES.get(chapter.year, next_start_page - 1)
        completed_matches.append(
            ChapterMatch(
                year=chapter.year,
                title=chapter.title,
                start_page=chapter.start_page,
                end_page=end_page,
            ),
        )

    return completed_matches


def normalize_head_text(extracted_text: str) -> str:
    flattened_text = " ".join(extracted_text.split())
    return flattened_text[:HEAD_SCAN_CHAR_LIMIT]


def validate_detected_years(chapters: list[ChapterMatch]) -> None:
    detected_years = tuple(chapter.year for chapter in chapters)

    if detected_years != EXPECTED_YEARS:
        missing_years = sorted(set(EXPECTED_YEARS) - set(detected_years))
        extra_years = sorted(set(detected_years) - set(EXPECTED_YEARS))
        problems: list[str] = []

        if missing_years:
            problems.append(f"missing years: {missing_years}")
        if extra_years:
            problems.append(f"unexpected years: {extra_years}")

        raise SystemExit(
            "Detected class-history years did not match the expected 1935-2004 set: "
            + ", ".join(problems),
        )


def write_chapter_pdfs(
    reader: PdfReader,
    chapters: list[ChapterMatch],
    output_dir: Path,
    *,
    force: bool,
) -> None:
    for chapter in chapters:
        destination = output_dir / chapter.file_name

        if destination.exists() and not force:
            raise SystemExit(
                f"Refusing to overwrite existing file without --force: {destination}",
            )

        writer = PdfWriter()
        for page_number in range(chapter.start_page - 1, chapter.end_page):
            writer.add_page(reader.pages[page_number])

        with destination.open("wb") as output_file:
            writer.write(output_file)


if __name__ == "__main__":
    raise SystemExit(main())

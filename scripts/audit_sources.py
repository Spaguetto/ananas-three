"""Archive supplied sources byte-for-byte and audit their structure, not genealogy.

Usage: python -X utf8 scripts/audit_sources.py --csv PATH --notes PATH --images PATH...
No person identities or family relationships are inferred by this script.
"""
import argparse
import csv
import hashlib
import io
import json
from collections import Counter, defaultdict
from pathlib import Path
import unicodedata


ROOT = Path(__file__).resolve().parents[1]


def clean(value):
    return value.replace("\ufeff", "").strip()


def name_key(value):
    return " ".join("".join(c for c in unicodedata.normalize("NFD", clean(value).casefold())
                            if unicodedata.category(c) != "Mn").split())


def digest(value):
    return hashlib.sha256(value).hexdigest()


def archive(path):
    raw = path.read_bytes()
    sha = digest(raw)
    target = ROOT / "data" / "originals" / sha / path.name
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if target.read_bytes() != raw:
            raise RuntimeError(f"Archive mismatch: {target}")
    else:
        target.write_bytes(raw)
    return {"name": path.name, "sha256": sha, "bytes": len(raw),
            "path": target.relative_to(ROOT).as_posix()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--notes", type=Path, required=True)
    parser.add_argument("--images", type=Path, nargs="*", default=[])
    args = parser.parse_args()
    files = [args.csv, args.notes, *args.images]
    # Read all supplied paths before writing anything.
    for path in files:
        path.read_bytes()
    sources = [archive(path) for path in files]
    raw = args.csv.read_bytes()
    rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"), newline=""), strict=True))
    width = max(map(len, rows), default=0)
    labels = defaultdict(list)
    for number, row in enumerate(rows, 1):
        if row and clean(row[0]):
            labels[name_key(row[0])].append(number)
    report = {
        "scope": "Structural audit only. Records are not unique people. No inferred edges.",
        "csv_sha256": digest(raw),
        "header": "No header present; the first record is data.",
        "record_count": len(rows),
        "record_widths": dict(sorted(Counter(map(len, rows)).items())),
        "empty_record_numbers": [i for i, row in enumerate(rows, 1) if not any(clean(c) for c in row)],
        "filled_columns": {str(i + 1): sum(bool(clean(r[i])) for r in rows if len(r) > i)
                           for i in range(width)},
        "nonempty_short_records": [{"record": i, "cells": row} for i, row in enumerate(rows, 1)
                                   if len(row) != 9 and any(clean(c) for c in row)],
        "other_column_values": [{"record": n, "column": i + 1, "value": value}
                                for n, row in enumerate(rows, 1) for i, value in enumerate(row)
                                if i not in (0, 1, 8) and clean(value)],
        "source_labels_column_9": dict(sorted(Counter(clean(row[8]) for row in rows
                                                       if len(row) > 8 and clean(row[8])).items())),
        "repeated_first_cell_candidates": [{"normalized_label": key, "records": numbers}
                                            for key, numbers in labels.items() if len(numbers) > 1],
        "caution": "Repeated labels suggest review only. Do not merge people by name or placeholders.",
    }
    out = ROOT / "data" / "audit"
    out.mkdir(parents=True, exist_ok=True)
    for name, value in [("source-manifest.json", {"sources": sources}), ("csv-audit.json", report)]:
        (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sources_archived": len(sources), "records": len(rows),
                      "empty_records": len(report["empty_record_numbers"]),
                      "filled_columns": report["filled_columns"],
                      "repeated_label_groups": len(report["repeated_first_cell_candidates"]),
                      "report": str(out / "csv-audit.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()

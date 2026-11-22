"""Compare identical optical scenarios between the previous and current deck."""
from collections import Counter
import csv
from pathlib import Path
import sys


MODES = ("matrix", "directions", "joker")


def read(root, version):
    result = {}
    for mode in MODES:
        with (root / f"{version}-{mode}.tsv").open(encoding="utf-8", newline="") as source:
            for row in csv.DictReader(source, delimiter="\t"):
                key = (mode, row["condition"], row["case"])
                assert key not in result
                result[key] = row
    return result


def main(root):
    before, after = read(root, "before"), read(root, "after")
    assert before.keys() == after.keys() and len(after) == 1490
    stats = {"before": Counter(), "after": Counter()}
    conditions = {}
    changes = []
    for key, older in before.items():
        newer = after[key]
        assert all(older[field] == newer[field] for field in older
                   if field not in {"verdict", "actual_ids", "actual_sum"})
        is_rejection = older["expected_ids"] == "null"
        for name, row in (("before", older), ("after", newer)):
            stats[name][("negative" if is_rejection else "complete", row["verdict"])] += 1
            if row["verdict"] == "pass":
                assert row["actual_ids"] == row["expected_ids"] and row["actual_sum"] == row["expected_sum"]
        label = (*key[:2], "negative" if is_rejection else "complete")
        summary = conditions.setdefault(label, [0, 0, 0])
        summary[0] += 1
        summary[1] += older["verdict"] == "pass"
        summary[2] += newer["verdict"] == "pass"
        if older["verdict"] != newer["verdict"] or older["actual_ids"] != newer["actual_ids"]:
            changes.append((*key, older["cards"], older["verdict"], newer["verdict"],
                            older["actual_ids"], newer["actual_ids"]))
    with (root / "comparison.tsv").open("w", encoding="utf-8", newline="") as target:
        writer = csv.writer(target, delimiter="\t")
        writer.writerow(("mode", "condition", "group", "trials", "before_pass", "after_pass"))
        writer.writerows((*condition, *counts) for condition, counts in conditions.items())
    with (root / "changed-cases.tsv").open("w", encoding="utf-8", newline="") as target:
        writer = csv.writer(target, delimiter="\t")
        writer.writerow(("mode", "condition", "case", "cards", "before", "after", "before_ids", "after_ids"))
        writer.writerows(changes)
    for name, counts in stats.items():
        print(name, dict(counts))
    for changed in changes:
        print(*changed, sep="\t")
    if any(counts[("complete", "wrong-ids")] or counts[("negative", "false-accept")]
           for counts in stats.values()):
        raise SystemExit("Incorrect card IDs or an incomplete marker was accepted")


if __name__ == "__main__":
    main(Path(sys.argv[1]))

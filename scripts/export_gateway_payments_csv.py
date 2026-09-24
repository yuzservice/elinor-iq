#!/usr/bin/env python3
"""Export DigiPay/SnappPay order invoice+payment rows into gateway import CSVs."""
from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "source" / "elinor_new13-septamber-2026.sql"
OUT_DIR = Path("/tmp/elinor_gateway_import")
ORDER_TYPE = "Modules\\\\Order\\\\Entities\\\\Order"


def main():
    dump = Path(sys.argv[1]) if len(sys.argv) > 1 else SOURCE
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else OUT_DIR
    if not dump.exists():
        print(f"Dump not found: {dump}", file=sys.stderr)
        sys.exit(1)
    out.mkdir(parents=True, exist_ok=True)

    inv_re = re.compile(
        r"\((\d+),(\d+),(\d+),'([^']+)',(\d+),'"
        + re.escape(ORDER_TYPE)
        + r"',(?:NULL|'[^']*'),'(success|failed|pending)'"
    )
    pay_re = re.compile(
        r"\((\d+),(\d+),'[^']*',(?:NULL|'[^']*'),'(digipay|snapppay)',"
        r"(?:NULL|\d+)?,'(success|failed|pending)'(?:,NULL|'[^']*')?,"
        r"'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})','(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})'"
    )

    needed_invoice_ids = set()
    payment_rows = []
    with dump.open("r", encoding="utf-8", errors="replace") as handle:
        in_pay = False
        for line in handle:
            if "INSERT INTO `payments`" in line:
                in_pay = True
            elif in_pay and line.startswith("INSERT INTO ") and "`payments`" not in line:
                break
            if not in_pay:
                continue
            for match in pay_re.finditer(line):
                inv_id = int(match.group(2))
                needed_invoice_ids.add(inv_id)
                payment_rows.append(
                    {
                        "source_id": int(match.group(1)),
                        "invoice_source_id": inv_id,
                        "gateway": match.group(3),
                        "status": match.group(4),
                        "success_at": match.group(5) if match.group(4) == "success" else "",
                        "created_at": match.group(5),
                        "updated_at_source": match.group(6),
                    }
                )

    invoice_rows = []
    with dump.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if "INSERT INTO `invoices`" not in line:
                continue
            for match in inv_re.finditer(line):
                inv_id = int(match.group(1))
                if inv_id not in needed_invoice_ids:
                    continue
                rest = line[match.end() : match.end() + 160]
                created_m = re.search(r",'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})'", rest)
                updated_m = re.search(
                    r",'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})','(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})'\)",
                    rest,
                )
                invoice_rows.append(
                    {
                        "source_id": inv_id,
                        "amount": int(match.group(2)),
                        "wallet_amount": int(match.group(3)),
                        "inv_type": match.group(4),
                        "order_source_id": int(match.group(5)),
                        "status": match.group(6),
                        "created_at": created_m.group(1) if created_m else "",
                        "updated_at_source": updated_m.group(2) if updated_m else "",
                    }
                )

    invoice_ids = {row["source_id"] for row in invoice_rows}
    payment_rows = [row for row in payment_rows if row["invoice_source_id"] in invoice_ids]

    inv_path = out / "invoices.csv"
    pay_path = out / "payments.csv"
    with inv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(
            [
                "source_id",
                "amount",
                "wallet_amount",
                "inv_type",
                "order_source_id",
                "status",
                "created_at",
                "updated_at_source",
            ]
        )
        for row in invoice_rows:
            writer.writerow(
                [
                    row["source_id"],
                    row["amount"],
                    row["wallet_amount"],
                    row["inv_type"],
                    row["order_source_id"],
                    row["status"],
                    row["created_at"],
                    row["updated_at_source"],
                ]
            )

    with pay_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(
            [
                "source_id",
                "invoice_source_id",
                "gateway",
                "status",
                "success_at",
                "created_at",
                "updated_at_source",
            ]
        )
        for row in payment_rows:
            writer.writerow(
                [
                    row["source_id"],
                    row["invoice_source_id"],
                    row["gateway"],
                    row["status"],
                    row["success_at"],
                    row["created_at"],
                    row["updated_at_source"],
                ]
            )

    print(f"Wrote {len(invoice_rows)} invoices and {len(payment_rows)} payments to {out}")


if __name__ == "__main__":
    main()

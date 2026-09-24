#!/usr/bin/env python3
"""Analyze digipay/snapppay payments in Elinor source SQL dump."""
import re
from collections import Counter, defaultdict
from datetime import datetime

SOURCE = "/Users/rezasoltani/Documents/elinor-iq-v2/source/elinor_new13-septamber-2026.sql"
ORDER_TYPE = "Modules\\\\Order\\\\Entities\\\\Order"


def load_order_invoices(path):
    invoices = {}
    inv_re = re.compile(
        r"\((\d+),(\d+),(\d+),'(?:gateway|wallet|both)',(\d+),'"
        + re.escape(ORDER_TYPE)
        + r"',(?:NULL|'[^']*'),'(success|failed|pending)'"
    )
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if "INSERT INTO `invoices`" not in line:
                continue
            for m in inv_re.finditer(line):
                rest = line[m.end() : m.end() + 120]
                date_m = re.search(r",'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})'", rest)
                invoices[int(m.group(1))] = {
                    "amount": int(m.group(2)),
                    "order_id": int(m.group(4)),
                    "status": m.group(5),
                    "created_at": date_m.group(1) if date_m else None,
                }
    return invoices


def load_payments(path):
    payment_re = re.compile(
        r"\(\d+,(\d+),'[^']*',(?:NULL|'[^']*'),'(digipay|snapppay|[^']+)',"
        r"(?:NULL|\d+)?,'(success|failed|pending)'"
    )
    payments = []
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        in_payments = False
        for line in f:
            if "INSERT INTO `payments`" in line:
                in_payments = True
            elif in_payments and line.startswith("INSERT INTO ") and "`payments`" not in line:
                break
            if not in_payments:
                continue
            for m in payment_re.finditer(line):
                payments.append((int(m.group(1)), m.group(2), m.group(3)))
    return payments


def pos_gateway_totals(path, cutoff):
    # mini_orders columns include digipay_cashier_amount, snappay_cashier_amount near end.
    # Parse tuples loosely by searching field names in CREATE TABLE order.
    totals = {"digipay": 0, "snapppay": 0}
    counts = {"digipay": 0, "snapppay": 0}
    recent = {"digipay": 0, "snapppay": 0}
    row_re = re.compile(
        r"\((\d+),.*?,'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})',.*?,(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)"
    )
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        in_rows = False
        for line in f:
            if "INSERT INTO `mini_orders`" in line:
                in_rows = True
            elif in_rows and line.startswith("INSERT INTO ") and "`mini_orders`" not in line:
                break
            if not in_rows:
                continue
            # Fallback: extract trailing payment columns from each tuple fragment.
            for chunk in re.findall(r"\((\d+),([^;]+?)\)(?:,|\;)", line):
                source_id, body = chunk
                parts = body.split(",")
                if len(parts) < 20:
                    continue
                created = parts[-3].strip("'")
                digipay = int(parts[-6])
                snappay = int(parts[-5])
                try:
                    dt = datetime.strptime(created, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    continue
                if digipay:
                    totals["digipay"] += digipay
                    counts["digipay"] += 1
                    if dt >= cutoff:
                        recent["digipay"] += digipay
                if snappay:
                    totals["snapppay"] += snappay
                    counts["snappay"] += 1
                    if dt >= cutoff:
                        recent["snappay"] += snappay
    return totals, counts, recent


def main():
    cutoff = datetime(2026, 8, 14)

    print("Loading order invoices...")
    invoices = load_order_invoices(SOURCE)
    print(f"Order invoices: {len(invoices):,} (success: {sum(1 for v in invoices.values() if v['status']=='success'):,})")

    print("Loading payments...")
    payments = load_payments(SOURCE)
    print(f"Payment rows: {len(payments):,}")
    gw_all = Counter(g for _, g, _ in payments)
    print("Top gateways:", ", ".join(f"{g}={c:,}" for g, c in gw_all.most_common(8)))

    stats = defaultdict(lambda: {"count": 0, "amount": 0})
    recent = defaultdict(lambda: {"count": 0, "amount": 0})
    for inv_id, gw, pay_status in payments:
        if gw not in ("digipay", "snapppay") or pay_status != "success":
            continue
        inv = invoices.get(inv_id)
        if not inv or inv["status"] != "success":
            continue
        stats[gw]["count"] += 1
        stats[gw]["amount"] += inv["amount"]
        if inv["created_at"]:
            dt = datetime.strptime(inv["created_at"], "%Y-%m-%d %H:%M:%S")
            if dt >= cutoff:
                recent[gw]["count"] += 1
                recent[gw]["amount"] += inv["amount"]

    print("\n=== ONLINE (invoices + payments, both success) ===")
    for gw in ("digipay", "snapppay"):
        s = stats[gw]
        print(f"{gw}: {s['count']:,} tx, {s['amount']:,} Rial (~{s['amount']//10:,} Toman)")
    print(f"\n=== ONLINE since {cutoff.date()} ===")
    for gw in ("digipay", "snapppay"):
        r = recent[gw]
        print(f"{gw}: {r['count']:,} tx, {r['amount']:,} Rial (~{r['amount']//10:,} Toman)")

    print("\nParsing POS mini_orders (may take a minute)...")
    pos_totals, pos_counts, pos_recent = pos_gateway_totals(SOURCE, cutoff)
    print("\n=== POS (mini_orders tender columns, all time) ===")
    for gw in ("digipay", "snapppay"):
        print(
            f"{gw}: {pos_counts[gw]:,} sales with value, "
            f"{pos_totals[gw]:,} Rial (~{pos_totals[gw]//10:,} Toman)"
        )
    print(f"\n=== POS since {cutoff.date()} ===")
    for gw in ("digipay", "snapppay"):
        print(f"{gw}: {pos_recent[gw]:,} Rial (~{pos_recent[gw]//10:,} Toman)")


if __name__ == "__main__":
    main()

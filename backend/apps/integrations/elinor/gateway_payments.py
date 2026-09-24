"""Parse and persist online DigiPay / SnappPay payments from Elinor order payloads."""

from __future__ import annotations

from django.utils import timezone

from apps.integrations.elinor.parsers import as_int, extract_list, parse_datetime
from apps.sales.models import OnlineInvoice, OnlinePayment, Order

GATEWAY_METRICS = frozenset({"digipay", "snapppay"})
ORDER_ENTITY_MARKERS = ("Order\\Entities\\Order", "Order/Entities/Order")


def is_order_payable_type(payable_type) -> bool:
    text = str(payable_type or "")
    return any(marker in text for marker in ORDER_ENTITY_MARKERS)


def payment_paid_at(*, success_at, invoice_updated_at, payment_created_at, invoice_created_at):
    return (
        success_at
        or invoice_updated_at
        or payment_created_at
        or invoice_created_at
        or timezone.now()
    )


def extract_order_payment_rows(order_source_id, detail):
    if not isinstance(detail, dict):
        return []

    rows = []
    seen = set()

    def add_row(invoice, payment):
        invoice_source_id = as_int(invoice.get("id"), default=None)
        payment_source_id = as_int(payment.get("id"), default=None)
        gateway = str(payment.get("gateway") or "").strip().lower()
        if not invoice_source_id or not payment_source_id or gateway not in GATEWAY_METRICS:
            return
        key = (invoice_source_id, payment_source_id)
        if key in seen:
            return
        seen.add(key)

        payable_id = as_int(invoice.get("payable_id"), default=None)
        order_id = payable_id or order_source_id
        if not is_order_payable_type(invoice.get("payable_type")) and payable_id != order_source_id:
            return

        invoice_created = parse_datetime(invoice.get("created_at"))
        invoice_updated = parse_datetime(invoice.get("updated_at"))
        payment_created = parse_datetime(payment.get("created_at"))
        success_at = parse_datetime(payment.get("success_at"))
        rows.append(
            {
                "invoice_source_id": invoice_source_id,
                "payment_source_id": payment_source_id,
                "order_source_id": order_id,
                "amount": as_int(invoice.get("amount")),
                "invoice_status": str(invoice.get("status") or ""),
                "inv_type": str(invoice.get("type") or ""),
                "gateway": gateway,
                "payment_status": str(payment.get("status") or ""),
                "success_at": success_at,
                "invoice_created_at": invoice_created,
                "invoice_updated_at": invoice_updated,
                "payment_created_at": payment_created,
                "payment_updated_at": parse_datetime(payment.get("updated_at")),
            }
        )

    invoices = extract_list(detail, ("invoices", "order_invoices", "orderInvoices"))
    single_invoice = detail.get("invoice")
    if isinstance(single_invoice, dict):
        invoices = [single_invoice, *invoices]

    for invoice in invoices:
        if not isinstance(invoice, dict):
            continue
        payments = extract_list(invoice, ("payments", "paymentAttempts", "payment_attempts"))
        single_payment = invoice.get("payment")
        if isinstance(single_payment, dict):
            payments = [single_payment, *payments]
        if payments:
            for payment in payments:
                if isinstance(payment, dict):
                    add_row(invoice, payment)

    for payment in extract_list(detail, ("payments", "order_payments", "orderPayments")):
        if not isinstance(payment, dict):
            continue
        invoice = payment.get("invoice")
        if isinstance(invoice, dict):
            add_row(invoice, payment)

    return rows


def upsert_order_gateway_payments(order, detail):
    if not isinstance(order, Order):
        return 0
    rows = extract_order_payment_rows(order.source_id, detail)
    upserted = 0
    for row in rows:
        invoice_defaults = {
            "order_source_id": row["order_source_id"],
            "order": order,
            "amount": row["amount"],
            "status": row["invoice_status"],
            "inv_type": row["inv_type"],
            "created_at": row["invoice_created_at"] or timezone.now(),
            "updated_at_source": row["invoice_updated_at"],
        }
        invoice, _ = OnlineInvoice.objects.update_or_create(
            source_id=row["invoice_source_id"],
            defaults=invoice_defaults,
        )
        if invoice.order_id != order.id:
            invoice.order = order
            invoice.save(update_fields=["order"])

        paid_at = payment_paid_at(
            success_at=row["success_at"],
            invoice_updated_at=row["invoice_updated_at"],
            payment_created_at=row["payment_created_at"],
            invoice_created_at=row["invoice_created_at"],
        )
        OnlinePayment.objects.update_or_create(
            source_id=row["payment_source_id"],
            defaults={
                "invoice": invoice,
                "gateway": row["gateway"],
                "status": row["payment_status"],
                "amount": row["amount"],
                "success_at": row["success_at"],
                "paid_at": paid_at,
                "created_at": row["payment_created_at"] or paid_at,
                "updated_at_source": row["payment_updated_at"],
            },
        )
        upserted += 1
    return upserted

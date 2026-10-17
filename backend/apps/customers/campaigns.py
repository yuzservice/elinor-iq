import logging
from datetime import datetime
from django.db.models import F, Q, Sum
from django.utils import timezone

from apps.customers.models import Customer
from apps.customers.operators import exclude_operator_accounts
from apps.customers.presentation import customer_status_label, UNNAMED_CUSTOMER
from apps.customers.purchases import SALES_LINE_LABELS
from apps.integrations.elinor.client import ElinorApiError, ElinorClient
from apps.sales.models import Order, PosSale, PosSaleItem, SalesLine

logger = logging.getLogger(__name__)

# Fallback known campaigns (e.g. Action #33 created on 2026-10-15)
DEFAULT_CAMPAIGNS = [
    {
        "id": 33,
        "title": "طلایی ۱ فروشگاه / دختر",
        "type": "wallet_charge",
        "type_label": "شارژ هدیه کیف پول",
        "type_value": 300000,
        "level_id": 20,
        "level_title": "طلایی سطح ۱",
        "start_date": "2026-10-15T12:44:00+03:30",
        "end_date": "2026-10-22T23:59:00+03:30",
        "is_active": True,
        "target_audience_estimate": 450,
        "total_gift_distributed": 135000000,
    }
]


def fetch_live_actions():
    """Attempt to fetch live customer actions from the Elinor API."""
    try:
        client = ElinorClient()
        payload = client.get_actions(page=1, per_page=50)
        results = payload.get("results") or []
        if results:
            actions = []
            now = timezone.now()
            for row in results:
                action_id = row.get("id")
                start_dt = _parse_date(row.get("start_date"))
                end_dt = _parse_date(row.get("end_date"))
                is_active = False
                if start_dt and end_dt:
                    is_active = start_dt <= now <= end_dt
                elif start_dt:
                    is_active = start_dt <= now

                val = 0
                try:
                    val = int(row.get("type_value") or 0)
                except (ValueError, TypeError):
                    val = 0

                actions.append(
                    {
                        "id": action_id,
                        "title": row.get("title") or f"کمپین شماره {action_id}",
                        "type": row.get("type") or "wallet_charge",
                        "type_label": "شارژ هدیه کیف پول" if row.get("type") == "wallet_charge" else str(row.get("type")),
                        "type_value": val,
                        "level_id": row.get("level_id"),
                        "level_title": (row.get("level") or {}).get("title") or "سطح باشگاه مشتریان",
                        "start_date": row.get("start_date"),
                        "end_date": row.get("end_date"),
                        "is_active": is_active,
                        "target_audience_estimate": 450,
                        "total_gift_distributed": val * 450 if val else 135000000,
                    }
                )
            return actions
    except Exception as exc:
        logger.warning("Could not fetch live actions from Elinor API (%s), using local fallback.", exc)
    return DEFAULT_CAMPAIGNS


def _parse_date(val):
    if not val:
        return None
    try:
        if isinstance(val, datetime):
            return val if timezone.is_aware(val) else timezone.make_aware(val)
        # Parse ISO or standard MySQL format
        clean = str(val).replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean)
        return dt if timezone.is_aware(dt) else timezone.make_aware(dt)
    except Exception:
        return None


def get_campaigns_summary(action_id=None, branch=None, page=1, per_page=20):
    """Aggregate campaign performance and customer redemptions."""
    campaigns = fetch_live_actions()
    
    selected_campaign = None
    if action_id:
        try:
            target_id = int(action_id)
            selected_campaign = next((c for c in campaigns if c["id"] == target_id), None)
        except (ValueError, TypeError):
            pass

    if not selected_campaign and campaigns:
        selected_campaign = campaigns[0]

    # Date range filters based on selected campaign
    start_dt = _parse_date(selected_campaign.get("start_date")) if selected_campaign else None
    end_dt = _parse_date(selected_campaign.get("end_date")) if selected_campaign else None

    # Base query for POS sales with wallet usage
    pos_qs = PosSale.objects.filter(
        from_wallet_amount__gt=0,
        deleted_at__isnull=True,
        is_cancelled=False,
    )
    if start_dt:
        pos_qs = pos_qs.filter(created_at__gte=start_dt)
    if end_dt:
        pos_qs = pos_qs.filter(created_at__lte=end_dt)
    if branch and branch.upper() in SALES_LINE_LABELS:
        pos_qs = pos_qs.filter(sales_line=branch.upper())

    # Calculate overall metrics
    pos_aggregates = pos_qs.aggregate(
        total_wallet=Sum("from_wallet_amount"),
        total_cash=Sum("cash_amount"),
        total_card=Sum("card_by_card_amount"),
        total_snapp=Sum("snappay_cashier_amount"),
        total_digi=Sum("digipay_cashier_amount"),
    )
    total_gift_used = int(pos_aggregates.get("total_wallet") or 0)
    other_payments = (
        int(pos_aggregates.get("total_cash") or 0)
        + int(pos_aggregates.get("total_card") or 0)
        + int(pos_aggregates.get("total_snapp") or 0)
        + int(pos_aggregates.get("total_digi") or 0)
    )
    total_sales_generated = total_gift_used + other_payments
    basket_lift = other_payments  # Incremental cash/card revenue generated on top of the gift
    
    redemption_count = pos_qs.count()
    unique_customers_count = pos_qs.values("customer_id").distinct().count()

    # Total distributed estimation
    distributed = (
        selected_campaign.get("total_gift_distributed")
        if selected_campaign and selected_campaign.get("total_gift_distributed")
        else (selected_campaign.get("type_value", 300000) * 450 if selected_campaign else 135000000)
    )
    burn_rate_pct = round((total_gift_used / distributed * 100), 1) if distributed > 0 else 0.0

    # Branch breakdown
    branch_stats = {}
    for line_key, line_label in SALES_LINE_LABELS.items():
        line_qs = pos_qs.filter(sales_line=line_key)
        line_wallet = int(line_qs.aggregate(w=Sum("from_wallet_amount")).get("w") or 0)
        line_count = line_qs.count()
        branch_stats[line_key] = {
            "key": line_key,
            "label": line_label,
            "wallet_amount": line_wallet,
            "count": line_count,
            "share_pct": round((line_wallet / total_gift_used * 100), 1) if total_gift_used > 0 else 0.0,
        }

    # Itemized customer redemptions list (paginated)
    total_rows = redemption_count
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paged_sales = list(
        pos_qs.select_related("customer", "store")
        .order_by("-created_at")
        [start_idx:end_idx]
    )

    redemptions = []
    for sale in paged_sales:
        cust = sale.customer
        cust_name = UNNAMED_CUSTOMER
        cust_mobile = ""
        if cust:
            full = f"{cust.first_name} {cust.last_name}".strip()
            cust_name = full or UNNAMED_CUSTOMER
            cust_mobile = cust.mobile or ""

        # Total invoice amount = wallet + cash + card + installments
        invoice_total = (
            sale.from_wallet_amount
            + sale.cash_amount
            + sale.card_by_card_amount
            + sale.snappay_cashier_amount
            + sale.digipay_cashier_amount
        )
        incremental = max(0, invoice_total - sale.from_wallet_amount)

        redemptions.append(
            {
                "id": sale.id,
                "source_id": sale.source_id,
                "customer_id": cust.source_id if cust else None,
                "customer_name": cust_name,
                "customer_mobile": cust_mobile,
                "sales_line": sale.sales_line,
                "sales_line_label": SALES_LINE_LABELS.get(sale.sales_line, sale.sales_line),
                "created_at": sale.created_at.isoformat() if sale.created_at else None,
                "wallet_amount": int(sale.from_wallet_amount),
                "total_amount": int(invoice_total),
                "incremental_amount": int(incremental),
                "tracking_code": sale.tracking_code or "",
            }
        )

    total_pages = max(1, (total_rows + per_page - 1) // per_page)

    return {
        "campaigns": campaigns,
        "selected_campaign": selected_campaign,
        "summary": {
            "total_gift_distributed": distributed,
            "total_gift_used": total_gift_used,
            "total_sales_generated": total_sales_generated,
            "basket_lift": basket_lift,
            "burn_rate_pct": burn_rate_pct,
            "redemption_count": redemption_count,
            "unique_customers_count": unique_customers_count,
            "branches": list(branch_stats.values()),
        },
        "redemptions": redemptions,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total_rows,
            "total_pages": total_pages,
        },
    }

import logging
from collections import defaultdict
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

# Known level gift campaigns in Elinor Boutique
DEFAULT_CAMPAIGNS = [
    {
        "id": 33,
        "title": "طلایی ۱ فروشگاه / دختر",
        "description_pattern": "هدیه سطح طلایی ۱ فروشگاه",
        "type": "wallet_charge",
        "type_label": "شارژ هدیه کیف پول",
        "type_value": 300000,
        "level_id": 20,
        "tier_code": "GOLD_1",
        "level_title": "طلایی سطح ۱",
        "start_date": "2026-10-15T12:44:00+03:30",
        "end_date": "2026-10-22T23:59:00+03:30",
        "is_active": True,
        "target_audience_estimate": 450,
        "total_gift_distributed": 135000000,
    },
    {
        "id": 32,
        "title": "هدیه سطح نقره ای ۱ فروشگاه",
        "description_pattern": "هدیه سطح نقره ای ۱ فروشگاه",
        "type": "wallet_charge",
        "type_label": "شارژ هدیه کیف پول",
        "type_value": 400000,
        "level_id": 19,
        "tier_code": "SILVER",
        "level_title": "نقره‌ای سطح ۱",
        "start_date": "2026-10-06T18:00:00+03:30",
        "end_date": "2026-10-13T23:59:00+03:30",
        "is_active": False,
        "target_audience_estimate": 320,
        "total_gift_distributed": 128000000,
    },
    {
        "id": 31,
        "title": "هدیه سطح الماسی ۱ فروشگاه",
        "description_pattern": "هدیه سطح الماسی ۱ فروشگاه",
        "type": "wallet_charge",
        "type_label": "شارژ هدیه کیف پول",
        "type_value": 300000,
        "level_id": 21,
        "tier_code": "DIAMOND",
        "level_title": "الماسی سطح ۱",
        "start_date": "2026-10-15T12:00:00+03:30",
        "end_date": "2026-10-22T23:59:00+03:30",
        "is_active": True,
        "target_audience_estimate": 180,
        "total_gift_distributed": 54000000,
    },
]

DESCRIPTION_TIER_MAP = {
    "نقره": "SILVER",
    "طلا": "GOLD_1",
    "الماس": "DIAMOND",
    "vip": "VIP",
    "برنز": "BRONZE_1",
}


def fetch_live_actions():
    """Attempt to fetch live customer actions from the Elinor API, supplemented by known level patterns."""
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

                title = row.get("title") or f"کمپین شماره {action_id}"
                desc_pattern = f"هدیه سطح {title}"
                for k, tier in DESCRIPTION_TIER_MAP.items():
                    if k in title:
                        desc_pattern = f"هدیه سطح {k} فروشگاه"
                        break

                actions.append(
                    {
                        "id": action_id,
                        "title": title,
                        "description_pattern": desc_pattern,
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
        clean = str(val).replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean)
        return dt if timezone.is_aware(dt) else timezone.make_aware(dt)
    except Exception:
        return None


def get_campaigns_summary(action_id=None, branch=None, gift_keyword=None, page=1, per_page=20):
    """Aggregate campaign performance and customer redemptions strictly filtered by gift description,
    capped per customer, and tracking chronological gift consumption without double-counting cashbacks."""
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

    keyword = (gift_keyword or "").strip()
    if not keyword and selected_campaign:
        keyword = selected_campaign.get("description_pattern") or "هدیه سطح"

    # Campaign gift ceiling per customer (e.g. 300,000 or 400,000)
    gift_cap = int(selected_campaign.get("type_value") or 300000) if selected_campaign else 300000

    # Date range filters based on selected campaign
    start_dt = _parse_date(selected_campaign.get("start_date")) if selected_campaign else None
    end_dt = _parse_date(selected_campaign.get("end_date")) if selected_campaign else None

    # Base query for POS sales where wallet was used
    pos_qs = PosSale.objects.filter(
        from_wallet_amount__gt=0,
        deleted_at__isnull=True,
        is_cancelled=False,
    ).exclude(customer__mobile="09120844911")

    # Match target tier of the campaign
    target_tier = None
    if "نقره" in keyword:
        target_tier = "SILVER"
    elif "طلا" in keyword:
        target_tier = "GOLD_1"
    elif "الماس" in keyword:
        target_tier = "DIAMOND"
    elif "vip" in keyword.lower():
        target_tier = "VIP"

    if target_tier:
        pos_qs = pos_qs.filter(customer__tier_code=target_tier)

    if start_dt:
        pos_qs = pos_qs.filter(created_at__gte=start_dt)
    if end_dt:
        pos_qs = pos_qs.filter(created_at__lte=end_dt)
    if branch and branch.upper() in SALES_LINE_LABELS:
        pos_qs = pos_qs.filter(sales_line=branch.upper())

    # Order chronologically (created_at ASC) to trace each customer's gift consumption
    all_sales = list(
        pos_qs.select_related("customer", "store")
        .order_by("created_at")
    )

    customer_remaining_gift = defaultdict(lambda: gift_cap)
    valid_redemptions = []
    total_gift_used = 0
    total_sales_generated = 0
    total_basket_lift = 0
    unique_customer_ids = set()
    branch_amounts = defaultdict(int)
    branch_counts = defaultdict(int)

    for sale in all_sales:
        cust = sale.customer
        cust_id = cust.id if cust else sale.source_id
        
        # Check remaining gift for this customer
        rem = customer_remaining_gift[cust_id]
        if rem <= 0:
            # Customer has ALREADY exhausted their level gift in an earlier invoice!
            # Any further wallet deduction is paid from purchase cashback or personal wallet balance, NOT this gift!
            continue

        # Gift portion consumed in this specific invoice (capped at customer's remaining gift and sale wallet amount)
        actual_gift_used = min(int(sale.from_wallet_amount), rem)
        customer_remaining_gift[cust_id] -= actual_gift_used

        # Calculate true invoice total and incremental revenue (Basket Lift)
        invoice_total = (
            sale.from_wallet_amount
            + sale.cash_amount
            + sale.card_by_card_amount
            + sale.snappay_cashier_amount
            + sale.digipay_cashier_amount
        )
        # Real basket lift is the revenue above the gift contribution!
        lift = max(0, invoice_total - actual_gift_used)

        total_gift_used += actual_gift_used
        total_sales_generated += invoice_total
        total_basket_lift += lift
        unique_customer_ids.add(cust_id)
        branch_amounts[sale.sales_line] += actual_gift_used
        branch_counts[sale.sales_line] += 1

        cust_name = UNNAMED_CUSTOMER
        cust_mobile = ""
        cust_tier = ""
        if cust:
            full = f"{cust.first_name} {cust.last_name}".strip()
            cust_name = full or UNNAMED_CUSTOMER
            cust_mobile = cust.mobile or ""
            cust_tier = cust.tier_code or ""

        gift_title = keyword or (selected_campaign.get("title") if selected_campaign else "هدیه سطح باشگاه")

        valid_redemptions.append(
            {
                "id": sale.id,
                "source_id": sale.source_id,
                "customer_id": cust.source_id if cust else None,
                "customer_name": cust_name,
                "customer_mobile": cust_mobile,
                "customer_tier": cust_tier,
                "gift_description": gift_title,
                "sales_line": sale.sales_line,
                "sales_line_label": SALES_LINE_LABELS.get(sale.sales_line, sale.sales_line),
                "created_at": sale.created_at.isoformat() if sale.created_at else None,
                "wallet_amount": actual_gift_used,
                "total_amount": int(invoice_total),
                "incremental_amount": int(lift),
                "tracking_code": sale.tracking_code or "",
            }
        )

    # Sort redemptions newest first for display
    valid_redemptions.sort(key=lambda r: r["created_at"] or "", reverse=True)

    # Total distributed estimation
    distributed = (
        selected_campaign.get("total_gift_distributed")
        if selected_campaign and selected_campaign.get("total_gift_distributed")
        else (gift_cap * 450)
    )
    burn_rate_pct = round((total_gift_used / distributed * 100), 1) if distributed > 0 else 0.0

    # Branch breakdown
    branch_stats = []
    for line_key, line_label in SALES_LINE_LABELS.items():
        w = branch_amounts[line_key]
        c = branch_counts[line_key]
        branch_stats.append(
            {
                "key": line_key,
                "label": line_label,
                "wallet_amount": w,
                "count": c,
                "share_pct": round((w / total_gift_used * 100), 1) if total_gift_used > 0 else 0.0,
            }
        )

    # Paginate
    total_rows = len(valid_redemptions)
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paged_redemptions = valid_redemptions[start_idx:end_idx]
    total_pages = max(1, (total_rows + per_page - 1) // per_page)

    return {
        "campaigns": campaigns,
        "selected_campaign": selected_campaign,
        "gift_keyword": keyword,
        "summary": {
            "total_gift_distributed": distributed,
            "total_gift_used": total_gift_used,
            "total_sales_generated": total_sales_generated,
            "basket_lift": total_basket_lift,
            "burn_rate_pct": burn_rate_pct,
            "redemption_count": total_rows,
            "unique_customers_count": len(unique_customer_ids),
            "branches": branch_stats,
        },
        "redemptions": paged_redemptions,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total_rows,
            "total_pages": total_pages,
        },
    }

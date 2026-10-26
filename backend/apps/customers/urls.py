from django.urls import path

from . import views

urlpatterns = [
    path("reports/", views.reports),
    path("campaigns/", views.customer_campaigns),
    path("export/", views.customer_export),
    path("refresh-tiers/", views.refresh_tiers),
    path("tiers/", views.customer_tiers),
    path("rfm/summary/", views.rfm_summary),
    path("rfm/movement/", views.rfm_movement),
    path("rfm/call-list/", views.rfm_call_list),
    path("internal-accounts/", views.internal_accounts),
    path("internal-accounts/<int:account_id>/", views.internal_account_detail),
    path("tier-rules/", views.tier_rules),
    path("tier-rules/draft/", views.tier_rules_draft),
    path("tier-rules/draft/preview/", views.tier_rules_preview),
    path("tier-rules/draft/activate/", views.tier_rules_activate),
    path("tier-rules/<int:version>/restore/", views.tier_rules_restore),
    path("", views.customer_list),
    path("<int:source_id>/purchases/", views.customer_purchases),
    path("<int:source_id>/products/", views.customer_products),
    path("<int:source_id>/", views.customer_detail),
]

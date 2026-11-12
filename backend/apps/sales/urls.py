from django.urls import path

from . import views

urlpatterns = [
    path("filters/", views.filter_options),
    path("targets/", views.targets_view),
    path("targets/copy-preview/", views.targets_copy_preview),
    path("kpis/", views.overview_kpis),
    path("trend/", views.overview_trend),
    path("summary/", views.summary),
    path("orders/", views.order_list),
    path("products/", views.product_list),
]

from django.urls import path

from . import views

urlpatterns = [
    path("reports/", views.reports),
    path("export/", views.customer_export),
    path("", views.customer_list),
    path("<int:source_id>/purchases/", views.customer_purchases),
    path("<int:source_id>/products/", views.customer_products),
    path("<int:source_id>/", views.customer_detail),
]

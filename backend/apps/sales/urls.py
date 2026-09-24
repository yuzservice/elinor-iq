from django.urls import path

from . import views

urlpatterns = [
    path("filters/", views.filter_options),
    path("summary/", views.summary),
    path("orders/", views.order_list),
    path("products/", views.product_list),
]

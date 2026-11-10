from django.urls import path

from . import views

urlpatterns = [
    path("categories/", views.category_tree, name="category_tree"),
    path("summary/", views.products_summary, name="products_summary"),
    path("table/", views.products_table, name="products_table"),
    path("pairs/", views.product_pairs, name="product_pairs"),
    path("<int:product_id>/", views.product_detail, name="product_detail"),
    path("<int:product_id>/call-list/", views.product_call_list, name="product_call_list"),
]

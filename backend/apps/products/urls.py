from django.urls import path

from . import views

urlpatterns = [
    path("", views.product_list, name="product_list"),
    path("categories/", views.category_tree, name="category_tree"),
    path("bundles/", views.product_bundles, name="product_bundles"),
    path("size-color/", views.product_size_color, name="product_size_color"),
    path("<int:product_id>/360/", views.product_360, name="product_360"),
]

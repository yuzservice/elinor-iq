from django.urls import path

from . import views

urlpatterns = [
    path("layout/", views.layout),
    path("slots/<int:slot_id>/", views.slot_product),
    path("products/", views.products),
    path("templates/", views.templates),
    path("templates/<int:template_id>/", views.template),
]

from django.urls import path

from . import views

urlpatterns = [
    path("summary/", views.home_summary),
    path("targets/", views.home_targets),
]

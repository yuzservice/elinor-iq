from django.urls import path

from . import views

urlpatterns = [
    path("status/", views.status_view),
    path("sync/", views.trigger_sync),
]

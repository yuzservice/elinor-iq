from django.urls import path

from . import views

urlpatterns = [
    path("summary/", views.summary),
    path("debug/", views.debug),
    path("instagram/webhook/", views.instagram_webhook),
    path("instagram/webhook", views.instagram_webhook),
    path("sessions/", views.session_list),
    path("sessions/<int:session_id>/reply/", views.send_reply),
    path("sessions/<int:session_id>/", views.session_detail),
]

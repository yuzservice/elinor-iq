from django.urls import path

from . import views

urlpatterns = [
    path("settings/", views.settings_view),
    path("tags/", views.tags_view),
    path("tags/<int:tag_id>/", views.tag_detail),
    path("agents/", views.agents_view),
    path("lists/", views.lists_view),
    path("lists/excel/", views.list_excel),
    path("lists/<int:list_id>/", views.list_detail),
    path("programs/", views.programs_view),
    path("programs/<int:program_id>/", views.program_detail),
    path("programs/<int:program_id>/preview/", views.program_preview),
    path("programs/<int:program_id>/activate/", views.program_activate),
    path("programs/<int:program_id>/status/", views.program_status),
    path("programs/<int:program_id>/form/", views.program_form),
    path("programs/<int:program_id>/form/publish/", views.program_form_publish),
]

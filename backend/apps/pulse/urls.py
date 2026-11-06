from django.urls import path

from . import views

urlpatterns = [
    path("status/", views.status),
    path("home/", views.home),
    path("tasks/<int:task_id>/toggle/", views.toggle_task),
    path("posts/", views.posts),
    path("posts/<int:post_id>/", views.post_detail),
    path("products/", views.products),
    path("products/<str:code>/", views.product_detail),
    path("hours/", views.golden_hours),
    path("media/<int:asset_id>/", views.media),
]

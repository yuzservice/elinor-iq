from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", include("apps.core.health_urls")),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/home/", include("apps.core.urls")),
    path("api/sales/", include("apps.sales.urls")),
    path("api/customers/", include("apps.customers.urls")),
    path("api/products/", include("apps.products.urls")),
    path("api/system/", include("apps.system.urls")),
    path("api/smart-direct/", include("apps.smart_direct.urls")),
]

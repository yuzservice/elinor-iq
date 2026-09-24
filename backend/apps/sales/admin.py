from django.contrib import admin

from .models import Order, OrderItem, PosSale, PosSaleItem, Store

admin.site.register(Order)
admin.site.register(OrderItem)
admin.site.register(Store)
admin.site.register(PosSale)
admin.site.register(PosSaleItem)

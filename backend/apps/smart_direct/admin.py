from django.contrib import admin

from .models import SmartDirectEvent, SmartDirectSession

admin.site.register(SmartDirectSession)
admin.site.register(SmartDirectEvent)

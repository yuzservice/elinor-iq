from django.contrib import admin

from .models import ImportRun, SyncCursor, SyncRun

admin.site.register(SyncRun)
admin.site.register(SyncCursor)
admin.site.register(ImportRun)

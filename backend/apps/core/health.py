from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health(_request):
    from django.db import connection

    postgres = False
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            postgres = cursor.fetchone()[0] == 1
    except Exception:
        postgres = False
    status = "ok" if postgres else "degraded"
    return Response({"status": status, "postgres": postgres})

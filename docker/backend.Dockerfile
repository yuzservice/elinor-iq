FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY docker/backend-entrypoint.sh /entrypoint.sh
COPY docker/scheduler-entrypoint.sh /scheduler-entrypoint.sh
RUN chmod +x /entrypoint.sh /scheduler-entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]

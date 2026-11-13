FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Optional package mirrors for servers that cannot reach Debian or PyPI directly (set in .env; empty = default sources).
# APT_MIRROR replaces http://deb.debian.org/debian (security updates keep their own source); see docs/runbooks/performance.md.
ARG APT_MIRROR=""
ARG PIP_INDEX_URL=""
ARG PIP_TRUSTED_HOST=""

RUN if [ -n "$APT_MIRROR" ]; then \
        sed -i -E "s#http://deb.debian.org/debian( |$)#${APT_MIRROR}\\1#" /etc/apt/sources.list.d/debian.sources; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir \
        ${PIP_INDEX_URL:+--index-url "$PIP_INDEX_URL"} \
        ${PIP_TRUSTED_HOST:+--trusted-host "$PIP_TRUSTED_HOST"} \
        -r /tmp/requirements.txt

COPY docker/backend-entrypoint.sh /entrypoint.sh
COPY docker/scheduler-entrypoint.sh /scheduler-entrypoint.sh
RUN chmod +x /entrypoint.sh /scheduler-entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]

#!/bin/sh
set -e

if [ ! -d node_modules ] || [ ! -x node_modules/.bin/vite ]; then
  rm -rf /app/node_modules/* 2>/dev/null || true
  cp -R /tmp/node_modules/. /app/node_modules/
fi

debug="$(printf '%s' "${DJANGO_DEBUG:-false}" | tr '[:upper:]' '[:lower:]')"
case "$debug" in
  1|true|yes)
    exec npm run dev -- --host 0.0.0.0 --port 5173
    ;;
esac

# Remove stale index.html first so Docker healthcheck waits for the new build to finish
rm -f /app/dist/index.html

npm run build
exec sleep infinity

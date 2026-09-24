#!/bin/sh
set -e
if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  cp -R /tmp/node_modules /app/node_modules
fi
npm install
exec npm run dev -- --host 0.0.0.0 --port 5173

FROM node:22-alpine

WORKDIR /app

COPY frontend/package.json /tmp/package.json
RUN cd /tmp && npm install

COPY docker/frontend-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5173
ENTRYPOINT ["/entrypoint.sh"]

#!/bin/sh
set -e

domain="${DOMAIN:-}"
cert="/etc/letsencrypt/live/${domain}/fullchain.pem"
key="/etc/letsencrypt/live/${domain}/privkey.pem"
debug="$(printf '%s' "${DJANGO_DEBUG:-false}" | tr '[:upper:]' '[:lower:]')"
frontend_dev=0
case "$debug" in
  1|true|yes) frontend_dev=1 ;;
esac

cat > /etc/nginx/conf.d/default.conf <<'EOF'
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}
EOF

frontend_location() {
    if [ "$frontend_dev" = "1" ]; then
        cat <<'EOF'
    location / {
        set $frontend_upstream frontend:5173;
        proxy_pass http://$frontend_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }
EOF
        return
    fi
    cat <<'EOF'
    location /assets/ {
        root /var/www/frontend;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    location / {
        root /var/www/frontend;
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
EOF
}

proxy_locations() {
    cat <<'EOF'
    client_max_body_size 32m;
    gzip on;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_proxied any;
    gzip_vary on;
    gzip_types application/json application/javascript text/javascript text/css text/plain image/svg+xml;
    resolver 127.0.0.11 valid=10s ipv6=off;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location /api/ {
        set $api_upstream backend:8000;
        proxy_pass http://$api_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /admin/ {
        set $admin_upstream backend:8000;
        proxy_pass http://$admin_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

EOF
    frontend_location
}

if [ -n "$domain" ] && [ -f "$cert" ] && [ -f "$key" ]; then
    cat >> /etc/nginx/conf.d/default.conf <<EOF
server {
    listen 80;
    server_name ${domain};

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name ${domain};

    ssl_certificate ${cert};
    ssl_certificate_key ${key};
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_protocols TLSv1.2 TLSv1.3;

EOF
    proxy_locations >> /etc/nginx/conf.d/default.conf
    echo "}" >> /etc/nginx/conf.d/default.conf
else
    cat >> /etc/nginx/conf.d/default.conf <<'EOF'
server {
    listen 80;
    server_name _;

EOF
    proxy_locations >> /etc/nginx/conf.d/default.conf
    echo "}" >> /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'

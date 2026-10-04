#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ONE-TIME server setup for an Amazon Linux 2023 EC2 instance.
#
# Run it on the instance:   sudo bash ec2-setup.sh
# Or paste it into "User data" when launching the instance.
#
# It installs Node.js + nginx, creates the app folders, and registers a
# systemd service. After this, every deploy is done by the pipeline.
# ---------------------------------------------------------------------------
set -euo pipefail

APP_NAME="sdlc-demo"
APP_USER="${APP_USER:-ec2-user}"        # the user GitHub Actions SSHes in as
APP_DIR="/opt/${APP_NAME}"
APP_PORT=3000

echo ">>> Installing Node.js 22 and nginx"
# curl is already installed (as curl-minimal); installing "curl" would conflict.
dnf install -y nginx tar
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs

echo ">>> Creating app directories in ${APP_DIR}"
mkdir -p "${APP_DIR}/releases"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

echo ">>> Registering systemd service"
cat > "/etc/systemd/system/${APP_NAME}.service" <<EOF
[Unit]
Description=SDLC demo Node.js app
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}/current
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "${APP_NAME}"

echo ">>> Configuring nginx as a reverse proxy (port 80 -> ${APP_PORT})"
# Amazon Linux has no sites-available/sites-enabled, and its stock nginx.conf
# contains its own port-80 server. Replace it with a minimal config instead.
cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.orig
cat > /etc/nginx/nginx.conf <<EOF
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log;
pid /run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    access_log /var/log/nginx/access.log;

    server {
        listen 80 default_server;
        listen [::]:80 default_server;

        location / {
            proxy_pass http://127.0.0.1:${APP_PORT};
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        }
    }
}
EOF

# SELinux is permissive by default on AL2023; if it is enforcing,
# nginx needs permission to open connections to the Node app.
if command -v setsebool > /dev/null && [ "$(getenforce)" = "Enforcing" ]; then
  setsebool -P httpd_can_network_connect 1
fi

nginx -t
# nginx is not started automatically after install on Amazon Linux.
systemctl enable --now nginx
systemctl restart nginx

echo ">>> Done. The app will start after the first pipeline deploy."

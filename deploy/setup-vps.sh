#!/bin/bash
# ============================================
# Remote Admin Panel — VPS Deploy Script
# ============================================
# Run on a fresh Ubuntu 22/24 VPS:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/deploy/setup-vps.sh | bash
#
# Or copy the project to VPS and run:
#   chmod +x deploy/setup-vps.sh && ./deploy/setup-vps.sh

set -e

DOMAIN="${DOMAIN:-}"
WS_DOMAIN="${WS_DOMAIN:-}"
ADMIN_USER="${ADMIN_USERNAME:-admin}"
ADMIN_PASS="${ADMIN_PASSWORD:-admin123}"

echo "============================================"
echo "  Remote Admin Panel — VPS Setup"
echo "============================================"

# Prompt for domain if not set
if [ -z "$DOMAIN" ]; then
  read -p "Enter your panel domain (e.g. panel.example.com): " DOMAIN
fi
if [ -z "$WS_DOMAIN" ]; then
  read -p "Enter your WebSocket domain (e.g. ws.example.com): " WS_DOMAIN
fi
if [ "$ADMIN_PASS" = "admin123" ]; then
  read -sp "Enter admin password: " ADMIN_PASS
  echo
fi

echo ""
echo "[1/6] Installing system packages..."
sudo apt update -qq
sudo apt install -y -qq curl git nginx certbot python3-certbot-nginx ufw

echo "[2/6] Installing Node.js 20..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi
echo "  Node $(node -v), npm $(npm -v)"

echo "[3/6] Installing project dependencies..."
npm ci --production=false

echo "[4/6] Creating .env.local..."
JWT_SECRET=$(openssl rand -hex 32)
cat > .env.local <<EOF
JWT_SECRET=${JWT_SECRET}
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASS}
NEXT_PUBLIC_WS_URL=wss://${WS_DOMAIN}
WS_PORT=3001
PORT=3000
EOF
echo "  .env.local created"

echo "[5/6] Building Next.js..."
npm run build

echo "[6/6] Configuring Nginx & SSL..."
# Generate Nginx config with actual domains
sudo tee /etc/nginx/sites-available/admin-panel > /dev/null <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}

server {
    listen 80;
    server_name ${WS_DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/admin-panel /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# SSL via Let's Encrypt
echo "  Requesting SSL certificates..."
sudo certbot --nginx -d "${DOMAIN}" -d "${WS_DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email || {
  echo "  ⚠ SSL setup failed. You can run manually: sudo certbot --nginx -d ${DOMAIN} -d ${WS_DOMAIN}"
}

# Install systemd services
echo "  Installing systemd services..."
APP_DIR=$(pwd)
APP_USER=$(whoami)

sudo tee /etc/systemd/system/admin-panel.service > /dev/null <<SVC
[Unit]
Description=Remote Admin Panel (Next.js)
After=network.target
[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=$(which node) node_modules/.bin/next start -p 3000
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=${APP_DIR}/.env.local
[Install]
WantedBy=multi-user.target
SVC

sudo tee /etc/systemd/system/ws-server.service > /dev/null <<SVC
[Unit]
Description=Remote Admin WebSocket Server
After=network.target
[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=$(which node) server/ws-server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=${APP_DIR}/.env.local
[Install]
WantedBy=multi-user.target
SVC

sudo systemctl daemon-reload
sudo systemctl enable --now admin-panel ws-server

# Firewall
echo "  Configuring firewall..."
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo ""
echo "============================================"
echo "  ✅ Deployment complete!"
echo "============================================"
echo "  Panel:     https://${DOMAIN}"
echo "  WebSocket: wss://${WS_DOMAIN}"
echo "  Login:     ${ADMIN_USER} / (your password)"
echo ""
echo "  Manage services:"
echo "    sudo systemctl status admin-panel"
echo "    sudo systemctl status ws-server"
echo "    sudo journalctl -u admin-panel -f"
echo "    sudo journalctl -u ws-server -f"
echo "============================================"

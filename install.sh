#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="shironex-panel"
NODE_SERVICE="shironex-node"
REPO_URL="${SHIRONEX_REPO_URL:-https://github.com/SnckBoy/ShiroNex-panel.git}"
BRANCH="${SHIRONEX_BRANCH:-main}"
APP_DIR="${SHIRONEX_PANEL_DIR:-/opt/shironex-panel}"
NODE_DIR="${SHIRONEX_NODE_DIR:-/opt/shironex-node}"
NODE_CONFIG_DIR="/etc/shironex-node"
NODE_DATA_DIR="/var/lib/shironex/servers"
PANEL_PORT="${PORT:-6767}"
NODE_PORT="${NODE_PORT:-6768}"
BACKUP_ROOT="/var/backups/shironex"
LOG_FILE="/var/log/shironex-installer.log"
BOOTSTRAP_TMP=""

cleanup() {
  if [[ -n "${BOOTSTRAP_TMP:-}" && -d "$BOOTSTRAP_TMP" ]]; then
    rm -rf "$BOOTSTRAP_TMP"
  fi
  return 0
}
trap cleanup EXIT

info(){ printf '\033[1;36m[INFO]\033[0m %s\n' "$*"; }
ok(){ printf '\033[1;32m[ OK ]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
fail(){ printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

require_tty() {
  if ! ( : </dev/tty ) 2>/dev/null; then
    fail "Interactive input requires a controlling terminal (/dev/tty). Run with a terminal, or use an explicit command such as: diagnostics, panel, node, or ssl."
  fi
}

tty_read() {
  local prompt="$1" variable="$2"
  require_tty
  IFS= read -r -p "$prompt" "$variable" </dev/tty || fail "Could not read interactive input from /dev/tty."
}

tty_confirm() {
  local prompt="$1" answer
  tty_read "$prompt" answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

banner() {
cat <<'EOF'
╔══════════════════════════════════════════════════════════╗
║                    SHIRONEX INSTALLER                    ║
║             Minecraft & VPS Hosting Panel               ║
╚══════════════════════════════════════════════════════════╝
EOF
}

require_root(){ [[ "$EUID" -eq 0 ]] || fail "Run with sudo/root."; }

check_os() {
  [[ -r /etc/os-release ]] || fail "Cannot detect operating system."
  . /etc/os-release
  case "$ID" in
    ubuntu)
      case "${VERSION_ID:-}" in
        22.04|24.04) ;;
        *) fail "Supported Ubuntu versions: 22.04 and 24.04. Detected: ${VERSION_ID:-unknown}" ;;
      esac
      ;;
    debian)
      case "${VERSION_ID:-}" in
        11|12|13) ;;
        *) fail "Supported Debian versions: 11, 12, and 13. Detected: ${VERSION_ID:-unknown}" ;;
      esac
      ;;
    *) fail "Supported OS: Ubuntu 22.04/24.04 or Debian 11/12/13. Detected: $ID" ;;
  esac
  case "$(dpkg --print-architecture)" in
    amd64|arm64) ;;
    *) fail "Unsupported architecture: $(dpkg --print-architecture)" ;;
  esac
}

check_network() {
  curl -fsS --max-time 10 https://github.com >/dev/null || fail "Internet connectivity check failed."
}

install_base_dependencies() {
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git openssl build-essential
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  fi
  command -v node >/dev/null && command -v npm >/dev/null || fail "Node.js/npm installation failed."
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then systemctl enable --now docker || true; fi
    docker info >/dev/null 2>&1 || fail "Docker is installed but not responding."
    ok "Docker detected"
    return
  fi

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/${ID}
Suites: ${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then systemctl enable --now docker || true; fi
  docker info >/dev/null 2>&1 || fail "Docker installation failed."
  ok "Docker installed"
}

bootstrap_source() {
  # When install.sh is executed through curl, download the actual repository source.
  if [[ -f "$(dirname "$0")/package.json" ]]; then
    SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
    return
  fi

  install_base_dependencies
  BOOTSTRAP_TMP="$(mktemp -d /tmp/shironex-bootstrap.XXXXXX)"
  info "Downloading ShiroNex source from GitHub..."
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$BOOTSTRAP_TMP/repo" >/dev/null 2>&1 || fail "Could not download the ShiroNex source tree from GitHub."
  SOURCE_DIR="$BOOTSTRAP_TMP/repo"
  [[ -f "$SOURCE_DIR/package.json" ]] || fail "Downloaded ShiroNex source does not contain package.json."
  [[ -f "$SOURCE_DIR/install.sh" ]] || fail "Downloaded ShiroNex source does not contain install.sh."
}

backup() {
  install -d -m 700 "$BACKUP_ROOT"
  local out
  out="$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)"
  install -d -m 700 "$out"
  [[ -d "$APP_DIR/.data" ]] && cp -a "$APP_DIR/.data" "$out/panel-data"
  [[ -f "$APP_DIR/.env" ]] && cp -a "$APP_DIR/.env" "$out/panel.env"
  [[ -f "$NODE_CONFIG_DIR/config.json" ]] && cp -a "$NODE_CONFIG_DIR/config.json" "$out/node-config.json"
  ok "Backup: $out"
}

configure_panel() {
  install -d -m 750 "$APP_DIR"
  if [[ "$SOURCE_DIR" != "$APP_DIR" ]]; then
    cp -a "$SOURCE_DIR"/. "$APP_DIR/"
  fi
  cd "$APP_DIR"
  [[ -f .env ]] || cp .env.example .env
  chmod 600 .env

  set_env() {
    local key="$1" value="$2"
    if grep -q "^${key}=" .env; then
      sed -i "s#^${key}=.*#${key}=\"${value}\"#" .env
    else
      printf '%s="%s"\n' "$key" "$value" >> .env
    fi
  }

  set_env PORT "$PANEL_PORT"
  set_env NODE_ENV production
  grep -q '^JWT_SECRET=' .env || printf 'JWT_SECRET="%s"\n' "$(openssl rand -hex 32)" >> .env
  grep -q '^NODE_AUTH_SECRET=' .env || printf 'NODE_AUTH_SECRET="%s"\n' "$(openssl rand -hex 32)" >> .env
  grep -q '^NODE_ENCRYPTION_KEY=' .env || printf 'NODE_ENCRYPTION_KEY="%s"\n' "$(openssl rand -hex 32)" >> .env

  npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
  npm run lint
  npm run build
  npm install -g pm2
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  PORT="$PANEL_PORT" pm2 start ecosystem.config.cjs --name "$APP_NAME" --update-env
  pm2 save
  ok "Panel built and started"
}

install_panel_docker() {
  require_root
  check_os
  check_network
  install_base_dependencies
  install_docker
  [[ -d "$APP_DIR/.data" || -f "$APP_DIR/.env" ]] && backup
  bootstrap_source
  install -d -m 750 "$APP_DIR"
  cp -a "$SOURCE_DIR"/. "$APP_DIR/"
  cd "$APP_DIR"
  [[ -f .env ]] || cp .env.example .env
  chmod 600 .env
  set_env() {
    local key="$1" value="$2"
    if grep -q "^${key}=" .env; then
      sed -i "s#^${key}=.*#${key}=\"${value}\"#" .env
    else
      printf '%s="%s"\n' "$key" "$value" >> .env
    fi
  }
  set_env PORT "$PANEL_PORT"
  set_env NODE_ENV production
  grep -q '^JWT_SECRET=' .env || printf 'JWT_SECRET="%s"\n' "$(openssl rand -hex 32)" >> .env
  grep -q '^NODE_AUTH_SECRET=' .env || printf 'NODE_AUTH_SECRET="%s"\n' "$(openssl rand -hex 32)" >> .env
  grep -q '^NODE_ENCRYPTION_KEY=' .env || printf 'NODE_ENCRYPTION_KEY="%s"\n' "$(openssl rand -hex 32)" >> .env
  cat > Dockerfile.shironex <<'EOF'
FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run lint && npm run build
ENV NODE_ENV=production
EXPOSE 6767
CMD ["npm", "start"]
EOF
  cat > docker-compose.yml <<EOF
services:
  shironex-panel:
    build:
      context: .
      dockerfile: Dockerfile.shironex
    container_name: shironex-panel
    restart: unless-stopped
    env_file: .env
    ports:
      - "${PANEL_PORT}:6767"
    volumes:
      - ./.data:/app/.data
EOF
  docker compose -f docker-compose.yml up -d --build
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow "$PANEL_PORT/tcp" >/dev/null 2>&1 || true
  ok "Panel Docker container built and started"
  printf '\nPanel URL: http://%s:%s\n' "$(hostname -I | awk '{print $1}')" "$PANEL_PORT"
}

install_panel() {
  require_root
  check_os
  check_network
  install_base_dependencies
  [[ -d "$APP_DIR/.data" || -f "$APP_DIR/.env" ]] && backup
  bootstrap_source
  configure_panel

  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow "$PANEL_PORT/tcp" >/dev/null 2>&1 || true

  if curl -fsS --max-time 10 "http://127.0.0.1:${PANEL_PORT}/health" >/dev/null 2>&1; then
    ok "Panel health check passed"
  else
    warn "Panel started but health endpoint is not ready. Check: pm2 logs $APP_NAME"
  fi

  printf '\nPanel URL: http://%s:%s\n' "$(hostname -I | awk '{print $1}')" "$PANEL_PORT"
}

install_node() {
  require_root
  check_os
  check_network
  install_base_dependencies
  bootstrap_source
  install_docker

  install -d -m 700 "$NODE_DIR" "$NODE_CONFIG_DIR" "$NODE_DATA_DIR"

  if [[ -z "${SHIRONEX_PANEL_URL:-}" || -z "${SHIRONEX_NODE_ID:-}" || -z "${SHIRONEX_SETUP_TOKEN:-}" ]]; then
    warn "No node registration parameters were supplied."
    printf '\nCreate a node in ShiroNex → Nodes → Create Node and run its generated command here.\n'
    printf 'Example:\n  curl -fsSL PANEL_URL/node-install.sh | sudo bash -s -- --panel PANEL_URL --node-id NODE_ID --setup-token SETUP_TOKEN --port %s\n' "$NODE_PORT"
    return 0
  fi

  "$SOURCE_DIR/node-install.sh" \
    --panel "$SHIRONEX_PANEL_URL" \
    --node-id "$SHIRONEX_NODE_ID" \
    --setup-token "$SHIRONEX_SETUP_TOKEN" \
    --port "$NODE_PORT"
}

configure_ssl() {
  require_root
  check_os
  local domain email
  domain="${SHIRONEX_DOMAIN:-}"
  email="${SHIRONEX_EMAIL:-}"

  if [[ -z "$domain" ]]; then tty_read "Panel domain (e.g. panel.example.com): " domain; fi
  if [[ -z "$email" ]]; then tty_read "ACME email: " email; fi
  [[ "$domain" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || fail "Invalid domain."
  [[ "$email" == *@*.* ]] || fail "Invalid email."

  local server_ip
  server_ip="$(hostname -I | awk '{print $1}')"
  getent ahostsv4 "$domain" >/dev/null || fail "DNS for $domain does not resolve. Point it to $server_ip first."

  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y nginx certbot python3-certbot-nginx

  cat >/etc/nginx/sites-available/shironex <<EOF
server {
  listen 80;
  server_name $domain;

  location / {
    proxy_pass http://127.0.0.1:$PANEL_PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options SAMEORIGIN always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
}
EOF

  ln -sfn /etc/nginx/sites-available/shironex /etc/nginx/sites-enabled/shironex
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable --now nginx
  certbot --nginx -d "$domain" --redirect --non-interactive --agree-tos -m "$email"

  ufw delete allow "$PANEL_PORT/tcp" >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true

  ok "HTTPS configured: https://$domain"
}

diagnostics() {
  require_root
  printf '\nShiroNex diagnostics\n\n'
  printf 'Panel: '; pm2 describe "$APP_NAME" >/dev/null 2>&1 && echo OK || echo ERROR
  printf 'Panel health: '; curl -fsS --max-time 5 "http://127.0.0.1:${PANEL_PORT}/health" >/dev/null 2>&1 && echo OK || echo ERROR
  printf 'Docker: '; docker info >/dev/null 2>&1 && echo OK || echo NOT_READY
  printf 'Node service: '; systemctl is-active --quiet "$NODE_SERVICE" && echo OK || echo NOT_INSTALLED_OR_OFFLINE
  printf 'Disk: '; df -P / | awk 'NR==2 {print $5 " used"}'
  printf 'Memory: '; free -h | awk '/Mem:/ {print $3 " / " $2}'
  printf 'Ports:\n'; ss -ltnp 2>/dev/null | grep -E ":($PANEL_PORT|80|443|$NODE_PORT)\b" || true
}

update_all() {
  require_root
  backup
  cd "$APP_DIR"
  git pull --ff-only origin "$BRANCH" 2>/dev/null || true
  npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
  npm run lint
  npm run build
  pm2 restart "$APP_NAME" --update-env
  [[ -x "$NODE_DIR/update.sh" ]] && bash "$NODE_DIR/update.sh" || true
  ok "Update complete"
}

repair_all() {
  require_root
  [[ -d "$APP_DIR" ]] || fail "Panel directory not found."
  backup
  cd "$APP_DIR"
  npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
  npm run lint
  npm run build
  pm2 restart "$APP_NAME" --update-env
  systemctl restart "$NODE_SERVICE" 2>/dev/null || true
  ok "Repair complete"
}

uninstall_all() {
  require_root
  tty_confirm "Remove ShiroNex application/services? Backups are preserved. [y/N] " || return 0

  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  pm2 save >/dev/null 2>&1 || true
  systemctl disable --now "$NODE_SERVICE" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/$NODE_SERVICE.service"
  systemctl daemon-reload
  rm -rf "$APP_DIR" "$NODE_DIR" "$NODE_CONFIG_DIR"
  warn "ShiroNex removed. Backups remain in $BACKUP_ROOT."
}

system_info() {
  printf '\nShiroNex system information\n\n'
  uname -a
  printf 'OS: '; . /etc/os-release; printf '%s %s\n' "$NAME" "$VERSION_ID"
  printf 'Architecture: '; dpkg --print-architecture
  printf 'Node: '; node --version 2>/dev/null || echo not-installed
  printf 'Docker: '; docker --version 2>/dev/null || echo not-installed
  printf 'Panel: '; pm2 status "$APP_NAME" 2>/dev/null || true
  printf 'Node service: '; systemctl is-active "$NODE_SERVICE" 2>/dev/null || echo not-installed
  df -h "$APP_DIR" 2>/dev/null || df -h /
}

menu() {
  banner
  cat <<'EOF'

[1] Install Panel — Native
[2] Install Panel — Docker
[3] Install Remote Node
[4] Install Panel + Node
[5] Configure HTTPS / SSL
[6] Update ShiroNex
[7] Repair Installation
[8] Diagnostics
[9] Uninstall
[10] System Information
[0] Exit
EOF
  local option
  tty_read $'\nSelect an option: ' option
  case "$option" in
    1) install_panel ;;
    2) install_panel_docker ;;
    3) install_node ;;
    4) install_panel; install_node ;;
    5) configure_ssl ;;
    6) update_all ;;
    7) repair_all ;;
    8) diagnostics ;;
    9) uninstall_all ;;
    10) system_info ;;
    0) exit 0 ;;
    *) warn "Invalid option" ;;
  esac
}

main() {
  require_root
  case "${1:-menu}" in
    panel) install_panel ;;
    docker) install_panel_docker ;;
    node) install_node ;;
    both) install_panel; install_node ;;
    ssl) configure_ssl ;;
    update) update_all ;;
    repair) repair_all ;;
    backup) backup ;;
    diagnostics) diagnostics ;;
    uninstall) uninstall_all ;;
    info|system-info) system_info ;;
    menu) menu ;;
    -h|--help)
      echo "Usage: sudo bash install.sh [panel|docker|node|both|ssl|update|repair|backup|diagnostics|uninstall|info]"
      ;;
    *) fail "Unknown action: $1" ;;
  esac
}

if [[ "${1:-menu}" == "menu" ]]; then
  require_tty
fi

if [[ "$EUID" -eq 0 ]]; then
  mkdir -p "$(dirname "$LOG_FILE")"
  exec > >(tee -a "$LOG_FILE") 2>&1
fi

main "$@"

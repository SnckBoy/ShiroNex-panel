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

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'; C_CYAN=$'\033[38;5;51m'; C_BLUE=$'\033[38;5;39m'; C_PURPLE=$'\033[38;5;141m'; C_GREEN=$'\033[38;5;82m'; C_YELLOW=$'\033[38;5;220m'; C_RED=$'\033[38;5;203m'; C_WHITE=$'\033[38;5;255m'; C_GRAY=$'\033[38;5;245m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_CYAN=''; C_BLUE=''; C_PURPLE=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_WHITE=''; C_GRAY=''
fi

info(){ printf '%s[%sINFO%s]%s %s\n' "$C_CYAN" "$C_BOLD" "$C_RESET" "$C_RESET" "$*"; }
ok(){ printf '%s[%s  OK%s]%s %s\n' "$C_GREEN" "$C_BOLD" "$C_RESET" "$C_RESET" "$*"; }
warn(){ printf '%s[%s WARN%s]%s %s\n' "$C_YELLOW" "$C_BOLD" "$C_RESET" "$C_RESET" "$*"; }
fail(){ printf '%s[%sERROR%s]%s %s\n' "$C_RED" "$C_BOLD" "$C_RESET" "$C_RESET" "$*" >&2; exit 1; }
section(){ printf '\n%s%s━━━ %s %s━━━%s\n' "$C_PURPLE" "$C_BOLD" "$*" "$C_RESET" "$C_RESET"; }
step(){ printf '%s  ›%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }

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
  printf '\n%s%s╭──────────────────────────────────────────────────────────╮%s\n' "$C_CYAN" "$C_BOLD" "$C_RESET"
  printf '%s%s│%s %s%sSHIRONEX%s %s%sINSTALLER%s %s│%s\n' "$C_CYAN" "$C_BOLD" "$C_RESET" "$C_WHITE" "$C_BOLD" "$C_RESET" "$C_PURPLE" "$C_BOLD" "$C_RESET" "$C_CYAN" "$C_RESET"
  printf '%s%s│%s %sMinecraft & VPS Hosting Control Panel%s %s│%s\n' "$C_CYAN" "$C_BOLD" "$C_RESET" "$C_GRAY" "$C_RESET" "$C_CYAN" "$C_RESET"
  printf '%s%s╰──────────────────────────────────────────────────────────╯%s\n\n' "$C_CYAN" "$C_BOLD" "$C_RESET"
}

require_root(){ [[ "$EUID" -eq 0 ]] || fail "Run with sudo/root."; }

check_os() {
  [[ -r /etc/os-release ]] || fail "Cannot detect operating system."
  . /etc/os-release
  case "$ID" in
    ubuntu)
      [[ -n "${VERSION_ID:-}" ]] || fail "Ubuntu version could not be detected."
      # Node.js 22 and the current ShiroNex dependency tree require glibc 2.28+;
      # Ubuntu 20.04 is the oldest release that can run this production stack.
      if dpkg --compare-versions "$VERSION_ID" lt "20.04"; then
        fail "This ShiroNex release requires Ubuntu 20.04 or newer. Detected: Ubuntu $VERSION_ID. Upgrade the VPS to Ubuntu 20.04+ and run the installer again."
      fi
      if [[ "$VERSION_ID" != "22.04" && "$VERSION_ID" != "24.04" ]]; then
        warn "Ubuntu $VERSION_ID is not one of the primary CI-tested releases; continuing with the generic Ubuntu compatibility path."
      fi
      ;;
    debian)
      case "${VERSION_ID:-}" in
        11|12|13) ;;
        *) fail "Supported Debian versions: 11, 12, and 13. Detected: ${VERSION_ID:-unknown}" ;;
      esac
      ;;
    *) fail "Supported OS: Ubuntu 20.04+ or Debian 11/12/13. Detected: $ID" ;;
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
  section "System prerequisites"
  step "Refreshing package indexes and checking Node.js runtime"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git openssl build-essential xz-utils
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
    if ! (curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs); then
      warn "NodeSource does not publish packages for this Ubuntu release; installing the official Node.js binary instead."
      local node_arch node_version node_root
      case "$(dpkg --print-architecture)" in
        amd64) node_arch="x64" ;;
        arm64) node_arch="arm64" ;;
        *) fail "No official Node.js binary is available for architecture: $(dpkg --print-architecture)" ;;
      esac
      node_version="22.14.0"
      node_root="/opt/nodejs/node-v${node_version}-linux-${node_arch}"
      rm -rf "$node_root"
      curl -fsSL "https://nodejs.org/dist/v${node_version}/node-v${node_version}-linux-${node_arch}.tar.xz" -o /tmp/shironex-node.tar.xz
      install -d -m 755 /opt/nodejs
      tar -xJf /tmp/shironex-node.tar.xz -C /opt/nodejs
      ln -sfn "$node_root/bin/node" /usr/local/bin/node
      ln -sfn "$node_root/bin/npm" /usr/local/bin/npm
      ln -sfn "$node_root/bin/npx" /usr/local/bin/npx
      rm -f /tmp/shironex-node.tar.xz
    fi
  fi
  command -v node >/dev/null && command -v npm >/dev/null || fail "Node.js/npm installation failed."
}

install_docker() {
  section "Container runtime"
  step "Checking Docker availability"
  if command -v docker >/dev/null 2>&1; then
    if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then systemctl enable --now docker || true; fi
    docker info >/dev/null 2>&1 || fail "Docker is installed but not responding."
    ok "Docker detected"
    return
  fi

  local docker_ready=false
  install -m 0755 -d /etc/apt/keyrings
  if curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc; then
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
    if apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; then
      docker_ready=true
    else
      warn "Docker’s upstream repository has no package for this OS codename; using the distribution Docker package."
    fi
  else
    warn "Could not reach Docker’s upstream repository; using the distribution Docker package."
  fi
  if [[ "$docker_ready" != true ]]; then
    rm -f /etc/apt/sources.list.d/docker.sources
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io
    if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
      DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-plugin 2>/dev/null || \
        DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-v2 2>/dev/null || \
        DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose 2>/dev/null || true
    fi
  fi
  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then systemctl enable --now docker || true; fi
  docker info >/dev/null 2>&1 || fail "Docker installation failed."
  ok "Docker installed"
}

bootstrap_source() {
  section "ShiroNex source"
  step "Preparing the canonical application source tree"
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
  section "Panel build and service"
  step "Installing the native panel at $APP_DIR"
  install -d -m 750 "$APP_DIR"
  if [[ "$SOURCE_DIR" != "$APP_DIR" ]]; then
    cp -a "$SOURCE_DIR"/. "$APP_DIR/"
  fi
  cd "$APP_DIR"
  if [[ ! -f "$APP_DIR/.env" ]]; then
    if [[ -f "$SOURCE_DIR/.env.example" ]]; then
      cp "$SOURCE_DIR/.env.example" "$APP_DIR/.env"
    else
      : > "$APP_DIR/.env"
      warn "No .env.example found; creating a secure production environment file."
    fi
  else
    info "Existing $APP_DIR/.env found; preserving it."
  fi
  chmod 600 "$APP_DIR/.env"

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
  section "Docker panel installation"
  step "Building the ShiroNex panel container"
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
  if [[ ! -f "$APP_DIR/.env" ]]; then
    if [[ -f "$SOURCE_DIR/.env.example" ]]; then
      cp "$SOURCE_DIR/.env.example" "$APP_DIR/.env"
    else
      : > "$APP_DIR/.env"
      warn "No .env.example found; creating a secure production environment file."
    fi
  else
    info "Existing $APP_DIR/.env found; preserving it."
  fi
  chmod 600 "$APP_DIR/.env"
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
      - "${PANEL_PORT}:${PANEL_PORT}"
    volumes:
      - ./.data:/app/.data
EOF
  if docker compose version >/dev/null 2>&1; then
    docker compose -f docker-compose.yml up -d --build
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f docker-compose.yml up -d --build
  else
    fail "Docker is installed, but no Compose command is available. Install docker-compose-plugin or docker-compose and retry."
  fi
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
  install_docker
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

install_local_node() {
  section "Local node onboarding"
  step "Registering the local daemon with the panel"
  require_root
  check_os
  check_network
  install_base_dependencies
  install_docker
  [[ -d "$APP_DIR" && -f "$APP_DIR/.env" ]] || fail "Install the panel before configuring the local node."

  local bootstrap_secret response credential daemon_source
  bootstrap_secret="$(sed -n 's/^NODE_AUTH_SECRET=//p' "$APP_DIR/.env" | head -n1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
  [[ -n "$bootstrap_secret" ]] || fail "NODE_AUTH_SECRET is missing from $APP_DIR/.env."
  daemon_source="$APP_DIR/node-daemon"
  [[ -f "$daemon_source/package.json" ]] || fail "The node daemon source is missing from the panel installation."

  response="$(curl -fsS --retry 3 -X POST "http://127.0.0.1:${PANEL_PORT}/api/node-agent/local-bootstrap" -H 'content-type: application/json' -H "x-shironex-bootstrap: $bootstrap_secret" -d "{\"port\":$NODE_PORT,\"daemonVersion\":\"1.1.0\"}")" || fail "Local node registration failed. Check: pm2 logs $APP_NAME"
  credential="$(printf '%s' "$response" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);if(!j.credential)process.exit(2);process.stdout.write(j.credential)}catch{process.exit(3)}})' 2>/dev/null)" || fail "Panel did not return a local node credential."

  rm -rf "$NODE_DIR"
  install -d -m 700 "$NODE_DIR" "$NODE_CONFIG_DIR" "$NODE_DATA_DIR"
  cp -a "$daemon_source"/. "$NODE_DIR/"
  PANEL_URL="http://127.0.0.1:${PANEL_PORT}" NODE_ID=local CREDENTIAL="$credential" NODE_PORT="$NODE_PORT" CONFIG_DIR="$NODE_CONFIG_DIR" node - <<'NODE'
const fs = require("fs");
const path = process.env.CONFIG_DIR + "/config.json";
const config = {
  panelUrl: process.env.PANEL_URL,
  nodeId: process.env.NODE_ID,
  credential: process.env.CREDENTIAL,
  port: Number(process.env.NODE_PORT),
  serverDirectory: "/var/lib/shironex/servers",
  dockerSocket: "/var/run/docker.sock",
  heartbeatIntervalMs: 10000,
  daemonVersion: "1.1.0"
};
fs.writeFileSync(path, JSON.stringify(config) + "\n", { mode: 0o600 });
NODE
  chmod 600 "$NODE_CONFIG_DIR/config.json"
  cd "$NODE_DIR"
  npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
  npm run build

  cat >"/etc/systemd/system/$NODE_SERVICE.service" <<EOF
[Unit]
Description=ShiroNex Node Daemon (local)
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
ExecStart=/usr/bin/node $NODE_DIR/dist/index.js
Restart=always
RestartSec=3
User=root
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now "$NODE_SERVICE"
  systemctl is-active --quiet "$NODE_SERVICE" || fail "Local node service failed. Check: journalctl -u $NODE_SERVICE -n 100 --no-pager"
  sleep 2
  ok "Local node installed and service is running"
}

install_node() {
  section "Remote node onboarding"
  step "Preparing this VPS as a ShiroNex node"
  require_root
  check_os
  check_network
  install_base_dependencies
  bootstrap_source
  install_docker

  install -d -m 700 "$NODE_DIR" "$NODE_CONFIG_DIR" "$NODE_DATA_DIR"

  local panel_url="${SHIRONEX_PANEL_URL:-}" node_id="${SHIRONEX_NODE_ID:-}" setup_token="${SHIRONEX_SETUP_TOKEN:-}"
  if [[ -z "$panel_url" ]]; then tty_read "Panel URL: " panel_url; fi
  if [[ -z "$node_id" ]]; then tty_read "Node ID: " node_id; fi
  if [[ -z "$setup_token" ]]; then tty_read "One-time setup token: " setup_token; fi
  [[ -n "$panel_url" && -n "$node_id" && -n "$setup_token" ]] || fail "Panel URL, node ID, and setup token are required."

  "$SOURCE_DIR/node-install.sh" \
    --panel "$panel_url" \
    --node-id "$node_id" \
    --setup-token "$setup_token" \
    --port "$NODE_PORT"
}

configure_ssl() {
  section "HTTPS / SSL configuration"
  step "Preparing the secure reverse proxy"
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

manage_users() {
  section "User administration"
  step "Opening the secure user management tool"
  require_root
  [[ -d "$APP_DIR" && -f "$APP_DIR/package.json" ]] || fail "Install the ShiroNex panel before managing users."
  command -v npx >/dev/null 2>&1 || fail "npm/npx is required. Install the panel first."
  cd "$APP_DIR"
  npx --no-install tsx scripts/createuser.ts
}

update_all() {
  section "ShiroNex update"
  step "Creating a backup before updating the panel and node"
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
  section "Repair installation"
  step "Rebuilding services while preserving application data"
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

uninstall_panel() {
  backup
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  pm2 save >/dev/null 2>&1 || true
  rm -rf "$APP_DIR"
  ok "Panel removed. Node service and node data were left untouched. Backup preserved in $BACKUP_ROOT."
}

uninstall_node() {
  backup
  systemctl disable --now "$NODE_SERVICE" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/$NODE_SERVICE.service"
  systemctl daemon-reload
  rm -rf "$NODE_DIR" "$NODE_CONFIG_DIR"
  if tty_confirm "Also delete Minecraft server data in $NODE_DATA_DIR? This cannot be undone. [y/N] "; then
    rm -rf "$NODE_DATA_DIR"
    warn "Node and Minecraft server data removed. Backup preserved in $BACKUP_ROOT."
  else
    ok "Node service/config removed. Minecraft server data was preserved at $NODE_DATA_DIR."
  fi
}

uninstall_all() {
  section "Uninstall ShiroNex"
  step "Choose exactly which component to remove; backups are created first"
  require_root
  printf '\n  [1] Panel only\n  [2] Node only\n  [3] Panel and node\n  [0] Cancel\n\n'
  local choice
  tty_read "Remove: " choice
  case "$choice" in
    1) tty_confirm "Remove the panel only? The node will remain installed. [y/N] " && uninstall_panel ;;
    2) tty_confirm "Remove the node only? The panel will remain installed. [y/N] " && uninstall_node ;;
    3)
      tty_confirm "Remove both panel and node? Backups will be preserved. [y/N] " || return 0
      uninstall_panel
      uninstall_node
      ;;
    0) info "Uninstall cancelled." ;;
    *) warn "Invalid uninstall selection." ;;
  esac
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
  printf '%s%s  INSTALLATION MODES%s\n' "$C_WHITE" "$C_BOLD" "$C_RESET"
  printf '%s  [1]%s  Install Panel — Native\n' "$C_CYAN" "$C_RESET"
  printf '%s  [2]%s  Install Panel — Docker\n' "$C_CYAN" "$C_RESET"
  printf '%s  [3]%s  Install Remote Node\n' "$C_CYAN" "$C_RESET"
  printf '%s  [4]%s  Install Panel + Node\n' "$C_CYAN" "$C_RESET"
  printf '\n%s%s  MAINTENANCE%s\n' "$C_WHITE" "$C_BOLD" "$C_RESET"
  printf '%s  [5]%s  Configure HTTPS / SSL\n' "$C_PURPLE" "$C_RESET"
  printf '%s  [6]%s  Update ShiroNex\n' "$C_PURPLE" "$C_RESET"
  printf '%s  [7]%s  Repair Installation\n' "$C_PURPLE" "$C_RESET"
  printf '%s  [8]%s  Diagnostics\n' "$C_PURPLE" "$C_RESET"
  printf '%s  [9]%s  Uninstall\n' "$C_PURPLE" "$C_RESET"
  printf '%s [10]%s  System Information\n' "$C_PURPLE" "$C_RESET"
  printf '%s [11]%s  Create / Update Users\n' "$C_PURPLE" "$C_RESET"
  printf '\n%s  [0]%s  Exit\n\n' "$C_RED" "$C_RESET"
  local option
  tty_read $'\nSelect an option: ' option
  case "$option" in
    1) install_panel ;;
    2) install_panel_docker ;;
    3) install_node ;;
    4) install_panel; install_local_node ;;
    5) configure_ssl ;;
    6) update_all ;;
    7) repair_all ;;
    8) diagnostics ;;
    9) uninstall_all ;;
    10) system_info ;;
    11) manage_users ;;
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
    node-update|node-reconfigure|node-restart)
      bootstrap_source
      shift
      bash "$SOURCE_DIR/node-update.sh" "$@"
      ;;
    both) install_panel; install_local_node ;;
    ssl) configure_ssl ;;
    update) update_all ;;
    repair) repair_all ;;
    backup) backup ;;
    diagnostics) diagnostics ;;
    uninstall) uninstall_all ;;
    info|system-info) system_info ;;
    users|user|create-user) manage_users ;;
    menu) menu ;;
    -h|--help)
      echo "Usage: sudo bash install.sh [panel|docker|node|node-update|both|ssl|update|repair|backup|diagnostics|uninstall|info|users]"
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

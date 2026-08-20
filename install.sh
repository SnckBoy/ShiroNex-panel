#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="shironex-panel"
NODE_SERVICE="shironex-node"
APP_DIR="${SHIRONEX_PANEL_DIR:-/opt/shironex-panel}"
NODE_DIR="${SHIRONEX_NODE_DIR:-/opt/shironex-node}"
NODE_CONFIG_DIR="/etc/shironex-node"
NODE_DATA_DIR="/var/lib/shironex/servers"
PANEL_PORT="${PORT:-6767}"
NODE_PORT="${NODE_PORT:-6768}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="/var/backups/shironex"

# When this file is piped directly from GitHub, only the bootstrap script exists.
# Download the signed-by-location project archive, then re-enter the full installer.
if [[ "${SHIRONEX_BOOTSTRAPPED:-0}" != "1" && ! -f "$SOURCE_DIR/package.json" ]]; then
  [[ "$EUID" -eq 0 ]] || { echo "Run as root: curl -fsSL https://raw.githubusercontent.com/SnckBoy/ShiroNex-panel/main/install.sh | sudo bash" >&2; exit 1; }
  BOOTSTRAP_TMP="$(mktemp -d /tmp/shironex-bootstrap.XXXXXX)"
  trap 'rm -rf "$BOOTSTRAP_TMP"' EXIT
  apt-get update
  apt-get install -y ca-certificates curl unzip
  curl -fL "${SHIRONEX_ARCHIVE_URL:-https://raw.githubusercontent.com/SnckBoy/ShiroNex-panel/main/ShiroNex-fixed-improved.zip}" -o "$BOOTSTRAP_TMP/shironex.zip"
  unzip -q "$BOOTSTRAP_TMP/shironex.zip" -d "$BOOTSTRAP_TMP/extracted"
  BOOTSTRAP_SOURCE="$(find "$BOOTSTRAP_TMP/extracted" -mindepth 1 -maxdepth 2 -type f -name install.sh -printf '%h\n' | head -1)"
  [[ -n "$BOOTSTRAP_SOURCE" && -f "$BOOTSTRAP_SOURCE/install.sh" ]] || { echo "The ShiroNex archive does not contain install.sh" >&2; exit 1; }
  export SHIRONEX_BOOTSTRAPPED=1
  [[ -e /dev/tty ]] && exec </dev/tty
  exec bash "$BOOTSTRAP_SOURCE/install.sh" "$@"
fi
LOG_FILE="/var/log/shironex-installer.log"
NONINTERACTIVE=false
LOG_TARGET="$LOG_FILE"
[[ "$EUID" -eq 0 ]] || LOG_TARGET="/tmp/shironex-installer.log"
exec > >(tee -a "$LOG_TARGET") 2>&1

info(){ printf '\033[1;36m[INFO]\033[0m %s\n' "$*"; }
ok(){ printf '\033[1;32m[ OK ]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
fail(){ printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

banner(){ cat <<'EOF'
╔══════════════════════════════════════════════════════════╗
║                    SHIRONEX INSTALLER                    ║
║              Minecraft & VPS Hosting Platform            ║
╚══════════════════════════════════════════════════════════╝
EOF
}

confirm(){
  $NONINTERACTIVE && return 0
  local answer
  read -r -p "${1:-Continue?} [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

require_root(){ [[ "$EUID" -eq 0 ]] || fail "Run as root, for example: sudo bash install.sh"; }

check_os(){
  [[ -r /etc/os-release ]] || fail "Cannot detect operating system."
  . /etc/os-release
  [[ "$ID" == "ubuntu" ]] || fail "This installer supports Ubuntu. Detected: $ID"
  case "${VERSION_ID:-}" in 22.04|24.04) ok "Ubuntu ${VERSION_ID} detected";; *) fail "Supported versions are Ubuntu 22.04 and 24.04; detected ${VERSION_ID:-unknown}.";; esac
  case "$(dpkg --print-architecture)" in amd64|arm64) ok "Supported architecture: $(dpkg --print-architecture)";; *) fail "Unsupported architecture: $(dpkg --print-architecture)";; esac
}

check_network(){
  curl -fsS --max-time 10 https://raw.githubusercontent.com >/dev/null || fail "Internet connectivity check failed."
  ok "Internet connectivity available"
}

backup_path(){
  install -d -m 700 "$BACKUP_ROOT"
  local stamp out
  stamp="$(date +%Y%m%d-%H%M%S)"
  out="$BACKUP_ROOT/$stamp"
  install -d -m 700 "$out"
  [[ -d "$APP_DIR/.data" ]] && cp -a "$APP_DIR/.data" "$out/panel-data"
  [[ -f "$APP_DIR/.env" ]] && cp -a "$APP_DIR/.env" "$out/panel.env"
  [[ -f "$NODE_CONFIG_DIR/config.json" ]] && cp -a "$NODE_CONFIG_DIR/config.json" "$out/node-config.json"
  ok "Backup created at $out"
}

install_dependencies(){
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl unzip openssl git build-essential ufw
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  fi
  command -v node >/dev/null && command -v npm >/dev/null || fail "Node.js/npm installation failed."
  ok "Node.js $(node --version) and npm $(npm --version) available"
}

install_docker(){
  if command -v docker >/dev/null 2>&1; then
    systemctl enable --now docker
    ok "Docker already installed"
    return
  fi
  info "Installing Docker Engine from Docker's official Ubuntu repository"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  docker info >/dev/null || fail "Docker is installed but not responding."
  ok "Docker installed and running"
}

configure_panel(){
  install -d -m 750 "$APP_DIR"
  if [[ "$SOURCE_DIR" != "$APP_DIR" ]]; then
    cp -a "$SOURCE_DIR"/. "$APP_DIR/"
  fi
  cd "$APP_DIR"
  [[ -f .env ]] || cp .env.example .env
  if [[ -f .env && ! -f .env.before-installer ]]; then cp -a .env .env.before-installer; fi
  set_env(){ local key="$1" value="$2"; if grep -q "^${key}=" .env; then sed -i "s#^${key}=.*#${key}=\"${value}\"#" .env; else printf '%s="%s"\n' "$key" "$value" >> .env; fi; }
  set_env PORT "$PANEL_PORT"
  set_env NODE_ENV production
  grep -q '^JWT_SECRET=' .env || printf 'JWT_SECRET="%s"\n' "$(openssl rand -hex 32)" >> .env
  grep -q '^NODE_AUTH_SECRET=' .env || printf 'NODE_AUTH_SECRET="%s"\n' "$(openssl rand -hex 32)" >> .env
  grep -q '^NODE_ENCRYPTION_KEY=' .env || printf 'NODE_ENCRYPTION_KEY="%s"\n' "$(openssl rand -hex 32)" >> .env
  npm install --no-audit --no-fund
  npm run lint
  npm run build
  npm install -g pm2
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  PORT="$PANEL_PORT" pm2 start ecosystem.config.cjs --name "$APP_NAME" --update-env
  pm2 save
  ok "Panel built and started with PM2"
}

install_panel(){
  require_root; check_os; check_network; install_dependencies
  if [[ -d "$APP_DIR/.data" || -f "$APP_DIR/.env" ]]; then backup_path; fi
  configure_panel
  if command -v ufw >/dev/null 2>&1; then
    ufw allow OpenSSH >/dev/null 2>&1 || true
    ufw allow "$PANEL_PORT/tcp" >/dev/null 2>&1 || true
  fi
  curl -fsS --max-time 10 "http://127.0.0.1:${PANEL_PORT}/health" >/dev/null || warn "Panel process started, but local HTTP health check is not ready yet. Check: pm2 logs $APP_NAME"
  printf '\nShiroNex Panel: http://%s:%s\n' "$(hostname -I | awk '{print $1}')" "$PANEL_PORT"
}

install_node(){
  require_root; check_os; check_network; install_dependencies; install_docker
  install -d -m 700 "$NODE_DIR" "$NODE_CONFIG_DIR" "$NODE_DATA_DIR"
  if [[ -z "${SHIRONEX_PANEL_URL:-}" || -z "${SHIRONEX_NODE_ID:-}" || -z "${SHIRONEX_SETUP_TOKEN:-}" ]]; then
    warn "Node credentials are not present. Create a node in the panel and run its generated command on this VPS."
    printf 'Example:\n  curl -fsSL PANEL_URL/node.sh | bash -s -- --panel PANEL_URL --node-id NODE_ID --setup-token SETUP_TOKEN --port %s\n' "$NODE_PORT"
    return 0
  fi
  curl -fsSL "$SHIRONEX_PANEL_URL/shironex-node.tar.gz" | tar -xzf - -C "$NODE_DIR"
  cd "$NODE_DIR"
  npm install --no-audit --no-fund
  local response credential
  response="$(curl -fsS --retry 3 -X POST "$SHIRONEX_PANEL_URL/api/node-agent/register" -H 'content-type: application/json' -d "{\"nodeId\":\"$SHIRONEX_NODE_ID\",\"setupToken\":\"$SHIRONEX_SETUP_TOKEN\",\"daemonVersion\":\"1.1.0\"}")"
  credential="$(printf '%s' "$response" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!j.credential)process.exit(2);process.stdout.write(j.credential)})')"
  cat >"$NODE_CONFIG_DIR/config.json" <<EOF
{"panelUrl":"$SHIRONEX_PANEL_URL","nodeId":"$SHIRONEX_NODE_ID","credential":"$credential","port":$NODE_PORT,"serverDirectory":"$NODE_DATA_DIR","dockerSocket":"/var/run/docker.sock","heartbeatIntervalMs":10000,"daemonVersion":"1.1.0"}
EOF
  chmod 600 "$NODE_CONFIG_DIR/config.json"
  npm run build
  cat >/etc/systemd/system/$NODE_SERVICE.service <<EOF
[Unit]
Description=ShiroNex Node Daemon
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service
[Service]
Type=simple
ExecStart=/usr/bin/node $NODE_DIR/dist/index.js
Restart=always
RestartSec=3
User=root
NoNewPrivileges=false
LimitNOFILE=65535
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now "$NODE_SERVICE"
  systemctl is-active --quiet "$NODE_SERVICE" || fail "Node service did not start. Check journalctl -u $NODE_SERVICE."
  ok "Node daemon installed and running"
}

install_both(){
  install_panel
  install_node
}

update_all(){
  require_root
  backup_path
  if [[ -x "$APP_DIR/panel-install.sh" ]]; then bash "$APP_DIR/panel-install.sh" update; else cd "$APP_DIR"; npm install --no-audit --no-fund; npm run lint; npm run build; pm2 restart "$APP_NAME" --update-env; fi
  [[ -f "$NODE_DIR/update.sh" ]] && bash "$NODE_DIR/update.sh" || true
  ok "Update complete"
}

repair_all(){
  require_root
  [[ -d "$APP_DIR" ]] || fail "Panel directory not found: $APP_DIR"
  backup_path
  cd "$APP_DIR"
  npm install --no-audit --no-fund
  npm run lint
  npm run build
  pm2 restart "$APP_NAME" --update-env
  systemctl restart "$NODE_SERVICE" 2>/dev/null || true
  ok "Repair complete"
}

uninstall_all(){
  require_root
  confirm "Remove ShiroNex services and application files? Backups will be preserved." || return 0
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  pm2 save >/dev/null 2>&1 || true
  systemctl disable --now "$NODE_SERVICE" 2>/dev/null || true
  rm -f "/etc/systemd/system/$NODE_SERVICE.service"
  systemctl daemon-reload
  rm -rf "$APP_DIR" "$NODE_DIR" "$NODE_CONFIG_DIR"
  warn "ShiroNex services and application directories removed. Backups remain in $BACKUP_ROOT."
}

system_info(){
  printf '\nShiroNex system information\n\n'
  uname -a
  printf 'OS: '; . /etc/os-release; printf '%s %s\n' "$NAME" "$VERSION_ID"
  printf 'Architecture: '; dpkg --print-architecture
  printf 'Node: '; node --version 2>/dev/null || printf 'not installed\n'
  printf 'Docker: '; docker --version 2>/dev/null || printf 'not installed\n'
  printf 'Panel: '; pm2 status "$APP_NAME" 2>/dev/null | tail -n +1 || true
  printf 'Node service: '; systemctl is-active "$NODE_SERVICE" 2>/dev/null || printf 'not installed\n'
  df -h "$APP_DIR" 2>/dev/null || df -h /
}

menu(){
  banner
  cat <<'EOF'

[1] Install ShiroNex Panel
[2] Install ShiroNex Node
[3] Install Panel + Node
[4] Update ShiroNex
[5] Repair Installation
[6] Uninstall ShiroNex
[7] System Information
[0] Exit
EOF
  local option
  read -r -p $'\nSelect an option: ' option
  case "$option" in
    1) install_panel;; 2) install_node;; 3) install_both;; 4) update_all;; 5) repair_all;; 6) uninstall_all;; 7) system_info;; 0) exit 0;; *) warn "Invalid option";;
  esac
}

main(){
  local action="${1:-menu}"
  if [[ "$action" == "-h" || "$action" == "--help" ]]; then
    printf 'Usage: sudo bash install.sh [panel|node|both|update|repair|uninstall|info]\n'
    exit 0
  fi
  require_root
  case "$action" in
    panel) install_panel;; node) install_node;; both) install_both;; update) update_all;; repair) repair_all;; uninstall) uninstall_all;; info|system-info) system_info;; menu) menu;; --non-interactive) NONINTERACTIVE=true; shift; main "${1:-panel}";; -h|--help) printf 'Usage: sudo bash install.sh [panel|node|both|update|repair|uninstall|info]\n';;
    *) fail "Unknown action: $action";;
  esac
}
main "$@"

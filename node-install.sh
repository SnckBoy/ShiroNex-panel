#!/usr/bin/env bash
set -Eeuo pipefail

PANEL_URL=""
NODE_ID=""
SETUP_TOKEN=""
NODE_PORT="${NODE_PORT:-6768}"
NODE_DIR="${SHIRONEX_NODE_DIR:-/opt/shironex-node}"
CONFIG_DIR="/etc/shironex-node"
DATA_DIR="/var/lib/shironex/servers"
SERVICE="shironex-node"
DAEMON_VERSION="1.1.0"

info(){ printf '\033[1;36m[INFO]\033[0m %s\n' "$*"; }
ok(){ printf '\033[1;32m[ OK ]\033[0m %s\n' "$*"; }
fail(){ printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

usage(){
  cat <<'EOF'
ShiroNex Node Installer

Usage:
  sudo bash node-install.sh \
    --panel https://panel.example.com \
    --node-id NODE_ID \
    --setup-token ONE_TIME_TOKEN \
    --port 6768
EOF
}

require_root(){ [[ "$EUID" -eq 0 ]] || fail "Run with sudo/root."; }
check_os(){
  [[ -r /etc/os-release ]] || fail "Cannot detect operating system."
  . /etc/os-release
  case "$ID:${VERSION_ID:-}" in
    ubuntu:22.04|ubuntu:24.04|debian:11|debian:12|debian:13) ;;
    *) fail "Supported OS: Ubuntu 22.04/24.04 or Debian 11/12/13. Detected: ${PRETTY_NAME:-$ID}" ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --panel) PANEL_URL="${2:-}"; shift 2 ;;
    --node-id) NODE_ID="${2:-}"; shift 2 ;;
    --setup-token) SETUP_TOKEN="${2:-}"; shift 2 ;;
    --port) NODE_PORT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

require_root
check_os
[[ -n "$PANEL_URL" && -n "$NODE_ID" && -n "$SETUP_TOKEN" ]] || { usage; exit 2; }
[[ "$PANEL_URL" =~ ^https?:// ]] || fail "Panel URL must start with http:// or https://."
[[ "$NODE_PORT" =~ ^[0-9]+$ && "$NODE_PORT" -ge 1024 && "$NODE_PORT" -le 65535 ]] || fail "Invalid node port."

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl openssl git build-essential

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi

if ! command -v docker >/dev/null 2>&1; then
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
fi
if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then systemctl enable --now docker || true; fi
docker info >/dev/null 2>&1 || fail "Docker is not ready."

install -d -m 700 "$NODE_DIR" "$CONFIG_DIR" "$DATA_DIR"

info "Downloading ShiroNex node daemon..."
TMP="$(mktemp -d /tmp/shironex-node.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "$PANEL_URL/shironex-node.tar.gz" -o "$TMP/node.tar.gz" \
  || fail "Could not download the node daemon from $PANEL_URL."

tar -xzf "$TMP/node.tar.gz" -C "$NODE_DIR"
cd "$NODE_DIR"
npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund

info "Registering node..."
RESPONSE="$(curl -fsS --retry 3 \
  -X POST "$PANEL_URL/api/node-agent/register" \
  -H 'content-type: application/json' \
  -d "{\"nodeId\":\"$NODE_ID\",\"setupToken\":\"$SETUP_TOKEN\",\"daemonVersion\":\"$DAEMON_VERSION\"}")" \
  || fail "Node registration failed."

CREDENTIAL="$(printf '%s' "$RESPONSE" | node -e '
let s="";
process.stdin.on("data",d=>s+=d).on("end",()=>{
  try {
    const j=JSON.parse(s);
    if(!j.credential) process.exit(2);
    process.stdout.write(j.credential);
  } catch {
    process.exit(3);
  }
})' 2>/dev/null)" || fail "Panel did not return a node credential."

node -e '
const fs=require("fs");
const path=process.argv[1];
const obj=JSON.parse(process.argv[2]);
fs.writeFileSync(path, JSON.stringify(obj)+"\n", {mode:0o600});
' "$CONFIG_DIR/config.json" \
  "{\"panelUrl\":\"$PANEL_URL\",\"nodeId\":\"$NODE_ID\",\"credential\":\"$CREDENTIAL\",\"port\":$NODE_PORT,\"serverDirectory\":\"$DATA_DIR\",\"dockerSocket\":\"/var/run/docker.sock\",\"heartbeatIntervalMs\":10000,\"daemonVersion\":\"$DAEMON_VERSION\"}"

npm run build

cat >"/etc/systemd/system/$SERVICE.service" <<EOF
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
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE"
systemctl is-active --quiet "$SERVICE" || fail "Node service failed. Check: journalctl -u $SERVICE -n 100 --no-pager"

ok "ShiroNex node installed and online."
echo "Node service: systemctl status $SERVICE --no-pager"
echo "Node logs:    journalctl -u $SERVICE -f"

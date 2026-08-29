#!/usr/bin/env bash
set -euo pipefail
PANEL_URL=""; NODE_ID=""; SETUP_TOKEN=""; PORT="8080"
while [[ $# -gt 0 ]]; do case "$1" in --panel) PANEL_URL="$2"; shift 2;; --node-id) NODE_ID="$2"; shift 2;; --setup-token) SETUP_TOKEN="$2"; shift 2;; --port) PORT="$2"; shift 2;; *) echo "Unknown option: $1"; exit 2;; esac; done
[[ $EUID -eq 0 ]] || { echo "Run this installer as root."; exit 1; }
[[ -n "$PANEL_URL" && -n "$NODE_ID" && -n "$SETUP_TOKEN" ]] || { echo "Missing --panel, --node-id or --setup-token"; exit 2; }
. /etc/os-release
case "$ID" in
  ubuntu)
    [[ -n "${VERSION_ID:-}" ]] || { echo "Could not detect the Ubuntu version." >&2; exit 1; }
    if dpkg --compare-versions "$VERSION_ID" lt "20.04"; then
      echo "This ShiroNex node requires Ubuntu 20.04 or newer. Detected: Ubuntu $VERSION_ID." >&2
      exit 1
    fi
    ;;
  debian)
    ;;
  *) echo "ShiroNex Node supports Ubuntu 20.04+ and Debian 11/12/13." >&2; exit 1;;
esac
apt-get update
apt-get install -y ca-certificates curl gnupg xz-utils
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  if ! (curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs); then
    echo "NodeSource has no package for this release; installing the official Node.js binary." >&2
    case "$(dpkg --print-architecture)" in
      amd64) NODE_ARCH=x64 ;;
      arm64) NODE_ARCH=arm64 ;;
      *) echo "Unsupported architecture: $(dpkg --print-architecture)" >&2; exit 1;;
    esac
    NODE_VERSION=22.14.0
    NODE_ROOT="/opt/nodejs/node-v${NODE_VERSION}-linux-${NODE_ARCH}"
    rm -rf "$NODE_ROOT"
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -o /tmp/shironex-node.tar.xz
    install -d -m 755 /opt/nodejs
    tar -xJf /tmp/shironex-node.tar.xz -C /opt/nodejs
    ln -sfn "$NODE_ROOT/bin/node" /usr/local/bin/node
    ln -sfn "$NODE_ROOT/bin/npm" /usr/local/bin/npm
    ln -sfn "$NODE_ROOT/bin/npx" /usr/local/bin/npx
    rm -f /tmp/shironex-node.tar.xz
  fi
fi
if ! command -v docker >/dev/null; then
  if ! curl -fsSL https://get.docker.com | sh; then
    apt-get update
    apt-get install -y docker.io
  fi
fi
command -v systemctl >/dev/null 2>&1 && systemctl enable --now docker || { echo "systemd is required to run the ShiroNex node service." >&2; exit 1; }
install -d -m 700 /opt/shironex-node /etc/shironex-node /var/lib/shironex/servers
curl -fsSL "$PANEL_URL/shironex-node.tar.gz" | tar -xzf - -C /opt/shironex-node
cd /opt/shironex-node
npm ci --omit=dev || npm install --omit=dev
RESP=$(curl -fsS --retry 3 -X POST "$PANEL_URL/api/node-agent/register" -H 'content-type: application/json' -d "{\"nodeId\":\"$NODE_ID\",\"setupToken\":\"$SETUP_TOKEN\",\"daemonVersion\":\"1.1.0\"}")
CRED=$(printf '%s' "$RESP" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s); if(!j.credential) process.exit(2); console.log(j.credential)})')
cat >/etc/shironex-node/config.json <<EOF
{"panelUrl":"$PANEL_URL","nodeId":"$NODE_ID","credential":"$CRED","port":$PORT,"serverDirectory":"/var/lib/shironex/servers","dockerSocket":"/var/run/docker.sock","heartbeatIntervalMs":10000,"daemonVersion":"1.1.0"}
EOF
chmod 600 /etc/shironex-node/config.json
cd /opt/shironex-node && npm run build
cat >/etc/systemd/system/shironex-node.service <<'EOF'
[Unit]
Description=ShiroNex Node Daemon
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service
[Service]
Type=simple
ExecStart=/usr/bin/node /opt/shironex-node/dist/index.js
Restart=always
RestartSec=3
User=root
NoNewPrivileges=false
LimitNOFILE=65535
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now shironex-node
sleep 2
systemctl --no-pager --full status shironex-node || true
echo "ShiroNex Node installed. Logs: journalctl -u shironex-node -f"

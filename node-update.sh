#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG_DIR="${SHIRONEX_NODE_CONFIG_DIR:-/etc/shironex-node}"
CONFIG_FILE="$CONFIG_DIR/config.json"
SERVICE="${SHIRONEX_NODE_SERVICE:-shironex-node}"
RESTART=true

fail(){ printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }
info(){ printf '\033[1;36m[INFO]\033[0m %s\n' "$*"; }
ok(){ printf '\033[1;32m[ OK ]\033[0m %s\n' "$*"; }
usage(){
  cat <<'EOF'
ShiroNex Node Reconfigure / Restart

Usage:
  sudo bash node-update.sh [options]

Options:
  --panel URL              Panel URL used for heartbeat registration
  --node-id ID             Existing ShiroNex node ID
  --port PORT              Local daemon HTTP port (1024-65535)
  --server-directory PATH  Minecraft server data directory
  --docker-socket PATH     Docker socket path
  --no-restart             Write and validate config without restarting
  -h, --help               Show this help

The existing node credential is preserved. This command does not delete
servers, worlds, allocations, or the node registration.
EOF
}

[[ "$EUID" -eq 0 ]] || fail "Run with sudo/root."
[[ -f "$CONFIG_FILE" ]] || fail "Node configuration not found at $CONFIG_FILE. Install/register the node first."
command -v node >/dev/null 2>&1 || fail "Node.js is required to update the node configuration."

PANEL_URL=""; NODE_ID=""; PORT=""; SERVER_DIRECTORY=""; DOCKER_SOCKET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --panel) PANEL_URL="${2:-}"; shift 2 ;;
    --node-id) NODE_ID="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --server-directory) SERVER_DIRECTORY="${2:-}"; shift 2 ;;
    --docker-socket) DOCKER_SOCKET="${2:-}"; shift 2 ;;
    --no-restart) RESTART=false; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[[ -z "$PORT" || "$PORT" =~ ^[0-9]+$ ]] || fail "Invalid port: $PORT"
[[ -z "$PORT" || "$PORT" -ge 1024 && "$PORT" -le 65535 ]] || fail "Port must be between 1024 and 65535."
[[ -z "$PANEL_URL" || "$PANEL_URL" =~ ^https?:// ]] || fail "Panel URL must start with http:// or https://."
[[ -z "$SERVER_DIRECTORY" || "$SERVER_DIRECTORY" = /* ]] || fail "Server directory must be an absolute path."
[[ -z "$DOCKER_SOCKET" || "$DOCKER_SOCKET" = /* ]] || fail "Docker socket must be an absolute path."

TMP_FILE="$(mktemp "$CONFIG_DIR/config.json.XXXXXX")"
cleanup(){ rm -f "$TMP_FILE"; }
trap cleanup EXIT

PANEL_URL="$PANEL_URL" NODE_ID="$NODE_ID" PORT="$PORT" SERVER_DIRECTORY="$SERVER_DIRECTORY" DOCKER_SOCKET="$DOCKER_SOCKET" CONFIG_FILE="$CONFIG_FILE" TMP_FILE="$TMP_FILE" node <<'NODE'
const fs = require("fs");
const config = JSON.parse(fs.readFileSync(process.env.CONFIG_FILE, "utf8"));
const updates = {
  panelUrl: process.env.PANEL_URL,
  nodeId: process.env.NODE_ID,
  port: process.env.PORT,
  serverDirectory: process.env.SERVER_DIRECTORY,
  dockerSocket: process.env.DOCKER_SOCKET,
};
for (const [key, value] of Object.entries(updates)) {
  if (value) config[key] = key === "port" ? Number(value) : value;
}
if (!config.credential || !config.nodeId || !config.panelUrl || !Number.isInteger(Number(config.port))) {
  throw new Error("Existing config is missing required node fields; re-register the node.");
}
fs.writeFileSync(process.env.TMP_FILE, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
NODE
chmod 600 "$TMP_FILE"
mv -f "$TMP_FILE" "$CONFIG_FILE"
ok "Node configuration updated without changing the node credential or server data."

if [[ "$RESTART" == true ]]; then
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "$SERVICE.service" >/dev/null 2>&1; then
    systemctl daemon-reload
    systemctl restart "$SERVICE"
    systemctl is-active --quiet "$SERVICE" || fail "Node restart failed. Check: journalctl -u $SERVICE -n 100 --no-pager"
    ok "Node service restarted: $SERVICE"
  else
    info "systemd service $SERVICE.service was not found; configuration was updated but the daemon was not restarted."
  fi
else
  info "Restart skipped (--no-restart). Restart later with: sudo systemctl restart $SERVICE"
fi

#!/usr/bin/env bash
# ShiroNex node diagnostic CLI
# Read-only triage: this script does not install, restart, prune, delete, or modify services.

set -u

VERSION="1.0.0"
CONFIG_PATH="${SHIRONEX_CONFIG:-/etc/shironex-node/config.json}"
OUTPUT="text"
STRICT=0
HEALTH_URL="${SHIRONEX_NODE_HEALTH_URL:-}"
NODE_TOKEN_ENV="SHIRONEX_NODE_TOKEN"

CHECK_IDS=()
CHECK_STATUS=()
CHECK_MESSAGES=()
CHECK_EVIDENCE=()
FAIL_COUNT=0
WARN_COUNT=0

usage() {
  cat <<'EOF'
Usage: shironex-node-diagnose.sh [options]

Read-only ShiroNex node and container-runtime diagnostics.

Options:
  --config PATH       Node daemon config path (default: $SHIRONEX_CONFIG or /etc/shironex-node/config.json)
  --health-url URL    Optional node daemon health URL to test
  --json              Emit machine-readable JSON
  --strict            Return non-zero when warnings are present
  --version           Print the diagnostic version
  -h, --help          Show this help

Environment:
  SHIRONEX_CONFIG          Overrides the default config path.
  SHIRONEX_NODE_HEALTH_URL Supplies the health URL when --health-url is omitted.
  SHIRONEX_NODE_TOKEN      Optional bearer token for the health API. It is never printed.

Examples:
  sudo bash scripts/shironex-node-diagnose.sh
  sudo bash scripts/shironex-node-diagnose.sh --config /etc/shironex-node/config.json
  SHIRONEX_NODE_TOKEN='...' sudo -E bash scripts/shironex-node-diagnose.sh \
    --health-url http://127.0.0.1:6768/v1/health --json
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --config)
      [ "$#" -ge 2 ] || { echo "--config requires a path" >&2; exit 2; }
      CONFIG_PATH="$2"; shift 2 ;;
    --health-url)
      [ "$#" -ge 2 ] || { echo "--health-url requires a URL" >&2; exit 2; }
      HEALTH_URL="$2"; shift 2 ;;
    --json) OUTPUT="json"; shift ;;
    --strict) STRICT=1; shift ;;
    --version) echo "$VERSION"; exit 0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

add_check() {
  local id="$1" status="$2" message="$3" evidence="${4:-}"
  CHECK_IDS+=("$id")
  CHECK_STATUS+=("$status")
  CHECK_MESSAGES+=("$message")
  CHECK_EVIDENCE+=("$evidence")
  case "$status" in
    FAIL) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
    WARN) WARN_COUNT=$((WARN_COUNT + 1)) ;;
  esac
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

limited() {
  if command_exists timeout; then timeout 8 "$@" 2>&1; else "$@" 2>&1; fi
}

service_state() {
  local service="$1" state
  if ! command_exists systemctl; then
    printf '%s' "systemctl unavailable"
    return 0
  fi
  state=$(systemctl is-active "$service" 2>/dev/null || true)
  printf '%s' "${state:-inactive-or-missing}"
}

json_escape() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '%s' "$value"
}

emit_text() {
  echo "ShiroNex node diagnostic $VERSION"
  echo "Host: $(hostname 2>/dev/null || echo unknown)"
  echo "Config: $CONFIG_PATH"
  echo
  printf '%-22s %-6s %s\n' "CHECK" "STATE" "MESSAGE"
  printf '%-22s %-6s %s\n' "----------------------" "------" "----------------------------------------------"
  local i
  for i in "${!CHECK_IDS[@]}"; do
    printf '%-22s %-6s %s\n' "${CHECK_IDS[$i]}" "${CHECK_STATUS[$i]}" "${CHECK_MESSAGES[$i]}"
    if [ -n "${CHECK_EVIDENCE[$i]}" ]; then
      printf '  evidence: %s\n' "${CHECK_EVIDENCE[$i]}"
    fi
  done
  echo
  echo "Summary: $FAIL_COUNT failure(s), $WARN_COUNT warning(s)."
  if [ "$FAIL_COUNT" -gt 0 ]; then
    echo "Action: resolve FAIL checks, then restart the ShiroNex daemon only after validating the runtime and permissions."
  elif [ "$WARN_COUNT" -gt 0 ]; then
    echo "Action: review WARN checks before assigning production servers to this node."
  else
    echo "Action: no blocking runtime issue was detected by this read-only scan."
  fi
}

emit_json() {
  printf '{"version":"%s","host":"%s","config":"%s","summary":{"failures":%d,"warnings":%d},"checks":[' \
    "$(json_escape "$VERSION")" "$(json_escape "$(hostname 2>/dev/null || echo unknown)")" "$(json_escape "$CONFIG_PATH")" "$FAIL_COUNT" "$WARN_COUNT"
  local i
  for i in "${!CHECK_IDS[@]}"; do
    [ "$i" -gt 0 ] && printf ','
    printf '{"id":"%s","status":"%s","message":"%s","evidence":"%s"}' \
      "$(json_escape "${CHECK_IDS[$i]}")" "$(json_escape "${CHECK_STATUS[$i]}")" \
      "$(json_escape "${CHECK_MESSAGES[$i]}")" "$(json_escape "${CHECK_EVIDENCE[$i]}")"
  done
  echo ']} '
}

# Operating-system and service identity checks.
if [ -r /etc/os-release ]; then
  OS_NAME=$(sed -n 's/^PRETTY_NAME=//p' /etc/os-release | tr -d '"')
  add_check os PASS "Operating system detected" "${OS_NAME:-unknown}"
else
  add_check os WARN "Unable to read /etc/os-release" "The host may be a minimal container environment."
fi

if command_exists systemctl; then
  DAEMON_STATE=$(service_state shironex-node)
  if [ "$DAEMON_STATE" = "active" ]; then
    add_check shironex-daemon PASS "ShiroNex node daemon is active" "$DAEMON_STATE"
  else
    add_check shironex-daemon WARN "ShiroNex node daemon is not active or systemd is unavailable" "$DAEMON_STATE"
  fi
else
  add_check shironex-daemon WARN "systemctl is unavailable; daemon service state could not be checked" "Run this on the node host or inspect the process supervisor used by the deployment."
fi

# Runtime discovery.
DOCKER_PRESENT=0
if command_exists docker; then
  DOCKER_PRESENT=1
  DOCKER_VERSION=$(docker --version 2>&1 | head -1)
  DOCKER_INFO=$(limited docker info)
  if printf '%s' "$DOCKER_INFO" | grep -qiE 'server version|docker root dir|storage driver'; then
    add_check docker-api PASS "Docker Engine API is reachable" "$DOCKER_VERSION"
  else
    add_check docker-api FAIL "Docker CLI exists but Docker Engine API is unavailable" "$(printf '%s' "$DOCKER_INFO" | head -1)"
  fi
else
  add_check docker-api FAIL "Docker CLI is not installed" "Install Docker Engine on this node or assign the workload to a supported Docker node."
fi

if command_exists podman; then
  PODMAN_INFO=$(limited podman info)
  if printf '%s' "$PODMAN_INFO" | grep -qiE 'host:|version:'; then
    add_check podman WARN "Podman is installed; Docker-compatible behavior is experimental" "Use a dedicated Docker Engine node for production unless full lifecycle compatibility has been tested."
  else
    add_check podman WARN "Podman is installed but its service is not confirmed healthy" "$(printf '%s' "$PODMAN_INFO" | head -1)"
  fi
fi

if command_exists crictl; then
  CRICTL_INFO=$(limited crictl info)
  if printf '%s' "$CRICTL_INFO" | grep -qiE 'runtimeType|config|runtimeReady|status'; then
    add_check cri-runtime WARN "A CRI runtime is available; it is not a Docker API replacement" "Use crictl only to diagnose Kubernetes runtime health."
  else
    add_check cri-runtime WARN "crictl is installed but CRI connectivity is not confirmed" "$(printf '%s' "$CRICTL_INFO" | head -1)"
  fi
fi

if command_exists ctr; then
  CTR_VERSION=$(limited ctr version | head -1)
  add_check containerd INFO "containerd tooling detected" "$CTR_VERSION; do not use its native socket as dockerSocket."
fi

if command_exists kubectl; then
  KUBE_RUNTIME=$(kubectl get nodes -o custom-columns='RUNTIME:.status.nodeInfo.containerRuntimeVersion' --no-headers 2>/dev/null | head -1)
  if [ -n "$KUBE_RUNTIME" ]; then
    add_check kubernetes WARN "Kubernetes runtime detected: $KUBE_RUNTIME" "Kubernetes health does not provide Docker API compatibility; use a dedicated Docker node."
  else
    add_check kubernetes INFO "kubectl is installed but cluster runtime was not queried" "Check kubeconfig and permissions if this node should be part of a cluster."
  fi
fi

# Socket and configured endpoint checks.
CONFIG_SOCKET=""
if [ -r "$CONFIG_PATH" ]; then
  CONFIG_SOCKET=$(sed -n 's/.*"dockerSocket"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$CONFIG_PATH" | head -1)
  [ -n "$CONFIG_SOCKET" ] || CONFIG_SOCKET="/var/run/docker.sock (default)"
  add_check daemon-config PASS "Node daemon configuration is readable" "dockerSocket=$CONFIG_SOCKET"
else
  add_check daemon-config WARN "Node daemon configuration is not readable at the expected path" "Use --config PATH or set SHIRONEX_CONFIG; credentials are intentionally not collected."
fi

SOCKET_PATH="${CONFIG_SOCKET:-/var/run/docker.sock}"
[ "$SOCKET_PATH" = "/var/run/docker.sock (default)" ] && SOCKET_PATH="/var/run/docker.sock"
if [ -S "$SOCKET_PATH" ]; then
  SOCKET_META=$(ls -l "$SOCKET_PATH" 2>/dev/null || true)
  add_check docker-socket PASS "Configured Docker socket exists" "$SOCKET_META"
else
  add_check docker-socket FAIL "Configured Docker socket is missing or is not a Unix socket" "$SOCKET_PATH"
fi

SERVICE_USER=""
if command_exists systemctl; then
  SERVICE_USER=$(systemctl show shironex-node --property=User --value 2>/dev/null || true)
fi
if [ -n "$SERVICE_USER" ] && [ "$SERVICE_USER" != "root" ]; then
  if id "$SERVICE_USER" >/dev/null 2>&1 && [ -S "$SOCKET_PATH" ] && command_exists sudo; then
    if sudo -u "$SERVICE_USER" test -r "$SOCKET_PATH" -a -w "$SOCKET_PATH" 2>/dev/null; then
      add_check socket-access PASS "ShiroNex service user can access the Docker socket" "user=$SERVICE_USER"
    else
      add_check socket-access FAIL "ShiroNex service user cannot read and write the Docker socket" "user=$SERVICE_USER; inspect docker group membership and restart the service after changes."
    fi
  else
    add_check socket-access WARN "Could not verify socket access for the ShiroNex service user" "user=$SERVICE_USER; socket=$SOCKET_PATH"
  fi
else
  add_check socket-access INFO "Service user could not be resolved or is root" "Verify the effective service context manually before changing permissions."
fi

if command_exists df; then
  ROOT_USAGE=$(df -P "$SOCKET_PATH" 2>/dev/null | awk 'NR==2 {print $5}')
  DATA_USAGE=$(df -P /var/lib/docker 2>/dev/null | awk 'NR==2 {print $5}')
  [ -n "$DATA_USAGE" ] || DATA_USAGE="$ROOT_USAGE"
  if [ -n "$DATA_USAGE" ]; then
    DATA_NUMBER=${DATA_USAGE%%%}
    if [ "${DATA_NUMBER:-0}" -ge 95 ] 2>/dev/null; then
      add_check disk-space FAIL "Docker filesystem is critically full" "$DATA_USAGE used; preserve server data before cleanup."
    elif [ "${DATA_NUMBER:-0}" -ge 85 ] 2>/dev/null; then
      add_check disk-space WARN "Docker filesystem is nearing capacity" "$DATA_USAGE used; review images, logs, worlds, backups, and inodes."
    else
      add_check disk-space PASS "Docker filesystem has normal reported usage" "$DATA_USAGE used"
    fi
  else
    add_check disk-space WARN "Filesystem usage could not be determined" "Check df -h and df -i manually."
  fi
fi

# Optional panel-facing health check. The bearer token is never echoed or placed in evidence.
if [ -n "$HEALTH_URL" ]; then
  if ! command_exists curl; then
    add_check node-health WARN "curl is unavailable; node health URL was not tested" "$HEALTH_URL"
  else
    CURL_ARGS=(--silent --show-error --max-time 8 --output /tmp/shironex-node-health.$$.json --write-out '%{http_code}')
    NODE_TOKEN="${!NODE_TOKEN_ENV-}"
    if [ -n "$NODE_TOKEN" ]; then
      CURL_ARGS+=(--header "Authorization: Bearer $NODE_TOKEN")
    fi
    HTTP_CODE=$(curl "${CURL_ARGS[@]}" "$HEALTH_URL" 2>/tmp/shironex-node-health.$$.err || true)
    BODY=$(cat /tmp/shironex-node-health.$$.json 2>/dev/null || true)
    ERR=$(cat /tmp/shironex-node-health.$$.err 2>/dev/null || true)
    rm -f /tmp/shironex-node-health.$$.json /tmp/shironex-node-health.$$.err
    if [ "$HTTP_CODE" = "200" ]; then
      if printf '%s' "$BODY" | grep -q '"docker"[[:space:]]*:[[:space:]]*false'; then
        add_check node-health WARN "Node daemon is reachable but reports Docker unavailable" "HTTP 200; docker=false"
      else
        add_check node-health PASS "Node daemon health endpoint is reachable" "HTTP 200"
      fi
    else
      add_check node-health FAIL "Node daemon health endpoint did not return HTTP 200" "HTTP ${HTTP_CODE:-request-failed}; ${ERR:-inspect URL, TLS, firewall, and credential}"
    fi
  fi
fi

if [ "$OUTPUT" = "json" ]; then
  emit_json
else
  emit_text
fi

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
if [ "$STRICT" -eq 1 ] && [ "$WARN_COUNT" -gt 0 ]; then
  exit 2
fi
exit 0

#!/usr/bin/env bash
set -euo pipefail
systemctl disable --now shironex-node 2>/dev/null || true
rm -f /etc/systemd/system/shironex-node.service
systemctl daemon-reload
rm -rf /opt/shironex-node
rm -f /etc/shironex-node/config.json
rmdir /etc/shironex-node 2>/dev/null || true
echo "ShiroNex Node daemon removed. Server data under /var/lib/shironex/servers was preserved."

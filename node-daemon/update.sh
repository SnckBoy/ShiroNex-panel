#!/usr/bin/env bash
set -euo pipefail
cd /opt/shironex-node
npm ci --omit=dev || npm install --omit=dev
npm run build
systemctl restart shironex-node
systemctl --no-pager --full status shironex-node

#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/../vps-infra/scripts/vps-common.sh"

DOMAIN="math.adamdub.xyz"

echo "==> Building site..."
cd "${SCRIPT_DIR}/site"
npm run build

vps_deploy_static "$DOMAIN" "dist"

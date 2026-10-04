#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Runs ON the EC2 instance, called by the pipeline's DEPLOY stage.
#
# Usage: bash deploy.sh <release-id> <path-to-tarball>
#
# Strategy: "releases + symlink"
#   /opt/sdlc-demo/releases/<id>   one folder per deployed build
#   /opt/sdlc-demo/current  ->     symlink to the live release
# Switching the symlink makes the release live; switching it back is a rollback.
# ---------------------------------------------------------------------------
set -euo pipefail

RELEASE_ID="$1"
TARBALL="$2"

APP_NAME="sdlc-demo"
APP_DIR="/opt/${APP_NAME}"
RELEASE_DIR="${APP_DIR}/releases/${RELEASE_ID}"
HEALTH_URL="http://127.0.0.1:3000/health"
KEEP_RELEASES=5

PREVIOUS_RELEASE="$(readlink -f "${APP_DIR}/current" || true)"

echo ">>> Unpacking release ${RELEASE_ID}"
rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}"
tar -xzf "${TARBALL}" -C "${RELEASE_DIR}"
rm -f "${TARBALL}"

echo ">>> Switching 'current' to the new release"
ln -sfn "${RELEASE_DIR}" "${APP_DIR}/current"
sudo systemctl restart "${APP_NAME}"

echo ">>> Health check"
for attempt in $(seq 1 10); do
  if curl -fsS "${HEALTH_URL}" > /dev/null; then
    echo "Healthy after ${attempt} attempt(s)"
    break
  fi
  if [ "${attempt}" -eq 10 ]; then
    echo "!!! Health check FAILED"
    if [ -n "${PREVIOUS_RELEASE}" ] && [ -d "${PREVIOUS_RELEASE}" ]; then
      echo "!!! Rolling back to ${PREVIOUS_RELEASE}"
      ln -sfn "${PREVIOUS_RELEASE}" "${APP_DIR}/current"
      sudo systemctl restart "${APP_NAME}"
    fi
    exit 1
  fi
  sleep 3
done

echo ">>> Cleaning up old releases (keeping ${KEEP_RELEASES})"
cd "${APP_DIR}/releases"
ls -1t | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf

echo ">>> Deploy of ${RELEASE_ID} complete"

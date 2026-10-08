#!/bin/bash
# Production deploy, started from the admin panel (tps-backend: POST /internal/deploy).
#
#   deploy.sh <run-dir>
#
# Fast-forwards ~/app to origin/main, reinstalls dependencies only in backends
# whose package files changed, restarts only the pm2 apps whose code changed,
# and health-checks them. If anything fails after the code moved, it puts the
# previous commit back and restarts again, so a bad push cannot leave the site
# down.
#
# The API copies this file into <run-dir> and runs that copy detached, because
# restarting tps-api kills the request that started the deploy, and git
# rewrites this file mid-run.
#
# Writes into <run-dir>: log, status (running|success|failed|rolled_back|noop),
# result.json.
set -uo pipefail
RUN_DIR="$1"
APP_DIR="${DEPLOY_APP_DIR:-/home/ubuntu/app}"
exec >> "$RUN_DIR/log" 2>&1

log()    { echo "[$(date -u +%H:%M:%S)] $*"; }
status() { echo "$1" > "$RUN_DIR/status"; }
result() { printf '{"from":"%s","to":"%s","services":"%s","outcome":"%s"}\n' "$OLD" "${NEW:-}" "${SERVICES:-}" "$1" > "$RUN_DIR/result.json"; }

# One deploy at a time.
exec 9> /tmp/ps-deploy.lock
if ! flock -n 9; then log "Another deploy is already running."; status failed; exit 1; fi

status running
cd "$APP_DIR" || { log "No checkout at $APP_DIR"; status failed; exit 1; }
OLD=$(git rev-parse HEAD)
log "Current commit: $(git log -1 --format='%h %s' HEAD)"

# Tracked files edited by hand on the server would be lost or conflict.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  log "The server checkout has uncommitted changes; refusing to deploy:"
  git status --short --untracked-files=no
  status failed; result failed; exit 1
fi

log "Fetching origin/main"
if ! git fetch --quiet origin main; then log "git fetch failed"; status failed; result failed; exit 1; fi
NEW=$(git rev-parse FETCH_HEAD)

if [ "$OLD" = "$NEW" ]; then
  log "Already on the latest commit. Nothing to deploy."
  status noop; result noop; exit 0
fi

log "Deploying $(git rev-parse --short "$OLD") -> $(git log -1 --format='%h %s' "$NEW")"
git log --format='  %h %s (%an)' "$OLD..$NEW"
CHANGED=$(git diff --name-only "$OLD" "$NEW")

# backend dir | pm2 apps | health port
BACKENDS="tps-backend|tps-api tps-worker|3000
crm-backend|crm-api|4005
gradient-backend|gradient-api gradient-worker|5000"

SERVICES=""; INSTALL=""; PORTS=""
while IFS='|' read -r dir apps port; do
  if echo "$CHANGED" | grep -q "^$dir/"; then
    SERVICES="$SERVICES $apps"; PORTS="$PORTS $port"
    echo "$CHANGED" | grep -qE "^$dir/package(-lock)?\.json$" && INSTALL="$INSTALL $dir"
  fi
done <<< "$BACKENDS"
SERVICES=$(echo $SERVICES); PORTS=$(echo $PORTS); INSTALL=$(echo $INSTALL)

install_deps() {
  local d
  for d in $INSTALL; do
    log "npm ci in $d"
    (cd "$APP_DIR/$d" && PUPPETEER_SKIP_DOWNLOAD=true npm ci --no-audit --no-fund --loglevel=error) || return 1
  done
}

restart_and_check() {
  [ -z "$SERVICES" ] && return 0
  log "Restarting: $SERVICES"
  pm2 restart $SERVICES --update-env > /dev/null || return 1
  local p i ok
  for p in $PORTS; do
    ok=0
    for i in $(seq 1 30); do
      curl -sf -m 3 "http://127.0.0.1:$p/health" > /dev/null && { ok=1; break; }
      sleep 2
    done
    [ $ok = 1 ] && log "  health ok on :$p" || { log "  health FAILED on :$p"; return 1; }
  done
}

rollback() {
  log "ROLLING BACK to $(git rev-parse --short "$OLD")"
  git reset --hard --quiet "$OLD"
  install_deps
  restart_and_check && log "Rolled back; previous version is serving." || log "ROLLBACK ALSO FAILED - check pm2 logs on the server"
  status rolled_back; result rolled_back; exit 1
}

git merge --ff-only --quiet "$NEW" || { log "Not a fast-forward from the server's commit; refusing."; status failed; result failed; exit 1; }
install_deps || { log "Dependency install failed"; rollback; }
[ -z "$SERVICES" ] && log "No backend code changed; nothing to restart."
restart_and_check || rollback

pm2 save > /dev/null
log "Deploy finished: now on $(git log -1 --format='%h %s' HEAD)"
status success; result success

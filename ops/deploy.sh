#!/bin/bash
# Production deploy, started from the admin panel (tps-backend: /internal/deploy).
#
#   deploy.sh <run-dir>
#
# Reads from the environment:
#   DEPLOY_MODE     code (default) | env
#   DEPLOY_TARGETS  backends to deploy: any of "tps crm gradient" (default: all)
#   DEPLOY_ENV_BACKUP  env mode: the .env as it was before the panel saved it
#
# code: fast-forwards ~/app to origin/main, then for each target backend whose
#       code changed since it was last deployed, reinstalls packages if they
#       changed, restarts its pm2 apps and health-checks them.
# env:  the API has already written the new .env; restarts that backend and
#       health-checks it.
# Any failure puts back what was there before (the previous commit, or the
# previous .env) and restarts again, so a bad change cannot leave a backend down.
#
# The commit each backend is running is kept in $RUNS_DIR/deployed.json: the
# backends share one checkout, so the checkout's HEAD alone cannot say which
# backend has actually been restarted onto which code.
#
# The API runs a copy of this file in <run-dir>, detached: restarting tps-api
# is part of a deploy and must not kill it, and git rewrites the original.
set -uo pipefail
RUN_DIR="$1"
APP_DIR="${DEPLOY_APP_DIR:-/home/ubuntu/app}"
RUNS_DIR="$(dirname "$RUN_DIR")"
STATE="$RUNS_DIR/deployed.json"
MODE="${DEPLOY_MODE:-code}"
TARGETS="${DEPLOY_TARGETS:-tps crm gradient}"
exec >> "$RUN_DIR/log" 2>&1

log()    { echo "[$(date -u +%H:%M:%S)] $*"; }
status() { echo "$1" > "$RUN_DIR/status"; }
DONE=""
result() { printf '{"mode":"%s","targets":"%s","from":"%s","to":"%s","restarted":"%s","outcome":"%s"}\n' \
  "$MODE" "$TARGETS" "${OLD:-}" "${NEW:-}" "$(echo $DONE)" "$1" > "$RUN_DIR/result.json"; }

dir_of()   { echo "$1-backend"; }
apps_of()  { case $1 in tps) echo "tps-api tps-worker";; crm) echo "crm-api";; gradient) echo "gradient-api gradient-worker";; esac; }
port_of()  { case $1 in tps) echo 3000;; crm) echo 4005;; gradient) echo 5000;; esac; }
deployed() { python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2],''))" "$STATE" "$1" 2>/dev/null; }
mark()     { python3 - "$STATE" "$1" "$2" <<'PY'
import json, sys
p, k, v = sys.argv[1:]
try: d = json.load(open(p))
except Exception: d = {}
d[k] = v
json.dump(d, open(p, "w"))
PY
}

restart_and_check() {   # <backend>
  local b=$1 p i
  log "Restarting $b: $(apps_of $b)"
  # No --update-env: it would copy this shell's variables into the app, where
  # they beat the app's own .env (dotenv never overrides). Each app reads its
  # .env when it starts, so a plain restart picks up .env edits.
  pm2 restart $(apps_of $b) > /dev/null || return 1
  p=$(port_of $b)
  for i in $(seq 1 30); do
    curl -sf -m 3 "http://127.0.0.1:$p/health" > /dev/null && { log "  $b healthy on :$p"; return 0; }
    sleep 2
  done
  log "  $b health check FAILED on :$p"; return 1
}

install_deps() {        # <backend> <since-commit>
  local d; d=$(dir_of $1)
  if [ -z "$2" ] || git diff --name-only "$2" HEAD -- "$d/package.json" "$d/package-lock.json" | grep -q .; then
    log "npm ci in $d"
    (cd "$APP_DIR/$d" && PUPPETEER_SKIP_DOWNLOAD=true npm ci --no-audit --no-fund --loglevel=error)
  fi
}

# One deploy at a time.
exec 9> /tmp/ps-deploy.lock
if ! flock -n 9; then log "Another deploy is already running."; status failed; result failed; exit 1; fi
status running
cd "$APP_DIR" || { log "No checkout at $APP_DIR"; status failed; result failed; exit 1; }
OLD=$(git rev-parse HEAD); NEW=$OLD
log "Mode: $MODE, backends: $TARGETS (by ${DEPLOY_BY:-unknown})"

# Before the first panel deploy, every backend is running the checkout's HEAD.
for b in tps crm gradient; do [ -n "$(deployed $b)" ] || mark $b "$OLD"; done

# ---------------------------------------------------------------- env mode
if [ "$MODE" = env ]; then
  b=$TARGETS; env_file="$APP_DIR/$(dir_of $b)/.env"
  if restart_and_check $b; then
    DONE=$b; pm2 save > /dev/null
    log "New .env for $b is live."; status success; result success; exit 0
  fi
  log "ROLLING BACK $b to the previous .env"
  cp -p "$DEPLOY_ENV_BACKUP" "$env_file"
  restart_and_check $b && log "Previous .env restored; $b is serving." || log "ROLLBACK ALSO FAILED - check pm2 logs for $b"
  status rolled_back; result rolled_back; exit 1
fi

# --------------------------------------------------------------- code mode
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  log "The server checkout has uncommitted changes; refusing to deploy:"; git status --short --untracked-files=no
  status failed; result failed; exit 1
fi
log "Fetching origin/main"
git fetch --quiet origin main || { log "git fetch failed"; status failed; result failed; exit 1; }
NEW=$(git rev-parse FETCH_HEAD)
if [ "$OLD" != "$NEW" ]; then
  log "Checkout $(git rev-parse --short "$OLD") -> $(git log -1 --format='%h %s' "$NEW")"
  git merge --ff-only --quiet "$NEW" || { log "Not a fast-forward from the server's commit; refusing."; status failed; result failed; exit 1; }
fi

rollback() {
  log "ROLLING BACK: checkout to $(git rev-parse --short "$OLD")"
  git reset --hard --quiet "$OLD"
  local b
  for b in $DONE $1; do
    install_deps $b "$NEW"
    restart_and_check $b && mark $b "$OLD" || log "ROLLBACK ALSO FAILED for $b - check pm2 logs"
  done
  status rolled_back; result rolled_back; exit 1
}

for b in $TARGETS; do
  was=$(deployed $b)
  if [ "$was" = "$NEW" ] || ! git diff --name-only "$was" "$NEW" -- "$(dir_of $b)" | grep -q .; then
    log "$b: no code changes since its last deploy"; mark $b "$NEW"; continue
  fi
  log "$b: deploying $(git rev-parse --short "$was") -> $(git rev-parse --short "$NEW")"
  git log --format='    %h %s (%an)' "$was..$NEW" -- "$(dir_of $b)"
  install_deps $b "$was" || { log "npm ci failed for $b"; rollback $b; }
  restart_and_check $b || rollback $b
  mark $b "$NEW"; DONE="$DONE $b"
done

pm2 save > /dev/null
if [ -z "$(echo $DONE)" ]; then log "Nothing to deploy."; status noop; result noop; exit 0; fi
log "Deploy finished: $(echo $DONE) on $(git log -1 --format='%h %s' HEAD)"
status success; result success

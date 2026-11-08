#!/usr/bin/env bash
# Idempotent deploy of In My Words to the Vultr VM (pattern from agentic-social-research/ops/deploy.sh).
# Safe to re-run by a human, an agent, or CI, from anywhere.
#
#   ops/deploy.sh               sync code, push secrets from the local .env, build, (re)start
#                               all services, configure Caddy HTTPS, then verify from here
#   ops/deploy.sh --skip-env    keep the VM's existing /etc/inmywords.env (what CI uses)
#   ops/deploy.sh --env-only    only refresh /etc/inmywords.env and restart the services
#   ops/deploy.sh --plain-http  serve plain HTTP on :80 only (no TLS)
#
# Env overrides: DEPLOY_HOST (required, or set in ops/host), DEPLOY_DOMAIN (web hostname,
# default <ip-with-dashes>.sslip.io; the API is served at api.<DEPLOY_DOMAIN>),
# DEPLOY_SSH_KEY (~/.ssh/inmywords_vultr_ed25519).
#
# What runs on the VM (all as user `app`, code read-only in /srv/inmywords, owned by root):
#   inmywords-mcp-profile :8101  inmywords-mcp-memory :8102  inmywords-mcp-actions :8103
#   inmywords-mcp-emh :8104      inmywords-api :8000 (uvicorn)  inmywords-web :3000 (next start)
#   inmywords-booking :8200 (mock booking page)                       — all on 127.0.0.1
#   Caddy: https://DOMAIN → web, https://api.DOMAIN → api, https://booking.DOMAIN → mock booking
#
# Secrets: only the allowlisted keys below are read from the local .env and streamed over SSH
# stdin into /etc/inmywords.env (root:app 0640). They never appear in argv, logs or the synced tree.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${DEPLOY_HOST:-$( [ -f ops/host ] && tr -d '[:space:]' < ops/host || true)}"
[[ "$HOST" =~ ^[0-9.]+$ ]] || { echo "Set DEPLOY_HOST to the VM's IPv4 address (or write it to ops/host)" >&2; exit 2; }
DOMAIN="${DEPLOY_DOMAIN:-${HOST//./-}.sslip.io}"
API_DOMAIN="api.$DOMAIN"
BOOKING_DOMAIN="booking.$DOMAIN"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/inmywords_vultr_ed25519}"
REMOTE=/srv/inmywords
SKIP_ENV=0
ENV_ONLY=0
PLAIN=0
for arg in "$@"; do
  case "$arg" in
    --skip-env) SKIP_ENV=1 ;;
    --env-only) ENV_ONLY=1 ;;
    --plain-http) PLAIN=1 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "DEPLOY_DOMAIN has unexpected characters" >&2; exit 2; }
[ -f "$SSH_KEY" ] || { echo "SSH key $SSH_KEY not found" >&2; exit 2; }

KNOWN_HOSTS_OPT=(-o StrictHostKeyChecking=accept-new)
[ -s ops/known_hosts ] && KNOWN_HOSTS_OPT=(-o StrictHostKeyChecking=yes -o UserKnownHostsFile=ops/known_hosts)
SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 "${KNOWN_HOSTS_OPT[@]}")
ssh_root() { ssh "${SSH_OPTS[@]}" "root@$HOST" "$@"; }
step() { printf '\n== %s\n' "$*"; }
SERVICES=(inmywords-mcp-profile inmywords-mcp-memory inmywords-mcp-actions inmywords-mcp-emh inmywords-api inmywords-web inmywords-booking)

# Secrets copied from the local .env to the VM. Add a name here when a new integration lands.
ENV_KEYS=(DATABASE_URL GEMINI_API_KEY GEMINI_MODEL GEMINI_EMBED_MODEL
  ELEVENLABS_API_KEY ELEVENLABS_STORY_AGENT_ID ELEVENLABS_COACH_AGENT_ID ELEVENLABS_TTS_MODEL
  ELEVENLABS_FALLBACK_VOICE_ID ELEVENLABS_DEFAULT_VOICE_ID CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET
  CLOUDINARY_UPLOAD_PRESET NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME EMAIL_SENDER_ADDRESS EMAIL_SENDER_PASSWORD
  GOOGLE_SERVICE_ACCOUNT_JSON GOOGLE_CALENDAR_STAFF_EMAILS)

push_env() {
  step "Writing /etc/inmywords.env (root:app 0640; values streamed over SSH stdin)"
  [ -f .env ] || { echo "No local .env; nothing to push (services run in mock/seed mode)." >&2; }
  local pattern
  pattern="^($(IFS='|'; echo "${ENV_KEYS[*]}"))="
  { [ -f .env ] && grep -E "$pattern" .env | grep -Ev '^[A-Z_]+=$' || true; } | ssh_root 'set -e
id app >/dev/null 2>&1 || useradd -m -s /usr/sbin/nologin app
umask 077; t=$(mktemp /etc/inmywords.env.XXXXXX); cat > "$t"
chown root:app "$t"; chmod 0640 "$t"; mv -f "$t" /etc/inmywords.env
echo "keys on VM: $(cut -d= -f1 /etc/inmywords.env | tr "\n" " ")"'
}
restart_all() {
  ssh_root "systemctl daemon-reload && systemctl restart ${SERVICES[*]}"
}
wait_healthy() {
  ssh_root 'for i in $(seq 1 60); do
  curl -fsS -o /dev/null http://127.0.0.1:8000/ && curl -fsS -o /dev/null http://127.0.0.1:3000/ && { echo "api + web healthy on 127.0.0.1"; exit 0; }
  sleep 1; done
for s in inmywords-api inmywords-web; do journalctl -u $s -n 30 --no-pager; done; exit 1'
}

if [ "$ENV_ONLY" = 1 ]; then push_env; restart_all; wait_healthy; exit 0; fi

step "Preparing $HOST"
ssh_root 'set -e
export DEBIAN_FRONTEND=noninteractive
id app >/dev/null 2>&1 || useradd -m -s /usr/sbin/nologin app
mkdir -p /srv/inmywords
need=""
for c in rsync curl; do command -v $c >/dev/null || need="$need $c"; done
python3 -c "import venv, ensurepip" 2>/dev/null || need="$need python3-venv python3-pip"
[ -n "$need" ] && apt-get -o DPkg::Lock::Timeout=180 update -q && apt-get -o DPkg::Lock::Timeout=180 install -y -q $need
if ! command -v node >/dev/null || [ "$(node -p "process.versions.node.split(\".\")[0]")" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y -q nodejs
fi
[ -f /swapfile ] || { fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && echo "/swapfile none swap sw 0 0" >> /etc/fstab; }
python3 --version; node -v'

if [ -s ops/github_deploy_key.pub ]; then
  step "Authorizing the GitHub Actions deploy key (restricted, comment inmywords-github-actions-deploy)"
  { printf 'restrict '; cat ops/github_deploy_key.pub; } | ssh_root 'set -e
line=$(cat); umask 077; mkdir -p /root/.ssh; touch /root/.ssh/authorized_keys
grep -qF "$line" /root/.ssh/authorized_keys || echo "$line" >> /root/.ssh/authorized_keys
echo "deploy key authorized"'
fi

step "Syncing code to $HOST:$REMOTE"
rsync -az --delete \
  --exclude '.env*' --exclude '.git' --exclude '.github' --exclude 'node_modules' --exclude '.next' \
  --exclude '.venv' --exclude '__pycache__' --exclude 'audio-cache' --exclude '.DS_Store' --exclude '*.docx' \
  --exclude '.runtime.json' \
  -e "ssh ${SSH_OPTS[*]}" ./api ./mcp ./db ./web ./mock-booking "root@$HOST:$REMOTE/"

SHA="$(git rev-parse HEAD)"
DIRTY=false
[ -n "$(git status --porcelain)" ] && DIRTY=true
printf '{"git_sha":"%s","dirty":%s,"deployed_at":"%s"}\n' "$SHA" "$DIRTY" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" | ssh_root "cat > $REMOTE/VERSION"
echo "VERSION: $SHA dirty=$DIRTY"

if [ "$SKIP_ENV" = 0 ]; then push_env; fi
ssh_root 'test -f /etc/inmywords.env || install -m 0640 -o root -g app /dev/null /etc/inmywords.env'

step "Installing Python deps and building the web app"
ssh_root "set -eo pipefail
cd $REMOTE
[ -x /opt/inmywords-venv/bin/python ] || python3 -m venv /opt/inmywords-venv
/opt/inmywords-venv/bin/pip install -q --upgrade pip
/opt/inmywords-venv/bin/pip install -q -r api/requirements.txt -r mcp/requirements.txt fastmcp
cd web
npm ci --no-audit --no-fund --loglevel=error
set -a; . /etc/inmywords.env; set +a
# next build wipes .next first, so keep the running build until the new one succeeds.
rm -rf /var/tmp/inmywords-next.prev; [ -d .next ] && cp -a .next /var/tmp/inmywords-next.prev
if ! API_BASE_URL=http://127.0.0.1:8000 npm run build > /var/tmp/inmywords-build.log 2>&1; then
  grep -E 'error|Error' /var/tmp/inmywords-build.log | head -n 20
  rm -rf .next; [ -d /var/tmp/inmywords-next.prev ] && mv /var/tmp/inmywords-next.prev .next
  echo 'next build FAILED: deploy aborted; the previous web build is still in place.' >&2
  exit 1
fi
tail -n 15 /var/tmp/inmywords-build.log
find $REMOTE -name '.env*' -print -delete
chown -R root:root $REMOTE && chmod -R u=rwX,go=rX $REMOTE
mkdir -p $REMOTE/web/.next/cache && chown -R app:app $REMOTE/web/.next/cache
# Seed mode persists action plans + bookings to db/seed/.runtime.json; keep it in writable state.
mkdir -p /var/lib/inmywords && chown app:app /var/lib/inmywords
ln -sfn /var/lib/inmywords/runtime.json $REMOTE/db/seed/.runtime.json"

step "Installing systemd units"
unit() {  # name, description, workdir, exec, extra env lines
  cat <<UNIT
[Unit]
Description=In My Words: $2
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=app
Group=app
WorkingDirectory=$3
EnvironmentFile=/etc/inmywords.env
Environment=PYTHONUNBUFFERED=1
$5
ExecStart=$4
Restart=always
RestartSec=2
StateDirectory=inmywords
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=
ReadWritePaths=$REMOTE/web/.next/cache
MemoryMax=700M

[Install]
WantedBy=multi-user.target
UNIT
}
PY=/opt/inmywords-venv/bin/python
{
  unit inmywords-mcp-profile "profile MCP server" "$REMOTE/mcp" "$PY profile_server.py" ""
  echo "#---"
  unit inmywords-mcp-memory "memory MCP server" "$REMOTE/mcp" "$PY memory_server.py" ""
  echo "#---"
  unit inmywords-mcp-actions "actions MCP server" "$REMOTE/mcp" "$PY actions_server.py" ""
  echo "#---"
  unit inmywords-mcp-emh "EMH MCP server (mock)" "$REMOTE/mcp" "$PY emh_server.py" ""
  echo "#---"
  unit inmywords-api "FastAPI backend" "$REMOTE/api" "/opt/inmywords-venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1" \
    "Environment=AUDIO_CACHE_DIR=/var/lib/inmywords/audio-cache
Environment=PUBLIC_API_URL=https://$API_DOMAIN"
  echo "#---"
  unit inmywords-web "Next.js web app" "$REMOTE/web" "/usr/bin/node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000" \
    "Environment=NODE_ENV=production
Environment=API_BASE_URL=http://127.0.0.1:8000
Environment=PUBLIC_API_URL=https://$API_DOMAIN"
  echo "#---"
  unit inmywords-booking "mock booking page" "$REMOTE" "$PY mock-booking/app.py" ""
} | ssh_root 'set -e
t=$(mktemp); cat > "$t"
python3 - "$t" <<"PY"
import sys, pathlib
names = ["inmywords-mcp-profile", "inmywords-mcp-memory", "inmywords-mcp-actions", "inmywords-mcp-emh",
         "inmywords-api", "inmywords-web", "inmywords-booking"]
parts = pathlib.Path(sys.argv[1]).read_text().split("#---\n")
for name, body in zip(names, parts, strict=True):
    pathlib.Path(f"/etc/systemd/system/{name}.service").write_text(body)
PY
rm -f "$t"'
ssh_root "systemctl daemon-reload && systemctl enable ${SERVICES[*]} >/dev/null 2>&1"
restart_all
wait_healthy

step "Warming the audio cache on the VM (voice previews, tile labels, demo lines)"
# Runs as the service user with the service's env; needs ELEVENLABS_API_KEY on the VM. Non-fatal.
ssh_root "systemd-run --quiet --wait --pipe --collect --uid=app --gid=app \
  -p EnvironmentFile=/etc/inmywords.env -p Environment=AUDIO_CACHE_DIR=/var/lib/inmywords/audio-cache \
  -p WorkingDirectory=$REMOTE/api /opt/inmywords-venv/bin/python -m scripts.pregenerate" \
  || echo "WARNING: cache warm-up failed (no ElevenLabs key on the VM?); audio is generated on first use instead." >&2

step "Installing Caddy (official apt repository)"
ssh_root 'set -e
export DEBIAN_FRONTEND=noninteractive
if ! command -v caddy >/dev/null; then
  apt-get -o DPkg::Lock::Timeout=180 update -q
  apt-get -o DPkg::Lock::Timeout=180 install -y -q debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get -o DPkg::Lock::Timeout=180 update -q
  apt-get -o DPkg::Lock::Timeout=180 install -y -q caddy
fi
command -v ufw >/dev/null && { ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; } || true
caddy version'

write_caddy() {  # $1 = tls | plain
  local conf
  if [ "$1" = tls ]; then
    conf="$DOMAIN {
	header -Server
	reverse_proxy 127.0.0.1:3000
}

$API_DOMAIN {
	header -Server
	reverse_proxy 127.0.0.1:8000
}

$BOOKING_DOMAIN {
	header -Server
	reverse_proxy 127.0.0.1:8200
}

http://$HOST {
	redir https://$DOMAIN{uri}
}
"
  else
    conf="http://$DOMAIN, http://$HOST {
	header -Server
	reverse_proxy 127.0.0.1:3000
}

http://$API_DOMAIN {
	header -Server
	reverse_proxy 127.0.0.1:8000
}

http://$BOOKING_DOMAIN {
	header -Server
	reverse_proxy 127.0.0.1:8200
}
"
  fi
  printf '%s' "$conf" | ssh_root 'set -e
cat > /etc/caddy/Caddyfile.new
caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile >/dev/null 2>&1 || { caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile; exit 1; }
chown root:caddy /etc/caddy/Caddyfile.new && chmod 640 /etc/caddy/Caddyfile.new
mv -f /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
systemctl enable caddy >/dev/null 2>&1
systemctl reload caddy 2>/dev/null || systemctl restart caddy'
}

WEB="https://$DOMAIN"; API="https://$API_DOMAIN"; WARN=""
if [ "$PLAIN" = 1 ]; then
  write_caddy plain; WEB="http://$DOMAIN"; API="http://$API_DOMAIN"
else
  step "Configuring HTTPS for $DOMAIN and $API_DOMAIN (Let's Encrypt via Caddy)"
  write_caddy tls
  ok=0
  for i in $(seq 1 24); do
    curl -fsS -o /dev/null --max-time 10 "$API/" && curl -fsS -o /dev/null --max-time 10 "$WEB/" && { ok=1; break; }
    sleep 5
  done
  if [ "$ok" = 0 ]; then
    ssh_root 'journalctl -u caddy -n 60 --no-pager | grep -iE "error|challenge|obtain" | tail -n 8' || true
    WARN="TLS certificates were not issued within 2 minutes; fell back to plain HTTP."
    write_caddy plain; WEB="http://$DOMAIN"; API="http://$API_DOMAIN"
  fi
fi

step "Verifying from this machine"
curl -fsS --max-time 15 "$API/"; echo
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1"; }
BOOK="${API/api./booking.}"
printf 'web / %s   /staff %s   api /residents/marcus %s   api /.env %s   booking / %s\n' \
  "$(code "$WEB/")" "$(code "$WEB/staff")" "$(code "$API/residents/marcus")" "$(code "$API/.env")" "$(code "$BOOK/")"
[ -n "$WARN" ] && echo "WARNING: $WARN" >&2
echo "Web: $WEB"
echo "API: $API  (docs at $API/docs)"
echo "Booking: $BOOK"

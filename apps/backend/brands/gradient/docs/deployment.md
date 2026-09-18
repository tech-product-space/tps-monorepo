# Deploying gradient-backend to EC2

Postgres is RDS and stays there. This is about the box that runs the API, the
workflow worker and Redis.

## Will a t2.micro handle it?

Yes, at current scale, if you add swap and don't build on the box. It is the
smallest thing that works, not the right thing.

Measured on this codebase — RSS after loading every module and connecting:

| | |
|---|---|
| API (`src/server.js`) | **~170 MB** idle, 200–250 MB under traffic |
| Worker (`src/worker.js`) | **~110 MB** idle, up to ~180 MB mid-send |
| Redis (queue only) | 15–40 MB — delayed jobs are small |
| nginx | ~15 MB |
| OS | ~150 MB (Amazon Linux 2023), ~200 MB (Ubuntu) |

That is **450–550 MB idle** and **700–850 MB** when a campaign send overlaps a
certificate render, against 1 GB with no swap. It fits. It does not fit
comfortably.

**The real constraint is CPU credits, not memory.** A t2.micro earns 6 credits
an hour and its baseline is 10% of one vCPU. Four things on this box are CPU
work, not I/O wait, and each burns credits:

- certificate rendering — `@napi-rs/canvas` plus `pdf-lib`, per certificate
- `buildRecipients` — a single-threaded pass over the whole audience, in memory
- `npm ci` — will exhaust both credits and RAM
- TLS handshakes at any volume

When the credits run out the box is throttled to 10% of a core and everything —
API responses included — crawls. There is no warning in the app; you see it in
CloudWatch as `CPUCreditBalance` hitting zero.

**Recommendation.** Run t2.micro if it is what you have. Move to **t3.small**
before the first large campaign send or any bulk certificate issuance. t3.micro
is a strict upgrade on t2.micro for roughly the same money — newer CPU, and
unlimited mode means throttling costs you cents instead of downtime.

### On t3.small

2 vCPU, 2 GiB, unlimited burst on by default. The memory question stops being
interesting, but **the second vCPU is the bigger win**: on one core the API and
the worker compete, so a certificate render or an audience resolution raises
request latency for something no user asked for. On two they genuinely run in
parallel. Unlimited mode also changes the failure shape — exhausting credits
costs a surcharge (~$0.05 per vCPU-hour) rather than throttling you to 20% of a
core. Set a billing alarm and stop thinking about it.

| | t2.micro | t3.small |
|---|---|---|
| Swap | 2 GB, mandatory | 1 GB, cheap insurance |
| API heap (`--max-old-space-size`) | 320 | 768 |
| Worker heap | 256 | 512 |
| `npm ci` | only when quiet, `--maxsockets 1` | just run it |

**`WORKFLOW_CONCURRENCY` stays at 5 on both.** Its ceiling is the SES quota, not
the box — the advance queue sends with no interval between jobs, so raising it
raises the rate at which you hit SES, and a throttling response is recorded as a
*per-recipient failure*: a real recipient marked failed because we sent too
fast. Raise it only against a known quota.

Campaign sends are not a CPU load on either instance. `campaignSendJob` sleeps
100 ms between sends on purpose (~10/second, conservative for any production
quota), so it is almost entirely I/O wait. The genuine CPU consumers are
certificate rendering and audience resolution.

**If gradient-admin lands on the same box, redo this.** A Next.js production
build wants ~2 GB on its own and the running server another ~200 MB. Build it
elsewhere, or give it its own instance.

Two rules that come from the 1 GB, not from taste:

- **No Docker.** The daemon alone is ~100 MB, which is most of your headroom.
  Install Redis from the distro package. The `npm run redis:*` scripts in
  `package.json` are for local development only.
- **Never build on the box.** `npm ci` peaks well above what is free. Either
  install with `--maxsockets 1` when the box is quiet, or build elsewhere and
  ship `node_modules`.

---

## 1. Before you start

- Security group: 22 from your IP only, 80 and 443 from anywhere.
- The RDS security group must allow 5432 **from the EC2 instance's security
  group**, not from an IP.
- An Elastic IP, so a stop/start does not change the DNS you just pointed.
- The production origins are already in the CORS allowlist in `src/app.js`
  (`thegradient.co.in`, `admin.thegradient.co.in`, `gradientlearnings.org` and
  their `www`/`admin` forms). **A new domain will fail silently until it is
  added there** — it is a code change and a deploy, not a config value.

## 2. Swap

Not optional on 1 GB. Do this first, or `npm ci` will OOM-kill mid-install and
leave a half-written `node_modules`.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10 && echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
free -h
```

## 3. Node and git

Node 20 or newer — the codebase is ESM with Express 5 and top-level `await`.

```bash
# Amazon Linux 2023
sudo dnf install -y git
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs

# Ubuntu
sudo apt update && sudo apt install -y git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs

node -v   # expect v22.x
```

## 4. Redis

Queue storage for the workflow engine. Two settings are load-bearing.

```bash
# Amazon Linux 2023
sudo dnf install -y redis6
sudo systemctl enable --now redis6

# Ubuntu
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
```

Edit the config (`/etc/redis6/redis6.conf` or `/etc/redis/redis.conf`):

```
bind 127.0.0.1
maxmemory-policy noeviction
appendonly yes
```

- **`noeviction`** — a three-day wait is a delayed BullMQ job. A policy that may
  evict it turns "wait three days" into "never", silently.
- **`appendonly yes`** — this is what makes a Redis restart lose nothing.
  Verified: 13 delayed jobs before a restart, 13 after.
- **`bind 127.0.0.1`** — nothing outside the box should reach it. There is no
  password by default.

Restart and confirm:

```bash
sudo systemctl restart redis6      # or redis-server
redis6-cli PING                    # or redis-cli
redis6-cli CONFIG GET maxmemory-policy   # must print noeviction
```

## 5. The code

```bash
sudo mkdir -p /var/www && sudo chown $USER:$USER /var/www
cd /var/www
git clone https://github.com/tech-product-space/gradient-backend.git
cd gradient-backend
npm ci --maxsockets 1
```

**Install the dev dependencies too — do not use `--omit=dev`.** `sequelize-cli`
is a dev dependency and it is what runs the migrations. There is no
`sequelize.sync` anywhere in this codebase; the 62 migration files are the only
thing that builds the schema.

## 6. `.env`

Create `/var/www/gradient-backend/.env`. Copy the values from the working local
file; the ones below are the ones whose *production* value differs or whose
absence breaks something quietly.

```ini
NODE_ENV=production
PORT=8000

POSTGRES_HOST=<rds endpoint>
POSTGRES_PORT=5432
POSTGRES_DB=<prod db, not gradient-beta>
POSTGRES_USER=
POSTGRES_PASSWORD=

JWT_SECRET=
TOKEN_ENCRYPTION_KEY=          # AES-256-GCM key for Meta page tokens

PUBLIC_SITE_URL=https://thegradient.co.in
ADMIN_SITE_URL=https://admin.thegradient.co.in

AGENDA_JOBS_ENABLED=true       # campaigns, reminders, certificates, Meta polling
WORKFLOWS_ENABLED=true         # without this the worker consumes nothing

REDIS_URL=redis://127.0.0.1:6379
REDIS_TLS=false
WORKFLOW_QUEUE_PREFIX=gradient:production
WORKFLOW_CONCURRENCY=5

META_INTEGRATION_ENABLED=true
META_GRAPH_VERSION=
META_ALERT_EMAIL=

# AWS_* (S3), AWS_SES_*, OUTLOOK_*, GOOGLE_AUTH_* — same as local
```

```bash
chmod 600 .env
```

Three of these are worth stating plainly:

- **`WORKFLOWS_ENABLED=true` on both processes or neither.** With it off, the
  API accepts a publish, shows the workflow active, and enrols nobody. That
  looks exactly like a bad trigger filter.
- **`WORKFLOW_QUEUE_PREFIX` must differ per environment.** Two environments
  sharing one Redis under the same prefix means staging's worker consumes
  production's jobs and mails real people from test data. It defaults to
  `gradient:${NODE_ENV}`, so the mistake needs an actual override — but if
  staging also runs `NODE_ENV=production`, set this by hand on both.
- **`AGENDA_JOBS_ENABLED=true`** — Agenda runs on Postgres and carries
  campaigns, event reminders, certificates and the Meta poll. With it off, jobs
  are defined and never run.

## 7. Migrations

```bash
cd /var/www/gradient-backend
npm run pg:migrate
```

Run this from one place only, and before restarting the services. On a fresh
database it will take a minute or two.

## 8. Two systemd services

The worker is **not optional**. It is a separate process that mounts no routers
and listens on no port, and it is the only thing that consumes the queue.

`/etc/systemd/system/gradient-api.service`:

```ini
[Unit]
Description=Gradient API
After=network.target redis6.service
Wants=redis6.service

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/var/www/gradient-backend
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
# Leaves room for the worker and Redis on a 1 GB box.
Environment=NODE_OPTIONS=--max-old-space-size=320
StandardOutput=journal
StandardError=journal
SyslogIdentifier=gradient-api

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/gradient-worker.service`:

```ini
[Unit]
Description=Gradient workflow worker
After=network.target redis6.service
Wants=redis6.service

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/var/www/gradient-backend
ExecStart=/usr/bin/node src/worker.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=256
# The worker closes its queues on SIGTERM so a job mid-send finishes rather
# than being redelivered later. Give it room to; an interrupted send is what
# turns a routine deploy into a duplicate email.
KillSignal=SIGTERM
TimeoutStopSec=60
StandardOutput=journal
StandardError=journal
SyslogIdentifier=gradient-worker

[Install]
WantedBy=multi-user.target
```

On Ubuntu use `User=ubuntu` and `redis-server.service`.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gradient-api gradient-worker
sudo systemctl status gradient-api gradient-worker
```

systemd rather than pm2 deliberately: pm2 is another always-resident Node
process, and on this box that is 40–50 MB bought for nothing systemd does not
already do.

## 9. nginx and TLS

```bash
sudo dnf install -y nginx       # or: sudo apt install -y nginx
```

`/etc/nginx/conf.d/gradient.conf`:

```nginx
server {
    listen 80;
    server_name api.thegradient.co.in;

    # multer accepts 20 MB uploads and express.json 10 MB. nginx defaults to
    # 1 MB, which rejects a resume upload before it ever reaches the app.
    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

```bash
sudo nginx -t && sudo systemctl enable --now nginx
sudo dnf install -y certbot python3-certbot-nginx    # or apt
sudo certbot --nginx -d api.thegradient.co.in
```

Certbot renews itself via a systemd timer; confirm with
`sudo systemctl list-timers | grep certbot`.

## 10. Verify, in this order

```bash
curl -s localhost:8000/health                       # API is up
redis6-cli PING                                     # Redis answers
sudo journalctl -u gradient-worker -n 30 --no-pager  # "Workflow worker process ready"
```

Then, with an admin token from the panel:

```bash
curl -s https://api.thegradient.co.in/workflows/admin/health \
  -H "Authorization: Bearer <token>" | jq
```

Expect `enabled: true`, `redis: "up"`, `workerAlive: true`, and
`healthy: true`. That endpoint is the first thing to look at whenever somebody
says a workflow did not fire — it answers the three questions that fail
separately: is the feature switched on, is Redis reachable, and has a worker
checked in.

The admin panel shows the same thing as a banner on the automations screen.

## 11. Deploying an update

```bash
cd /var/www/gradient-backend
git pull
npm ci --maxsockets 1
npm run pg:migrate
sudo systemctl restart gradient-api gradient-worker
```

Restart the **worker last** and let it stop cleanly — it closes its queues on
SIGTERM so a job mid-send finishes rather than being redelivered.

Nothing is lost across a restart. Every wait is a `nextRunAt` timestamp on a
row plus a delayed job, so a three-day wait survives the deploy; and the
reconcile cron re-queues any enrolment that is overdue with no live job within
about five minutes.

## What to watch

| Signal | Where | Why |
|---|---|---|
| `CPUCreditBalance` | CloudWatch | Zero means the box is throttled to 10% of a core |
| Memory | `free -h` | Sustained swap use means it is time for t3.small |
| `[workflow.trigger-lost]` | `journalctl -u gradient-api` | A realtime trigger that fired while Redis was unreachable is lost outright — no enrolment row exists for reconcile to find |
| `workerAlive: false` | `/workflows/admin/health` | Publishing still works and nobody gets enrolled or emailed |

## Known single points of failure

Redis on the same box means one instance loss takes the queue with it. That is
survivable and was tested by stopping Redis outright: public form submissions
still save, the API still serves, only the automation sleeps — and it catches up
when Redis returns. The one genuine loss is a realtime trigger that fires during
the outage. Alert on `[workflow.trigger-lost]`.

---

# One-time: upgrading the box and shipping the automation release

For a server that is **already running an older build under pm2 on Ubuntu**, and
is being resized at the same time. Do the phases in this order — the resize
needs a stop/start anyway, and the memory-hungry steps (`npm ci`, 16 migrations)
are much safer with the extra GB already in place.

Budget about 45 minutes, of which roughly 5 is downtime.

## What this release actually contains

`main` is missing **two** features, not one: the workflow automation *and* the
Facebook lead integration. Both landed on `feat/workflow`.

- 16 new migrations — lead events, 5 workflow tables, 6 Meta tables, 3 fixes
- A second process (`src/worker.js`) that did not exist before
- Redis, which this server has never had
- New environment variables, two of which fail loudly and one of which fails
  quietly if missed

## Phase 0 — On your machine, before touching the server

**1. Merge the branch into main.**

```bash
git checkout main && git pull
git merge feat/workflow
git push origin main
```

`main` is 7 commits ahead (event fixes) and `feat/workflow` is 2 commits ahead,
but **no file was touched on both sides**, so this merges cleanly. Deploying the
branch directly works too — just be consistent about which ref the server
tracks.

**2. Generate the token encryption key.**

```bash
openssl rand -hex 32
```

Keep it somewhere safe. It encrypts Facebook page tokens, and **rotating it
invalidates every stored token** — there is no re-wrap path, so every account
would have to be re-entered by hand.

## Phase 1 — Before the resize

**1. Will pm2 come back after a reboot?** This is the step people skip and then
believe the resize broke the server.

```bash
systemctl is-enabled pm2-ubuntu     # expect: enabled
pm2 save                            # freeze the current app list
```

If that is not `enabled`, run `pm2 startup` and then the command it prints,
followed by `pm2 save`.

**2. Is there an Elastic IP?** Without one, stopping the instance changes its
public IP and your DNS points at nothing. Check the Networking tab; if the
public IPv4 has no Elastic IP beside it, allocate and associate one **before**
stopping.

**3. Take a snapshot.** EC2 to Volumes to the root volume to Actions to Create
snapshot. Two minutes of insurance ahead of 16 migrations.

**4. Write down what is deployed now**, so a rollback has a target:

```bash
cd /var/www/gradient-backend    # or wherever it lives
git rev-parse --short HEAD
pm2 list
```

## Phase 2 — Resize to t3.small

Ubuntu 22.04/24.04 AMIs already carry the ENA and NVMe drivers, so a t2 to t3
move boots without any AMI work.

1. EC2 console, Instances, select the instance, **Instance state to Stop**
2. Wait for `stopped` (about a minute)
3. **Actions to Instance settings to Change instance type to t3.small**, apply
4. **Instance state to Start instance**

Then, once it is back:

```bash
uptime && free -h
pm2 list                        # the old app should be back up
curl -s localhost:8000/health   # whatever port it runs on
nproc                           # expect 2
```

**Swap.** 1 GB is enough at 2 GB of RAM, but keep it — it is what stops an
`npm ci` spike from OOM-killing the API.

```bash
free -h | grep -i swap          # if it shows 0B, create it:
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## Phase 3 — Redis

New to this server. Native package, not Docker — the Docker daemon alone would
cost more memory than Redis does.

```bash
sudo apt update && sudo apt install -y redis-server
sudo nano /etc/redis/redis.conf
```

Set these three:

```
bind 127.0.0.1
maxmemory-policy noeviction
appendonly yes
```

```bash
sudo systemctl enable --now redis-server
sudo systemctl restart redis-server
redis-cli PING                              # PONG
redis-cli CONFIG GET maxmemory-policy       # must say noeviction
```

`noeviction` is not a preference. A three-day wait is a delayed job in Redis; a
policy that may evict it turns "wait three days" into "never", silently.
`appendonly yes` is what makes a Redis restart lose nothing.

## Phase 4 — Code, environment, migrations

**1. Pull the release.**

```bash
cd /var/www/gradient-backend
git fetch origin
git checkout main
git pull
npm ci
```

**Do not use `--omit=dev`.** `sequelize-cli` is a dev dependency and it is what
runs the migrations.

**2. Add the new environment variables** to `.env`. Everything already there
stays; these are additions:

```ini
# Facebook lead integration
TOKEN_ENCRYPTION_KEY=<the 64 hex chars from Phase 0>
META_INTEGRATION_ENABLED=false     # turn on after a page is connected
META_GRAPH_VERSION=v22.0
META_ALERT_EMAIL=<who hears about token expiry>

# Workflow automation
WORKFLOWS_ENABLED=true
REDIS_URL=redis://127.0.0.1:6379
REDIS_TLS=false
WORKFLOW_QUEUE_PREFIX=gradient:production
WORKFLOW_CONCURRENCY=5

# Confirm these are already set — the automation needs both
AGENDA_JOBS_ENABLED=true
ADMIN_SITE_URL=https://admin.thegradient.co.in
```

How each one fails if you miss it:

| Missing | What you see |
|---|---|
| `TOKEN_ENCRYPTION_KEY` | Boots fine. The first attempt to save a Facebook page 500s, naming the variable. |
| `WORKFLOWS_ENABLED` | **The quiet one.** Publishing works, the workflow shows active, and nobody is ever enrolled. Indistinguishable from a bad trigger filter. |
| `REDIS_URL` | The worker starts and consumes nothing; the health endpoint says Redis is down. |
| `WORKFLOW_QUEUE_PREFIX` | Defaults to `gradient:${NODE_ENV}`. Only dangerous if a second environment shares this Redis — then its worker eats production's jobs and mails real people from test data. |

**3. Snapshot the database, then migrate.** RDS console, Actions, Take snapshot.
Then:

```bash
npx sequelize-cli db:migrate:status | tail -20    # see what is pending
npm run pg:migrate
```

16 migrations. They create tables and indexes only — nothing rewrites or drops
existing data.

**4. Restart the API and add the worker.**

```bash
pm2 restart <your-api-name> --update-env

pm2 start src/worker.js --name gradient-worker \
  --node-args="--max-old-space-size=512" --time

pm2 save        # so both come back after a reboot
pm2 list
```

**The worker is not optional.** It mounts no routers and listens on no port, and
it is the only thing that consumes the queue. An API running alone accepts a
publish, shows the workflow as active, enqueues jobs and runs none of them.

While you are here, cap the API's heap too:

```bash
pm2 delete <your-api-name>
pm2 start src/server.js --name gradient-api \
  --node-args="--max-old-space-size=768" --time
pm2 save
```

## Phase 5 — Verify, in this order

```bash
curl -s localhost:8000/health
redis-cli PING
pm2 logs gradient-worker --lines 30    # "Workflow worker process ready"
```

Then from the panel, or with an admin token:

```bash
curl -s https://api.thegradient.co.in/workflows/admin/health \
  -H "Authorization: Bearer <token>"
```

You want `enabled: true`, `redis: "up"`, `workerAlive: true`, `healthy: true`.
Anything else, that response names which of the three is wrong.

Last, an end-to-end proof that costs nothing: build a workflow with a live
trigger on website leads, publish it, submit a form on the public site, and
watch an enrolment appear. Make the first step a long wait so nothing is emailed
while you are testing.

## Phase 6 — The admin panel

None of the new screens exist until **gradient-admin** is deployed too. The
Automations tab, the trigger dialog and the Meta Leads screens are all frontend.
The API will answer them; nothing in the panel will show them.

If you are considering putting that panel on this same box: not at 2 GB. A
Next.js production build wants roughly 2 GB by itself.

## If it goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| Nothing responds after the resize | pm2 was never registered with systemd | SSH in, `pm2 resurrect`, then set up `pm2 startup` properly |
| DNS points nowhere | No Elastic IP, so the public IP changed | Associate an EIP, update the A record |
| A migration fails part way | Each migration file is its own transaction | Fix the cause and re-run `npm run pg:migrate` — completed files are skipped |
| Workflows publish but enrol nobody | `WORKFLOWS_ENABLED` is not `true`, or no worker is running | `/workflows/admin/health` names which |
| Need to back out entirely | | `git checkout <old sha>`, `npm ci`, `pm2 restart all`. Leave the migrations alone — the new tables are additive and the old code ignores them. |

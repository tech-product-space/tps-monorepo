const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile, spawn } = require("child_process");

// Production deploys and .env edits from the admin panel. Every route here sits
// behind requireDeployer, so only the accounts in DEPLOY_ADMIN_EMAILS reach it.
//
// A deploy runs ops/deploy.sh detached from this process: restarting tps-api is
// part of a deploy, and must not kill the deploy with it. Each run lives in its
// own folder under DEPLOY_RUNS_DIR (log, status, meta.json, result.json), so
// history survives restarts without a database table. deploy.sh also keeps
// DEPLOY_RUNS_DIR/deployed.json: the commit each backend is actually running.

const APP_DIR = process.env.DEPLOY_APP_DIR || "/home/ubuntu/app";
const RUNS_DIR = process.env.DEPLOY_RUNS_DIR || "/home/ubuntu/deploy-runs";
const ENV_BACKUPS_DIR = path.join(RUNS_DIR, "env-backups");
const SCRIPT = path.join(APP_DIR, "ops", "deploy.sh");
const RUN_ID = /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}$/;
const BACKENDS = ["tps", "crm", "gradient"];
const dirOf = (b) => `${b}-backend`;
const envPath = (b) => path.join(APP_DIR, dirOf(b), ".env");
const MAX_ENV_BYTES = 64 * 1024;
const ENV_BACKUPS_KEPT = 20;

const git = (args, timeout = 20000) =>
  new Promise((resolve, reject) =>
    execFile("git", args, { cwd: APP_DIR, timeout }, (err, stdout) =>
      err ? reject(err) : resolve(stdout.trim()),
    ),
  );

const FMT = "%H%x1f%h%x1f%s%x1f%an%x1f%cI";
const parseCommit = (line) => {
  const [sha, short, subject, author, date] = line.split("\x1f");
  return { sha, short, subject, author, date };
};
const commitOf = async (ref) => parseCommit(await git(["log", "-1", `--format=${FMT}`, ref]));

const readJson = (p, fallback) => {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
};

const readRun = (id, withLog) => {
  const dir = path.join(RUNS_DIR, id);
  const read = (f) => {
    try { return fs.readFileSync(path.join(dir, f), "utf8"); } catch { return null; }
  };
  const run = {
    id,
    ...readJson(path.join(dir, "meta.json"), {}),
    status: (read("status") || "starting").trim(),
    result: readJson(path.join(dir, "result.json"), null),
  };
  if (withLog) run.log = (read("log") || "").split("\n").slice(-500).join("\n");
  return run;
};

const listRuns = (limit = 20) => {
  let ids = [];
  try { ids = fs.readdirSync(RUNS_DIR).filter((d) => RUN_ID.test(d)); } catch { /* no runs yet */ }
  return ids.sort().reverse().slice(0, limit).map((id) => readRun(id, false));
};

const isRunning = () => listRuns(5).some((r) => r.status === "running" || r.status === "starting");

// Start deploy.sh detached. Returns the run id.
const launch = ({ by, mode, targets, envBackup, note }) => {
  const id = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${crypto.randomBytes(3).toString("hex")}`;
  const dir = path.join(RUNS_DIR, id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({
    startedAt: new Date().toISOString(), by, mode, targets, note,
  }));
  fs.writeFileSync(path.join(dir, "status"), "starting");
  fs.copyFileSync(SCRIPT, path.join(dir, "deploy.sh"));
  // `setsid -f` forks again so the script is re-parented to init. pm2 kills an
  // app's whole process tree when restarting it, and a plain detached child is
  // still in tps-api's tree, so restarting tps-api would kill its own deploy.
  const child = spawn("setsid", ["-f", "bash", path.join(dir, "deploy.sh"), dir], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      DEPLOY_APP_DIR: APP_DIR,
      DEPLOY_MODE: mode,
      DEPLOY_TARGETS: targets.join(" "),
      DEPLOY_ENV_BACKUP: envBackup || "",
      DEPLOY_BY: by,
    },
  });
  child.unref();
  return id;
};

// GET /internal/deploy/me — lets the panel decide whether to show the page.
const me = (req, res) => res.json({ allowed: true, email: req.staff.email });

// GET /internal/deploy/status — per backend: what it runs, what waits on main.
const status = async (req, res) => {
  try {
    await git(["fetch", "--quiet", "origin", "main"], 30000);
    const head = await git(["rev-parse", "HEAD"]);
    const latest = await commitOf("FETCH_HEAD");
    const deployed = readJson(path.join(RUNS_DIR, "deployed.json"), {});

    const backends = await Promise.all(BACKENDS.map(async (name) => {
      const sha = deployed[name] || head;
      const dir = dirOf(name);
      const raw = await git(["log", `--format=${FMT}`, `${sha}..FETCH_HEAD`, "-n", "50", "--", dir]);
      const pending = raw ? raw.split("\n").map(parseCommit) : [];
      const changedFiles = pending.length ? (await git(["diff", "--name-only", sha, "FETCH_HEAD", "--", dir])).split("\n") : [];
      return {
        name,
        live: await commitOf(sha),
        pending,
        dependenciesChanged: changedFiles.some((f) => f === `${dir}/package.json` || f === `${dir}/package-lock.json`),
      };
    }));

    const runs = listRuns();
    res.json({
      latest,
      backends,
      running: runs.find((r) => r.status === "running" || r.status === "starting") || null,
      runs,
    });
  } catch (error) {
    console.error("Deploy status error:", error);
    res.status(500).json({ message: "Could not read deploy status", error: error.message });
  }
};

// POST /internal/deploy  { backends?: ["tps", ...] } — deploy the latest main.
const start = (req, res) => {
  const requested = Array.isArray(req.body?.backends) && req.body.backends.length ? req.body.backends : BACKENDS;
  if (!requested.every((b) => BACKENDS.includes(b))) return res.status(400).json({ message: "Unknown backend" });
  if (isRunning()) return res.status(409).json({ message: "A deploy is already running" });
  try {
    const id = launch({ by: req.staff.email, mode: "code", targets: requested });
    res.status(202).json({ id });
  } catch (error) {
    console.error("Deploy start error:", error);
    res.status(500).json({ message: "Could not start the deploy", error: error.message });
  }
};

// GET /internal/deploy/runs/:id — one run with its log, for live polling.
const run = (req, res) => {
  const { id } = req.params;
  if (!RUN_ID.test(id) || !fs.existsSync(path.join(RUNS_DIR, id))) {
    return res.status(404).json({ message: "Run not found" });
  }
  res.json(readRun(id, true));
};

// ------------------------------------------------------------------ .env

// KEY=VALUE per line; blank lines and # comments allowed. Returns the keys, or
// throws with the first problem, so a typo is caught before anything restarts.
const parseEnv = (text) => {
  const keys = [];
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const m = /^(?:export\s+)?([A-Za-z0-9_]+)\s*=/.exec(t);
    if (!m) throw new Error(`Line ${i + 1} is not KEY=value: "${t.slice(0, 40)}"`);
    if (keys.includes(m[1])) throw new Error(`${m[1]} is set twice (line ${i + 1})`);
    keys.push(m[1]);
  });
  return keys;
};

// Keys of a file that may not pass parseEnv (an existing .env with a stray line).
const looseKeys = (text) =>
  text.split("\n").map((l) => /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=/.exec(l)?.[1]).filter(Boolean);

const valueOf = (text, key) => {
  const m = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=(.*)$`, "m").exec(text);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
};

const backendParam = (req, res) => {
  const b = req.params.backend;
  if (!BACKENDS.includes(b)) { res.status(404).json({ message: "Unknown backend" }); return null; }
  return b;
};

// GET /internal/deploy/env/:backend — the production .env, as text.
const getEnv = (req, res) => {
  const b = backendParam(req, res);
  if (!b) return;
  try {
    const content = fs.readFileSync(envPath(b), "utf8");
    const stat = fs.statSync(envPath(b));
    console.log(`[deploy] ${req.staff.email} opened the ${b} .env`);
    res.json({ backend: b, content, modifiedAt: stat.mtime.toISOString(), keys: looseKeys(content).length });
  } catch (error) {
    res.status(500).json({ message: `Could not read the ${b} .env`, error: error.message });
  }
};

// PUT /internal/deploy/env/:backend  { content, basedOn } — save, then restart
// that backend; deploy.sh restores this backup if it fails its health check.
const saveEnv = (req, res) => {
  const b = backendParam(req, res);
  if (!b) return;
  const content = typeof req.body?.content === "string" ? req.body.content.replace(/\r\n/g, "\n") : null;
  if (content === null) return res.status(400).json({ message: "content is required" });
  if (Buffer.byteLength(content) > MAX_ENV_BYTES) return res.status(400).json({ message: ".env is too large" });
  if (isRunning()) return res.status(409).json({ message: "A deploy is already running" });

  let newKeys;
  try { newKeys = parseEnv(content); } catch (e) { return res.status(400).json({ message: e.message }); }

  const file = envPath(b);
  const current = fs.readFileSync(file, "utf8");

  // Someone (or another tab) changed it since this editor loaded it.
  const mtime = fs.statSync(file).mtime.toISOString();
  if (req.body.basedOn && req.body.basedOn !== mtime) {
    return res.status(409).json({ message: "The .env changed on the server since you opened it. Reload and re-apply your edit." });
  }

  // Never let the deployer lock themselves out of this page.
  if (b === "tps") {
    const list = (valueOf(content, "DEPLOY_ADMIN_EMAILS") || "").split(",").map((e) => e.trim().toLowerCase());
    if (!list.includes(String(req.staff.email).toLowerCase())) {
      return res.status(400).json({ message: `DEPLOY_ADMIN_EMAILS must still include ${req.staff.email}` });
    }
  }

  const oldKeys = looseKeys(current);
  const summary = {
    added: newKeys.filter((k) => !oldKeys.includes(k)),
    removed: oldKeys.filter((k) => !newKeys.includes(k)),
    changed: newKeys.filter((k) => oldKeys.includes(k) && valueOf(current, k) !== valueOf(content, k)),
  };
  if (!summary.added.length && !summary.removed.length && !summary.changed.length && current.trim() === content.trim()) {
    return res.status(400).json({ message: "No changes to save" });
  }

  try {
    fs.mkdirSync(ENV_BACKUPS_DIR, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const backup = path.join(ENV_BACKUPS_DIR, `${b}-${stamp}.env`);
    fs.writeFileSync(backup, current, { mode: 0o600 });

    // Atomic replace, keeping the file private.
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 });
    fs.renameSync(tmp, file);

    // Keep the newest backups per backend.
    fs.readdirSync(ENV_BACKUPS_DIR).filter((f) => f.startsWith(`${b}-`)).sort().reverse()
      .slice(ENV_BACKUPS_KEPT).forEach((f) => fs.unlinkSync(path.join(ENV_BACKUPS_DIR, f)));

    const note = [
      summary.added.length && `added ${summary.added.join(", ")}`,
      summary.changed.length && `changed ${summary.changed.join(", ")}`,
      summary.removed.length && `removed ${summary.removed.join(", ")}`,
    ].filter(Boolean).join("; ");
    const id = launch({ by: req.staff.email, mode: "env", targets: [b], envBackup: backup, note });
    console.log(`[deploy] ${req.staff.email} saved the ${b} .env (${note}); run ${id}`);
    res.status(202).json({ id, summary });
  } catch (error) {
    console.error("Env save error:", error);
    res.status(500).json({ message: "Could not save the .env", error: error.message });
  }
};

module.exports = { me, status, start, run, getEnv, saveEnv };

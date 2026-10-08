const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile, spawn } = require("child_process");

// Production deploys from the admin panel. Every route here sits behind
// requireDeployer, so only the accounts in DEPLOY_ADMIN_EMAILS reach them.
//
// A deploy runs ops/deploy.sh detached from this process: restarting tps-api is
// part of a deploy, and must not kill the deploy with it. Each run lives in its
// own folder under DEPLOY_RUNS_DIR (log, status, meta.json, result.json), so
// history survives restarts without a database table.

const APP_DIR = process.env.DEPLOY_APP_DIR || "/home/ubuntu/app";
const RUNS_DIR = process.env.DEPLOY_RUNS_DIR || "/home/ubuntu/deploy-runs";
const SCRIPT = path.join(APP_DIR, "ops", "deploy.sh");
const RUN_ID = /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}$/;

const git = (args, timeout = 20000) =>
  new Promise((resolve, reject) =>
    execFile("git", args, { cwd: APP_DIR, timeout }, (err, stdout) =>
      err ? reject(err) : resolve(stdout.trim()),
    ),
  );

const commit = async (ref) => {
  const [sha, short, subject, author, date] = (
    await git(["log", "-1", "--format=%H%x1f%h%x1f%s%x1f%an%x1f%cI", ref])
  ).split("\x1f");
  return { sha, short, subject, author, date };
};

const BACKENDS = [
  { dir: "tps-backend", name: "tps" },
  { dir: "crm-backend", name: "crm" },
  { dir: "gradient-backend", name: "gradient" },
];

const readRun = (id, withLog) => {
  const dir = path.join(RUNS_DIR, id);
  const read = (f) => {
    try { return fs.readFileSync(path.join(dir, f), "utf8"); } catch { return null; }
  };
  const meta = JSON.parse(read("meta.json") || "{}");
  const result = JSON.parse(read("result.json") || "null");
  const run = { id, ...meta, status: (read("status") || "starting").trim(), result };
  if (withLog) run.log = (read("log") || "").split("\n").slice(-500).join("\n");
  return run;
};

const listRuns = (limit = 15) => {
  let ids = [];
  try { ids = fs.readdirSync(RUNS_DIR).filter((d) => RUN_ID.test(d)); } catch { /* no runs yet */ }
  return ids.sort().reverse().slice(0, limit).map((id) => readRun(id, false));
};

// GET /internal/deploy/me — lets the panel decide whether to show the page.
const me = (req, res) => res.json({ allowed: true, email: req.staff.email });

// GET /internal/deploy/status — what is live, what is waiting on main.
const status = async (req, res) => {
  try {
    await git(["fetch", "--quiet", "origin", "main"], 30000);
    const live = await commit("HEAD");
    const latest = await commit("FETCH_HEAD");
    const pendingRaw = await git(["log", "--format=%h%x1f%s%x1f%an%x1f%cI", "HEAD..FETCH_HEAD", "-n", "50"]);
    const pending = pendingRaw
      ? pendingRaw.split("\n").map((l) => {
          const [short, subject, author, date] = l.split("\x1f");
          return { short, subject, author, date };
        })
      : [];
    const changed = pending.length ? (await git(["diff", "--name-only", "HEAD", "FETCH_HEAD"])).split("\n") : [];
    const backends = BACKENDS.map((b) => ({
      name: b.name,
      changed: changed.some((f) => f.startsWith(`${b.dir}/`)),
      dependenciesChanged: changed.some((f) => f === `${b.dir}/package.json` || f === `${b.dir}/package-lock.json`),
    }));
    const runs = listRuns();
    res.json({ live, latest, pending, backends, running: runs.find((r) => r.status === "running") || null, runs });
  } catch (error) {
    console.error("Deploy status error:", error);
    res.status(500).json({ message: "Could not read deploy status", error: error.message });
  }
};

// POST /internal/deploy — start a deploy of the latest main.
const start = (req, res) => {
  if (listRuns(5).some((r) => r.status === "running")) {
    return res.status(409).json({ message: "A deploy is already running" });
  }
  const id = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${crypto.randomBytes(3).toString("hex")}`;
  const dir = path.join(RUNS_DIR, id);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({
      startedAt: new Date().toISOString(),
      by: req.staff.email,
    }));
    // Run a copy: the deploy rewrites the checkout this script lives in.
    fs.copyFileSync(SCRIPT, path.join(dir, "deploy.sh"));
    const child = spawn("bash", [path.join(dir, "deploy.sh"), dir], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, DEPLOY_APP_DIR: APP_DIR },
    });
    child.unref();
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

module.exports = { me, status, start, run };

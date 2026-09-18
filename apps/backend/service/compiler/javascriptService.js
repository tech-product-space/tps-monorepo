const { spawn } = require("child_process");
const { performance } = require("perf_hooks");
const crypto = require("crypto");

exports.runJS = function (code) {
  const containerName = "jsbox_" + crypto.randomBytes(4).toString("hex");

  let cmd, args;
  // cmd = "node";
  // args = [];
  cmd = "docker";
  args = [
    "run",
    "--rm",
    "--name",
    containerName,
    "-i",
    "--network",
    "none",
    "--cpus",
    "0.5",
    "-m",
    "512m",
    "--pids-limit",
    "50",
    "--read-only",
    "--security-opt",
    "no-new-privileges",
    "--tmpfs",
    "/tmp:rw,size=100m",
    "--ulimit",
    "cpu=2",
    "javascript-sandbox",
    "node",
    "-e",
    code,
  ];

  return new Promise((resolve) => {
    const start = performance.now();

    const subprocess = spawn(cmd, args, { timeout: 30000 });

    let stdout = "";
    let stderr = "";

    subprocess.on("error", (err) => {
      try {
        spawn("docker", ["kill", containerName]);
      } catch (_) {}

      resolve({
        stdout: "",
        stderr: "Internal Error: Could not launch the compiler.",
        time: 0,
        exitCode: null,
        status: "Internal Error",
      });
    });

    subprocess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    subprocess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    subprocess.on("close", (code, signal) => {
      // Sandbox failure
      if (code === 127) {
        resolve({
          stdout: "",
          stderr: "Internal Error: Could not launch the compiler.",
          time: 0,
          exitCode: code,
          status: "Internal Error",
        });
      }

      spawn("docker", ["kill", containerName]);

      const end = performance.now();
      const time = Math.round(end - start);

      let status = "Accepted";

      if (signal === "SIGTERM" || signal === "SIGKILL" || code == 137) {
        status = "Time Limit Exceeded";
        if (!stderr) {
          stderr = "Time Limit Exceeded";
        }
      } else if (code !== 0) {
        status = "Runtime Error";
        if (!stderr) {
          stderr = "Runtime Error";
        }
      }

      // Output limit
      if (stdout.length > 10000) stdout = stdout.slice(0, 10000);
      if (stderr.length > 10000) stderr = stderr.slice(0, 10000);

      resolve({
        stdout,
        stderr,
        time,
        exitCode: code,
        status,
      });
    });
  });
};

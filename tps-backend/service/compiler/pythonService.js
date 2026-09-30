const { spawn } = require("child_process");
const { performance } = require("perf_hooks");
const crypto = require("crypto");

exports.runPython = function (code, stdIn = "") {
  const containerName = "pybox_" + crypto.randomBytes(4).toString("hex");

  let cmd = "docker";
  let args = [
    "run",
    "--rm",
    "-i",
    "--name",
    containerName,
    "--network",
    "none",
    "--cpus",
    "0.5",
    "-m",
    "512m",
    "--pids-limit",
    "50",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,size=100m",
    "--security-opt",
    "no-new-privileges",
    "--ulimit",
    "cpu=2",
    "python-sandbox",
    "python3",
    "-u",
    "-c",
    code,
  ];

  return new Promise((resolve) => {
    const start = performance.now();

    const subprocess = spawn(cmd, args, {
      timeout: 30000,
    });

    let stdout = "";
    let stderr = "";

    try {
      if (stdIn) subprocess.stdin.write(stdIn);
      subprocess.stdin.end();
    } catch (_) {}

    subprocess.stdout.on("data", (data) => (stdout += data.toString()));
    subprocess.stderr.on("data", (data) => (stderr += data.toString()));

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

    subprocess.on("close", (code, signal) => {
      const end = performance.now();
      const time = Math.round(end - start);

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

      // Determine status
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

      // Output limits
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

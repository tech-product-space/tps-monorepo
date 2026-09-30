const { execSync } = require("child_process");

const images = [
  { name: "python-sandbox", test: "python3 --version" },
  { name: "javascript-sandbox", test: "node -v" },
];

function runCheck(cmd, msg) {
  try {
    execSync(cmd, { stdio: "ignore" });
    console.log(`✔ ${msg}`);
    return true;
  } catch (err) {
    console.log(`✘ ${msg}`);
    return false;
  }
}

console.log("\n=== Docker Health Check ===");

// 1. Docker installed
runCheck("docker --version", "Docker installed");

// 2. Docker running
runCheck("docker info", "Docker daemon running");

console.log("\n=== Checking Sandbox Images ===");

// 3. Check sandbox images
for (const img of images) {
  const exists = runCheck(
    `docker image inspect ${img.name}`,
    `${img.name} image found`
  );
  if (!exists) continue;

  runCheck(
    `docker run --rm ${img.name} ${img.test}`,
    `Runtime OK inside ${img.name}`
  );
}

console.log("\nHealth check complete.\n");

const { spawnSync } = require("child_process");

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run("npx", ["hardhat", "compile"]);
run("npx", ["hardhat", "run", "scripts/deployChainA.js", "--network", "chainA"]);
run("npx", ["hardhat", "run", "scripts/deployChainB.js", "--network", "chainB"]);

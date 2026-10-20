const net = require("node:net");
const { spawn } = require("node:child_process");

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function run() {
  const productionPort = await findAvailablePort();
  let developmentPort = await findAvailablePort();
  while (developmentPort === productionPort) {
    developmentPort = await findAvailablePort();
  }
  const playwrightCli = require.resolve("@playwright/test/cli");
  const child = spawn(
    process.execPath,
    [playwrightCli, "test", ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PLAYWRIGHT_PROD_PORT: String(productionPort),
        PLAYWRIGHT_DEV_PORT: String(developmentPort)
      }
    }
  );

  child.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

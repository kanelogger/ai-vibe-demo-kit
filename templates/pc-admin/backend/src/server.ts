import { buildApp } from "./app";
import config from "./config";
import { initSchema } from "./db/mysql";
import Logger from "./loaders/logger";

async function start() {
  try {
    await initSchema();

    const app = buildApp();
    await app.listen({ port: config.port, host: "0.0.0.0" });

    Logger.info(`
    ################################################
    🛡️  Server listening on http://localhost:${config.port} 🛡️
    ################################################
  `);
  } catch (err) {
    Logger.error(err);
    process.exit(1);
  }
}

start();

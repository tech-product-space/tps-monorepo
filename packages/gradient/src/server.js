import app from "./app.js";
import env from "./config/env.js";
import { initServices } from "./boot.js";

async function start() {
  await initServices();
  app.listen(env.PORT, () => {
    console.log(`Server running on PORT: ${env.PORT}`);
  });
}

start();

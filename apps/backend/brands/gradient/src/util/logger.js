import env from "../config/env.js";

const isDevOrTest = env.APP_ENVIRONMENT === "development" || 
                    env.APP_ENVIRONMENT === "test" || 
                    env.APP_ENVIRONMENT === "production";

const formatMessage = (level, message, meta) => {
  const timestamp = new Date().toISOString();

  if (meta) {
    return `[${timestamp}] ${level.toUpperCase()}: ${message} ${JSON.stringify(meta)}`;
  }

  return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
};

const logger = {

  info(message, meta) {
    if (!isDevOrTest) return;
    console.log(formatMessage("info", message, meta));
  },

  warn(message, meta) {
    if (!isDevOrTest) return;
    console.warn(formatMessage("warn", message, meta));
  },

  error(message, meta) {
    if (!isDevOrTest) return;
    console.error(formatMessage("error", message, meta));
  },

  debug(message, meta) {
    if (!isDevOrTest) return;
    console.debug(formatMessage("debug", message, meta));
  },
};

export default logger;
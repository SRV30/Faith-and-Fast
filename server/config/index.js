import development from "./development.js";
import production from "./production.js";

const env = process.env.NODE_ENV || "development";

const configs = {
  development,
  production,
};

let config = configs[env];

if (!config) {
  console.error(`Unknown environment: ${env}. Falling back to development.`);
  config = configs.development;
}

export function getEnv() {
  return env;
}

export function isProduction() {
  return env === "production";
}

export function isDevelopment() {
  return env === "development";
}

export default config;

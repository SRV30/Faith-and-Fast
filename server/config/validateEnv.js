const REQUIRED_ENV_VARS = [
  'MONGODB_URL',
  'JWT_SECRET',
  'SECRET_KEY_ACCESS_TOKEN',
  'SECRET_KEY_REFRESH_TOKEN',
  'CLOUDINARY_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'BREVO_API_KEY',
  'BREVO_SENDER_EMAIL',
  'BREVO_SENDER_NAME',
  'FRONTEND_URL',
];

export default function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter(
    (key) => !process.env[key] || process.env[key].trim() === ''
  );

  if (missing.length > 0) {
    console.error('\n[FATAL] Missing required environment variables:\n');
    missing.forEach((key) => console.error(`  - ${key}`));
    console.error('\nCheck your .env file against server/.env\n');
    process.exit(1);
  }

  const env = process.env.NODE_ENV || "development";
  console.log(`[validateEnv] Environment: ${env}`);
  if (!["development", "production", "test"].includes(env)) {
    console.warn(`[validateEnv] Warning: Unrecognized environment "${env}". Use development, production, or test.`);
  }
}

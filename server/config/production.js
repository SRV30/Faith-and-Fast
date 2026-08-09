const production = {
  port: process.env.PORT || 5000,
  cors: {
    allowedOrigins: [
      process.env.FRONTEND_URL,
      process.env.FRONTEND_WWW_URL,
    ].filter(Boolean),
  },
  rateLimiting: {
    windowMs: 15 * 60 * 1000,
    max: 2000,
  },
  mongoose: {
    serverSelectionTimeoutMS: 10000,
  },
  logLevel: "info",
};

export default production;

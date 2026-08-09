const development = {
  port: process.env.PORT || 5000,
  cors: {
    allowedOrigins: [
      "http://localhost:5173",
      "http://localhost:3000",
    ],
  },
  rateLimiting: {
    windowMs: 15 * 60 * 1000,
    max: 2000,
  },
  mongoose: {
    serverSelectionTimeoutMS: 5000,
  },
  logLevel: "debug",
};

export default development;

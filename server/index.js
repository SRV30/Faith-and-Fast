import cloudinary from "cloudinary";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import connectDB from "./config/connectDB.js";
import validateEnv from "./config/validateEnv.js";
import errorMiddleware from "./middleware/error.js";
import config from "./config/index.js";
import errorMonitor from "./middleware/errorMonitor.js";
dotenv.config();
validateEnv();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const PORT = config.port;

const allowedOrigins = config.cors.allowedOrigins;
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(responseWrapper);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(limiter);
app.use(morgan("combined"));
app.use(errorMonitor);
app.use(errorMiddleware);
app.disable('x-powered-by');

app.get('/', (req, res) => {
  res.send('Server is running: ' + PORT);
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

app.get('/ready', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  if (isDbConnected) {
    res.status(200).json({ status: 'UP', services: { database: 'UP' } });
  } else {
    res.status(503).json({ status: 'DOWN', services: { database: 'DOWN' } });
  }
});

//routes
import addressRouter from './route/addressRoute.js';
import backupRouter from './route/backupRoute.js';
import bulkProductRouter from './route/bulkProductRoute.js';
import cartRouter from './route/cartRoute.js';
import categoryRouter from './route/categoryRoute.js';
import currencyRouter from './route/currencyRoute.js';
import discountRouter from './route/discountRoute.js';
import faqRouter from './route/faqRoute.js';
import healthRouter from './route/healthRoute.js';
import inventoryRouter from './route/inventoryRoute.js';
import orderRouter from './route/orderRoute.js';
import paymentRouter from './route/paymentRoute.js';
import paymentSettingsRouter from './route/paymentSettingsRoute.js';
import productRouter from './route/productRoute.js';
import recommendationRouter from './route/recommendationRoute.js';
import reviewRouter from './route/reviewRoute.js';
import supportRouter from './route/supportRoute.js';
import userAuditRouter from './route/userAuditRoute.js';
import ticketRouter from './route/ticketRoute.js';
import userRouter from './route/userRoute.js';
import wishListRouter from './route/wishlistRoute.js';
import emailRouter from './route/emailTemplateRoute.js';
import adminAuditRouter from './route/adminAuditRoute.js';
import referralRouter from './route/referralRoute.js';
import { startMonitoring } from './utils/systemMonitor.js';
import { healthConfig } from './config/healthAndBackupConfig.js';

app.use('/api/health', healthRouter);
app.use('/api/address', addressRouter);
app.use('/api/cart', cartRouter);
app.use('/api/category', categoryRouter);
app.use('/api/discount', discountRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/order', orderRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/payment-settings', paymentSettingsRouter);
app.use('/api/product', productRouter);
app.use('/api/support', supportRouter);
app.use('/api/user', userRouter);
app.use('/api/wishlist', wishListRouter);
app.use('/api/email-templates', emailRouter);
app.use('/api/admin-audit', adminAuditRouter);
app.use('/api/referral', referralRouter);
app.use('/api/review', reviewRouter);
app.use('/api/recommendations', recommendationRouter);
app.use('/api/bulk-product', bulkProductRouter);
app.use('/api/backup', backupRouter);
app.use('/api/faq', faqRouter);
app.use('/api/ticket', ticketRouter);

app.use(errorMiddleware);

connectDB().then(() => {
  startMonitoring(healthConfig.monitoringInterval);

  const server = app.listen(PORT, () =>
    logger.info(`Server is running on port ${PORT}`)
  );

  setupShutdownHandlers(server);
});

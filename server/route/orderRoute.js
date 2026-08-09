import express from 'express';
import auth from '../middleware/auth.js';
import {
  cancelOrder,
  createOrder,
  deleteAllOrders,
  deleteOrder,
  getAllOrders,
  getSingleOrder,
  myOrders,
  updateOrderStatus,
  uploadPaymentScreenshot,
  verifyPayment,
} from "../controllers/orderController.js";
import admin from "../middleware/Admin.js";
import upload from "../middleware/multer.js";
import { getOrderAnalytics } from "../controllers/analyticsController.js";
import { orderValidation } from "../middleware/validator.js";

const orderRouter = express.Router();

orderRouter.post("/create", auth, orderValidation.create, createOrder);

orderRouter.post(
  '/create',
  optionalAuth,
  clearOrderAnalyticsCache,
  orderLimiter,
  validate(createOrderSchema),
  createOrder
);

orderRouter.post(
  '/upload-payment-screenshot',
  optionalAuth,
  upload.single('screenshot'),
  uploadPaymentScreenshot
);

orderRouter.put(
  '/admin/verify-payment/:orderId',
  auth,
  admin,
  clearOrderAnalyticsCache,
  verifyPayment
);

orderRouter.get('/myorder', auth, myOrders);

orderRouter.get('/get/admin', auth, admin, getAllOrders);

orderRouter.get(
  '/admin/analytics',
  auth,
  admin,
  cacheMiddleware('orders:analytics', 3600),
  getOrderAnalytics
);

orderRouter.get('/get/:orderId', auth, getSingleOrder);

orderRouter.put('/admin/update/:orderId', auth, admin, clearOrderAnalyticsCache, updateOrderStatus);

orderRouter.put("/admin/update/:orderId", auth, admin, orderValidation.updateStatus, updateOrderStatus);

orderRouter.delete('/admin/delete/:orderId', auth, admin, clearOrderAnalyticsCache, deleteOrder);

orderRouter.delete('/admin/delete-all', auth, admin, clearOrderAnalyticsCache, deleteAllOrders);

orderRouter.get('/invoice/:orderId', auth, downloadInvoice);

export default orderRouter;

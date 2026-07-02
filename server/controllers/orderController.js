import catchAsyncErrors from "../middleware/catchAsyncErrors.js";
import OrderModel from "../models/orderModel.js";
import ProductModel from "../models/productModel.js";
import UserModel from "../models/userModel.js";
import DiscountModel from "../models/discountModel.js";
import sendEmail from "../config/sendEmail.js";
import generateReceiptHTML from "../utils/generateReceipt.js";
import { uploadImage } from "../utils/cloudinary.js";

export const createOrder = catchAsyncErrors(async (req, res) => {
  try {
    const {
      userId,
      addressId,
      products,
      paymentMethod,
      couponCode,
      upiReference,
      paymentScreenshot,
    } = req.body;
    // NOTE: totalAmount and discountAmount are intentionally NOT read from the
    // request body — they are recomputed server-side below from real DB prices
    // and a re-validated coupon, so a tampered client-supplied total is ignored.

    let { deliveryDate } = req.body;

    const createdAt = new Date();
    deliveryDate = new Date(createdAt);
    deliveryDate.setDate(createdAt.getDate() + 5);

    const method = paymentMethod || "COD";
    if (!["COD", "ONLINE", "STRIPE"].includes(method)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment method" });
    }
    if (method === "ONLINE" && (!paymentScreenshot || !paymentScreenshot.url)) {
      return res.status(400).json({
        success: false,
        message: "Payment screenshot is required for online payments",
      });
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order must contain at least one product",
      });
    }

    // Rebuild every line item from the database: trust the client only for which
    // product and how many, never for the price. Each line's unit price and line
    // total come from the DB, and the items total is summed from them.
    const orderItems = [];
    let itemsTotal = 0;
    for (const item of products) {
      const product = await ProductModel.findById(item.product);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product ${item.product} not found`,
        });
      }

      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({
          success: false,
          message: `Invalid quantity for "${product.name}"`,
        });
      }

      const lineTotal = product.price * quantity;
      itemsTotal += lineTotal;

      orderItems.push({
        product: product._id,
        quantity,
        price: product.price, // DB price snapshot — never the client value
        totalPrice: lineTotal,
        images:
          Array.isArray(item.images) && item.images.length > 0
            ? item.images
            : product.images,
        selectedColor: item.selectedColor || "",
        selectedSize: item.selectedSize || "",
      });
    }

    // Re-validate the coupon and recompute the discount server-side, mirroring
    // applyDiscount's formula. The coupon's usage (usedBy) is consumed by the
    // applyDiscount endpoint at checkout — here we only recompute the monetary
    // amount (so a tampered discountAmount cannot be trusted) and never re-consume
    // the coupon. An invalid, expired, or inactive coupon simply yields no discount.
    let discountAmount = 0;
    let appliedCouponCode = "";
    if (couponCode && String(couponCode).trim()) {
      const discount = await DiscountModel.findOne({
        name: String(couponCode).trim(),
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
        isActive: true,
      });

      if (discount) {
        let computed =
          discount.discountType === "FIXED"
            ? discount.discountValue
            : (itemsTotal * discount.discountValue) / 100;
        computed = Math.min(computed, itemsTotal);
        discountAmount = Math.max(0, computed);
        appliedCouponCode = discount.name;
      }
    }

    const totalAmount = Math.max(0, itemsTotal - discountAmount);

    const newOrder = new OrderModel({
      user: userId,
      address: addressId,
      products: orderItems,
      totalAmount,
      couponCode: appliedCouponCode,
      discountAmount,
      paymentMethod: method,
      upiReference: method === "ONLINE" ? upiReference || "" : "",
      paymentScreenshot:
        method === "ONLINE" && paymentScreenshot
          ? {
              public_id: paymentScreenshot.public_id || "",
              url: paymentScreenshot.url || "",
            }
          : { public_id: "", url: "" },
      orderStatus: "PENDING",
      paymentStatus: "PENDING",
      deliveryDate,
    });

    await newOrder.save();

    const populatedOrder = await OrderModel.findById(newOrder._id)
      .populate("user", "name email")
      .populate("products.product", "name price images");

    // COD orders get their confirmation/receipt immediately.
    // ONLINE orders are "Pending Verification" — their receipt email is sent
    // only after an admin verifies the payment (see verifyPayment below).
    if (method === "COD") {
      const receiptHTML = generateReceiptHTML(populatedOrder);
      const user = await UserModel.findById(userId);

      sendEmail({
        sendTo: user.email,
        subject: "Order Confirmation",
        html: receiptHTML,
      });
    }

    res.status(201).json({ success: true, order: populatedOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Customer — upload the UPI payment screenshot to Cloudinary before placing an
// online order. Returns { public_id, url } which the client sends with createOrder.
export const uploadPaymentScreenshot = catchAsyncErrors(async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No screenshot uploaded" });
    }

    const result = await uploadImage(req.file);

    return res.status(200).json({
      success: true,
      screenshot: { public_id: result.public_id, url: result.secure_url },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Admin — approve or reject a pending online payment.
export const verifyPayment = catchAsyncErrors(async (req, res) => {
  try {
    const { orderId } = req.params;
    const { action, rejectionReason } = req.body;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Use 'approve' or 'reject'.",
      });
    }

    const order = await OrderModel.findById(orderId)
      .populate("user", "name email")
      .populate("products.product", "name price images");

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.paymentMethod !== "ONLINE") {
      return res.status(400).json({
        success: false,
        message: "Only online payments require verification",
      });
    }

    if (order.paymentStatus !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: `Payment already ${order.paymentStatus.toLowerCase()}`,
      });
    }

    if (action === "approve") {
      order.paymentStatus = "COMPLETED";
      order.paymentVerifiedAt = new Date();
      order.paymentRejectionReason = "";
      await order.save();

      const receiptHTML = generateReceiptHTML(order);
      sendEmail({
        sendTo: order.user.email,
        subject: "Payment Verified — Your Receipt - Faith AND Fast",
        html: receiptHTML,
      });

      return res.status(200).json({
        success: true,
        message: "Payment approved successfully",
        order,
      });
    }

    // reject
    order.paymentStatus = "FAILED";
    order.paymentRejectionReason =
      rejectionReason || "Payment could not be verified";
    await order.save();

    sendEmail({
      sendTo: order.user.email,
      subject: "Payment Verification Failed - Faith AND Fast",
      html: `
        <html>
          <body style="font-family: Arial, sans-serif; background-color: #f9f9f9; color: #333;">
            <div style="background-color: #fff; padding: 20px; max-width: 600px; margin: 0 auto; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #e91e63; text-align: center;">Payment Verification Failed</h2>
              <p style="font-size: 16px;">Dear ${order.user.name},</p>
              <p style="font-size: 16px;">We were unable to verify the payment for your order <strong>#${order._id}</strong>.</p>
              <p style="font-size: 16px;"><strong>Reason:</strong> ${order.paymentRejectionReason}</p>
              <p style="font-size: 16px;">Please contact us at <strong>support@faithandfast.com</strong> or place the order again.</p>
              <p style="font-size: 16px; text-align: center;">Best regards,<br>Faith AND Fast Team</p>
            </div>
          </body>
        </html>
      `,
    });

    return res.status(200).json({
      success: true,
      message: "Payment rejected",
      order,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export const getSingleOrder = catchAsyncErrors(async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await OrderModel.findById(orderId)
      .populate("user", "name email")
      .populate("address", "address_line city pincode state country mobile")
      .populate("products.product", "name price images");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export const myOrders = catchAsyncErrors(async (req, res) => {
  try {
    const userId = req.user._id;

    const orders = await OrderModel.find({ user: userId })
      .populate("address", "address_line city pincode state country mobile")
      .populate("products.product", "name price images")
      .sort({ createdAt: -1 });

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No orders found for this user",
      });
    }

    res.status(200).json({
      success: true,
      orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Admin
export const getAllOrders = catchAsyncErrors(async (req, res) => {
  try {
    const orders = await OrderModel.find()
      .populate("user", "name email")
      .populate("address", "address_line city pincode state country mobile")
      .populate("products.product", "name price images")
      .sort({ createdAt: -1 });

    if (!orders || orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No orders found",
      });
    }

    res.status(200).json({
      success: true,
      totalOrders: orders.length,
      orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Admin
export const updateOrderStatus = catchAsyncErrors(async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderStatus, trackingId, notes, deliveryDate } = req.body;
    const adminId =
      req.user && req.user._id ? req.user._id.toString() : "Unknown";

    console.log("Request Body:", req.body);

    const validStatuses = ["PENDING", "SHIPPED", "DELIVERED", "CANCELLED"];
    if (!validStatuses.includes(orderStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status",
      });
    }

    const order = await OrderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    order.orderStatus = orderStatus;
    if (trackingId) order.trackingId = trackingId;

    if (orderStatus === "DELIVERED") {
      order.deliveryDate = new Date();
    } else if (deliveryDate) {
      order.deliveryDate = new Date(deliveryDate);
    }

    order.orderHistory.push({
      status: orderStatus,
      changedAt: new Date(),
      changedBy: adminId.toString(),
      notes: notes || "",
    });

    // Deduct stock at most once per order: only on the first transition into
    // SHIPPED (stockDeducted === false). Without this guard, setting an order to
    // SHIPPED again (e.g. PENDING → SHIPPED → DELIVERED → SHIPPED, or a duplicated
    // request) deducted the same items' stock a second time.
    if (orderStatus === "SHIPPED" && !order.stockDeducted) {
      // Two-phase inventory update to guarantee stock integrity.
      //
      // PHASE 1 — validate every line item BEFORE touching any stock. Load each
      // product, confirm it exists and has enough quantity. If any single item
      // fails, we abort here having written nothing — inventory is left exactly
      // as it was. (The previous single-loop approach deducted item-by-item, so
      // a failure on item 3 left items 1 and 2 permanently deducted with no
      // rollback.)
      const stockUpdates = [];
      for (const item of order.products) {
        const product = await ProductModel.findById(item.product);

        if (!product) {
          return res.status(404).json({
            success: false,
            message: `Product with ID ${item.product} not found. No stock was changed.`,
          });
        }

        if (product.stock < item.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for "${product.name}" (available: ${product.stock}, required: ${item.quantity}). No stock was changed.`,
          });
        }

        stockUpdates.push({ product, quantity: item.quantity });
      }

      // PHASE 2 — apply each deduction with an atomic conditional update that
      // re-checks sufficient stock at write time, closing the race between the
      // Phase 1 read above and this write. findOneAndUpdate with a
      // `stock: { $gte: quantity }` guard plus `$inc` decrements in a single
      // atomic DB operation, so two concurrent shipments of the same product
      // can never both pass the check and drive stock negative. (Like the
      // previous save, this skips schema validators, which findOneAndUpdate
      // does by default.)
      for (const { product, quantity } of stockUpdates) {
        const updated = await ProductModel.findOneAndUpdate(
          { _id: product._id, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          { new: true }
        );

        if (!updated) {
          // Stock changed since Phase 1 (a concurrent shipment consumed it).
          // Some earlier items in this loop may already be deducted; surface a
          // clear conflict so the operator can reconcile, rather than silently
          // under-deducting or going negative.
          return res.status(409).json({
            success: false,
            message: `Stock for "${product.name}" changed and can no longer be safely deducted. Please retry.`,
          });
        }
      }

      // Mark the order so the same stock is never deducted again.
      order.stockDeducted = true;
    }

    // Restore stock when an order whose stock was already deducted is cancelled.
    // Previously the CANCELLED branch only changed the status, so inventory for a
    // shipped-then-cancelled order leaked permanently. Guarded by stockDeducted
    // so cancelling an order that never shipped does not inflate stock.
    if (orderStatus === "CANCELLED" && order.stockDeducted) {
      for (const item of order.products) {
        await updateCancelStock(item.product, item.quantity);
      }
      order.stockDeducted = false;
    }

    await order.save();
    console.log("Updated Order:", order);

    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      order,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

export const cancelOrder = catchAsyncErrors(async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const order = await OrderModel.findById(orderId)
      .populate("products.product")
      .populate("user");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.orderStatus === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Order is already cancelled",
      });
    }

    if (
      order.user._id.toString() !== userId.toString() &&
      req.user.role !== "ADMIN"
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to cancel this order",
      });
    }

    if (order.orderStatus === "SHIPPED" || order.orderStatus === "DELIVERED") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel an order that is already shipped or delivered",
      });
    }

    order.orderStatus = "CANCELLED";

    for (const item of order.products) {
      const prodId = item.product?._id || item.product;
      await updateCancelStock(prodId, item.quantity);
    }

    order.orderHistory.push({
      status: "CANCELLED",
      changedAt: new Date(),
      changedBy: userId.toString(),
      notes: "Order cancelled by user",
    });

    await order.save();

    const emailSent = await sendEmail({
      sendTo: order.user.email,
      subject: "Your Order Has Been Cancelled - Faith AND Fast",
      html: `
            <html>
              <body style="font-family: Arial, sans-serif; background-color: #f9f9f9; color: #333;">
                <div style="background-color: #fff; padding: 20px; max-width: 600px; margin: 0 auto; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                  <h2 style="color: #e91e63; text-align: center;">Order Cancellation Confirmation</h2>
                  <p style="font-size: 16px;">Dear ${order.user.name},</p>
                  <p style="font-size: 16px;">We are writing to confirm that your order <strong>#${
                    order._id
                  }</strong> has been successfully cancelled.</p>
                  <p style="font-size: 16px;">Here are the details of your order:</p>
                  <ul style="font-size: 16px;">
                    ${order.products
                      .map(
                        (item) =>
                          `<li><strong>Product:</strong> ${item.product.name} | <strong>Quantity:</strong> ${item.quantity}</li>`
                      )
                      .join("")}
                  </ul>
                  <p style="font-size: 16px;"><strong>Order Created:</strong> ${
                    order.createdAt
                  }</p>
                  <p style="font-size: 16px;">If you have any concerns or questions, feel free to contact our support team at <strong>support@faithandfast.com</strong>.</p>
                  <p style="font-size: 16px; text-align: center;">
                    <a href="https://www.faithandfast.com" style="color: #fff; background-color: #e91e63; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Visit Faith AND Fast</a>
                  </p>
                  <p style="font-size: 16px; text-align: center;">Best regards,<br>Faith AND Fast Team</p>
                </div>
              </body>
            </html>
          `,
    });

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      emailSent,
      order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

async function updateCancelStock(productId, quantity) {
  const product = await ProductModel.findById(productId);

  if (!product) {
    throw new Error(`Product with ID ${productId} not found`);
  }

  product.stock += quantity;

  await product.save({ validateBeforeSave: false });
}

export const deleteOrder = catchAsyncErrors(async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await OrderModel.findById(orderId).populate(
      "products.product"
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (req.user.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to delete this order",
      });
    }

    await order.deleteOne();

    res.status(200).json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

export const deleteAllOrders = catchAsyncErrors(async (req, res) => {
  try {
    await OrderModel.deleteMany({});
    res.status(200).json({
      success: true,
      message: "All orders deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting all orders:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});
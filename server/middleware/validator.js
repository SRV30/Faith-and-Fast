import mongoose from "mongoose";

export function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validatePassword(password) {
  return password && password.length >= 6;
}

export function validateObjectId(id, name = "ID") {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return `Invalid ${name}`;
  }
  return null;
}

export function validateRequiredFields(fields, body) {
  const missing = fields.filter((f) => !body[f] || body[f].toString().trim() === "");
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(", ")}`;
  }
  return null;
}

export function validateAllowedValues(value, allowed, name = "Field") {
  if (!allowed.includes(value)) {
    return `${name} must be one of: ${allowed.join(", ")}`;
  }
  return null;
}

export function validateRequestBody(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      if (rules.required && (!value || value.toString().trim() === "")) {
        errors.push({ field, message: `${field} is required` });
        continue;
      }

      if (!value) continue;

      if (rules.type === "email" && !validateEmail(value)) {
        errors.push({ field, message: `${field} must be a valid email` });
      }

      if (rules.type === "password" && !validatePassword(value)) {
        errors.push({ field, message: `${field} must be at least 6 characters` });
      }

      if (rules.type === "objectId") {
        const err = validateObjectId(value, field);
        if (err) errors.push({ field, message: err });
      }

      if (rules.minLength && value.length < rules.minLength) {
        errors.push({ field, message: `${field} must be at least ${rules.minLength} characters` });
      }

      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push({ field, message: `${field} must be at most ${rules.maxLength} characters` });
      }

      if (rules.enum && !rules.enum.includes(value)) {
        errors.push({ field, message: `${field} must be one of: ${rules.enum.join(", ")}` });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
        error: true,
      });
    }

    next();
  };
}

export const userValidation = {
  register: validateRequestBody({
    name: { required: true, type: "string", minLength: 2, maxLength: 50 },
    email: { required: true, type: "email" },
    password: { required: true, type: "password" },
  }),
  login: validateRequestBody({
    email: { required: true, type: "email" },
    password: { required: true },
  }),
  forgotPassword: validateRequestBody({
    email: { required: true, type: "email" },
  }),
  resetPassword: validateRequestBody({
    email: { required: true, type: "email" },
    newPassword: { required: true, type: "password" },
    confirmPassword: { required: true },
  }),
};

export const productValidation = {
  create: validateRequestBody({
    name: { required: true, type: "string", minLength: 3, maxLength: 200 },
    category: { required: true, type: "string" },
    price: { required: true, type: "string" },
    stock: { required: true, type: "string" },
    description: { required: true, type: "string", minLength: 10 },
  }),
};

export const orderValidation = {
  create: validateRequestBody({
    userId: { required: true, type: "objectId" },
    addressId: { required: true, type: "objectId" },
    paymentMethod: { required: true, enum: ["COD", "ONLINE", "STRIPE"] },
  }),
  updateStatus: validateRequestBody({
    orderStatus: { required: true, enum: ["PENDING", "SHIPPED", "DELIVERED", "CANCELLED"] },
  }),
};

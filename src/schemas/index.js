import { orderSchema, orderItemSchema } from "./orderSchema";
import { productSchema } from "./productSchema";
import { settingsSchema, neighborhoodItemSchema, dayHoursSchema } from "./settingsSchema";
import { adminUserSchema } from "./adminUserSchema";

/**
 * Utilitário seguro para validar dados sem estourar exceptions não tratadas.
 * Retorna { success: true, data } ou { success: false, errors: { [field]: message }, errorList: string[] }
 */
export function validateSchema(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) {
    return {
      success: true,
      data: result.data,
      errors: {},
      errorList: []
    };
  }

  const errors = {};
  const errorList = [];

  result.error.errors.forEach((err) => {
    const path = err.path.join(".") || "global";
    if (!errors[path]) {
      errors[path] = err.message;
    }
    errorList.push(`${path}: ${err.message}`);
  });

  return {
    success: false,
    errors,
    errorList
  };
}

import { sanitizeOrderData, sanitizeProductData } from "./sanitizers";

export {
  orderSchema,
  orderItemSchema,
  productSchema,
  settingsSchema,
  neighborhoodItemSchema,
  dayHoursSchema,
  adminUserSchema,
  sanitizeOrderData,
  sanitizeProductData
};

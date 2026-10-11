import { parseBRLToNumber } from "@/utils/moneyMask";

/**
 * Sanitiza rigorosamente dados de pedido para garantir tipos primitivos perfeitos
 * antes de serem persistidos no Supabase ou LocalStorage.
 */
export function sanitizeOrderData(rawOrder = {}) {
  const parseNum = (val, fallback = 0) => {
    if (typeof val === "number" && !isNaN(val)) return Number(val.toFixed(2));
    if (typeof val === "string") {
      const parsed = parseBRLToNumber(val);
      if (!isNaN(parsed)) return Number(parsed.toFixed(2));
    }
    return fallback;
  };

  const cleanItems = Array.isArray(rawOrder.items)
    ? rawOrder.items.map((item, idx) => {
        const itemPrice = parseNum(item.price ?? item.product_price);
        const itemQty = Math.max(1, parseInt(item.quantity, 10) || 1);
        const itemSubtotal = parseNum(item.subtotal ?? (itemPrice * itemQty));

        return {
          id: item.id || `item_${idx}_${Date.now()}`,
          product_id: item.product_id ? String(item.product_id) : undefined,
          product_name: String(item.product_name || item.name || "Item sem nome").trim(),
          name: String(item.name || item.product_name || "Item sem nome").trim(),
          price: itemPrice,
          product_price: itemPrice,
          quantity: itemQty,
          subtotal: itemSubtotal,
          additionals: Array.isArray(item.additionals)
            ? item.additionals.map((ad) => ({
                id: ad.id,
                name: String(ad.name || "").trim(),
                price: parseNum(ad.price),
              }))
            : [],
          complements: Array.isArray(item.complements) ? item.complements : [],
          notes: item.notes ? String(item.notes).trim() : "",
        };
      })
    : [];

  const subtotal = parseNum(rawOrder.subtotal, cleanItems.reduce((acc, it) => acc + it.subtotal, 0));
  const deliveryFee = parseNum(rawOrder.delivery_fee, 0);
  const discountAmount = parseNum(rawOrder.discount_amount, 0);
  const totalAmount = parseNum(rawOrder.total_amount ?? rawOrder.total, Math.max(0, subtotal - discountAmount + deliveryFee));

  return {
    ...rawOrder,
    customer_name: String(rawOrder.customer_name || "Cliente").trim(),
    customer_phone: String(rawOrder.customer_phone || "-").trim(),
    customer_email: rawOrder.customer_email ? String(rawOrder.customer_email).trim() : "",
    order_type: ["delivery", "balcao", "pickup", "mesa", "dine_in"].includes(rawOrder.order_type)
      ? rawOrder.order_type
      : "delivery",
    table_number: rawOrder.table_number ? String(rawOrder.table_number).trim() : null,
    customer_address: rawOrder.customer_address ? String(rawOrder.customer_address).trim() : null,
    delivery_address: rawOrder.delivery_address ? String(rawOrder.delivery_address).trim() : null,
    payment_method: String(rawOrder.payment_method || "dinheiro").toLowerCase().trim(),
    change_for: rawOrder.change_for ? parseNum(rawOrder.change_for) : null,
    notes: rawOrder.notes ? String(rawOrder.notes).trim() : "",
    coupon_code: rawOrder.coupon_code ? String(rawOrder.coupon_code).trim().toUpperCase() : null,
    subtotal,
    delivery_fee: deliveryFee,
    discount_amount: discountAmount,
    total_amount: totalAmount,
    total: totalAmount,
    items: cleanItems,
    status: rawOrder.status ? String(rawOrder.status).toLowerCase().trim() : "pendente",
  };
}

/**
 * Sanitiza rigorosamente dados de produto
 */
export function sanitizeProductData(rawProduct = {}) {
  const parseNum = (val, fallback = 0) => {
    if (typeof val === "number" && !isNaN(val)) return Number(val.toFixed(2));
    if (typeof val === "string") {
      const parsed = parseBRLToNumber(val);
      if (!isNaN(parsed)) return Number(parsed.toFixed(2));
    }
    return fallback;
  };

  return {
    ...rawProduct,
    name: String(rawProduct.name || "").trim(),
    description: rawProduct.description ? String(rawProduct.description).trim() : "",
    price: parseNum(rawProduct.price, 0),
    category: rawProduct.category ? String(rawProduct.category).trim() : "",
    category_id: rawProduct.category_id ? String(rawProduct.category_id) : null,
    image_url: rawProduct.image_url ? String(rawProduct.image_url).trim() : "",
    available: rawProduct.available !== false,
    popular: Boolean(rawProduct.popular),
  };
}

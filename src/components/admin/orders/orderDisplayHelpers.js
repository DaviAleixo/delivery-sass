import { getPaymentBrandInfo } from "@/constants/paymentBrands";

/**
 * Resolve metadados visuais de canal (Delivery, Salão/Mesa ou Retirada/PDV).
 */
export function getOrderChannelMeta(order) {
  const type = String(order?.order_type || "").toLowerCase();
  const rawTable = order?.table_number ? String(order.table_number).trim() : "";

  if (type === "delivery") {
    return {
      kind: "delivery",
      title: "Delivery",
      shortLabel: "Delivery",
      detailSubtitle: "Entrega (Delivery)",
      pillClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      iconBoxClass: "bg-emerald-50 text-[#047857] border-emerald-200/80",
    };
  }

  if (type === "dine_in" || type === "mesa" || rawTable.toLowerCase().includes("mesa")) {
    const formattedTable = rawTable
      ? (rawTable.toLowerCase().includes("mesa") ? rawTable : `Mesa ${rawTable}`)
      : "Salão (Mesa)";
    return {
      kind: "dine_in",
      title: "Salão",
      shortLabel: formattedTable,
      detailSubtitle: formattedTable,
      pillClass: "bg-sky-50 text-sky-700 border-sky-200",
      iconBoxClass: "bg-sky-50 text-sky-700 border-sky-200/80",
    };
  }

  return {
    kind: "pickup",
    title: "Retirada",
    shortLabel: "Retirada (Balcão)",
    detailSubtitle: "Retirada no Balcão",
    pillClass: "bg-amber-50 text-amber-800 border-amber-200",
    iconBoxClass: "bg-emerald-50 text-[#047857] border-emerald-200/80",
  };
}

/**
 * Resolve rótulo e estilo de badge para cada status do pedido.
 */
export function getOrderStatusMeta(status) {
  const map = {
    pendente: {
      label: "Pendente",
      badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
    },
    confirmado: {
      label: "Confirmado",
      badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    },
    preparando: {
      label: "Preparando",
      badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
    },
    pronto: {
      label: "Pronto na Cozinha",
      badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
    },
    enviado: {
      label: "Enviado",
      badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
    entregue: {
      label: "Entregue",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    cancelado: {
      label: "Cancelado",
      badgeClass: "bg-red-50 text-red-700 border-red-200",
    },
  };
  return (
    map[status] || {
      label: status || "-",
      badgeClass: "bg-gray-100 text-gray-700 border-gray-200",
    }
  );
}

/**
 * Formata nome legível da forma de pagamento com bandeira opcional.
 */
export function getPaymentMethodText(method, cardBrand) {
  const methods = {
    dinheiro: "Dinheiro",
    pix: "PIX",
    pix_online: "PIX Online (Mercado Pago)",
    cartao: "Cartão",
    cartao_credito: "Cartão de Crédito",
    cartao_debito: "Cartão de Débito",
    alimentacao: "Vale Alimentação / Refeição",
    caixa: "Pagar no Caixa (Mesa)",
    pagar_no_caixa: "Pagar no Caixa (Mesa)",
  };
  const base = methods[method] || method || "-";
  if (cardBrand) {
    const brandInfo = getPaymentBrandInfo(cardBrand);
    return `${base} (${brandInfo?.name || cardBrand})`;
  }
  return base;
}

/**
 * Soma total de unidades de itens de um pedido.
 */
export function getTotalItemsCount(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, it) => sum + (Number(it?.quantity) || 1), 0);
}

/**
 * Busca a foto do item no pedido ou no mapa do catálogo de produtos.
 */
export function resolveItemImage(item, productImageMap) {
  if (!item) return null;
  if (item.image_url) return item.image_url;
  if (!productImageMap) return null;

  if (item.product_id && productImageMap.byId.has(item.product_id)) {
    return productImageMap.byId.get(item.product_id);
  }
  const itemName = String(item.product_name || item.name || "").trim().toLowerCase();
  if (itemName && productImageMap.byName.has(itemName)) {
    return productImageMap.byName.get(itemName);
  }
  return null;
}


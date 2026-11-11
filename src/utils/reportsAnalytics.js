/**
 * reportsAnalytics.js
 * 
 * Motor analítico puro e desacoplado para a aba de Relatórios:
 * - Agregação cronológica de vendas dia a dia (faturamento e ticket médio)
 * - Agregação de categorias com snapshot histórico e tolerância zero a exclusões
 * - Mapeamento e detecção de horários de pico (00h às 23h BRT)
 */

import { getBrasiliaParts } from "./dateTime";

/**
 * Agrupa vendas dia a dia no período selecionado (Fuso Brasília)
 * @param {Array} orders Lista de pedidos
 * @param {Date} startDate Data inicial
 * @param {Date} endDate Data final
 * @returns {Array} Array de métricas diárias ordenado cronologicamente
 */
export function aggregateDailySales(orders = [], startDate = null, endDate = null) {
  const dailyMap = new Map();

  // Processa pedidos válidos
  orders.forEach((order) => {
    if (!order.created_date) return;
    const parts = getBrasiliaParts(order.created_date);
    const dateKey = parts.dateKey; // YYYY-MM-DD
    const displayDate = `${parts.day}/${parts.month}`;

    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        dateKey,
        displayDate,
        revenue: 0,
        ordersCount: 0,
        canceledRevenue: 0,
        canceledCount: 0,
        totalItemsSold: 0,
      });
    }

    const dayRecord = dailyMap.get(dateKey);
    const amount = Number(order.total_amount ?? order.total ?? 0) || 0;

    if (order.status === "cancelado") {
      dayRecord.canceledRevenue += amount;
      dayRecord.canceledCount += 1;
    } else {
      dayRecord.revenue += amount;
      dayRecord.ordersCount += 1;

      // Conta itens
      if (Array.isArray(order.items)) {
        order.items.forEach((it) => {
          dayRecord.totalItemsSold += Number(it.quantity || 1) || 1;
        });
      }
    }
  });

  // Se datas inicial e final forem fornecidas, podemos preencher dias intermediários com zero
  if (startDate && endDate) {
    const current = new Date(startDate);
    const end = new Date(endDate);
    
    // Limite de segurança de 366 dias para não travar loops
    let safetyCounter = 0;
    while (current <= end && safetyCounter < 370) {
      const parts = getBrasiliaParts(current);
      const key = parts.dateKey;
      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          dateKey: key,
          displayDate: `${parts.day}/${parts.month}`,
          revenue: 0,
          ordersCount: 0,
          canceledRevenue: 0,
          canceledCount: 0,
          totalItemsSold: 0,
        });
      }
      current.setDate(current.getDate() + 1);
      safetyCounter++;
    }
  }

  // Ordena por chave YYYY-MM-DD
  const sorted = Array.from(dailyMap.values()).sort((a, b) =>
    a.dateKey.localeCompare(b.dateKey)
  );

  return sorted.map((d) => ({
    ...d,
    revenue: Number(d.revenue.toFixed(2)),
    canceledRevenue: Number(d.canceledRevenue.toFixed(2)),
    averageTicket: d.ordersCount > 0 ? Number((d.revenue / d.ordersCount).toFixed(2)) : 0,
  }));
}

/**
 * Agrupa distribuição de receita por categoria com preservação histórica de nomes
 * (Snapshot de Categoria: se a categoria for deletada, mantém o nome original)
 * @param {Array} orders Lista de pedidos
 * @param {Array} categories Lista de categorias ativas (opcional)
 * @param {Array} products Lista de produtos cadastrados (opcional)
 * @returns {Array} Array de categorias ordenadas por faturamento decrescente
 */
export function aggregateCategoryDistribution(orders = [], categories = [], products = []) {
  const categoryNameMap = new Map();
  if (Array.isArray(categories)) {
    categories.forEach((c) => {
      if (c && c.id && c.name) {
        categoryNameMap.set(String(c.id), String(c.name).trim());
      }
    });
  }

  const productCategoryMap = new Map();
  if (Array.isArray(products)) {
    products.forEach((p) => {
      if (p && p.id) {
        const catId = p.category_id || p.category;
        const catName = categoryNameMap.get(String(catId)) || (typeof p.category === "string" ? p.category : null);
        productCategoryMap.set(String(p.id), { catId, catName });
      }
    });
  }

  const grouped = new Map();
  let totalRevenue = 0;

  orders.forEach((order) => {
    // Ignora cancelados
    if (order.status === "cancelado") return;
    if (!Array.isArray(order.items)) return;

    order.items.forEach((item) => {
      if (!item) return;

      // Resolução de Nome por Precedência Histórica:
      // 1. Snapshot direto no item do pedido
      let resolvedName = item.category_name ? String(item.category_name).trim() : null;

      // 2. Se não tinha snapshot, tenta via vínculo do produto cadastrado
      if (!resolvedName && item.product_id) {
        const prodInfo = productCategoryMap.get(String(item.product_id));
        if (prodInfo?.catName) resolvedName = prodInfo.catName;
        else if (prodInfo?.catId && categoryNameMap.has(String(prodInfo.catId))) {
          resolvedName = categoryNameMap.get(String(prodInfo.catId));
        }
      }

      // 3. Tenta via category_id do item se existir
      if (!resolvedName && item.category_id && categoryNameMap.has(String(item.category_id))) {
        resolvedName = categoryNameMap.get(String(item.category_id));
      }

      // 4. Tenta via string legada item.category
      if (!resolvedName && typeof item.category === "string" && item.category.trim()) {
        resolvedName = item.category.trim();
      }

      // 5. Fallback amigável (nunca null ou quebrado)
      if (!resolvedName || resolvedName === "undefined" || resolvedName === "null") {
        resolvedName = "Geral";
      }

      const qty = Math.max(1, Number(item.quantity) || 1);
      const price = Number(item.price ?? item.product_price ?? 0) || 0;
      const subtotal = Number(item.subtotal ?? (price * qty)) || 0;

      totalRevenue += subtotal;

      if (!grouped.has(resolvedName)) {
        grouped.set(resolvedName, {
          name: resolvedName,
          revenue: 0,
          items: 0,
        });
      }

      const record = grouped.get(resolvedName);
      record.revenue += subtotal;
      record.items += qty;
    });
  });

  const result = Array.from(grouped.values()).map((c) => ({
    name: c.name,
    items: c.items,
    revenue: Number(c.revenue.toFixed(2)),
    percentage: totalRevenue > 0 ? Number(((c.revenue / totalRevenue) * 100).toFixed(1)) : 0,
  }));

  // Ordena por maior faturamento
  return result.sort((a, b) => b.revenue - a.revenue);
}

/**
 * Mapeia o volume de pedidos por hora do dia (00h às 23h BRT)
 * @param {Array} orders Lista de pedidos
 * @returns {Object} { hourlyData: Array, peakHourInfo: Object }
 */
export function aggregatePeakHours(orders = []) {
  // Inicializa as 24 horas
  const hoursMap = new Map();
  for (let h = 0; h < 24; h++) {
    const label = `${String(h).padStart(2, "0")}h`;
    const range = `${String(h).padStart(2, "0")}:00 - ${String(h).padStart(2, "0")}:59`;
    hoursMap.set(h, {
      hour: h,
      label,
      range,
      ordersCount: 0,
      revenue: 0,
    });
  }

  orders.forEach((order) => {
    if (order.status === "cancelado") return;
    if (!order.created_date) return;

    const parts = getBrasiliaParts(order.created_date);
    const hour = parts.hour; // 0..23

    if (hoursMap.has(hour)) {
      const rec = hoursMap.get(hour);
      rec.ordersCount += 1;
      rec.revenue += Number(order.total_amount ?? order.total ?? 0) || 0;
    }
  });

  const hourlyData = Array.from(hoursMap.values()).map((h) => ({
    ...h,
    revenue: Number(h.revenue.toFixed(2)),
  }));

  // Identifica o horário de pico
  let peakHourInfo = null;
  let maxOrders = 0;

  hourlyData.forEach((h) => {
    if (h.ordersCount > maxOrders) {
      maxOrders = h.ordersCount;
      peakHourInfo = {
        hour: h.hour,
        label: `${String(h.hour).padStart(2, "0")}:00 às ${String(h.hour + 1).padStart(2, "0")}:00`,
        ordersCount: h.ordersCount,
        revenue: h.revenue,
      };
    }
  });

  // Se não houver pedidos no período
  if (!peakHourInfo) {
    peakHourInfo = {
      hour: 20,
      label: "Sem pedidos no período",
      ordersCount: 0,
      revenue: 0,
    };
  }

  return {
    hourlyData,
    peakHourInfo,
  };
}

/**
 * Agrupa taxas de serviço (% de atendimento/mesa) de forma cronológica com valor acumulado progressivo
 * @param {Array} sessions Lista de sessões de mesa (table_sessions)
 * @param {Array} orders Lista de pedidos (caso haja pedidos com service_fee avulso)
 * @param {Date} startDate Data inicial
 * @param {Date} endDate Data final
 * @param {boolean} isSingleDay Se true, agrega por horário (00h às 23h) para visão intra-turno
 * @returns {Object} { dailyData, totalServiceFee, totalSessionsCount, avgServiceFee, isHourly }
 */
export function aggregateServiceFeeCumulative(
  sessions = [],
  orders = [],
  startDate = null,
  endDate = null,
  isSingleDay = false
) {
  if (isSingleDay) {
    // Agregação horária para o dia (00h às 23h)
    const hoursMap = new Map();
    for (let h = 0; h < 24; h++) {
      hoursMap.set(h, {
        hour: h,
        displayDate: `${String(h).padStart(2, "0")}h`,
        dailyServiceFee: 0,
        sessionsCount: 0,
        subtotalAmount: 0,
      });
    }

    sessions.forEach((session) => {
      const fee = Number(session.service_fee || 0);
      const dateStr = session.closed_at || session.created_at;
      if (!dateStr) return;

      const parts = getBrasiliaParts(dateStr);
      const h = parts.hour;
      if (hoursMap.has(h)) {
        const rec = hoursMap.get(h);
        rec.dailyServiceFee += fee;
        rec.subtotalAmount += Number(session.subtotal || session.total_amount || 0);
        if (fee > 0) rec.sessionsCount += 1;
      }
    });

    const sessionIds = new Set(sessions.map((s) => s.id).filter(Boolean));
    orders.forEach((order) => {
      const fee = Number(order.service_fee || 0);
      if (fee <= 0) return;
      if (order.table_session_id && sessionIds.has(order.table_session_id)) return;
      if (order.status === "cancelado") return;

      const dateStr = order.created_date;
      if (!dateStr) return;

      const parts = getBrasiliaParts(dateStr);
      const h = parts.hour;
      if (hoursMap.has(h)) {
        const rec = hoursMap.get(h);
        rec.dailyServiceFee += fee;
        rec.subtotalAmount += Number(order.subtotal || order.total_amount || 0);
        rec.sessionsCount += 1;
      }
    });

    let runningCumulative = 0;
    let totalSessions = 0;
    const sorted = Array.from(hoursMap.values());
    const dailyData = sorted.map((h) => {
      runningCumulative += h.dailyServiceFee;
      totalSessions += h.sessionsCount;
      return {
        dateKey: `${h.hour}h`,
        displayDate: h.displayDate,
        dailyServiceFee: Number(h.dailyServiceFee.toFixed(2)),
        cumulativeServiceFee: Number(runningCumulative.toFixed(2)),
        sessionsCount: h.sessionsCount,
        subtotalAmount: Number(h.subtotalAmount.toFixed(2)),
      };
    });

    const totalServiceFee = Number(runningCumulative.toFixed(2));
    const avgServiceFee =
      totalSessions > 0 ? Number((totalServiceFee / totalSessions).toFixed(2)) : 0;

    return {
      dailyData,
      totalServiceFee,
      totalSessionsCount: totalSessions,
      avgServiceFee,
      isHourly: true,
    };
  }

  // Agregação diária padrão (Multi-day)
  const dailyMap = new Map();

  sessions.forEach((session) => {
    const fee = Number(session.service_fee || 0);
    const dateStr = session.closed_at || session.created_at;
    if (!dateStr) return;

    const parts = getBrasiliaParts(dateStr);
    const dateKey = parts.dateKey;

    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        dateKey,
        displayDate: `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}`,
        dailyServiceFee: 0,
        sessionsCount: 0,
        subtotalAmount: 0,
      });
    }

    const rec = dailyMap.get(dateKey);
    rec.dailyServiceFee += fee;
    rec.subtotalAmount += Number(session.subtotal || session.total_amount || 0);
    if (fee > 0) rec.sessionsCount += 1;
  });

  const sessionIds = new Set(sessions.map((s) => s.id).filter(Boolean));
  orders.forEach((order) => {
    const fee = Number(order.service_fee || 0);
    if (fee <= 0) return;
    if (order.table_session_id && sessionIds.has(order.table_session_id)) return;
    if (order.status === "cancelado") return;

    const dateStr = order.created_date;
    if (!dateStr) return;

    const parts = getBrasiliaParts(dateStr);
    const dateKey = parts.dateKey;

    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        dateKey,
        displayDate: `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}`,
        dailyServiceFee: 0,
        sessionsCount: 0,
        subtotalAmount: 0,
      });
    }

    const rec = dailyMap.get(dateKey);
    rec.dailyServiceFee += fee;
    rec.subtotalAmount += Number(order.subtotal || order.total_amount || 0);
    rec.sessionsCount += 1;
  });

  // Preenche dias sem vendas dentro do intervalo com 0
  if (startDate && endDate) {
    const current = new Date(startDate);
    const end = new Date(endDate);
    let safetyCounter = 0;
    while (current <= end && safetyCounter < 370) {
      const parts = getBrasiliaParts(current);
      const key = parts.dateKey;
      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          dateKey: key,
          displayDate: `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}`,
          dailyServiceFee: 0,
          sessionsCount: 0,
          subtotalAmount: 0,
        });
      }
      current.setDate(current.getDate() + 1);
      safetyCounter++;
    }
  }

  // Ordena cronologicamente por YYYY-MM-DD
  const sorted = Array.from(dailyMap.values()).sort((a, b) =>
    a.dateKey.localeCompare(b.dateKey)
  );

  let runningCumulative = 0;
  let totalSessions = 0;
  const dailyData = sorted.map((d) => {
    runningCumulative += d.dailyServiceFee;
    totalSessions += d.sessionsCount;
    return {
      dateKey: d.dateKey,
      displayDate: d.displayDate,
      dailyServiceFee: Number(d.dailyServiceFee.toFixed(2)),
      cumulativeServiceFee: Number(runningCumulative.toFixed(2)),
      sessionsCount: d.sessionsCount,
      subtotalAmount: Number(d.subtotalAmount.toFixed(2)),
    };
  });

  const totalServiceFee = Number(runningCumulative.toFixed(2));
  const avgServiceFee =
    totalSessions > 0 ? Number((totalServiceFee / totalSessions).toFixed(2)) : 0;

  return {
    dailyData,
    totalServiceFee,
    totalSessionsCount: totalSessions,
    avgServiceFee,
    isHourly: false,
  };
}

/**
 * Agrega faturamento, volume de transações, ticket médio e % de representatividade por método de pagamento.
 * Suporta pagamentos únicos e pagamentos múltiplos fracionados (ex: mesas amortizadas).
 * 
 * @param {Array} orders Lista de pedidos do período
 * @returns {Object} { methods: Array, totalRevenue: number, totalTransactions: number, topMethodByRevenue: Object, topMethodByVolume: Object }
 */
export function aggregatePaymentMethodsDistribution(orders = []) {
  const methodMap = {
    pix: {
      id: "pix",
      label: "Pix",
      count: 0,
      revenue: 0,
      color: "#059669",
      badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
      dotClass: "bg-emerald-500",
      icon: "pix",
    },
    cartao_credito: {
      id: "cartao_credito",
      label: "Cartão de Crédito",
      count: 0,
      revenue: 0,
      color: "#2563eb",
      badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
      dotClass: "bg-blue-500",
      icon: "credit_card",
    },
    cartao_debito: {
      id: "cartao_debito",
      label: "Cartão de Débito",
      count: 0,
      revenue: 0,
      color: "#0284c7",
      badgeClass: "bg-sky-50 text-sky-800 border-sky-200",
      dotClass: "bg-sky-500",
      icon: "credit_card",
    },
    dinheiro: {
      id: "dinheiro",
      label: "Dinheiro",
      count: 0,
      revenue: 0,
      color: "#16a34a",
      badgeClass: "bg-green-50 text-green-800 border-green-200",
      dotClass: "bg-green-500",
      icon: "banknote",
    },
    vale_refeicao: {
      id: "vale_refeicao",
      label: "Vale Refeição / Voucher",
      count: 0,
      revenue: 0,
      color: "#d97706",
      badgeClass: "bg-amber-50 text-amber-900 border-amber-200",
      dotClass: "bg-amber-500",
      icon: "receipt",
    },
    outros: {
      id: "outros",
      label: "Outros / Não Identificado",
      count: 0,
      revenue: 0,
      color: "#78716c",
      badgeClass: "bg-stone-50 text-stone-800 border-stone-200",
      dotClass: "bg-stone-500",
      icon: "help_circle",
    },
  };

  const normalizeKey = (key) => {
    if (!key) return "outros";
    const k = String(key).toLowerCase().trim();
    if (k.includes("pix") || k === "mercadopago") return "pix";
    if (k.includes("crédito") || k.includes("credito") || k === "credit") return "cartao_credito";
    if (k.includes("débito") || k.includes("debito") || k === "debit") return "cartao_debito";
    if (k.includes("dinheiro") || k === "cash") return "dinheiro";
    if (k.includes("vale") || k.includes("refei") || k.includes("alimenta") || k === "voucher") return "vale_refeicao";
    return "outros";
  };

  let grandTotalRevenue = 0;
  let grandTotalTransactions = 0;

  orders.forEach((order) => {
    if (order.status === "cancelado") return;
    const orderTotal = Number(order.total_amount ?? order.total ?? 0) || 0;
    if (orderTotal <= 0) return;

    // 1. Verifica se possui múltiplos pagamentos detalhados (ex: mesas e comandas fracionadas)
    let detailsPayments = null;
    if (order.payment_details) {
      if (Array.isArray(order.payment_details.payments) && order.payment_details.payments.length > 0) {
        detailsPayments = order.payment_details.payments;
      } else if (Array.isArray(order.payment_details) && order.payment_details.length > 0) {
        detailsPayments = order.payment_details;
      } else if (typeof order.payment_details === "string") {
        try {
          const parsed = JSON.parse(order.payment_details);
          if (Array.isArray(parsed?.payments) && parsed.payments.length > 0) {
            detailsPayments = parsed.payments;
          } else if (Array.isArray(parsed) && parsed.length > 0) {
            detailsPayments = parsed;
          }
        } catch {
          // ignore
        }
      }
    }

    if (detailsPayments && detailsPayments.length > 0) {
      // Decompõe cada parcela para o seu método com exatidão
      detailsPayments.forEach((p) => {
        const pAmt = Number(p.amount) || 0;
        if (pAmt <= 0) return;
        const normKey = normalizeKey(p.method);
        methodMap[normKey].revenue += pAmt;
        methodMap[normKey].count += 1;
        grandTotalRevenue += pAmt;
        grandTotalTransactions += 1;
      });
    } else {
      // Pagamento em método único
      const normKey = normalizeKey(order.payment_method);
      methodMap[normKey].revenue += orderTotal;
      methodMap[normKey].count += 1;
      grandTotalRevenue += orderTotal;
      grandTotalTransactions += 1;
    }
  });

  grandTotalRevenue = Number(grandTotalRevenue.toFixed(2));

  // Converte para lista ordenada por faturamento
  const methodsList = Object.values(methodMap)
    .filter((m) => m.revenue > 0 || m.count > 0)
    .map((m) => {
      const revenue = Number(m.revenue.toFixed(2));
      const percentage = grandTotalRevenue > 0 ? Number(((revenue / grandTotalRevenue) * 100).toFixed(1)) : 0;
      const txPercentage = grandTotalTransactions > 0 ? Number(((m.count / grandTotalTransactions) * 100).toFixed(1)) : 0;
      const averageTicket = m.count > 0 ? Number((revenue / m.count).toFixed(2)) : 0;
      return {
        ...m,
        revenue,
        percentage,
        txPercentage,
        averageTicket,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const topMethodByRevenue = methodsList[0] || null;
  const topMethodByVolume = [...methodsList].sort((a, b) => b.count - a.count)[0] || null;
  const overallAverageTicket = grandTotalTransactions > 0 ? Number((grandTotalRevenue / grandTotalTransactions).toFixed(2)) : 0;

  return {
    methods: methodsList,
    totalRevenue: grandTotalRevenue,
    totalTransactions: grandTotalTransactions,
    overallAverageTicket,
    topMethodByRevenue,
    topMethodByVolume,
  };
}

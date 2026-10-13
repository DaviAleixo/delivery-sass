/**
 * Motor Puro de Fechamento de Caixa do Turno e Relatório do Dia
 * (shiftClosingCalculator.js)
 * 
 * Clean Architecture & Clean Code:
 * - Determinístico, livre de efeitos colaterais e altamente testável.
 * - Trata virada de meia-noite em fuso oficial de Brasília (America/Sao_Paulo).
 * - Suporta lojas COM entregadores (extrato de saídas, taxas e acertos) e SEM entregadores.
 */

import { getBrasiliaParts, formatInBrasilia } from "./dateTime";

/**
 * Normaliza string de método de pagamento para chaves padronizadas
 */
export function normalizePaymentMethod(methodStr) {
  if (!methodStr) return "other";
  const m = String(methodStr).toLowerCase().trim();

  if (m.includes("dinheiro") || m === "cash") return "cash";
  if (m.includes("pix") || m === "mercadopago") return "pix";
  if (m.includes("crédito") || m.includes("credito") || m === "credit") return "credit";
  if (m.includes("débito") || m.includes("debito") || m === "debit") return "debit";
  if (m.includes("refeição") || m.includes("refeicao") || m.includes("alimentação") || m.includes("alimentacao") || m.includes("vale") || m === "voucher") return "mealVoucher";
  
  return "other";
}

/**
 * Determina o intervalo do turno atual da loja em Brasília
 */
export function resolveShiftBounds(tenantSettings, periodMode = "today", customRange = null) {
  if (customRange && customRange.start && customRange.end) {
    const s = new Date(customRange.start);
    const e = new Date(customRange.end);
    return {
      start: s,
      end: e,
      label: `Personalizado: ${formatInBrasilia(s, { includeSeconds: false })} até ${formatInBrasilia(e, { includeSeconds: false })}`,
      mode: "custom",
    };
  }

  const now = new Date();
  const nowParts = getBrasiliaParts(now);

  if (periodMode === "yesterday") {
    const yStart = new Date(now);
    yStart.setDate(yStart.getDate() - 1);
    yStart.setHours(0, 0, 0, 0);
    const yEnd = new Date(now);
    yEnd.setDate(yEnd.getDate() - 1);
    yEnd.setHours(23, 59, 59, 999);
    return {
      start: yStart,
      end: yEnd,
      label: `Ontem: ${formatInBrasilia(yStart, { includeTime: false })}`,
      mode: "yesterday",
    };
  }

  if (periodMode === "shift") {
    let openingHour = 18;
    let openingMinute = 0;

    if (tenantSettings?.opening_time) {
      const parts = tenantSettings.opening_time.split(":").map(Number);
      if (!isNaN(parts[0])) openingHour = parts[0];
      if (!isNaN(parts[1])) openingMinute = parts[1];
    }

    const shiftStart = new Date(now);
    // Se estamos de madrugada antes do horário de abertura, o turno começou no dia civil anterior
    if (nowParts.hour < openingHour) {
      shiftStart.setDate(shiftStart.getDate() - 1);
    }
    shiftStart.setHours(openingHour, openingMinute, 0, 0);

    const shiftEnd = new Date(now);
    return {
      start: shiftStart,
      end: shiftEnd,
      label: `Turno Noturno: ${formatInBrasilia(shiftStart, { includeSeconds: false })} até ${formatInBrasilia(shiftEnd, { includeSeconds: false })}`,
      mode: "shift",
    };
  }

  // DEFAULT: "today" (Hoje - Dia Completo desde 00:00 de hoje)
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date(now);

  const startFmt = formatInBrasilia(todayStart, { includeSeconds: false });
  const endFmt = formatInBrasilia(todayEnd, { includeSeconds: false });

  return {
    start: todayStart,
    end: todayEnd,
    label: `Hoje: ${startFmt} até ${endFmt}`,
    mode: "today",
  };
}

/**
 * Função principal de cálculo do Fechamento de Caixa
 */
export function calculateShiftClosing({
  orders = [],
  drivers = [],
  tenantSettings = null,
  periodMode = "today",
  customRange = null,
}) {
  const bounds = resolveShiftBounds(tenantSettings, periodMode, customRange);
  const startTime = bounds.start.getTime();
  const endTime = bounds.end.getTime();

  // Filtra pedidos pertencentes ao período
  const shiftOrders = orders.filter((order) => {
    if (!order?.created_date) return false;
    const orderTime = new Date(order.created_date).getTime();
    if (isNaN(orderTime)) return false;

    // Se for hoje ou turno atual, pedidos ativos (pendente, preparando, enviado)
    // são sempre mantidos para conferência
    if (bounds.mode !== "yesterday" && bounds.mode !== "custom" && ["pendente", "confirmado", "preparando", "enviado"].includes(order.status)) {
      return true;
    }

    return orderTime >= startTime && orderTime <= endTime;
  });

  // Métricas de Vendas
  let grossRevenue = 0;
  let totalOrdersCount = 0;
  let deliveryCount = 0;
  let counterCount = 0;
  let dineInCount = 0;
  let canceledCount = 0;
  let totalDeliveryFeesCollected = 0;

  // Formas de Pagamento
  const payments = {
    cash: { count: 0, total: 0, label: "Dinheiro (Gaveta)" },
    pix: { count: 0, total: 0, label: "PIX (Online / Máquina)" },
    credit: { count: 0, total: 0, label: "Cartão de Crédito" },
    debit: { count: 0, total: 0, label: "Cartão de Débito" },
    mealVoucher: { count: 0, total: 0, label: "Vale Refeição / Alimentação" },
    other: { count: 0, total: 0, label: "Outros / Cortesia" },
    total: 0,
  };

  // Mapa de motoboys para acerto financeiro
  const driverMap = new Map();
  // Registra primeiro os motoboys oficialmente cadastrados na loja
  const activeRegisteredDrivers = Array.isArray(drivers) ? drivers : [];
  for (const d of activeRegisteredDrivers) {
    if (d?.id) {
      driverMap.set(String(d.id), {
        id: String(d.id),
        name: d.name || "Entregador",
        vehicle: d.vehicle || "moto",
        feeType: d.fee_type || "per_order",
        feeValue: Number(d.fee_value !== undefined ? d.fee_value : 6.0),
        pixKey: d.pix_key || "",
        phone: d.phone || "",
        ordersCount: 0,
        tripsSet: new Set(),
        cashCollected: 0,
        feeEarned: 0,
        netBalance: 0,
        orders: [],
      });
    }
  }

  // Processa cada pedido do turno
  for (const order of shiftOrders) {
    const isCanceled = order.status === "cancelado";
    if (isCanceled) {
      canceledCount++;
      continue; // Cancelados não entram na receita nem nas taxas de motoboy
    }

    const orderAmount = Number(order.total_amount || order.total || 0);
    const deliveryFee = Number(order.delivery_fee || 0);
    const paymentMethodKey = normalizePaymentMethod(order.payment_method);

    grossRevenue += orderAmount;
    totalOrdersCount++;
    totalDeliveryFeesCollected += deliveryFee;

    // Segmentação por canal
    if (order.order_type === "delivery") {
      deliveryCount++;
    } else if (order.order_type === "takeout" || order.order_type === "balcao" || order.order_type === "pickup") {
      counterCount++;
    } else {
      dineInCount++;
    }

    // Agregação de pagamento
    if (payments[paymentMethodKey]) {
      payments[paymentMethodKey].count++;
      payments[paymentMethodKey].total += orderAmount;
      payments.total += orderAmount;
    } else {
      payments.other.count++;
      payments.other.total += orderAmount;
      payments.total += orderAmount;
    }

    // Reconciliação de Entregador (apenas pedidos enviados ou entregues com motoboy)
    const driverId = order.driver_id ? String(order.driver_id) : null;
    const driverName = order.driver_name || null;
    const isAssigned = (driverId && driverId !== "unassigned") || Boolean(driverName);

    if (isAssigned && ["enviado", "entregue"].includes(order.status)) {
      const mapKey = driverId || `name_${driverName}`;

      if (!driverMap.has(mapKey)) {
        // Entregador terceirizado ou adicionado avulso
        driverMap.set(mapKey, {
          id: driverId || mapKey,
          name: driverName || "Entregador Avulso",
          vehicle: "moto",
          feeType: "per_order",
          feeValue: 0,
          pixKey: "",
          phone: "",
          ordersCount: 0,
          tripsSet: new Set(),
          cashCollected: 0,
          feeEarned: 0,
          netBalance: 0,
          orders: [],
        });
      }

      const driverEntry = driverMap.get(mapKey);
      driverEntry.ordersCount++;
      driverEntry.orders.push(order);

      // Registra a viagem agrupada
      const tripId = order.trip_id || `single_${order.id}`;
      driverEntry.tripsSet.add(tripId);

      // Se o cliente pagou em dinheiro na entrega, o motoboy recebeu esse valor em mãos
      if (paymentMethodKey === "cash") {
        driverEntry.cashCollected += orderAmount;
      }
    }
  }

  // Calcula o valor devido a cada motoboy
  const driverList = [];
  let totalDriverFees = 0;
  let totalCashWithDrivers = 0;

  for (const entry of driverMap.values()) {
    const tripsCount = entry.tripsSet.size || entry.ordersCount;
    let feeEarned = 0;

    if (entry.feeType === "per_order") {
      feeEarned = entry.ordersCount * entry.feeValue;
    } else if (entry.feeType === "per_trip") {
      feeEarned = tripsCount * entry.feeValue;
    } else {
      feeEarned = 0; // Nenhum / Fixo
    }

    // Saldo: O que o motoboy tem a receber (taxa) menos o que ele tem a devolver ao caixa (dinheiro vivo dos clientes)
    const netBalance = feeEarned - entry.cashCollected;

    entry.tripsCount = tripsCount;
    entry.feeEarned = feeEarned;
    entry.netBalance = netBalance;

    // Apenas inclui motoboys que realizaram entregas nesta noite ou que estão cadastrados
    if (entry.ordersCount > 0 || activeRegisteredDrivers.some(d => String(d.id) === entry.id)) {
      driverList.push({
        driverId: entry.id,
        name: entry.name,
        vehicle: entry.vehicle,
        feeType: entry.feeType,
        feeValue: entry.feeValue,
        pixKey: entry.pixKey,
        phone: entry.phone,
        ordersCount: entry.ordersCount,
        tripsCount: entry.tripsCount,
        feeEarned: entry.feeEarned,
        cashCollected: entry.cashCollected,
        netBalance: entry.netBalance,
      });

      totalDriverFees += feeEarned;
      totalCashWithDrivers += entry.cashCollected;
    }
  }

  // Verifica se a loja tem entregadores cadastrados ou entregas atribuídas
  const hasDrivers = activeRegisteredDrivers.length > 0 || driverList.some(d => d.ordersCount > 0);

  // Análise da Gaveta de Dinheiro
  // Total de dinheiro esperado no caixa = vendas em dinheiro do turno
  // Dinheiro que veio de balcão/retirada (já na gaveta) + dinheiro devolvido pelos motoboys
  const totalCashSales = payments.cash.total;
  const cashDirectCounter = Math.max(0, totalCashSales - totalCashWithDrivers);

  const averageTicket = totalOrdersCount > 0 ? grossRevenue / totalOrdersCount : 0;

  return {
    bounds,
    summary: {
      grossRevenue,
      netRevenue: grossRevenue,
      totalOrders: totalOrdersCount,
      deliveryCount,
      counterCount,
      dineInCount,
      canceledCount,
      averageTicket,
      totalDeliveryFeesCollected,
    },
    payments,
    cashDrawer: {
      totalCashExpected: totalCashSales,
      cashDirectCounter,
      cashCollectedByDrivers: totalCashWithDrivers,
    },
    drivers: {
      hasDrivers,
      list: driverList,
      totalFeesToPay: totalDriverFees,
      totalCashToCollect: totalCashWithDrivers,
      netTotalToPayDrivers: totalDriverFees - totalCashWithDrivers,
    },
    shiftOrders,
  };
}

import { SHOW_DRIVER_CLOSING_SECTIONS } from "./shiftClosingCalculator";

/**
 * Formatador de Resumo de Fechamento de Caixa para WhatsApp
 * (shiftClosingWhatsAppFormatter.js)
 */

export function generateWhatsAppClosingText(closingData, storeName = "Restaurante") {
  if (!closingData) return "";

  const raw = closingData.raw_closing_data || closingData;
  const bounds = raw.bounds || { label: closingData.period_label || closingData.shift_date || "Turno" };
  const summary = raw.summary || {
    grossRevenue: closingData.gross_revenue || 0,
    totalOrders: closingData.total_orders || 0,
    deliveryCount: closingData.delivery_orders || 0,
    counterCount: closingData.counter_orders || 0,
    dineInCount: closingData.dine_in_orders || 0,
    averageTicket: closingData.average_ticket || 0,
    canceledCount: 0,
  };
  const payments = raw.payments || closingData.payment_breakdown || {
    cash: { total: 0, count: 0 },
    pix: { total: 0, count: 0 },
    credit: { total: 0, count: 0 },
    debit: { total: 0, count: 0 },
    mealVoucher: { total: 0, count: 0 },
    other: { total: 0, count: 0 },
  };
  const cashDrawer = raw.cashDrawer || closingData.cash_drawer || {};
  const drivers = raw.drivers || { hasDrivers: false, list: [] };

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const lines = [];
  const operator =
    cashDrawer.openedBy ||
    closingData.cashier_name ||
    raw.cashier_name ||
    null;

  // Cabeçalho
  lines.push(`🍔 *FECHAMENTO DE CAIXA - ${String(storeName).toUpperCase()}*`);
  lines.push(`📅 *Período:* ${bounds.label}`);
  if (operator) {
    lines.push(`👤 *Operador:* ${operator}${cashDrawer.blindClosing ? " _(Modo Cego)_" : ""}`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  // Resumo de Vendas
  lines.push(`📊 *RESUMO DAS VENDAS*`);
  lines.push(`• *Faturamento Bruto:* ${formatMoney(summary.grossRevenue)}`);
  lines.push(`• *Total de Pedidos:* ${summary.totalOrders}`);
  lines.push(`  🛵 Delivery: ${summary.deliveryCount}`);
  lines.push(`  🛍️ Balcão / Retirada: ${summary.counterCount}`);
  if (summary.dineInCount > 0) {
    lines.push(`  🍽️ Consumo no Local: ${summary.dineInCount}`);
  }
  lines.push(`• *Ticket Médio:* ${formatMoney(summary.averageTicket)}`);
  if (summary.canceledCount > 0) {
    lines.push(`• *Pedidos Cancelados:* ${summary.canceledCount}`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  // Divisão por Forma de Pagamento
  lines.push(`💳 *FORMAS DE PAGAMENTO*`);
  if (payments.cash.total > 0) {
    lines.push(`• 💵 Dinheiro: ${formatMoney(payments.cash.total)} (${payments.cash.count} pedidos)`);
  }
  if (payments.pix.total > 0) {
    lines.push(`• ⚡ PIX: ${formatMoney(payments.pix.total)} (${payments.pix.count} pedidos)`);
  }
  if (payments.credit.total > 0) {
    lines.push(`• 💳 Cartão de Crédito: ${formatMoney(payments.credit.total)} (${payments.credit.count} pedidos)`);
  }
  if (payments.debit.total > 0) {
    lines.push(`• 💳 Cartão de Débito: ${formatMoney(payments.debit.total)} (${payments.debit.count} pedidos)`);
  }
  if (payments.mealVoucher.total > 0) {
    lines.push(`• 🍽️ Vale Refeição: ${formatMoney(payments.mealVoucher.total)} (${payments.mealVoucher.count} pedidos)`);
  }
  if (payments.other.total > 0) {
    lines.push(`• 📝 Outros: ${formatMoney(payments.other.total)} (${payments.other.count} pedidos)`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  // Gaveta de Dinheiro
  const initialFloat = Number(cashDrawer.initialFloat ?? raw.initialFloat ?? 0);
  const cashSales = Number(cashDrawer.cashSales ?? cashDrawer.totalCashExpected ?? 0);
  const supplies = Number(cashDrawer.supplies ?? cashDrawer.totalSupplies ?? 0);
  const bleeds = Number(cashDrawer.bleeds ?? cashDrawer.totalBleeds ?? 0);
  const expenses = Number(cashDrawer.expenses ?? cashDrawer.totalExpenses ?? 0);
  const expectedInDrawer = Number(
    cashDrawer.expectedCashInDrawer ??
      cashDrawer.expectedInDrawer ??
      raw.expectedCashInDrawer ??
      cashDrawer.totalCashExpected ??
      0
  );
  const hasCounted = cashDrawer.countedCash !== undefined || raw.countedCash !== undefined;
  const countedCash = Number(cashDrawer.countedCash ?? raw.countedCash ?? expectedInDrawer);
  const diff = Number(cashDrawer.difference ?? raw.difference ?? (hasCounted ? countedCash - expectedInDrawer : 0));
  const justification = (cashDrawer.justification || raw.justification || "").trim();

  lines.push(`💰 *CONFERÊNCIA DA GAVETA (DINHEIRO)*`);
  if (cashDrawer.initialFloat !== undefined || raw.initialFloat !== undefined) {
    lines.push(`• (+) Troco Inicial: ${formatMoney(initialFloat)}`);
  }
  lines.push(`• (+) Vendas em Dinheiro: ${formatMoney(cashSales)}`);
  if (supplies > 0) lines.push(`• (+) Suprimentos: +${formatMoney(supplies)}`);
  if (bleeds > 0) lines.push(`• (-) Sangrias: -${formatMoney(bleeds)}`);
  if (expenses > 0) lines.push(`• (-) Despesas do Caixa: -${formatMoney(expenses)}`);
  lines.push(`• *Esperado na Gaveta:* ${formatMoney(expectedInDrawer)}`);
  if (hasCounted) {
    lines.push(`• *Contado na Gaveta:* ${formatMoney(countedCash)}`);
    if (Math.abs(diff) < 0.01) {
      lines.push(`• ✅ *Conferência:* R$ 0,00 (CAIXA EXATO)`);
    } else if (diff > 0) {
      lines.push(`• 🔵 *Conferência:* +${formatMoney(diff)} (SOBRA)`);
    } else {
      lines.push(`• 🔴 *Conferência:* -${formatMoney(Math.abs(diff))} (FALTA / QUEBRA)`);
    }
  }
  if (justification) {
    lines.push(`• 📝 *Justificativa:* "${justification}"`);
  }
  if (SHOW_DRIVER_CLOSING_SECTIONS && drivers.hasDrivers && cashDrawer.cashCollectedByDrivers > 0) {
    lines.push(`  ↳ Balcão/Direto: ${formatMoney(cashDrawer.cashDirectCounter)}`);
    lines.push(`  ↳ A Receber dos Motoboys: ${formatMoney(cashDrawer.cashCollectedByDrivers)}`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  // Se houver entregadores, exibe o extrato
  if (SHOW_DRIVER_CLOSING_SECTIONS && drivers.hasDrivers && drivers.list.length > 0) {
    lines.push(`🛵 *ACERTO DOS ENTREGADORES*`);

    for (const d of drivers.list) {
      if (d.ordersCount === 0 && d.feeEarned === 0) continue;
      lines.push(`\n👤 *${d.name}*`);
      lines.push(`  • Entregas: ${d.ordersCount} | Saídas: ${d.tripsCount}`);
      lines.push(`  • Taxa a Receber: ${formatMoney(d.feeEarned)}`);
      lines.push(`  • Dinheiro em Mãos: ${formatMoney(d.cashCollected)}`);

      if (d.netBalance > 0) {
        lines.push(`  🟢 *Pagar ao Motoboy:* ${formatMoney(d.netBalance)}`);
        if (d.pixKey) lines.push(`    Pix: ${d.pixKey}`);
      } else if (d.netBalance < 0) {
        lines.push(`  🔴 *Motoboy Devolve ao Caixa:* ${formatMoney(Math.abs(d.netBalance))}`);
      } else {
        lines.push(`  ⚪ *Saldo Quitado (R$ 0,00)*`);
      }
    }
    lines.push(`\n━━━━━━━━━━━━━━━━━━━━━`);
  }

  lines.push(`✅ _Fechamento gerado automaticamente pelo Sistema Delivery_`);

  return lines.join("\n");
}

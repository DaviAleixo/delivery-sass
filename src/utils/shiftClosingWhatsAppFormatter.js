/**
 * Formatador de Resumo de Fechamento de Caixa para WhatsApp
 * (shiftClosingWhatsAppFormatter.js)
 */

export function generateWhatsAppClosingText(closingData, storeName = "Restaurante") {
  if (!closingData) return "";

  const { bounds, summary, payments, cashDrawer, drivers } = closingData;
  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const lines = [];

  // Cabeçalho
  lines.push(`🍔 *FECHAMENTO DE CAIXA - ${String(storeName).toUpperCase()}*`);
  lines.push(`📅 *Período:* ${bounds.label}`);
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
  lines.push(`💰 *CONFERÊNCIA DA GAVETA (DINHEIRO)*`);
  lines.push(`• *Total Esperado no Caixa:* ${formatMoney(cashDrawer.totalCashExpected)}`);
  if (drivers.hasDrivers && cashDrawer.cashCollectedByDrivers > 0) {
    lines.push(`  ↳ Balcão/Direto: ${formatMoney(cashDrawer.cashDirectCounter)}`);
    lines.push(`  ↳ A Receber dos Motoboys: ${formatMoney(cashDrawer.cashCollectedByDrivers)}`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  // Se houver entregadores, exibe o extrato
  if (drivers.hasDrivers && drivers.list.length > 0) {
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

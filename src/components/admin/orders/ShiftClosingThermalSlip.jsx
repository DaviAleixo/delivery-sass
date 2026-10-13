import React from "react";

export default function ShiftClosingThermalSlip({ closingData, storeName = "Restaurante", cashierName = "Operador" }) {
  if (!closingData) return null;

  const { bounds, summary, payments, cashDrawer, drivers } = closingData;
  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  return (
    <div className="receipt-copy w-full max-w-[300px] text-black font-sans text-xs select-none">
      {/* Cabeçalho */}
      <div className="text-center pb-2 border-b-2 border-dashed border-black">
        <h1 className="text-base font-black uppercase tracking-tight leading-tight">
          {storeName}
        </h1>
        <p className="text-[11px] font-black uppercase tracking-widest mt-0.5">
          FECHAMENTO DE CAIXA
        </p>
        <p className="text-[10px] font-semibold text-black mt-1">
          {bounds.label}
        </p>
        <p className="text-[10px] text-black">
          Operador: <b>{cashierName}</b>
        </p>
      </div>

      {/* Resumo de Vendas */}
      <div className="py-2.5 border-b border-dashed border-black space-y-1">
        <div className="text-[11px] font-black uppercase tracking-wider mb-1">
          RESUMO OPERACIONAL
        </div>
        <div className="flex justify-between font-extrabold text-sm">
          <span>FATURAMENTO TOTAL:</span>
          <span>{formatMoney(summary.grossRevenue)}</span>
        </div>
        <div className="flex justify-between text-xs font-semibold">
          <span>Total de Pedidos:</span>
          <span>{summary.totalOrders}</span>
        </div>
        <div className="flex justify-between text-[11px] pl-2 font-medium">
          <span>↳ Delivery (Entrega):</span>
          <span>{summary.deliveryCount}</span>
        </div>
        <div className="flex justify-between text-[11px] pl-2 font-medium">
          <span>↳ Balcão / Retirada:</span>
          <span>{summary.counterCount}</span>
        </div>
        {summary.dineInCount > 0 && (
          <div className="flex justify-between text-[11px] pl-2 font-medium">
            <span>↳ Mesa / Consumo:</span>
            <span>{summary.dineInCount}</span>
          </div>
        )}
        <div className="flex justify-between text-xs font-semibold pt-0.5">
          <span>Ticket Médio:</span>
          <span>{formatMoney(summary.averageTicket)}</span>
        </div>
        {summary.canceledCount > 0 && (
          <div className="flex justify-between text-xs font-semibold text-black">
            <span>Cancelados (não somados):</span>
            <span>{summary.canceledCount}</span>
          </div>
        )}
      </div>

      {/* Formas de Pagamento */}
      <div className="py-2.5 border-b border-dashed border-black space-y-1">
        <div className="text-[11px] font-black uppercase tracking-wider mb-1">
          FORMAS DE PAGAMENTO
        </div>
        {payments.cash.total > 0 && (
          <div className="flex justify-between text-xs font-bold">
            <span>DINHEIRO (GAVETA):</span>
            <span>{formatMoney(payments.cash.total)}</span>
          </div>
        )}
        {payments.pix.total > 0 && (
          <div className="flex justify-between text-xs font-bold">
            <span>PIX:</span>
            <span>{formatMoney(payments.pix.total)}</span>
          </div>
        )}
        {payments.credit.total > 0 && (
          <div className="flex justify-between text-xs font-semibold">
            <span>Cartão de Crédito:</span>
            <span>{formatMoney(payments.credit.total)}</span>
          </div>
        )}
        {payments.debit.total > 0 && (
          <div className="flex justify-between text-xs font-semibold">
            <span>Cartão de Débito:</span>
            <span>{formatMoney(payments.debit.total)}</span>
          </div>
        )}
        {payments.mealVoucher.total > 0 && (
          <div className="flex justify-between text-xs font-semibold">
            <span>Vale Refeição:</span>
            <span>{formatMoney(payments.mealVoucher.total)}</span>
          </div>
        )}
        {payments.other.total > 0 && (
          <div className="flex justify-between text-xs font-semibold">
            <span>Outros:</span>
            <span>{formatMoney(payments.other.total)}</span>
          </div>
        )}
      </div>

      {/* Conferência da Gaveta de Dinheiro */}
      <div className="py-2.5 border-b border-dashed border-black space-y-1">
        <div className="text-[11px] font-black uppercase tracking-wider mb-1">
          CONFERÊNCIA DA GAVETA
        </div>
        <div className="flex justify-between font-black text-xs">
          <span>TOTAL ESPERADO EM DINHEIRO:</span>
          <span>{formatMoney(cashDrawer.totalCashExpected)}</span>
        </div>
        {drivers.hasDrivers && cashDrawer.cashCollectedByDrivers > 0 && (
          <>
            <div className="flex justify-between text-[11px] pl-2 font-medium">
              <span>↳ Balcão / Caixa Direto:</span>
              <span>{formatMoney(cashDrawer.cashDirectCounter)}</span>
            </div>
            <div className="flex justify-between text-[11px] pl-2 font-medium">
              <span>↳ A Receber dos Motoboys:</span>
              <span>{formatMoney(cashDrawer.cashCollectedByDrivers)}</span>
            </div>
          </>
        )}
      </div>

      {/* Bloco Adaptativo de Motoboys (Apenas se houver entregadores) */}
      {drivers.hasDrivers && drivers.list.length > 0 && (
        <div className="py-2.5 border-b-2 border-dashed border-black space-y-2">
          <div className="text-[11px] font-black uppercase tracking-wider">
            ACERTO DE ENTREGADORES
          </div>

          {drivers.list.map((d) => {
            if (d.ordersCount === 0 && d.feeEarned === 0) return null;

            return (
              <div key={d.driverId} className="border-t border-dotted border-black pt-1.5 space-y-0.5 text-[11px]">
                <div className="font-black text-xs uppercase flex justify-between">
                  <span>{d.name}</span>
                  <span>{d.ordersCount} ent. / {d.tripsCount} saídas</span>
                </div>
                <div className="flex justify-between">
                  <span>Taxa devida:</span>
                  <span className="font-bold">{formatMoney(d.feeEarned)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Dinheiro recolhido na rua:</span>
                  <span className="font-bold">{formatMoney(d.cashCollected)}</span>
                </div>
                <div className="flex justify-between font-black text-xs pt-0.5 border-t border-dotted border-black">
                  <span>
                    {d.netBalance > 0
                      ? "PAGAR AO MOTOBOY:"
                      : d.netBalance < 0
                      ? "MOTOBOY DEVOLVE:"
                      : "SALDO QUITADO:"}
                  </span>
                  <span>{formatMoney(Math.abs(d.netBalance))}</span>
                </div>
                {d.pixKey && (
                  <div className="text-[10px] text-black italic">
                    Chave Pix: {d.pixKey}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assinaturas */}
      <div className="pt-6 pb-2 text-center space-y-6">
        <div>
          <div className="border-t border-black w-48 mx-auto mb-1"></div>
          <span className="text-[10px] font-bold uppercase tracking-wider">
            Assinatura do Caixa
          </span>
        </div>

        <div>
          <div className="border-t border-black w-48 mx-auto mb-1"></div>
          <span className="text-[10px] font-bold uppercase tracking-wider">
            Conferência / Gerente
          </span>
        </div>

        <div className="text-[9px] font-mono text-black pt-2">
          {new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </div>
      </div>
    </div>
  );
}

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Printer,
  MessageSquare,
  Clock,
  User,
  Wallet,
  EyeOff,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

const MOVEMENT_TYPE_LABELS = {
  open: "Abertura",
  supply: "Suprimento",
  bleed: "Sangria",
  expense: "Despesa",
};

export default function CashClosingAuditModal({
  isOpen,
  onClose,
  closing = null,
  onPrint = null,
  onCopyWhatsApp = null,
}) {
  if (!closing) return null;

  const formatMoney = (val) => `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const raw = closing.raw_closing_data || {};
  const cashDrawer = closing.cash_drawer || raw.cashDrawer || {};
  const payments = closing.payment_breakdown || raw.payments || {};

  const initialFloat = Number(cashDrawer.initialFloat ?? 0);
  const cashSales = Number(cashDrawer.cashSales ?? cashDrawer.totalCashSales ?? 0);
  const supplies = Number(cashDrawer.supplies ?? 0);
  const bleeds = Number(cashDrawer.bleeds ?? 0);
  const expenses = Number(cashDrawer.expenses ?? 0);
  const expectedCash = Number(
    cashDrawer.expectedCashInDrawer ?? cashDrawer.totalCashExpected ?? 0
  );
  const hasCounted = cashDrawer.countedCash !== undefined && cashDrawer.countedCash !== null;
  const countedCash = hasCounted ? Number(cashDrawer.countedCash) : expectedCash;
  const diff = Number(cashDrawer.difference ?? (hasCounted ? countedCash - expectedCash : 0));

  const isExact = Math.abs(diff) < 0.01;
  const isSurplus = diff > 0.01;
  const _isShortage = diff < -0.01;

  const movements = Array.isArray(cashDrawer.movements) ? cashDrawer.movements : [];
  const openedBy = cashDrawer.openedBy || closing.cashier_name || "Operador";
  const closedBy = cashDrawer.closedBy || closing.cashier_name || "Operador";
  const justification = (cashDrawer.justification || "").trim();
  const isBlind = Boolean(cashDrawer.blindClosing);

  const openedAtLabel = closing.opened_at
    ? new Date(closing.opened_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "—";
  const closedAtLabel = closing.closed_at || closing.created_at
    ? new Date(closing.closed_at || closing.created_at).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 border-0 shadow-2xl rounded-xl">
        <DialogHeader className="p-5 bg-stone-900 text-white border-b border-stone-800">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                Raio-X Auditável do Turno
              </DialogTitle>
              <p className="text-xs text-stone-300 mt-1">
                {closing.period_label || closing.shift_date}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isBlind && (
                <Badge className="bg-stone-800 text-stone-200 border border-stone-700 text-[10px] font-semibold">
                  <EyeOff className="w-3 h-3 mr-1" /> Fechamento Cego
                </Badge>
              )}
              {isExact ? (
                <Badge className="bg-emerald-600 text-white border-0 text-[11px] font-bold">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Caixa Exato
                </Badge>
              ) : isSurplus ? (
                <Badge className="bg-blue-600 text-white border-0 text-[11px] font-bold">
                  +{formatMoney(diff)} (Sobra)
                </Badge>
              ) : (
                <Badge className="bg-rose-600 text-white border-0 text-[11px] font-bold">
                  -{formatMoney(Math.abs(diff))} (Falta)
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-5 bg-white">
          {/* Responsáveis & Horários */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Abertura do Caixa
              </span>
              <p className="font-bold text-stone-900">{openedAtLabel}</p>
              <p className="text-stone-600 flex items-center gap-1">
                <User className="w-3 h-3 text-stone-400" /> Por: <b>{openedBy}</b>
              </p>
            </div>
            <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Encerramento do Caixa
              </span>
              <p className="font-bold text-stone-900">{closedAtLabel}</p>
              <p className="text-stone-600 flex items-center gap-1">
                <User className="w-3 h-3 text-stone-400" /> Por: <b>{closedBy}</b>
              </p>
            </div>
          </div>

          {/* Alerta de Divergência + Justificativa Completa */}
          <div
            className={`p-4 rounded-xl border ${
              isExact
                ? "bg-emerald-50/70 border-emerald-200"
                : isSurplus
                ? "bg-blue-50/70 border-blue-200"
                : "bg-rose-50/80 border-rose-200"
            }`}
          >
            <div className="flex items-start gap-3">
              {isExact ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    isSurplus ? "text-blue-700" : "text-rose-700"
                  }`}
                />
              )}
              <div className="space-y-2 flex-1">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] uppercase text-stone-500 block">Esperado Sistema</span>
                    <span className="font-mono font-bold text-stone-900">{formatMoney(expectedCash)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-stone-500 block">Contado Operador</span>
                    <span className="font-mono font-bold text-stone-900">
                      {hasCounted ? formatMoney(countedCash) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-stone-500 block">Diferença</span>
                    <span
                      className={`font-mono font-extrabold ${
                        isExact
                          ? "text-emerald-700"
                          : isSurplus
                          ? "text-blue-700"
                          : "text-rose-700"
                      }`}
                    >
                      {isExact
                        ? "R$ 0,00 (Exato)"
                        : isSurplus
                        ? `+${formatMoney(diff)} (Sobra)`
                        : `-${formatMoney(Math.abs(diff))} (Falta)`}
                    </span>
                  </div>
                </div>

                {justification && (
                  <div className="bg-white/90 border border-stone-200 rounded-lg p-2.5 text-xs text-stone-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block mb-0.5">
                      Justificativa Registrada pelo Caixa
                    </span>
                    <p className="whitespace-pre-wrap leading-relaxed font-medium">
                      "{justification}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Composição da Gaveta & Faturamento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-stone-200 rounded-xl p-3.5 space-y-2 text-xs">
              <h4 className="font-bold text-stone-800 flex items-center gap-1.5 border-b border-stone-100 pb-2">
                <Wallet className="w-3.5 h-3.5 text-emerald-700" />
                Memória de Cálculo da Gaveta
              </h4>
              <div className="flex justify-between">
                <span className="text-stone-600">(+) Troco Inicial</span>
                <span className="font-mono font-semibold">{formatMoney(initialFloat)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>(+) Vendas em Dinheiro</span>
                <span className="font-mono font-semibold">+{formatMoney(cashSales)}</span>
              </div>
              <div className="flex justify-between text-blue-700">
                <span>(+) Suprimentos</span>
                <span className="font-mono font-semibold">+{formatMoney(supplies)}</span>
              </div>
              <div className="flex justify-between text-amber-700">
                <span>(-) Sangrias</span>
                <span className="font-mono font-semibold">-{formatMoney(bleeds)}</span>
              </div>
              <div className="flex justify-between text-rose-700">
                <span>(-) Despesas do Caixa</span>
                <span className="font-mono font-semibold">-{formatMoney(expenses)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-stone-200 font-bold text-stone-900">
                <span>(=) Esperado na Gaveta</span>
                <span className="font-mono">{formatMoney(expectedCash)}</span>
              </div>
            </div>

            <div className="border border-stone-200 rounded-xl p-3.5 space-y-2 text-xs">
              <h4 className="font-bold text-stone-800 flex items-center gap-1.5 border-b border-stone-100 pb-2">
                <Receipt className="w-3.5 h-3.5 text-stone-700" />
                Resumo de Vendas do Turno
              </h4>
              <div className="flex justify-between">
                <span className="text-stone-600">Total de Pedidos</span>
                <span className="font-bold">
                  {closing.total_orders ?? 0} ({closing.delivery_orders ?? 0} deliv •{" "}
                  {closing.counter_orders ?? 0} balcão • {closing.dine_in_orders ?? 0} mesa)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Dinheiro</span>
                <span className="font-mono font-semibold">{formatMoney(payments.cash?.total ?? cashSales)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">PIX</span>
                <span className="font-mono font-semibold">{formatMoney(payments.pix?.total ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Cartão Crédito</span>
                <span className="font-mono font-semibold">{formatMoney(payments.credit?.total ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Cartão Débito</span>
                <span className="font-mono font-semibold">{formatMoney(payments.debit?.total ?? 0)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-stone-200 font-bold text-stone-900">
                <span>Faturamento Bruto</span>
                <span className="font-mono">{formatMoney(closing.gross_revenue ?? 0)}</span>
              </div>
            </div>
          </div>

          {/* Extrato Cronológico de Movimentações */}
          <div className="border border-stone-200 rounded-xl overflow-hidden">
            <div className="bg-stone-50 px-3.5 py-2 border-b border-stone-200 flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800">
                Movimentações da Gaveta ({movements.length})
              </span>
            </div>
            {movements.length === 0 ? (
              <p className="p-4 text-xs text-stone-400 text-center">
                Nenhuma movimentação manual registrada neste fechamento.
              </p>
            ) : (
              <div className="divide-y divide-stone-100 max-h-56 overflow-y-auto">
                {movements.map((mov, i) => {
                  const isIn = mov.direction === "in" || mov.type === "open" || mov.type === "supply";
                  return (
                    <div
                      key={mov.id || i}
                      className="px-3.5 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                            isIn ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {isIn ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-stone-800 truncate">
                            {MOVEMENT_TYPE_LABELS[mov.type] || mov.type}: {mov.title}
                          </p>
                          <p className="text-[10px] text-stone-400">
                            {mov.operator || mov.operator_name || openedBy} •{" "}
                            {mov.createdAt || mov.created_at
                              ? new Date(mov.createdAt || mov.created_at).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                            {mov.notes ? ` • "${mov.notes}"` : ""}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`font-mono font-bold shrink-0 ${
                          isIn ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {isIn ? "+" : "-"}
                        {formatMoney(mov.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-4 bg-stone-50 border-t border-stone-200 flex flex-wrap sm:justify-between gap-2">
          <div className="flex gap-2">
            {onPrint && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onPrint(closing)}
                className="text-xs font-semibold"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" /> Imprimir Cupom
              </Button>
            )}
            {onCopyWhatsApp && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onCopyWhatsApp(closing)}
                className="text-xs font-semibold text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              >
                <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Copiar WhatsApp
              </Button>
            )}
          </div>
          <Button type="button" onClick={onClose} className="bg-stone-900 text-white text-xs font-semibold">
            Fechar Raio-X
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


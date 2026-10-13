import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Receipt,
  Printer,
  Share2,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Bike,
  Copy,
  CheckCircle2,
  AlertCircle,
  Coins,
  ArrowRight,
  Wallet,
  Clock,
  Sparkles,
  Save,
} from "lucide-react";
import { generateWhatsAppClosingText } from "@/utils/shiftClosingWhatsAppFormatter";
import { calculateShiftClosing, getStoreShiftInfo } from "@/utils/shiftClosingCalculator";
import { ShiftClosing } from "@/entities/ShiftClosing";
import { getBrasiliaParts } from "@/utils/dateTime";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

export default function ShiftClosingModal({
  isOpen,
  onClose,
  orders = [],
  drivers: registeredDrivers = [],
  tenantSettings = null,
  closingData: initialClosingData = null,
  storeName = "Restaurante",
  readOnly = false,
  onClosingSaved = null,
}) {
  const [periodMode, setPeriodMode] = useState("today");
  const [copiedPixId, setCopiedPixId] = useState(null);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

  const shiftInfo = React.useMemo(
    () => getStoreShiftInfo(tenantSettings),
    [tenantSettings]
  );

  const closingData = React.useMemo(() => {
    if (orders && orders.length > 0) {
      return calculateShiftClosing({
        orders,
        drivers: registeredDrivers,
        tenantSettings,
        periodMode,
      });
    }
    return initialClosingData;
  }, [orders, registeredDrivers, tenantSettings, periodMode, initialClosingData]);

  if (!closingData) return null;

  const { bounds, summary, payments, cashDrawer, drivers } = closingData;

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  // Salva o fechamento na tabela shift_closings
  const handleSaveClosing = async () => {
    if (isSaving || hasSaved) return;
    setIsSaving(true);
    try {
      const activeTenantId = tenantSettings?.id || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";
      const shiftDate = bounds?.start ? getBrasiliaParts(bounds.start).dateKey : getBrasiliaParts(new Date()).dateKey;

      const payload = {
        tenant_id: activeTenantId,
        shift_date: shiftDate,
        period_mode: bounds?.mode || periodMode,
        period_label: bounds?.label || "Turno",
        opened_at: bounds?.start ? bounds.start.toISOString() : new Date().toISOString(),
        closed_at: bounds?.end ? bounds.end.toISOString() : new Date().toISOString(),
        cashier_name: "Operador",
        gross_revenue: summary.grossRevenue,
        net_revenue: summary.netRevenue,
        total_orders: summary.totalOrders,
        delivery_orders: summary.deliveryCount,
        counter_orders: summary.counterCount,
        dine_in_orders: summary.dineInCount,
        average_ticket: summary.averageTicket,
        payment_breakdown: payments,
        cash_drawer: cashDrawer,
        driver_settlements: drivers?.settlements || [],
        raw_closing_data: closingData,
      };

      await ShiftClosing.create(payload);
      setHasSaved(true);
      toast.success("Fechamento de Caixa salvo com sucesso!", {
        description: `Gravado no histórico de fechamentos (${bounds?.label || ""}).`,
      });
      if (typeof onClosingSaved === "function") {
        onClosingSaved(payload);
      }
    } catch (err) {
      console.error("[ShiftClosingModal] Erro ao salvar fechamento:", err);
      toast.error("Erro ao salvar o fechamento. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  // Copia a chave Pix do motoboy
  const handleCopyPix = (driver) => {
    if (!driver.pixKey) {
      toast.info("Este entregador não possui chave Pix cadastrada.");
      return;
    }
    navigator.clipboard.writeText(driver.pixKey);
    setCopiedPixId(driver.driverId);
    toast.success(`Chave Pix de ${driver.name} copiada!`);
    setTimeout(() => setCopiedPixId(null), 2500);
  };

  // Copia texto formatado para o WhatsApp
  const handleCopyWhatsApp = () => {
    const text = generateWhatsAppClosingText(closingData, storeName);
    navigator.clipboard.writeText(text);
    setCopiedWhatsApp(true);
    toast.success("Resumo do fechamento copiado!", {
      description: "Pronto para colar na conversa do WhatsApp do dono.",
    });
    setTimeout(() => setCopiedWhatsApp(false), 2500);
  };

  // Abre a impressão térmica
  const handlePrint = () => {
    try {
      sessionStorage.setItem(
        "shift_closing_print_data",
        JSON.stringify(closingData)
      );
      sessionStorage.setItem("current_tenant_name", storeName);
      window.open(createPageUrl("PrintShiftClosing"), "_blank");
    } catch (err) {
      console.error("[ShiftClosingModal] Erro ao abrir impressão:", err);
      window.print();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-5 sm:p-7 rounded-3xl bg-white shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Cabeçalho */}
        <DialogHeader className="pb-3 border-b border-stone-100 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-xl font-black text-stone-900 flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-500 text-white flex items-center justify-center shadow-md">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <span className="block leading-tight">Fechamento de Caixa do Turno</span>
                <span className="text-xs font-bold text-stone-400 font-normal">
                  {storeName} • Raio-X Financeiro & Operacional
                </span>
              </div>
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Barra de Filtro de Período (Hoje, Turno da Loja, Ontem) */}
        {!readOnly ? (
          <div className="py-2.5 px-0.5 space-y-2 border-b border-stone-100 flex-shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-2xl border border-stone-200">
                <button
                  type="button"
                  onClick={() => setPeriodMode("today")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    periodMode === "today"
                      ? "bg-white text-stone-900 shadow-sm"
                      : "text-stone-500 hover:text-stone-900"
                  }`}
                  title="Padrão recomendado para lojas de turno único (só dia ou só noite). Pega 100% dos pedidos de hoje."
                >
                  📅 Hoje (Dia Todo)
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodMode("shift")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    periodMode === "shift"
                      ? "bg-white text-stone-900 shadow-sm"
                      : "text-stone-500 hover:text-stone-900"
                  }`}
                  title="Filtra a partir do horário programado de abertura para o expediente da loja."
                >
                  {shiftInfo.label}
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodMode("yesterday")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    periodMode === "yesterday"
                      ? "bg-white text-stone-900 shadow-sm"
                      : "text-stone-500 hover:text-stone-900"
                  }`}
                  title="Caixa do dia/turno anterior"
                >
                  🗓️ Ontem
                </button>
              </div>

              <Badge
                variant="outline"
                className="bg-stone-50 text-stone-700 border-stone-200 text-[11px] font-bold px-2.5 py-1 flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5 text-stone-500" />
                <span>{bounds.label}</span>
              </Badge>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-stone-500 px-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              <span>
                <b>Flexibilidade de Turno:</b> Para a maioria das lojas que trabalham em período único (só dia ou só noite), <b>Hoje (Dia Todo)</b> garante que 100% dos pedidos sejam apurados. O modo <b>{shiftInfo.label}</b> filtra a partir da abertura oficial.
              </span>
            </div>
          </div>
        ) : (
          <div className="py-2.5 px-0.5 flex items-center justify-between border-b border-stone-100 flex-shrink-0">
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-bold px-3 py-1 text-xs">
              🔒 Registro Histórico Salvo
            </Badge>
            <Badge variant="outline" className="bg-stone-50 text-stone-700 border-stone-200 text-[11px] font-bold px-2.5 py-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-500" />
              <span>{bounds?.label || "Período Fechado"}</span>
            </Badge>
          </div>
        )}

        {/* Conteúdo com rolagem suave */}
        <div className="overflow-y-auto py-4 space-y-6 flex-1 pr-1">
          {/* 1. KPIs Principais */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-50 to-orange-50/60 border border-rose-200/80">
              <div className="text-xs font-black uppercase tracking-wider text-rose-700 flex items-center justify-between">
                <span>Faturamento</span>
                <TrendingUp className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 mt-1">
                {formatMoney(summary.grossRevenue)}
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                {summary.totalOrders} pedidos confirmados
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50/60 border border-emerald-200/80">
              <div className="text-xs font-black uppercase tracking-wider text-emerald-700 flex items-center justify-between">
                <span>Gaveta (Dinheiro)</span>
                <Coins className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 mt-1">
                {formatMoney(cashDrawer.totalCashExpected)}
              </div>
              <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                Valor físico esperado
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50/60 border border-blue-200/80">
              <div className="text-xs font-black uppercase tracking-wider text-blue-700 flex items-center justify-between">
                <span>Pedidos / Canal</span>
                <ShoppingBag className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 mt-1">
                {summary.totalOrders}
              </div>
              <p className="text-[11px] text-stone-600 mt-0.5">
                🛵 {summary.deliveryCount} Deliv. • 🛍️ {summary.counterCount} Balcão
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200">
              <div className="text-xs font-black uppercase tracking-wider text-stone-600 flex items-center justify-between">
                <span>Ticket Médio</span>
                <DollarSign className="w-4 h-4 text-stone-500" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 mt-1">
                {formatMoney(summary.averageTicket)}
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Média por comanda
              </p>
            </div>
          </div>

          {/* 2. Grid Duplo: Formas de Pagamento & Gaveta de Dinheiro */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Formas de Pagamento */}
            <div className="p-4 sm:p-5 rounded-2xl border border-stone-200 bg-white space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-stone-600" />
                  <h4 className="font-extrabold text-sm text-stone-900">
                    Formas de Pagamento
                  </h4>
                </div>
                <span className="text-xs font-bold text-stone-400">
                  Total: {formatMoney(payments.total)}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-stone-50">
                  <span className="font-medium text-stone-700 flex items-center gap-2">
                    💵 Dinheiro:
                  </span>
                  <div className="text-right">
                    <span className="font-bold text-stone-900">
                      {formatMoney(payments.cash.total)}
                    </span>
                    <span className="text-[10px] text-stone-400 ml-1.5">
                      ({payments.cash.count})
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-stone-50">
                  <span className="font-medium text-stone-700 flex items-center gap-2">
                    ⚡ PIX (Online / Máq):
                  </span>
                  <div className="text-right">
                    <span className="font-bold text-stone-900">
                      {formatMoney(payments.pix.total)}
                    </span>
                    <span className="text-[10px] text-stone-400 ml-1.5">
                      ({payments.pix.count})
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-stone-50">
                  <span className="font-medium text-stone-700 flex items-center gap-2">
                    💳 Cartão de Crédito:
                  </span>
                  <div className="text-right">
                    <span className="font-bold text-stone-900">
                      {formatMoney(payments.credit.total)}
                    </span>
                    <span className="text-[10px] text-stone-400 ml-1.5">
                      ({payments.credit.count})
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-stone-50">
                  <span className="font-medium text-stone-700 flex items-center gap-2">
                    💳 Cartão de Débito:
                  </span>
                  <div className="text-right">
                    <span className="font-bold text-stone-900">
                      {formatMoney(payments.debit.total)}
                    </span>
                    <span className="text-[10px] text-stone-400 ml-1.5">
                      ({payments.debit.count})
                    </span>
                  </div>
                </div>

                {payments.mealVoucher.total > 0 && (
                  <div className="flex items-center justify-between py-1 border-b border-stone-50">
                    <span className="font-medium text-stone-700 flex items-center gap-2">
                      🍽️ Vale Refeição:
                    </span>
                    <div className="text-right">
                      <span className="font-bold text-stone-900">
                        {formatMoney(payments.mealVoucher.total)}
                      </span>
                      <span className="text-[10px] text-stone-400 ml-1.5">
                        ({payments.mealVoucher.count})
                      </span>
                    </div>
                  </div>
                )}

                {payments.other.total > 0 && (
                  <div className="flex items-center justify-between py-1">
                    <span className="font-medium text-stone-700 flex items-center gap-2">
                      📝 Outros:
                    </span>
                    <div className="text-right">
                      <span className="font-bold text-stone-900">
                        {formatMoney(payments.other.total)}
                      </span>
                      <span className="text-[10px] text-stone-400 ml-1.5">
                        ({payments.other.count})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Conferência da Gaveta de Dinheiro */}
            <div className="p-4 sm:p-5 rounded-2xl border border-stone-200 bg-white space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-extrabold text-sm text-stone-900">
                    Conferência da Gaveta de Dinheiro
                  </h4>
                </div>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                    Total Físico Esperado no Caixa
                  </span>
                  <div className="text-xl font-black text-emerald-950 mt-0.5">
                    {formatMoney(cashDrawer.totalCashExpected)}
                  </div>
                  <p className="text-[10px] text-emerald-700 mt-1">
                    Conte as cédulas e moedas da gaveta. Deve bater exatamente com este valor.
                  </p>
                </div>

                {drivers.hasDrivers && cashDrawer.cashCollectedByDrivers > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-stone-600">
                      <span>• Balcão / Entrada Direta no Caixa:</span>
                      <span className="font-bold text-stone-900">
                        {formatMoney(cashDrawer.cashDirectCounter)}
                      </span>
                    </div>
                    <div className="flex justify-between text-amber-800 bg-amber-50 p-2 rounded-lg font-medium">
                      <span>• A Recolher dos Motoboys (em mãos):</span>
                      <span className="font-black text-amber-900">
                        {formatMoney(cashDrawer.cashCollectedByDrivers)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-stone-500 pt-1">
                    ✓ Todos os pagamentos em dinheiro foram feitos diretamente no caixa físico.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 3. Seção Adaptativa de Entregadores */}
          {drivers.hasDrivers ? (
            <div className="p-4 sm:p-5 rounded-2xl border border-orange-200/90 bg-orange-50/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-orange-200/60 pb-2">
                <div className="flex items-center gap-2">
                  <Bike className="w-4 h-4 text-orange-600" />
                  <h4 className="font-extrabold text-sm text-stone-900">
                    Acerto de Contas dos Entregadores
                  </h4>
                  <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300 text-[10px] font-extrabold">
                    {drivers.list.length} Motoboys
                  </Badge>
                </div>

                <div className="text-xs font-semibold text-stone-600">
                  Total de taxas a pagar: <b>{formatMoney(drivers.totalFeesToPay)}</b>
                </div>
              </div>

              {drivers.list.length === 0 ? (
                <p className="text-xs text-stone-500 py-3 text-center">
                  Nenhuma entrega despachada com motoboy neste turno.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {drivers.list.map((driver) => {
                    const isOwingDriver = driver.netBalance > 0;
                    const isDriverOwingStore = driver.netBalance < 0;

                    return (
                      <div
                        key={driver.driverId}
                        className="p-3.5 rounded-2xl bg-white border border-stone-200 shadow-sm space-y-2 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h5 className="font-black text-sm text-stone-900">
                                {driver.name}
                              </h5>
                              <p className="text-[11px] text-stone-500">
                                📦 {driver.ordersCount} entregas • 🚀 {driver.tripsCount} saídas
                              </p>
                            </div>

                            <Badge
                              variant="outline"
                              className={`font-black text-[10px] ${
                                isOwingDriver
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                  : isDriverOwingStore
                                  ? "bg-rose-50 text-rose-700 border-rose-300"
                                  : "bg-stone-100 text-stone-600 border-stone-200"
                              }`}
                            >
                              {isOwingDriver
                                ? `Pagar: ${formatMoney(driver.netBalance)}`
                                : isDriverOwingStore
                                ? `Devolver: ${formatMoney(Math.abs(driver.netBalance))}`
                                : "Quitado"}
                            </Badge>
                          </div>

                          <div className="mt-2.5 pt-2 border-t border-stone-100 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[10px] text-stone-400 block font-semibold">
                                Taxa a Receber:
                              </span>
                              <span className="font-bold text-stone-800">
                                {formatMoney(driver.feeEarned)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-stone-400 block font-semibold">
                                Dinheiro em Mãos:
                              </span>
                              <span className="font-bold text-amber-900">
                                {formatMoney(driver.cashCollected)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {driver.pixKey && (
                          <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                            <span className="text-[10px] text-stone-400 font-mono truncate max-w-[170px]" title={driver.pixKey}>
                              Pix: {driver.pixKey}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyPix(driver)}
                              className="text-[10px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-200"
                            >
                              {copiedPixId === driver.driverId ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Copiado!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copiar Pix</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 text-stone-600 text-xs flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-stone-200/80 text-stone-700 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <b className="text-stone-900">Operação sem entregadores terceirizados</b>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Todas as taxas de entrega cobradas dos clientes permanecem como receita integral da sua loja.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Ações Rápidas */}
        <DialogFooter className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-2.5 flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl text-xs font-bold"
          >
            Fechar
          </Button>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyWhatsApp}
              className="flex-1 sm:flex-none border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-xl text-xs font-bold gap-1.5 cursor-pointer shadow-sm"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{copiedWhatsApp ? "Copiado!" : "Copiar para WhatsApp"}</span>
            </Button>

            <Button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black gap-1.5 cursor-pointer shadow-md"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Cupom Térmico</span>
            </Button>

            {!readOnly && (
              <Button
                type="button"
                onClick={handleSaveClosing}
                disabled={isSaving || hasSaved}
                className={`flex-1 sm:flex-none rounded-xl text-xs font-black gap-1.5 cursor-pointer shadow-md transition-all ${
                  hasSaved
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-stone-900 hover:bg-black text-white"
                }`}
              >
                {hasSaved ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Fechamento Salvo ✓</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isSaving ? "Salvando..." : "Salvar Fechamento"}</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

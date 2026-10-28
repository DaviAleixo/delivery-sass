import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Order } from "@/entities/Order";
import { Settings } from "@/entities/Settings";
import { ShiftClosing } from "@/entities/ShiftClosing";
import { createPageUrl } from "@/utils";
import { calculateShiftClosing, getStoreShiftInfo } from "@/utils/shiftClosingCalculator";
import { generateWhatsAppClosingText } from "@/utils/shiftClosingWhatsAppFormatter";
import { formatInBrasilia, getBrasiliaParts } from "@/utils/dateTime";
import { parseBRLToNumber } from "@/utils/moneyMask";
import { toast } from "sonner";

// UI Components
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/CurrencyInput";

// Icons
import {
  Wallet,
  Lock,
  Unlock,
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Bike,
  Printer,
  Share2,
  Calendar,
  Clock,
  User,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  History,
  FileText,
  Sparkles,
  Layers,
  Search,
  Filter,
} from "lucide-react";

// Cash Modals
import OpenCashModal from "@/components/admin/cash/OpenCashModal";
import CashBleedModal from "@/components/admin/cash/CashBleedModal";
import CashSupplyModal from "@/components/admin/cash/CashSupplyModal";
import CashExpenseModal from "@/components/admin/cash/CashExpenseModal";
import CashClosingConfirmModal from "@/components/admin/cash/CashClosingConfirmModal";

export default function CashManagement() {
  const location = useLocation();
  const navigate = useNavigate();

  // Lê a aba inicial da query string (?tab=current | ?tab=closing | ?tab=history)
  const queryParams = new URLSearchParams(location.search);
  const initialTab = queryParams.get("tab") || "current";
  const [activeTab, setActiveTab] = useState(initialTab);

  // Estados de dados da loja
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [settings, setSettings] = useState(null);
  const [storeName, setStoreName] = useState("Restaurante");
  const [pastClosings, setPastClosings] = useState([]);

  // Estado do Caixa do Turno Atual
  const [isCashDrawerOpen, setIsCashDrawerOpen] = useState(true);
  const [cashDrawerInfo, setCashDrawerInfo] = useState({
    openedAt: new Date().toISOString(),
    operator: "Operador Principal",
    initialFloat: 100.0,
    notes: "Fundo de troco inicial",
  });

  // Lista de Movimentações Financeiras Manuais do Turno (Sangrias, Suprimentos, Saídas Operacionais)
  const [manualMovements, setManualMovements] = useState([
    {
      id: "mov-init",
      type: "open",
      title: "Abertura de Caixa (Fundo de Troco)",
      category: "fundo_inicial",
      amount: 100.0,
      direction: "in",
      operator: "Operador Principal",
      timestamp: new Date().toISOString(),
      notes: "Cédulas e moedas para troco inicial",
    },
  ]);

  // Modais
  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [bleedModalVisible, setBleedModalVisible] = useState(false);
  const [supplyModalVisible, setSupplyModalVisible] = useState(false);
  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [closingConfirmModalVisible, setClosingConfirmModalVisible] = useState(false);

  // Filtro de período para o Fechamento de Caixa
  const [periodMode, setPeriodMode] = useState("today");
  const [closingSaved, setClosingSaved] = useState(false);
  const [isSavingClosing, setIsSavingClosing] = useState(false);

  // Conferência de Caixa (Contagem Cega)
  const [countedCashStr, setCountedCashStr] = useState("");
  const [cashDifferenceJustification, setCashDifferenceJustification] = useState("");
  const [copiedPixId, setCopiedPixId] = useState(null);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

  // Filtro na tabela de movimentações da Aba 1
  const [movementFilter, setMovementFilter] = useState("all");

  // Carrega dados iniciais
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [ordersData, settingsData, closingsData] = await Promise.all([
          Order.list("-created_date", 200).catch(() => []),
          Settings.get().catch(() => null),
          ShiftClosing.list("-created_at", 50).catch(() => []),
        ]);

        setOrders(ordersData || []);
        setSettings(settingsData);
        setPastClosings(closingsData || []);

        const name =
          settingsData?.restaurant_name ||
          localStorage.getItem("current_tenant_name") ||
          "Restaurante";
        setStoreName(name);

        if (Array.isArray(settingsData?.delivery_drivers)) {
          setDrivers(settingsData.delivery_drivers);
        }
      } catch (err) {
        console.error("[CashManagement] Erro ao carregar dados:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Mantém a query string sincronizada com a aba ativa
  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    const search = new URLSearchParams(location.search);
    search.set("tab", newTab);
    navigate({ search: search.toString() }, { replace: true });
  };

  // Informações do Turno
  const shiftInfo = useMemo(() => getStoreShiftInfo(settings), [settings]);

  // Cálculo Oficial do Fechamento do Turno (shiftClosingCalculator)
  const shiftClosingData = useMemo(() => {
    return calculateShiftClosing({
      orders,
      drivers,
      tenantSettings: settings,
      periodMode,
    });
  }, [orders, drivers, settings, periodMode]);

  const { bounds, summary, payments, cashDrawer, drivers: driversClosing } = shiftClosingData;

  // Agregações de Movimentações Manuais
  const movementsSummary = useMemo(() => {
    let totalBleeds = 0;
    let totalSupplies = 0;
    let totalExpenses = 0;

    for (const mov of manualMovements) {
      if (mov.type === "bleed") totalBleeds += mov.amount;
      if (mov.type === "supply") totalSupplies += mov.amount;
      if (mov.type === "expense") totalExpenses += mov.amount;
    }

    return { totalBleeds, totalSupplies, totalExpenses };
  }, [manualMovements]);

  // Vendas em dinheiro do turno
  const cashSalesTotal = payments.cash.total;
  // Dinheiro recebido no balcão/retirada (já na loja)
  const cashAtCounter = cashDrawer.cashDirectCounter;
  // Dinheiro em mãos com os motoboys (ainda na rua a acertar)
  const cashWithDrivers = cashDrawer.cashCollectedByDrivers;

  // Saldo Esperado Físico na Gaveta:
  // Fundo Inicial + Dinheiro que entrou direto no balcão + Suprimentos - Sangrias - Saídas Operacionais
  // (Obs: Dinheiro com motoboy só entra na gaveta quando acertado na volta)
  const initialFloat = Number(cashDrawerInfo.initialFloat || 0);
  const expectedCashInDrawer =
    initialFloat +
    cashAtCounter +
    movementsSummary.totalSupplies -
    movementsSummary.totalBleeds -
    movementsSummary.totalExpenses;

  // Conferência de Caixa (Valor contado e diferença)
  const countedCash = parseBRLToNumber(countedCashStr);
  const hasCountedInput = countedCashStr.trim() !== "";
  const difference = hasCountedInput ? countedCash - expectedCashInDrawer : 0;
  const isExactDifference = Math.abs(difference) < 0.01;
  const isSurplus = difference > 0.01;
  const isShortage = difference < -0.01;

  // Consolidação de Movimentações para a Tabela da Aba 1 (Movimentações Manuais + Vendas em Dinheiro)
  const allShiftMovements = useMemo(() => {
    const list = [...manualMovements];

    // Adiciona os pedidos pagos em dinheiro no turno como movimentações de entrada
    const shiftCashOrders = (shiftClosingData.shiftOrders || []).filter(
      (o) =>
        o.status !== "cancelado" &&
        String(o.payment_method || "").toLowerCase().includes("dinheiro")
    );

    for (const ord of shiftCashOrders) {
      const isCounter =
        ord.order_type === "takeout" ||
        ord.order_type === "balcao" ||
        ord.order_type === "pickup" ||
        ord.order_type === "dine_in" ||
        ord.order_type === "mesa";

      list.push({
        id: `ord-${ord.id}`,
        type: "sale_cash",
        title: `Venda em Dinheiro (#${ord.id?.slice(-4) || ord.id})`,
        category: isCounter ? "Balcão / Mesa" : "Entrega (com Motoboy)",
        amount: Number(ord.total_amount || ord.total || 0),
        direction: isCounter ? "in" : "pending_driver",
        operator: ord.customer_name || "Cliente Balcão",
        timestamp: ord.created_date || new Date().toISOString(),
        notes: isCounter
          ? "Entrada líquida imediata na gaveta"
          : `Em trânsito com ${ord.driver_name || "entregador"}`,
      });
    }

    // Ordena do mais recente para o mais antigo
    return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [manualMovements, shiftClosingData]);

  // Filtro da tabela de movimentações
  const filteredMovements = useMemo(() => {
    if (movementFilter === "all") return allShiftMovements;
    if (movementFilter === "sales") return allShiftMovements.filter((m) => m.type === "sale_cash");
    if (movementFilter === "bleeds") return allShiftMovements.filter((m) => m.type === "bleed");
    if (movementFilter === "supplies") return allShiftMovements.filter((m) => m.type === "supply");
    if (movementFilter === "expenses") return allShiftMovements.filter((m) => m.type === "expense");
    return allShiftMovements;
  }, [allShiftMovements, movementFilter]);

  // Handlers de Ações Manuais
  const handleConfirmOpen = ({ operator, initialFloat: floatVal, notes, openedAt }) => {
    setIsCashDrawerOpen(true);
    setCashDrawerInfo({
      operator,
      initialFloat: floatVal,
      notes,
      openedAt,
    });
    setManualMovements((prev) => [
      {
        id: `mov-open-${Date.now()}`,
        type: "open",
        title: "Abertura de Caixa (Fundo de Troco)",
        category: "fundo_inicial",
        amount: floatVal,
        direction: "in",
        operator,
        timestamp: openedAt,
        notes,
      },
      ...prev.filter((m) => m.type !== "open"),
    ]);
  };

  const handleConfirmBleed = (data) => {
    setManualMovements((prev) => [
      {
        id: `mov-bleed-${Date.now()}`,
        type: "bleed",
        title: "Sangria de Caixa (Retirada)",
        category: data.reason,
        amount: data.amount,
        direction: "out",
        operator: data.operator,
        timestamp: data.timestamp,
        notes: data.notes || `Destino: ${data.reason}`,
      },
      ...prev,
    ]);
  };

  const handleConfirmSupply = (data) => {
    setManualMovements((prev) => [
      {
        id: `mov-supply-${Date.now()}`,
        type: "supply",
        title: "Suprimento de Caixa (Entrada)",
        category: data.reason,
        amount: data.amount,
        direction: "in",
        operator: data.operator,
        timestamp: data.timestamp,
        notes: data.notes || `Motivo: ${data.reason}`,
      },
      ...prev,
    ]);
  };

  const handleConfirmExpense = (data) => {
    setManualMovements((prev) => [
      {
        id: `mov-exp-${Date.now()}`,
        type: "expense",
        title: `Saída: ${data.categoryLabel}`,
        category: data.category,
        amount: data.amount,
        direction: "out",
        operator: data.operator,
        timestamp: data.timestamp,
        notes: data.description + (data.notes ? ` • ${data.notes}` : ""),
      },
      ...prev,
    ]);
  };

  const handleFinalCloseShift = async ({ countedCash: counted, difference: diff, justification, closedAt }) => {
    setIsCashDrawerOpen(false);
    setIsSavingClosing(true);
    try {
      const activeTenantId =
        settings?.id ||
        localStorage.getItem("current_tenant_id") ||
        "a0000000-0000-0000-0000-000000000001";
      const shiftDate = bounds?.start
        ? getBrasiliaParts(bounds.start).dateKey
        : getBrasiliaParts(new Date()).dateKey;

      const payload = {
        tenant_id: activeTenantId,
        shift_date: shiftDate,
        period_mode: bounds?.mode || periodMode,
        period_label: bounds?.label || "Turno",
        opened_at: cashDrawerInfo.openedAt,
        closed_at: closedAt,
        cashier_name: cashDrawerInfo.operator,
        gross_revenue: summary.grossRevenue,
        net_revenue: summary.netRevenue,
        total_orders: summary.totalOrders,
        delivery_orders: summary.deliveryCount,
        counter_orders: summary.counterCount,
        dine_in_orders: summary.dineInCount,
        average_ticket: summary.averageTicket,
        payment_breakdown: payments,
        cash_drawer: {
          ...cashDrawer,
          initialFloat,
          totalBleeds: movementsSummary.totalBleeds,
          totalSupplies: movementsSummary.totalSupplies,
          totalExpenses: movementsSummary.totalExpenses,
          expectedInDrawer: expectedCashInDrawer,
          countedCash: counted,
          difference: diff,
          justification,
        },
        driver_settlements: driversClosing?.settlements || [],
        raw_closing_data: {
          ...shiftClosingData,
          initialFloat,
          expectedCashInDrawer,
          countedCash: counted,
          difference: diff,
          justification,
        },
      };

      const saved = await ShiftClosing.create(payload);
      setPastClosings((prev) => [saved, ...prev]);
      setClosingSaved(true);
      toast.success("Fechamento de Caixa gravado no histórico!", {
        description: `Caixa fechado com sucesso por ${cashDrawerInfo.operator}.`,
      });
    } catch (err) {
      console.error("[CashManagement] Erro ao fechar caixa:", err);
      toast.error("Erro ao registrar fechamento no histórico.");
    } finally {
      setIsSavingClosing(false);
    }
  };

  // Ações de compartilhamento e impressão térmica
  const handlePrint = () => {
    try {
      const closingToPrint = {
        ...shiftClosingData,
        initialFloat,
        expectedCashInDrawer,
        countedCash,
        difference,
      };
      sessionStorage.setItem("shift_closing_print_data", JSON.stringify(closingToPrint));
      sessionStorage.setItem("current_tenant_name", storeName);
      window.open(createPageUrl("PrintShiftClosing"), "_blank");
    } catch (err) {
      console.error("[CashManagement] Erro ao abrir impressão:", err);
      window.print();
    }
  };

  const handleCopyWhatsApp = () => {
    const text = generateWhatsAppClosingText(shiftClosingData, storeName);
    navigator.clipboard.writeText(text);
    setCopiedWhatsApp(true);
    toast.success("Resumo do fechamento copiado para o WhatsApp!");
    setTimeout(() => setCopiedWhatsApp(false), 2500);
  };

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

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F7F9F8]">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#047857] mx-auto"></div>
          <p className="text-stone-600 font-semibold text-sm">Carregando Gestão de Caixa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-[#F7F9F8] min-h-screen space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200/80">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#047857] text-white flex items-center justify-center shadow-md">
              <Wallet className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
                Gestão de Caixa
              </h1>
              <p className="text-xs text-stone-500 font-medium">
                {storeName} • Controle da gaveta física, movimentações do turno e fechamento auditável
              </p>
            </div>
          </div>
        </div>

        {/* Pílula de Status do Caixa + Botões de Ação Rápida */}
        <div className="flex flex-wrap items-center gap-2">
          {isCashDrawerOpen ? (
            <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Caixa Aberto ({cashDrawerInfo.operator})</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Caixa Fechado</span>
            </div>
          )}

          {!isCashDrawerOpen ? (
            <Button
              type="button"
              onClick={() => setOpenModalVisible(true)}
              className="bg-[#047857] hover:bg-[#065f46] text-white rounded-xl text-xs font-black gap-1.5 shadow-sm cursor-pointer"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Abrir Caixa</span>
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBleedModalVisible(true)}
                className="bg-white hover:bg-amber-50 text-amber-800 border-amber-200 rounded-xl text-xs font-bold gap-1 cursor-pointer h-9 shadow-2xs"
                title="Retirar dinheiro da gaveta para cofre ou depósito"
              >
                <ArrowDownRight className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden md:inline">Sangria</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setSupplyModalVisible(true)}
                className="bg-white hover:bg-blue-50 text-blue-800 border-blue-200 rounded-xl text-xs font-bold gap-1 cursor-pointer h-9 shadow-2xs"
                title="Entrada de troco ou moedas na gaveta"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden md:inline">Suprimento</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setExpenseModalVisible(true)}
                className="bg-white hover:bg-rose-50 text-rose-800 border-rose-200 rounded-xl text-xs font-bold gap-1 cursor-pointer h-9 shadow-2xs"
                title="Pagar despesa rápida da operação com o dinheiro da gaveta"
              >
                <Receipt className="w-3.5 h-3.5 text-rose-600" />
                <span className="hidden md:inline">Registrar Saída</span>
              </Button>

              <Button
                type="button"
                onClick={() => handleTabChange("closing")}
                className="bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-black gap-1.5 shadow-sm cursor-pointer h-9"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Fechamento</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Principais */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-stone-200/70 p-1 rounded-2xl h-11 border border-stone-200 inline-flex w-full sm:w-auto shadow-2xs">
          <TabsTrigger
            value="current"
            className="flex-1 sm:flex-none rounded-xl text-xs font-black data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-sm px-4 gap-2 transition-all cursor-pointer"
          >
            <Wallet className="w-4 h-4 text-[#047857]" />
            <span>1. Caixa Atual</span>
          </TabsTrigger>

          <TabsTrigger
            value="closing"
            className="flex-1 sm:flex-none rounded-xl text-xs font-black data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-sm px-4 gap-2 transition-all cursor-pointer"
          >
            <Lock className="w-4 h-4 text-amber-600" />
            <span>2. Fechamento de Caixa</span>
          </TabsTrigger>

          <TabsTrigger
            value="history"
            className="flex-1 sm:flex-none rounded-xl text-xs font-black data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-sm px-4 gap-2 transition-all cursor-pointer"
          >
            <History className="w-4 h-4 text-stone-600" />
            <span>3. Histórico e Auditoria</span>
          </TabsTrigger>
        </TabsList>

        {/* =========================================================================
            ABA 1: CAIXA ATUAL (GAVETA, OPERAÇÕES E MOVIMENTAÇÕES DO TURNO)
        ========================================================================== */}
        <TabsContent value="current" className="space-y-6 animate-in fade-in-50">
          {/* Card Principal: Dinheiro Esperado na Gaveta */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1 bg-gradient-to-br from-stone-900 to-stone-800 text-white rounded-3xl p-6 shadow-xl border-0 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-44 h-44 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

              <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                    Gaveta Física • Turno Ao Vivo
                  </span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 text-[10px] font-black">
                    Tempo Real
                  </Badge>
                </div>

                <div>
                  <p className="text-xs text-stone-400 font-medium">Dinheiro Esperado na Gaveta</p>
                  <p className="text-3xl sm:text-4xl font-black text-white tracking-tight mt-1">
                    {formatMoney(expectedCashInDrawer)}
                  </p>
                </div>

                <div className="pt-3 border-t border-stone-700/60 space-y-1.5 text-xs text-stone-300 font-medium">
                  <div className="flex justify-between">
                    <span className="text-stone-400">(+) Fundo de Troco Inicial:</span>
                    <span className="font-bold text-white">{formatMoney(initialFloat)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-400">(+) Vendas Dinheiro (Balcão):</span>
                    <span className="font-bold text-emerald-400">{formatMoney(cashAtCounter)}</span>
                  </div>
                  {cashWithDrivers > 0 && (
                    <div className="flex justify-between text-amber-300">
                      <span>(⏳) Na rua c/ entregadores:</span>
                      <span className="font-bold">{formatMoney(cashWithDrivers)}</span>
                    </div>
                  )}
                  {movementsSummary.totalSupplies > 0 && (
                    <div className="flex justify-between text-blue-300">
                      <span>(+) Suprimentos (Moedas):</span>
                      <span className="font-bold">+{formatMoney(movementsSummary.totalSupplies)}</span>
                    </div>
                  )}
                  {movementsSummary.totalBleeds > 0 && (
                    <div className="flex justify-between text-amber-300">
                      <span>(-) Sangrias Realizadas:</span>
                      <span className="font-bold">-{formatMoney(movementsSummary.totalBleeds)}</span>
                    </div>
                  )}
                  {movementsSummary.totalExpenses > 0 && (
                    <div className="flex justify-between text-rose-300">
                      <span>(-) Saídas (Despesas):</span>
                      <span className="font-bold">-{formatMoney(movementsSummary.totalExpenses)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-stone-700/60 flex items-center justify-between text-xs text-stone-400">
                <span className="truncate">Operador: <b className="text-white">{cashDrawerInfo.operator}</b></span>
                <span className="shrink-0">{formatInBrasilia(cashDrawerInfo.openedAt, { includeSeconds: false })}</span>
              </div>
            </Card>

            {/* Grid dos Cards Métricos do Turno */}
            <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* Card 1: Faturamento Bruto de Vendas */}
              <Card className="rounded-3xl p-4 bg-white border border-stone-200/90 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#047857] flex items-center justify-center mb-2">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-stone-400 block uppercase">
                    Vendas do Turno
                  </span>
                  <span className="text-xl font-black text-stone-900 block mt-0.5">
                    {formatMoney(summary.grossRevenue)}
                  </span>
                </div>
                <p className="text-[10px] text-stone-500 font-medium mt-2">
                  {summary.totalOrders} pedidos realizados
                </p>
              </Card>

              {/* Card 2: Fundo de Troco Inicial */}
              <Card className="rounded-3xl p-4 bg-white border border-stone-200/90 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center mb-2">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-stone-400 block uppercase">
                    Fundo de Troco
                  </span>
                  <span className="text-xl font-black text-stone-900 block mt-0.5">
                    {formatMoney(initialFloat)}
                  </span>
                </div>
                <p className="text-[10px] text-stone-500 font-medium mt-2">
                  Dinheiro vivo de abertura
                </p>
              </Card>

              {/* Card 3: Total em Dinheiro (Vendas) */}
              <Card className="rounded-3xl p-4 bg-white border border-stone-200/90 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-2">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-stone-400 block uppercase">
                    Total em Dinheiro
                  </span>
                  <span className="text-xl font-black text-emerald-700 block mt-0.5">
                    {formatMoney(cashSalesTotal)}
                  </span>
                </div>
                <p className="text-[10px] text-stone-500 font-medium mt-2">
                  {cashAtCounter > 0 ? `${formatMoney(cashAtCounter)} no balcão` : "Balcão e entrega"}
                </p>
              </Card>

              {/* Card 4: Sangrias de Caixa */}
              <Card className="rounded-3xl p-4 bg-white border border-stone-200/90 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-2">
                    <ArrowDownRight className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-stone-400 block uppercase">
                    Sangrias Realizadas
                  </span>
                  <span className="text-xl font-black text-amber-800 block mt-0.5">
                    {formatMoney(movementsSummary.totalBleeds)}
                  </span>
                </div>
                <p className="text-[10px] text-stone-500 font-medium mt-2">
                  Retiradas para cofre / banco
                </p>
              </Card>

              {/* Card 5: Suprimentos de Caixa */}
              <Card className="rounded-3xl p-4 bg-white border border-stone-200/90 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-2">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-stone-400 block uppercase">
                    Suprimentos
                  </span>
                  <span className="text-xl font-black text-blue-800 block mt-0.5">
                    {formatMoney(movementsSummary.totalSupplies)}
                  </span>
                </div>
                <p className="text-[10px] text-stone-500 font-medium mt-2">
                  Entrada de troco / moedas
                </p>
              </Card>

              {/* Card 6: Saídas Operacionais (Despesas) */}
              <Card className="rounded-3xl p-4 bg-white border border-stone-200/90 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mb-2">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-stone-400 block uppercase">
                    Saídas (Despesas)
                  </span>
                  <span className="text-xl font-black text-rose-700 block mt-0.5">
                    {formatMoney(movementsSummary.totalExpenses)}
                  </span>
                </div>
                <p className="text-[10px] text-stone-500 font-medium mt-2">
                  Gelo, limpeza, insumos rápidos
                </p>
              </Card>
            </div>
          </div>

          {/* Seção da Tabela de Movimentações Financeiras do Turno */}
          <Card className="rounded-3xl bg-white border border-stone-200/90 shadow-sm overflow-hidden">
            <CardHeader className="bg-stone-50/70 border-b border-stone-100 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                  <CardTitle className="text-base font-black text-stone-900">
                    Movimentações da Gaveta no Turno
                  </CardTitle>
                </div>
                <p className="text-xs text-stone-500">
                  Extrato detalhado de entradas, retiradas, despesas e vendas em dinheiro vivo
                </p>
              </div>

              {/* Filtros da Tabela */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { key: "all", label: "Todas" },
                  { key: "sales", label: "Vendas Dinheiro" },
                  { key: "bleeds", label: "Sangrias" },
                  { key: "supplies", label: "Suprimentos" },
                  { key: "expenses", label: "Despesas" },
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setMovementFilter(f.key)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      movementFilter === f.key
                        ? "bg-stone-900 text-white shadow-xs"
                        : "bg-white text-stone-600 hover:bg-stone-100 border border-stone-200"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {filteredMovements.length === 0 ? (
                <div className="py-12 px-4 text-center text-stone-400 space-y-2">
                  <Wallet className="w-8 h-8 mx-auto stroke-1 text-stone-300" />
                  <p className="text-sm font-bold text-stone-600">Nenhuma movimentação registrada</p>
                  <p className="text-xs text-stone-400">
                    Use os botões no topo para registrar Sangria, Suprimento ou Saída de Despesa.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-100 bg-stone-50/50 text-stone-400 font-bold uppercase text-[10px]">
                        <th className="py-3 px-4">Horário</th>
                        <th className="py-3 px-4">Tipo & Operação</th>
                        <th className="py-3 px-4">Categoria / Descrição</th>
                        <th className="py-3 px-4">Responsável</th>
                        <th className="py-3 px-4 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {filteredMovements.map((mov) => {
                        const isIn = mov.direction === "in";
                        const isPendingDriver = mov.direction === "pending_driver";

                        return (
                          <tr key={mov.id} className="hover:bg-stone-50/60 transition-colors">
                            {/* Horário */}
                            <td className="py-3 px-4 font-medium text-stone-500 whitespace-nowrap">
                              {formatInBrasilia(mov.timestamp, { includeSeconds: false })}
                            </td>

                            {/* Tipo com Badge */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                {mov.type === "open" && (
                                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-bold text-[10px]">
                                    Abertura
                                  </Badge>
                                )}
                                {mov.type === "sale_cash" && (
                                  <Badge className="bg-emerald-50 text-[#047857] border-emerald-200 font-bold text-[10px]">
                                    Venda Dinheiro
                                  </Badge>
                                )}
                                {mov.type === "bleed" && (
                                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-bold text-[10px]">
                                    Sangria
                                  </Badge>
                                )}
                                {mov.type === "supply" && (
                                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-bold text-[10px]">
                                    Suprimento
                                  </Badge>
                                )}
                                {mov.type === "expense" && (
                                  <Badge className="bg-rose-100 text-rose-800 border-rose-200 font-bold text-[10px]">
                                    Despesa
                                  </Badge>
                                )}
                                <span className="font-bold text-stone-900">{mov.title}</span>
                              </div>
                            </td>

                            {/* Categoria / Detalhes */}
                            <td className="py-3 px-4 text-stone-600">
                              <span className="font-medium">{mov.notes || mov.category}</span>
                            </td>

                            {/* Operador */}
                            <td className="py-3 px-4 text-stone-500 font-medium">
                              {mov.operator}
                            </td>

                            {/* Valor */}
                            <td className="py-3 px-4 text-right font-black whitespace-nowrap">
                              {isIn ? (
                                <span className="text-emerald-700">+{formatMoney(mov.amount)}</span>
                              ) : isPendingDriver ? (
                                <span className="text-amber-700">
                                  {formatMoney(mov.amount)}{" "}
                                  <span className="text-[10px] font-normal text-amber-600">(na rua)</span>
                                </span>
                              ) : (
                                <span className="text-rose-700">-{formatMoney(mov.amount)}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* =========================================================================
            ABA 2: FECHAMENTO DE CAIXA (RAIO-X, CONFERÊNCIA OBRIGATÓRIA & ENCERRAMENTO)
        ========================================================================== */}
        <TabsContent value="closing" className="space-y-6 animate-in fade-in-50">
          {/* Barra de Filtro de Período */}
          <div className="bg-white p-3 rounded-2xl border border-stone-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl border border-stone-200/80">
              <button
                type="button"
                onClick={() => setPeriodMode("today")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  periodMode === "today"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-500 hover:text-stone-900"
                }`}
              >
                📅 Hoje (Dia Todo)
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode("shift")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  periodMode === "shift"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-500 hover:text-stone-900"
                }`}
              >
                {shiftInfo.label}
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode("yesterday")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  periodMode === "yesterday"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-500 hover:text-stone-900"
                }`}
              >
                ⏪ Ontem
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-stone-500 bg-stone-50 px-3 py-1.5 rounded-xl border border-stone-200">
                {bounds?.label || "Período do Fechamento"}
              </span>

              <Button
                type="button"
                variant="outline"
                onClick={handleCopyWhatsApp}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-xl text-xs font-bold gap-1.5 h-9 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>{copiedWhatsApp ? "Copiado!" : "WhatsApp"}</span>
              </Button>

              <Button
                type="button"
                onClick={handlePrint}
                className="bg-[#047857] hover:bg-[#065f46] text-white rounded-xl text-xs font-black gap-1.5 h-9 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir Cupom Térmico</span>
              </Button>
            </div>
          </div>

          {/* Cards Principais de Faturamento e Canais */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card className="rounded-3xl p-4 bg-white border border-stone-200/90 shadow-2xs">
              <span className="text-[11px] font-bold text-stone-400 block uppercase">
                Faturamento Bruto
              </span>
              <p className="text-2xl font-black text-stone-900 mt-1">
                {formatMoney(summary.grossRevenue)}
              </p>
              <span className="text-[10px] text-stone-500 font-medium mt-1 block">
                Total de vendas registradas
              </span>
            </Card>

            <Card className="rounded-3xl p-4 bg-white border border-stone-200/90 shadow-2xs">
              <span className="text-[11px] font-bold text-stone-400 block uppercase">
                Total de Pedidos
              </span>
              <p className="text-2xl font-black text-stone-900 mt-1">
                {summary.totalOrders}
              </p>
              <span className="text-[10px] text-stone-500 font-medium mt-1 block">
                Ticket Médio: {formatMoney(summary.averageTicket)}
              </span>
            </Card>

            <Card className="rounded-3xl p-4 bg-white border border-stone-200/90 shadow-2xs">
              <span className="text-[11px] font-bold text-stone-400 block uppercase">
                Canais de Atendimento
              </span>
              <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-stone-700">
                <span title="Delivery">🛵 {summary.deliveryCount}</span>
                <span>•</span>
                <span title="Balcão / Retirada">🛍️ {summary.counterCount}</span>
                <span>•</span>
                <span title="Salão / Mesa">🍽️ {summary.dineInCount}</span>
              </div>
              <span className="text-[10px] text-stone-500 font-medium mt-1 block">
                Delivery / Balcão / Mesa
              </span>
            </Card>

            <Card className="rounded-3xl p-4 bg-white border border-stone-200/90 shadow-2xs">
              <span className="text-[11px] font-bold text-stone-400 block uppercase">
                Taxas de Entrega
              </span>
              <p className="text-2xl font-black text-stone-900 mt-1">
                {formatMoney(summary.totalDeliveryFeesCollected)}
              </p>
              <span className="text-[10px] text-stone-500 font-medium mt-1 block">
                Arrecadadas dos clientes
              </span>
            </Card>
          </div>

          {/* Formas de Pagamento Consolidadas */}
          <Card className="rounded-3xl bg-white border border-stone-200/90 shadow-2xs p-5">
            <h2 className="text-sm font-black text-stone-900 mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[#047857]" />
              Discriminação por Forma de Pagamento
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Dinheiro (Gaveta)", val: payments.cash.total, count: payments.cash.count, color: "text-emerald-700 bg-emerald-50" },
                { label: "PIX (Online / Loja)", val: payments.pix.total, count: payments.pix.count, color: "text-blue-700 bg-blue-50" },
                { label: "Cartão de Crédito", val: payments.credit.total, count: payments.credit.count, color: "text-purple-700 bg-purple-50" },
                { label: "Cartão de Débito", val: payments.debit.total, count: payments.debit.count, color: "text-indigo-700 bg-indigo-50" },
                { label: "Vale Refeição", val: payments.mealVoucher.total, count: payments.mealVoucher.count, color: "text-amber-700 bg-amber-50" },
                { label: "Outros / Cortesia", val: payments.other.total, count: payments.other.count, color: "text-stone-700 bg-stone-100" },
              ].map((p, idx) => (
                <div key={idx} className={`p-3 rounded-2xl border border-stone-100 ${p.color}`}>
                  <span className="text-[10px] font-bold block truncate uppercase">{p.label}</span>
                  <p className="text-base font-black mt-1">{formatMoney(p.val)}</p>
                  <span className="text-[10px] opacity-75 font-semibold">{p.count} pedidos</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Seção 2: CONFERÊNCIA OBRIGATÓRIA DE GAVETA (CONTAGEM CEGA & QUEBRA DE CAIXA) */}
          <Card className="rounded-3xl bg-white border-2 border-stone-200/90 shadow-md p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <h2 className="text-base font-black text-stone-900">
                    Conferência da Gaveta Física (Contagem Cega)
                  </h2>
                </div>
                <p className="text-xs text-stone-500">
                  O operador digita o valor contado em cédulas e moedas para apurar a quebra ou sobra de caixa
                </p>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-bold text-stone-400 block uppercase">Saldo Esperado na Gaveta</span>
                <span className="text-xl font-black text-stone-900">{formatMoney(expectedCashInDrawer)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Campo de Entrada: Dinheiro Contado */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-stone-700 flex items-center justify-between">
                  <span>Valor Total Contado na Gaveta (R$):</span>
                  <span className="text-[11px] font-bold text-stone-400">Moedas + Cédulas</span>
                </Label>

                <CurrencyInput
                  value={countedCashStr}
                  onChange={(e) => setCountedCashStr(e.target.value)}
                  placeholder="R$ 0,00"
                  className="text-3xl h-16 font-black text-center rounded-2xl border-2 border-stone-200 focus-visible:border-stone-900 text-stone-900 bg-stone-50/50"
                />

                <p className="text-[11px] text-stone-400 leading-tight">
                  Conte o dinheiro físico presente na gaveta agora e digite o valor exato apurado.
                </p>
              </div>

              {/* Resultado do Confronto (Diferença de Caixa) */}
              <div className="space-y-3">
                <Label className="text-xs font-bold text-stone-700">Resultado da Apuração:</Label>

                {!hasCountedInput ? (
                  <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 text-center text-xs text-stone-400 font-medium">
                    Aguardando a digitação do valor contado para apurar a diferença...
                  </div>
                ) : isExactDifference ? (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 space-y-1">
                    <div className="flex items-center gap-2 font-black text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Caixa Correto (Bateu 100%)</span>
                    </div>
                    <p className="text-xs text-emerald-700 font-medium">
                      O dinheiro contado corresponde exatamente aos R$ {formatMoney(expectedCashInDrawer)} esperados pelo sistema.
                    </p>
                  </div>
                ) : isSurplus ? (
                  <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 space-y-1">
                    <div className="flex items-center gap-2 font-black text-sm">
                      <AlertCircle className="w-4 h-4 text-blue-600" />
                      <span>Sobra de Caixa: +{formatMoney(difference)}</span>
                    </div>
                    <p className="text-xs text-blue-700 font-medium">
                      Há mais dinheiro na gaveta do que o esperado.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 space-y-1">
                    <div className="flex items-center gap-2 font-black text-sm">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span>Falta de Caixa (Quebra): -{formatMoney(Math.abs(difference))}</span>
                    </div>
                    <p className="text-xs text-rose-700 font-medium">
                      O valor contado é menor que o esperado. É obrigatório justificar abaixo antes de encerrar.
                    </p>
                  </div>
                )}

                {/* Justificativa caso haja diferença */}
                {hasCountedInput && !isExactDifference && (
                  <div className="space-y-1.5 animate-in fade-in">
                    <Label className="text-xs font-bold text-stone-700">
                      Justificativa da Divergência:
                    </Label>
                    <Input
                      value={cashDifferenceJustification}
                      onChange={(e) => setCashDifferenceJustification(e.target.value)}
                      placeholder="Ex: Diferença de centavos decorrente de troco ou arredondamento..."
                      className="h-10 rounded-xl text-xs border-stone-200"
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Acerto de Contas com Entregadores */}
          {driversClosing?.hasDrivers && (
            <Card className="rounded-3xl bg-white border border-stone-200/90 shadow-2xs p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Bike className="w-4 h-4 text-[#047857]" />
                    <h2 className="text-sm font-black text-stone-900">
                      Acerto de Contas com a Equipe de Entregas
                    </h2>
                  </div>
                  <p className="text-xs text-stone-500">
                    Conferência de taxas de entrega e dinheiro recebido em mãos pelos motoboys
                  </p>
                </div>

                <Badge className="bg-stone-100 text-stone-700 border-0 font-bold text-xs">
                  {driversClosing.list.length} motoboy(s)
                </Badge>
              </div>

              <div className="divide-y divide-stone-100">
                {driversClosing.list.map((driver) => {
                  const toPayLoja = driver.netBalance > 0;
                  const toReceiveLoja = driver.netBalance < 0;

                  return (
                    <div
                      key={driver.driverId}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <span className="font-bold text-stone-900 text-sm">{driver.name}</span>
                        <div className="flex items-center gap-2 text-xs text-stone-500 font-medium mt-0.5">
                          <span>{driver.ordersCount} entregas</span>
                          <span>•</span>
                          <span>Taxas: {formatMoney(driver.feeEarned)}</span>
                          <span>•</span>
                          <span>Em mãos: {formatMoney(driver.cashCollected)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-stone-400 block">
                            {toPayLoja ? "Loja Paga ao Motoboy" : toReceiveLoja ? "Motoboy Devolve ao Caixa" : "Zerado"}
                          </span>
                          <span
                            className={`text-sm font-black ${
                              toPayLoja
                                ? "text-emerald-700"
                                : toReceiveLoja
                                ? "text-rose-700"
                                : "text-stone-700"
                            }`}
                          >
                            {formatMoney(Math.abs(driver.netBalance))}
                          </span>
                        </div>

                        {driver.pixKey && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyPix(driver)}
                            className="rounded-xl text-xs font-bold gap-1 border-stone-200 h-8 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{copiedPixId === driver.driverId ? "Copiado!" : "Copiar Pix"}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Botão de Fechamento Definitivo de Turno */}
          <div className="bg-white p-5 rounded-3xl border border-stone-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-sm font-black text-stone-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-500" />
                Encerramento Oficial do Turno
              </span>
              <p className="text-xs text-stone-500 max-w-xl">
                Ao encerrar, este expediente será travado, arquivado no Histórico e Auditoria com o comprovante imutável gerado para impressão.
              </p>
            </div>

            <Button
              type="button"
              onClick={() => setClosingConfirmModalVisible(true)}
              disabled={isSavingClosing || closingSaved}
              className={`rounded-2xl text-xs font-black px-6 py-5 shadow-md gap-2 cursor-pointer transition-all ${
                closingSaved
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-stone-900 hover:bg-black text-white"
              }`}
            >
              {closingSaved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                  <span>Turno Encerrado com Sucesso ✓</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Encerrar Expediente & Fechar Caixa</span>
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        {/* =========================================================================
            ABA 3: HISTÓRICO E AUDITORIA (TURNOS ANTERIORES & TRILHA IMUTÁVEL)
        ========================================================================== */}
        <TabsContent value="history" className="space-y-6 animate-in fade-in-50">
          <Card className="rounded-3xl bg-white border border-stone-200/90 shadow-sm overflow-hidden">
            <CardHeader className="bg-stone-50/70 border-b border-stone-100 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center">
                    <History className="w-4 h-4" />
                  </div>
                  <CardTitle className="text-base font-black text-stone-900">
                    Histórico de Turnos e Fechamentos Anteriores
                  </CardTitle>
                </div>
                <p className="text-xs text-stone-500">
                  Livro-caixa digital e auditoria dos turnos encerrados
                </p>
              </div>

              <Badge variant="outline" className="text-xs font-bold bg-white self-start sm:self-auto">
                {pastClosings.length} {pastClosings.length === 1 ? "fechamento" : "fechamentos"}
              </Badge>
            </CardHeader>

            <CardContent className="p-0">
              {pastClosings.length === 0 ? (
                <div className="py-16 px-4 flex flex-col items-center justify-center text-center text-stone-400 gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center">
                    <Receipt className="w-6 h-6 stroke-1" />
                  </div>
                  <p className="text-sm font-bold text-stone-700">
                    Nenhum fechamento registrado no histórico
                  </p>
                  <p className="text-xs text-stone-400 max-w-sm">
                    Quando você encerrar um turno na aba <b>Fechamento de Caixa</b>, ele será arquivado aqui com extrato completo e comprovante térmico.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-100 bg-stone-50/50 text-stone-400 font-bold uppercase text-[10px]">
                        <th className="py-3 px-4">Data / Turno</th>
                        <th className="py-3 px-4">Operador</th>
                        <th className="py-3 px-4">Faturamento Bruto</th>
                        <th className="py-3 px-4">Gaveta Esperada</th>
                        <th className="py-3 px-4">Conferência (Quebra/Sobra)</th>
                        <th className="py-3 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {pastClosings.map((c) => {
                        const diff = Number(c.cash_drawer?.difference || 0);
                        const isDiffZero = Math.abs(diff) < 0.01;

                        return (
                          <tr key={c.id} className="hover:bg-stone-50/60 transition-colors">
                            {/* Data e Período */}
                            <td className="py-3.5 px-4">
                              <span className="font-bold text-stone-900 block">
                                {c.period_label || c.shift_date}
                              </span>
                              <span className="text-[10px] text-stone-400 font-medium">
                                Fechado em: {formatInBrasilia(c.closed_at || c.created_at, { includeSeconds: false })}
                              </span>
                            </td>

                            {/* Operador */}
                            <td className="py-3.5 px-4 font-semibold text-stone-700">
                              {c.cashier_name || "Operador"}
                            </td>

                            {/* Faturamento Bruto */}
                            <td className="py-3.5 px-4 font-black text-stone-900">
                              {formatMoney(c.gross_revenue)}
                              <span className="text-[10px] text-stone-400 block font-normal">
                                {c.total_orders || 0} pedidos
                              </span>
                            </td>

                            {/* Gaveta Esperada */}
                            <td className="py-3.5 px-4 font-bold text-stone-700">
                              {formatMoney(c.cash_drawer?.expectedInDrawer || c.cash_drawer?.totalCashExpected || 0)}
                            </td>

                            {/* Conferência / Quebra */}
                            <td className="py-3.5 px-4">
                              {isDiffZero ? (
                                <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-bold">
                                  ✓ Exato (R$ 0,00)
                                </Badge>
                              ) : diff > 0 ? (
                                <Badge className="bg-blue-50 text-blue-800 border-blue-200 text-[10px] font-bold">
                                  +{formatMoney(diff)} (Sobra)
                                </Badge>
                              ) : (
                                <Badge className="bg-rose-50 text-rose-800 border-rose-200 text-[10px] font-bold">
                                  -{formatMoney(Math.abs(diff))} (Quebra)
                                </Badge>
                              )}
                              {c.cash_drawer?.justification && (
                                <span className="text-[10px] text-stone-500 block font-medium truncate max-w-xs mt-0.5">
                                  "{c.cash_drawer.justification}"
                                </span>
                              )}
                            </td>

                            {/* Ações */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    sessionStorage.setItem("shift_closing_print_data", JSON.stringify(c.raw_closing_data || c));
                                    sessionStorage.setItem("current_tenant_name", storeName);
                                    window.open(createPageUrl("PrintShiftClosing"), "_blank");
                                  }}
                                  className="h-8 px-2.5 rounded-xl text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 gap-1 cursor-pointer"
                                  title="Reimprimir Cupom Térmico"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Imprimir</span>
                                </Button>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const text = generateWhatsAppClosingText(c.raw_closing_data || c, storeName);
                                    navigator.clipboard.writeText(text);
                                    toast.success("Resumo copiado para o WhatsApp!");
                                  }}
                                  className="h-8 px-2.5 rounded-xl text-xs font-bold text-emerald-700 hover:bg-emerald-50 gap-1 cursor-pointer"
                                  title="Copiar para WhatsApp"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">WhatsApp</span>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* =========================================================================
          MODAIS OPERACIONAIS
      ========================================================================== */}
      {/* 1. Modal Abertura de Caixa */}
      <OpenCashModal
        isOpen={openModalVisible}
        onClose={() => setOpenModalVisible(false)}
        currentOperator={cashDrawerInfo.operator}
        onConfirmOpen={handleConfirmOpen}
      />

      {/* 2. Modal Sangria de Caixa */}
      <CashBleedModal
        isOpen={bleedModalVisible}
        onClose={() => setBleedModalVisible(false)}
        currentDrawerBalance={expectedCashInDrawer}
        onConfirmBleed={handleConfirmBleed}
        currentOperator={cashDrawerInfo.operator}
      />

      {/* 3. Modal Suprimento de Caixa */}
      <CashSupplyModal
        isOpen={supplyModalVisible}
        onClose={() => setSupplyModalVisible(false)}
        onConfirmSupply={handleConfirmSupply}
        currentOperator={cashDrawerInfo.operator}
      />

      {/* 4. Modal Registrar Saída Operacional (Despesa) */}
      <CashExpenseModal
        isOpen={expenseModalVisible}
        onClose={() => setExpenseModalVisible(false)}
        onConfirmExpense={handleConfirmExpense}
        currentOperator={cashDrawerInfo.operator}
        storeName={storeName}
      />

      {/* 5. Modal de Confirmação Irreversível de Fechamento de Caixa */}
      <CashClosingConfirmModal
        isOpen={closingConfirmModalVisible}
        onClose={() => setClosingConfirmModalVisible(false)}
        expectedCash={expectedCashInDrawer}
        countedCash={countedCash}
        difference={difference}
        justification={cashDifferenceJustification}
        operator={cashDrawerInfo.operator}
        onConfirmCloseShift={handleFinalCloseShift}
      />
    </div>
  );
}

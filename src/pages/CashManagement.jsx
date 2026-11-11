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
import { CurrencyInput } from "@/components/ui/CurrencyInput";

// Icons
import {
  Wallet,
  Lock,
  Unlock,
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
  ShoppingBag,
  Bike,
  Printer,
  Share2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  History,
  CreditCard,
  QrCode,
  Banknote,
  UtensilsCrossed,
  Info,
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

  const activeTenantStorageKey = useMemo(() => {
    const tid = (typeof window !== "undefined" ? localStorage.getItem("current_tenant_id") : null) || "default";
    return `pedemuleke_cash_drawer_${tid}`;
  }, []);

  // Estado do Caixa do Turno Atual (persistido em localStorage por loja para não perder ao atualizar)
  const [isCashDrawerOpen, setIsCashDrawerOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(activeTenantStorageKey);
      if (saved) return JSON.parse(saved).isCashDrawerOpen ?? true;
    } catch {}
    return true;
  });
  const [cashDrawerInfo, setCashDrawerInfo] = useState(() => {
    try {
      const saved = localStorage.getItem(activeTenantStorageKey);
      if (saved && JSON.parse(saved).cashDrawerInfo) return JSON.parse(saved).cashDrawerInfo;
    } catch {}
    return {
      openedAt: new Date().toISOString(),
      operator: "Operador Principal",
      initialFloat: 100.0,
      notes: "Fundo de troco inicial",
    };
  });

  // Lista de Movimentações Financeiras Manuais do Turno
  const [manualMovements, setManualMovements] = useState(() => {
    try {
      const saved = localStorage.getItem(activeTenantStorageKey);
      if (saved && Array.isArray(JSON.parse(saved).manualMovements)) {
        return JSON.parse(saved).manualMovements;
      }
    } catch {}
    return [
      {
        id: "mov-init",
        type: "open",
        title: "Abertura de Caixa (Troco Inicial)",
        category: "fundo_inicial",
        amount: 100.0,
        direction: "in",
        operator: "Operador Principal",
        timestamp: new Date().toISOString(),
        notes: "Cédulas e moedas para troco inicial",
      },
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        activeTenantStorageKey,
        JSON.stringify({ isCashDrawerOpen, cashDrawerInfo, manualMovements })
      );
    } catch {}
  }, [activeTenantStorageKey, isCashDrawerOpen, cashDrawerInfo, manualMovements]);

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

  // Conferência de Caixa (Contagem de Dinheiro)
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
          Order.list("-created_date", 250).catch(() => []),
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

  // Sincroniza a query string com a aba ativa
  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    const search = new URLSearchParams(location.search);
    search.set("tab", newTab);
    navigate({ search: search.toString() }, { replace: true });
  };

  // Informações do Turno
  const _shiftInfo = useMemo(() => getStoreShiftInfo(settings), [settings]);

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
  const _cashSalesTotal = payments.cash.total;
  // Dinheiro recebido no balcão/retirada (já na loja)
  const cashAtCounter = cashDrawer.cashDirectCounter;
  // Dinheiro em mãos com os motoboys (ainda na rua a acertar)
  const cashWithDrivers = cashDrawer.cashCollectedByDrivers;

  // Saldo Esperado Físico na Gaveta:
  // Fundo Inicial + Dinheiro que entrou direto no balcão + Suprimentos - Sangrias - Despesas Operacionais
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
  const _isShortage = difference < -0.01;

  // Consolidação de Movimentações para a Tabela (Movimentações Manuais + Pedidos em Dinheiro)
  const allShiftMovements = useMemo(() => {
    const list = [...manualMovements];

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
          ? "Recebido direto no caixa"
          : `Em trânsito com ${ord.driver_name || "entregador"}`,
      });
    }

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
        title: "Abertura de Caixa (Troco Inicial)",
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
        title: `Despesa: ${data.categoryLabel}`,
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

  const calculatePct = (val) => {
    const total = summary.grossRevenue || 0;
    if (total <= 0) return "0%";
    return `${((val / total) * 100).toFixed(1)}%`;
  };

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
    <div className="p-4 sm:p-6 lg:p-8 bg-[#F7F9F8] min-h-screen space-y-6 max-w-7xl mx-auto">
      {/* Header Corporativo Limpo */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              Gestão de Caixa & PDV
            </h1>
            <Badge
              variant="outline"
              className={`text-xs font-semibold px-2.5 py-0.5 rounded-md ${
                isCashDrawerOpen
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                  : "bg-stone-100 text-stone-600 border-stone-300"
              }`}
            >
              {isCashDrawerOpen ? "Caixa Aberto" : "Caixa Fechado"}
            </Badge>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {storeName} • Faturamento consolidado por canal e controle auditável da gaveta física
          </p>
        </div>

        {/* Barra de Ações Rápidas */}
        <div className="flex flex-wrap items-center gap-2">
          {!isCashDrawerOpen ? (
            <Button
              type="button"
              onClick={() => setOpenModalVisible(true)}
              className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold gap-1.5 h-9 px-4 cursor-pointer shadow-xs"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Abrir Caixa</span>
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSupplyModalVisible(true)}
                className="bg-white hover:bg-stone-50 text-stone-700 border-stone-300 rounded-lg text-xs font-semibold gap-1.5 h-9 cursor-pointer shadow-2xs"
                title="Entrada de troco ou moedas na gaveta"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
                <span>Suprimento</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setBleedModalVisible(true)}
                className="bg-white hover:bg-stone-50 text-stone-700 border-stone-300 rounded-lg text-xs font-semibold gap-1.5 h-9 cursor-pointer shadow-2xs"
                title="Retirar dinheiro da gaveta para cofre ou depósito"
              >
                <ArrowDownRight className="w-3.5 h-3.5 text-amber-600" />
                <span>Sangria</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setExpenseModalVisible(true)}
                className="bg-white hover:bg-stone-50 text-stone-700 border-stone-300 rounded-lg text-xs font-semibold gap-1.5 h-9 cursor-pointer shadow-2xs"
                title="Pagar despesa rápida da operação com o dinheiro do caixa"
              >
                <Receipt className="w-3.5 h-3.5 text-rose-600" />
                <span>Despesa</span>
              </Button>

              <Button
                type="button"
                onClick={() => handleTabChange("closing")}
                className="bg-stone-900 hover:bg-black text-white rounded-lg text-xs font-semibold gap-1.5 h-9 px-3.5 cursor-pointer shadow-xs"
              >
                <Lock className="w-3.5 h-3.5 text-stone-300" />
                <span>Fechar Caixa</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Navegação por Abas Executiva */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-stone-100 p-1 rounded-xl h-10 border border-stone-200 inline-flex w-full sm:w-auto shadow-2xs">
          <TabsTrigger
            value="current"
            className="flex-1 sm:flex-none rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-xs px-4 gap-2 transition-all cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5 text-stone-600" />
            <span>1. Caixa Atual</span>
          </TabsTrigger>

          <TabsTrigger
            value="closing"
            className="flex-1 sm:flex-none rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-xs px-4 gap-2 transition-all cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5 text-stone-600" />
            <span>2. Fechamento de Caixa</span>
          </TabsTrigger>

          <TabsTrigger
            value="history"
            className="flex-1 sm:flex-none rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-xs px-4 gap-2 transition-all cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-stone-600" />
            <span>3. Histórico e Auditoria</span>
          </TabsTrigger>
        </TabsList>

        {/* =========================================================================
            ABA 1: CAIXA ATUAL (GAVETA FÍSICA & DISCRIMINAÇÃO DOS MEIOS DE PAGAMENTO)
        ========================================================================== */}
        <TabsContent value="current" className="space-y-6 animate-in fade-in-50">
          {/* Linha Superior: 4 Cards de Métricas Principais */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Card 1: Saldo em Dinheiro na Gaveta */}
            <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
                  Dinheiro na Gaveta
                </span>
                <Badge variant="outline" className="text-[9px] font-semibold text-emerald-800 bg-emerald-50 border-emerald-200 px-1.5 py-0">
                  Ao Vivo
                </Badge>
              </div>
              <p className="text-2xl font-bold font-mono text-stone-900 mt-1">
                {formatMoney(expectedCashInDrawer)}
              </p>
              <span className="text-[11px] text-stone-500 mt-0.5 block">
                Físico disponível na loja
              </span>
            </Card>

            {/* Card 2: Faturamento Total */}
            <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide block">
                Faturamento do Turno
              </span>
              <p className="text-2xl font-bold font-mono text-stone-900 mt-1">
                {formatMoney(summary.grossRevenue)}
              </p>
              <span className="text-[11px] text-stone-500 mt-0.5 block">
                {summary.totalOrders} pedidos realizados
              </span>
            </Card>

            {/* Card 3: Ticket Médio */}
            <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide block">
                Ticket Médio
              </span>
              <p className="text-2xl font-bold font-mono text-stone-900 mt-1">
                {formatMoney(summary.averageTicket)}
              </p>
              <span className="text-[11px] text-stone-500 mt-0.5 block">
                Média por pedido
              </span>
            </Card>

            {/* Card 4: Canais de Atendimento */}
            <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide block">
                Canais de Atendimento
              </span>
              <div className="flex items-center gap-2 mt-2 text-xs font-semibold text-stone-700">
                <span className="flex items-center gap-1" title="Delivery">
                  <Bike className="w-3.5 h-3.5 text-stone-500" /> {summary.deliveryCount}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1" title="Balcão">
                  <ShoppingBag className="w-3.5 h-3.5 text-stone-500" /> {summary.counterCount}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1" title="Salão / Mesa">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-stone-500" /> {summary.dineInCount}
                </span>
              </div>
              <span className="text-[10px] text-stone-400 mt-1.5 block">
                Delivery / Balcão / Mesa
              </span>
            </Card>
          </div>

          {/* Segunda Linha: Gaveta Física (Esquerda) vs Faturamento por Meio de Pagamento (Direita) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* Coluna 1: Gaveta Física (Dinheiro em Espécie) */}
            <Card className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
              <CardHeader className="p-4 pb-3 border-b border-stone-100 flex flex-row items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-emerald-700" />
                    <CardTitle className="text-sm font-bold text-stone-900">
                      Gaveta Física (Dinheiro em Espécie)
                    </CardTitle>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Composição e conferência contábil da gaveta do caixa
                  </p>
                </div>

                <Badge variant="outline" className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border-emerald-200">
                  Saldo: {formatMoney(expectedCashInDrawer)}
                </Badge>
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                {/* Composição Matemática da Gaveta */}
                <div className="space-y-2 text-xs divide-y divide-stone-100">
                  <div className="flex justify-between py-1 text-stone-600">
                    <span className="flex items-center gap-1.5">
                      <span className="text-stone-400 font-mono font-bold">(+)</span> Fundo de Troco Inicial:
                    </span>
                    <span className="font-semibold font-mono text-stone-900">{formatMoney(initialFloat)}</span>
                  </div>

                  <div className="flex justify-between py-1 text-stone-600">
                    <span className="flex items-center gap-1.5">
                      <span className="text-emerald-600 font-mono font-bold">(+)</span> Vendas em Dinheiro (Balcão):
                    </span>
                    <span className="font-semibold font-mono text-emerald-700">+{formatMoney(cashAtCounter)}</span>
                  </div>

                  <div className="flex justify-between py-1 text-stone-600">
                    <span className="flex items-center gap-1.5">
                      <span className="text-blue-600 font-mono font-bold">(+)</span> Suprimentos (Troco Adicionado):
                    </span>
                    <span className="font-semibold font-mono text-blue-700">+{formatMoney(movementsSummary.totalSupplies)}</span>
                  </div>

                  <div className="flex justify-between py-1 text-stone-600">
                    <span className="flex items-center gap-1.5">
                      <span className="text-amber-600 font-mono font-bold">(-)</span> Sangrias (Retiradas p/ Cofre):
                    </span>
                    <span className="font-semibold font-mono text-amber-700">-{formatMoney(movementsSummary.totalBleeds)}</span>
                  </div>

                  <div className="flex justify-between py-1 text-stone-600">
                    <span className="flex items-center gap-1.5">
                      <span className="text-rose-600 font-mono font-bold">(-)</span> Despesas Pagas no Caixa:
                    </span>
                    <span className="font-semibold font-mono text-rose-700">-{formatMoney(movementsSummary.totalExpenses)}</span>
                  </div>

                  {cashWithDrivers > 0 && (
                    <div className="flex justify-between py-1.5 bg-amber-50/60 px-2 rounded text-amber-900 border border-amber-200/50">
                      <span className="flex items-center gap-1 text-[11px] font-medium">
                        <Bike className="w-3.5 h-3.5 text-amber-600" />
                        Em trânsito c/ entregadores (retorno pendente):
                      </span>
                      <span className="font-bold font-mono text-xs">{formatMoney(cashWithDrivers)}</span>
                    </div>
                  )}
                </div>

                {/* Botões Rápidos de Ação da Gaveta */}
                <div className="pt-2 border-t border-stone-100 grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSupplyModalVisible(true)}
                    className="bg-stone-50 hover:bg-blue-50 text-stone-700 hover:text-blue-800 border-stone-200 rounded-lg text-xs font-semibold gap-1 h-8.5 cursor-pointer shadow-2xs"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
                    <span>Suprimento</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBleedModalVisible(true)}
                    className="bg-stone-50 hover:bg-amber-50 text-stone-700 hover:text-amber-800 border-stone-200 rounded-lg text-xs font-semibold gap-1 h-8.5 cursor-pointer shadow-2xs"
                  >
                    <ArrowDownRight className="w-3.5 h-3.5 text-amber-600" />
                    <span>Sangria</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setExpenseModalVisible(true)}
                    className="bg-stone-50 hover:bg-rose-50 text-stone-700 hover:text-rose-800 border-stone-200 rounded-lg text-xs font-semibold gap-1 h-8.5 cursor-pointer shadow-2xs"
                  >
                    <Receipt className="w-3.5 h-3.5 text-rose-600" />
                    <span>Despesa</span>
                  </Button>
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                  <span>Operador: <b className="text-stone-800">{cashDrawerInfo.operator}</b></span>
                  <span>Aberto às {formatInBrasilia(cashDrawerInfo.openedAt, { includeSeconds: false })}</span>
                </div>
              </CardContent>
            </Card>

            {/* Coluna 2: Tabela dos Meios de Pagamento */}
            <Card className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
              <CardHeader className="p-4 pb-3 border-b border-stone-100 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-stone-700" />
                  <CardTitle className="text-xs font-bold uppercase tracking-wide text-stone-700">
                    Faturamento por Meio de Pagamento
                  </CardTitle>
                </div>
                <span className="text-[11px] text-stone-400 font-mono">Total: {formatMoney(summary.grossRevenue)}</span>
              </CardHeader>

              <div className="divide-y divide-stone-100">
                {[
                  {
                    label: "PIX (Online / Loja)",
                    icon: <QrCode className="w-4 h-4 text-emerald-600" />,
                    val: payments.pix.total,
                    count: payments.pix.count,
                    note: "Liquidado em conta bancária",
                  },
                  {
                    label: "Cartão de Crédito",
                    icon: <CreditCard className="w-4 h-4 text-blue-600" />,
                    val: payments.credit.total,
                    count: payments.credit.count,
                    note: "Maquininha ou portal",
                  },
                  {
                    label: "Cartão de Débito",
                    icon: <CreditCard className="w-4 h-4 text-indigo-600" />,
                    val: payments.debit.total,
                    count: payments.debit.count,
                    note: "Maquininha TEF/POS",
                  },
                  {
                    label: "Dinheiro Físico (Espécie)",
                    icon: <Banknote className="w-4 h-4 text-emerald-700" />,
                    val: payments.cash.total,
                    count: payments.cash.count,
                    note: "Entrada na gaveta da loja",
                  },
                  {
                    label: "Vale Refeição / Alimentação",
                    icon: <UtensilsCrossed className="w-4 h-4 text-amber-600" />,
                    val: payments.mealVoucher.total,
                    count: payments.mealVoucher.count,
                    note: "Sodexo, VR, Ticket, Alelo",
                  },
                ].map((row, idx) => (
                  <div key={idx} className="p-3 sm:px-4 flex items-center justify-between hover:bg-stone-50/50 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-stone-50 border border-stone-200/70 flex items-center justify-center">
                        {row.icon}
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-stone-900 block">{row.label}</span>
                        <span className="text-[10px] text-stone-400 block">{row.note} • {row.count} {row.count === 1 ? "pedido" : "pedidos"}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold font-mono text-stone-900 block">
                        {formatMoney(row.val)}
                      </span>
                      <span className="text-[10px] text-stone-400 font-medium">
                        {calculatePct(row.val)} do faturamento
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-2.5 bg-stone-50 border-t border-stone-100 flex items-center gap-1.5 text-[11px] text-stone-500">
                <Info className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span>
                  Valores em Pix e Cartão caem direto na sua conta bancária/adquirente e não interferem na contagem da gaveta física.
                </span>
              </div>
            </Card>
          </div>

          {/* Tabela de Extrato de Movimentações da Gaveta no Turno */}
          <Card className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
            <CardHeader className="bg-stone-50/60 border-b border-stone-200/80 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-bold text-stone-900">
                  Extrato de Movimentações da Gaveta no Turno
                </CardTitle>
                <p className="text-xs text-stone-500 mt-0.5">
                  Auditoria de entradas, sangrias, suprimentos, despesas e pedidos recebidos em dinheiro vivo
                </p>
              </div>

              {/* Filtro Rápido */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
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
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                      movementFilter === f.key
                        ? "bg-stone-900 text-white shadow-xs font-semibold"
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
                <div className="py-12 px-4 text-center text-stone-400 space-y-1.5">
                  <Wallet className="w-7 h-7 mx-auto stroke-1 text-stone-300" />
                  <p className="text-xs font-semibold text-stone-600">Nenhuma movimentação registrada neste filtro</p>
                  <p className="text-[11px] text-stone-400">
                    Use os botões de ação para registrar Suprimento, Sangria ou Despesas.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200/80 bg-stone-50/70 text-stone-500 font-semibold uppercase text-[10px]">
                        <th className="py-2.5 px-4">Horário</th>
                        <th className="py-2.5 px-4">Tipo & Operação</th>
                        <th className="py-2.5 px-4">Detalhes / Observações</th>
                        <th className="py-2.5 px-4">Responsável</th>
                        <th className="py-2.5 px-4 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {filteredMovements.map((mov) => {
                        const isIn = mov.direction === "in";
                        const isPendingDriver = mov.direction === "pending_driver";

                        return (
                          <tr key={mov.id} className="hover:bg-stone-50/60 transition-colors">
                            <td className="py-3 px-4 font-mono text-stone-500 whitespace-nowrap">
                              {formatInBrasilia(mov.timestamp, { includeSeconds: false })}
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                {mov.type === "open" && (
                                  <Badge className="bg-stone-100 text-stone-800 border-stone-300 font-medium text-[10px] rounded">
                                    Abertura
                                  </Badge>
                                )}
                                {mov.type === "sale_cash" && (
                                  <Badge className="bg-emerald-50 text-emerald-800 border-emerald-300 font-medium text-[10px] rounded">
                                    Venda Dinheiro
                                  </Badge>
                                )}
                                {mov.type === "bleed" && (
                                  <Badge className="bg-amber-50 text-amber-800 border-amber-300 font-medium text-[10px] rounded">
                                    Sangria
                                  </Badge>
                                )}
                                {mov.type === "supply" && (
                                  <Badge className="bg-blue-50 text-blue-800 border-blue-300 font-medium text-[10px] rounded">
                                    Suprimento
                                  </Badge>
                                )}
                                {mov.type === "expense" && (
                                  <Badge className="bg-rose-50 text-rose-800 border-rose-300 font-medium text-[10px] rounded">
                                    Despesa
                                  </Badge>
                                )}
                                <span className="font-semibold text-stone-900">{mov.title}</span>
                              </div>
                            </td>

                            <td className="py-3 px-4 text-stone-600">
                              <span className="font-normal">{mov.notes || mov.category}</span>
                            </td>

                            <td className="py-3 px-4 text-stone-500 font-medium">
                              {mov.operator}
                            </td>

                            <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
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
            ABA 2: CONFERÊNCIA & FECHAMENTO DE CAIXA (AUDITORIA E ENCERRAMENTO)
        ========================================================================== */}
        <TabsContent value="closing" className="space-y-6 animate-in fade-in-50">
          {/* Barra de Período e Ações de Exportação */}
          <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-lg border border-stone-200/80">
              <button
                type="button"
                onClick={() => setPeriodMode("today")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  periodMode === "today"
                    ? "bg-white text-stone-900 font-semibold shadow-xs"
                    : "text-stone-500 hover:text-stone-900"
                }`}
              >
                Hoje (Turno Ativo)
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode("yesterday")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  periodMode === "yesterday"
                    ? "bg-white text-stone-900 font-semibold shadow-xs"
                    : "text-stone-500 hover:text-stone-900"
                }`}
              >
                Ontem
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-stone-500 bg-stone-50 px-3 py-1.5 rounded-lg border border-stone-200">
                {bounds?.label || "Período do Fechamento"}
              </span>

              <Button
                type="button"
                variant="outline"
                onClick={handleCopyWhatsApp}
                className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded-lg text-xs font-semibold gap-1.5 h-9 cursor-pointer shadow-2xs"
              >
                <Share2 className="w-3.5 h-3.5 text-emerald-700" />
                <span>{copiedWhatsApp ? "Copiado!" : "Copiar p/ WhatsApp"}</span>
              </Button>

              <Button
                type="button"
                onClick={handlePrint}
                className="bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-xs font-semibold gap-1.5 h-9 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir Cupom Térmico</span>
              </Button>
            </div>
          </div>

          {/* Cards de Resumo Consolidado do Fechamento */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="rounded-xl p-4 bg-white border border-stone-200 shadow-2xs">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide block">
                Faturamento Bruto
              </span>
              <p className="text-xl font-bold font-mono text-stone-900 mt-1">
                {formatMoney(summary.grossRevenue)}
              </p>
              <span className="text-[10px] text-stone-400 mt-0.5 block">
                Todas as vendas do período
              </span>
            </Card>

            <Card className="rounded-xl p-4 bg-white border border-stone-200 shadow-2xs">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide block">
                Total de Pedidos
              </span>
              <p className="text-xl font-bold font-mono text-stone-900 mt-1">
                {summary.totalOrders}
              </p>
              <span className="text-[10px] text-stone-400 mt-0.5 block">
                Ticket Médio: {formatMoney(summary.averageTicket)}
              </span>
            </Card>

            <Card className="rounded-xl p-4 bg-white border border-stone-200 shadow-2xs">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide block">
                Taxas de Entrega
              </span>
              <p className="text-xl font-bold font-mono text-stone-900 mt-1">
                {formatMoney(summary.totalDeliveryFeesCollected)}
              </p>
              <span className="text-[10px] text-stone-400 mt-0.5 block">
                Arrecadadas no frete
              </span>
            </Card>

            <Card className="rounded-xl p-4 bg-white border border-stone-200 shadow-2xs">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide block">
                Saldo Esperado na Gaveta
              </span>
              <p className="text-xl font-bold font-mono text-emerald-800 mt-1">
                {formatMoney(expectedCashInDrawer)}
              </p>
              <span className="text-[10px] text-stone-400 mt-0.5 block">
                Dinheiro físico a conferir
              </span>
            </Card>
          </div>

          {/* Seção Principal: Conferência Física da Gaveta */}
          <Card className="rounded-xl bg-white border border-stone-300 shadow-xs p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-stone-700" />
                  <h2 className="text-sm font-bold text-stone-900">
                    Conferência Física da Gaveta (Contagem de Caixa)
                  </h2>
                </div>
                <p className="text-xs text-stone-500 mt-0.5">
                  Informe o valor físico apurado em notas e moedas para checar se houve sobra ou falta de caixa
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-semibold text-stone-400 block">Saldo Esperado pelo Sistema</span>
                <span className="text-lg font-bold font-mono text-stone-900">{formatMoney(expectedCashInDrawer)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Campo de Entrada: Valor Contado */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-stone-700 flex items-center justify-between">
                  <span>Valor Total Contado na Gaveta:</span>
                  <span className="text-[11px] text-stone-400 font-normal">Cédulas + Moedas</span>
                </Label>

                <CurrencyInput
                  value={countedCashStr}
                  onChange={(e) => setCountedCashStr(e.target.value)}
                  placeholder="R$ 0,00"
                  className="text-2xl h-14 font-bold font-mono text-center rounded-lg border-2 border-stone-300 focus-visible:border-stone-900 text-stone-900 bg-stone-50/50"
                />

                <p className="text-[11px] text-stone-500">
                  Conte o dinheiro na gaveta no final do dia e digite o valor exato apurado.
                </p>
              </div>

              {/* Resultado do Confronto */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-stone-700">Resultado da Auditoria:</Label>

                {!hasCountedInput ? (
                  <div className="p-4 rounded-lg bg-stone-50 border border-stone-200 text-center text-xs text-stone-500">
                    Aguardando a digitação do valor contado para apurar a diferença...
                  </div>
                ) : isExactDifference ? (
                  <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 space-y-1">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      <span>Caixa 100% Conferido (Exato)</span>
                    </div>
                    <p className="text-[11px] text-emerald-800">
                      O dinheiro contado corresponde exatamente aos {formatMoney(expectedCashInDrawer)} esperados pelo sistema.
                    </p>
                  </div>
                ) : isSurplus ? (
                  <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-300 text-blue-900 space-y-1">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <AlertCircle className="w-4 h-4 text-blue-700" />
                      <span>Sobra de Caixa: +{formatMoney(difference)}</span>
                    </div>
                    <p className="text-[11px] text-blue-800">
                      Há mais dinheiro físico na gaveta do que o registrado nas vendas e suprimentos.
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-900 space-y-1">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4 text-rose-700" />
                      <span>Falta de Caixa (Divergência): -{formatMoney(Math.abs(difference))}</span>
                    </div>
                    <p className="text-[11px] text-rose-800">
                      O valor contado é inferior ao esperado. Justifique o motivo abaixo antes de encerrar.
                    </p>
                  </div>
                )}

                {/* Justificativa caso haja diferença */}
                {hasCountedInput && !isExactDifference && (
                  <div className="space-y-1 animate-in fade-in">
                    <Label className="text-xs font-semibold text-stone-700">
                      Justificativa da Divergência:
                    </Label>
                    <Input
                      value={cashDifferenceJustification}
                      onChange={(e) => setCashDifferenceJustification(e.target.value)}
                      placeholder="Ex: Arredondamento de centavos em trocos..."
                      className="h-9 rounded-lg text-xs border-stone-300"
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Acerto de Contas com a Equipe de Entregas */}
          {driversClosing?.hasDrivers && (
            <Card className="rounded-xl bg-white border border-stone-200 shadow-2xs p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <Bike className="w-4 h-4 text-stone-700" />
                    <h2 className="text-xs font-bold uppercase tracking-wide text-stone-800">
                      Acerto de Contas com a Equipe de Entregas
                    </h2>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Conferência de taxas de entrega e dinheiro coletado pelos motoboys na rua
                  </p>
                </div>

                <Badge variant="outline" className="text-xs font-semibold text-stone-600 bg-stone-50 border-stone-200">
                  {driversClosing.list.length} {driversClosing.list.length === 1 ? "entregador" : "entregadores"}
                </Badge>
              </div>

              <div className="divide-y divide-stone-100">
                {driversClosing.list.map((driver) => {
                  const toPayLoja = driver.netBalance > 0;
                  const toReceiveLoja = driver.netBalance < 0;

                  return (
                    <div
                      key={driver.driverId}
                      className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <span className="font-semibold text-stone-900 text-xs">{driver.name}</span>
                        <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5">
                          <span>{driver.ordersCount} entregas</span>
                          <span>•</span>
                          <span>Taxas: {formatMoney(driver.feeEarned)}</span>
                          <span>•</span>
                          <span>Em mãos: {formatMoney(driver.cashCollected)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-semibold text-stone-400 block">
                            {toPayLoja ? "Loja Paga ao Entregador" : toReceiveLoja ? "Entregador Devolve ao Caixa" : "Zerado"}
                          </span>
                          <span
                            className={`text-xs font-bold font-mono ${
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
                            className="rounded-lg text-xs font-medium gap-1 border-stone-200 h-7.5 px-2.5 cursor-pointer shadow-2xs"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{copiedPixId === driver.driverId ? "Copiado!" : "Pix"}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Botão de Encerramento Oficial do Turno */}
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-stone-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-stone-900 uppercase tracking-wide flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-stone-600" />
                Encerramento Oficial do Expediente
              </span>
              <p className="text-xs text-stone-500 mt-0.5 max-w-xl">
                Ao encerrar, este expediente é arquivado no Histórico e Auditoria com o comprovante imutável gerado para reimpressão.
              </p>
            </div>

            <Button
              type="button"
              onClick={() => setClosingConfirmModalVisible(true)}
              disabled={isSavingClosing || closingSaved}
              className={`rounded-lg text-xs font-semibold px-5 py-2.5 shadow-xs gap-2 cursor-pointer transition-all ${
                closingSaved
                  ? "bg-emerald-700 hover:bg-emerald-800 text-white"
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
                  <Lock className="w-3.5 h-3.5 text-stone-300" />
                  <span>Encerrar Expediente & Fechar Caixa</span>
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        {/* =========================================================================
            ABA 3: HISTÓRICO E AUDITORIA (LIVRO-CAIXA DIGITAL E TURNOS ANTERIORES)
        ========================================================================== */}
        <TabsContent value="history" className="space-y-6 animate-in fade-in-50">
          <Card className="rounded-xl bg-white border border-stone-200 shadow-xs overflow-hidden">
            <CardHeader className="bg-stone-50/60 border-b border-stone-200/80 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-bold text-stone-900">
                  Histórico de Turnos e Fechamentos Anteriores
                </CardTitle>
                <p className="text-xs text-stone-500 mt-0.5">
                  Livro-caixa digital e auditoria dos expedientes concluídos
                </p>
              </div>

              <Badge variant="outline" className="text-xs font-semibold bg-white border-stone-300 text-stone-700 self-start sm:self-auto">
                {pastClosings.length} {pastClosings.length === 1 ? "fechamento" : "fechamentos"}
              </Badge>
            </CardHeader>

            <CardContent className="p-0">
              {pastClosings.length === 0 ? (
                <div className="py-16 px-4 flex flex-col items-center justify-center text-center text-stone-400 gap-1.5">
                  <Receipt className="w-8 h-8 stroke-1 text-stone-300" />
                  <p className="text-xs font-semibold text-stone-700">
                    Nenhum fechamento registrado no histórico
                  </p>
                  <p className="text-[11px] text-stone-400 max-w-sm">
                    Quando você encerrar um turno na aba <b>Conferência & Fechamento</b>, ele será arquivado aqui com comprovante térmico e extrato completo.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200/80 bg-stone-50/70 text-stone-500 font-semibold uppercase text-[10px]">
                        <th className="py-2.5 px-4">Data / Turno</th>
                        <th className="py-2.5 px-4">Operador</th>
                        <th className="py-2.5 px-4">Faturamento Bruto</th>
                        <th className="py-2.5 px-4">Gaveta Esperada</th>
                        <th className="py-2.5 px-4">Conferência (Quebra/Sobra)</th>
                        <th className="py-2.5 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {pastClosings.map((c) => {
                        const diff = Number(c.cash_drawer?.difference || 0);
                        const isDiffZero = Math.abs(diff) < 0.01;

                        return (
                          <tr key={c.id} className="hover:bg-stone-50/60 transition-colors">
                            <td className="py-3 px-4">
                              <span className="font-semibold text-stone-900 block">
                                {c.period_label || c.shift_date}
                              </span>
                              <span className="text-[10px] text-stone-400 font-mono">
                                Fechado em: {formatInBrasilia(c.closed_at || c.created_at, { includeSeconds: false })}
                              </span>
                            </td>

                            <td className="py-3 px-4 font-medium text-stone-700">
                              {c.cashier_name || "Operador"}
                            </td>

                            <td className="py-3 px-4 font-mono font-bold text-stone-900">
                              {formatMoney(c.gross_revenue)}
                              <span className="text-[10px] text-stone-400 block font-normal font-sans">
                                {c.total_orders || 0} pedidos
                              </span>
                            </td>

                            <td className="py-3 px-4 font-mono font-semibold text-stone-700">
                              {formatMoney(c.cash_drawer?.expectedInDrawer || c.cash_drawer?.totalCashExpected || 0)}
                            </td>

                            <td className="py-3 px-4">
                              {isDiffZero ? (
                                <Badge className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px] font-semibold rounded">
                                  ✓ Exato (R$ 0,00)
                                </Badge>
                              ) : diff > 0 ? (
                                <Badge className="bg-blue-50 text-blue-800 border-blue-300 text-[10px] font-semibold rounded">
                                  +{formatMoney(diff)} (Sobra)
                                </Badge>
                              ) : (
                                <Badge className="bg-rose-50 text-rose-800 border-rose-300 text-[10px] font-semibold rounded">
                                  -{formatMoney(Math.abs(diff))} (Falta)
                                </Badge>
                              )}
                              {c.cash_drawer?.justification && (
                                <span className="text-[10px] text-stone-500 block font-medium truncate max-w-xs mt-0.5">
                                  "{c.cash_drawer.justification}"
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right">
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
                                  className="h-7.5 px-2 rounded-md text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 gap-1 cursor-pointer"
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
                                  className="h-7.5 px-2 rounded-md text-xs font-medium text-emerald-800 hover:bg-emerald-50 gap-1 cursor-pointer"
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

      {/* 2. Modal Retirada de Dinheiro (Sangria) */}
      <CashBleedModal
        isOpen={bleedModalVisible}
        onClose={() => setBleedModalVisible(false)}
        currentDrawerBalance={expectedCashInDrawer}
        onConfirmBleed={handleConfirmBleed}
        currentOperator={cashDrawerInfo.operator}
      />

      {/* 3. Modal Adicionar Troco (Suprimento) */}
      <CashSupplyModal
        isOpen={supplyModalVisible}
        onClose={() => setSupplyModalVisible(false)}
        onConfirmSupply={handleConfirmSupply}
        currentOperator={cashDrawerInfo.operator}
      />

      {/* 4. Modal Registrar Despesa Local (Saída Operacional) */}
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

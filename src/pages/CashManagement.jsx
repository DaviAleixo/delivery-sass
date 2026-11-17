import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { invalidateCache } from "@/entities/storage";
import { Order } from "@/entities/Order";
import { Settings } from "@/entities/Settings";
import { ShiftClosing } from "@/entities/ShiftClosing";
import { createPageUrl } from "@/utils";
import { calculateShiftClosing, findOrphanShiftOrders, getStoreShiftInfo, SHOW_DRIVER_CLOSING_SECTIONS } from "@/utils/shiftClosingCalculator";
import {
  UUID_REGEX,
  CASH_SESSION_EVENT,
  resolveLoggedOperatorName,
  mapDbCashMovement,
  fetchActiveCashSessionState,
  openCashSessionAction,
  attachOrphanOrdersAction,
  notifyCashSessionChanged,
} from "@/utils/cashSessionService";
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
  Calculator,
  EyeOff,
  Eye,
} from "lucide-react";

// Cash Modals
import OpenCashModal from "@/components/admin/cash/OpenCashModal";
import CashBleedModal from "@/components/admin/cash/CashBleedModal";
import CashSupplyModal from "@/components/admin/cash/CashSupplyModal";
import CashExpenseModal from "@/components/admin/cash/CashExpenseModal";
import CashClosingConfirmModal from "@/components/admin/cash/CashClosingConfirmModal";
import BillCoinCalculatorModal from "@/components/admin/cash/BillCoinCalculatorModal";
import CashClosingAuditModal from "@/components/admin/cash/CashClosingAuditModal";
import CashSessionBanner from "@/components/admin/cash/CashSessionBanner";
import { createFinancialEntry } from "@/services/financialService";

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
  const [historyPeriodFilter, setHistoryPeriodFilter] = useState("all");
  const [historyOperatorFilter, setHistoryOperatorFilter] = useState("all");
  const [tenantBlindClosing, setTenantBlindClosing] = useState(false);

  const activeTenantId = useMemo(() => {
    return (
      settings?.id ||
      (typeof window !== "undefined" ? localStorage.getItem("current_tenant_id") : null) ||
      "a0000000-0000-0000-0000-000000000001"
    );
  }, [settings?.id]);

  const activeTenantStorageKey = useMemo(() => {
    const tid = (typeof window !== "undefined" ? localStorage.getItem("current_tenant_id") : null) || "default";
    return `pedemuleke_cash_drawer_${tid}`;
  }, []);

  // Estado do Caixa do Turno Atual (sincronizado com Supabase cash_sessions + fallback offline)
  const [isCashDrawerOpen, setIsCashDrawerOpen] = useState(() => {
    if (isSupabaseConfigured()) return false;
    try {
      const saved = localStorage.getItem(activeTenantStorageKey);
      if (saved) return JSON.parse(saved).isCashDrawerOpen ?? false;
    } catch {}
    return false;
  });
  const [cashDrawerInfo, setCashDrawerInfo] = useState(() => {
    try {
      const saved = localStorage.getItem(activeTenantStorageKey);
      if (!isSupabaseConfigured() && saved && JSON.parse(saved).cashDrawerInfo) {
        return JSON.parse(saved).cashDrawerInfo;
      }
    } catch {}
    return {
      sessionId: null,
      openedAt: null,
      closedAt: null,
      operator: resolveLoggedOperatorName(),
      initialFloat: 0,
      notes: "",
      blindClosing: false,
      lastClosedSessionId: null,
    };
  });

  // Pedidos criados enquanto o caixa estava fechado aguardando vínculo ao turno
  const [serverOrphanOrders, setServerOrphanOrders] = useState([]);
  const [lastClosedAtRef, setLastClosedAtRef] = useState(null);

  // Lista de Movimentações Financeiras Manuais do Turno
  const [manualMovements, setManualMovements] = useState(() => {
    if (isSupabaseConfigured()) return [];
    try {
      const saved = localStorage.getItem(activeTenantStorageKey);
      if (saved && Array.isArray(JSON.parse(saved).manualMovements)) {
        return JSON.parse(saved).manualMovements;
      }
    } catch {}
    return [];
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
  const [billCalculatorOpen, setBillCalculatorOpen] = useState(false);
  const [auditModalClosing, setAuditModalClosing] = useState(null);

  // Filtro de período para o Fechamento de Caixa
  const [periodMode, setPeriodMode] = useState("today");
  const [closingSaved, setClosingSaved] = useState(false);
  const [isSavingClosing, setIsSavingClosing] = useState(false);

  // Conferência de Caixa (Contagem de Dinheiro)
  const [countedCashStr, setCountedCashStr] = useState("");
  const [calculatorCounts, setCalculatorCounts] = useState(null);
  const [cashDifferenceJustification, setCashDifferenceJustification] = useState("");
  const [copiedPixId, setCopiedPixId] = useState(null);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

  // Filtro na tabela de movimentações da Aba 1
  const [movementFilter, setMovementFilter] = useState("all");

  // Carrega dados iniciais + Sessão de Caixa Ativa no Supabase
  const loadCashPageData = async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    try {
      const tid =
        localStorage.getItem("current_tenant_id") ||
        "a0000000-0000-0000-0000-000000000001";

      invalidateCache("orders");
      const [ordersData, settingsData, closingsData, sessionState] = await Promise.all([
        Order.list("-created_date", 250).catch(() => []),
        Settings.get().catch(() => null),
        ShiftClosing.list("-created_at", 50).catch(() => []),
        fetchActiveCashSessionState(tid).catch(() => null),
      ]);

      const tenantRow = sessionState?.tenantRow || null;
      if (sessionState) {
        setIsCashDrawerOpen(Boolean(sessionState.isCashDrawerOpen));
        setCashDrawerInfo((prev) => ({
          ...sessionState.cashDrawerInfo,
          lastClosedSessionId:
            sessionState.cashDrawerInfo?.sessionId ||
            prev.lastClosedSessionId ||
            sessionState.lastClosedSessionId ||
            null,
        }));
        setManualMovements(sessionState.manualMovements || []);
        setServerOrphanOrders(sessionState.orphanOrders || []);
        setLastClosedAtRef(sessionState.lastClosedAt || null);
        if (sessionState.isCashDrawerOpen) {
          setClosingSaved(false);
        }
      }

      const mergedSettings = {
        ...(settingsData || {}),
        ...(tenantRow || {}),
      };
      setOrders(ordersData || []);
      setSettings(mergedSettings);
      setTenantBlindClosing(Boolean(tenantRow?.blind_cash_closing));
      setPastClosings(closingsData || []);

      const name =
        tenantRow?.name ||
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
      if (showSpinner) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCashPageData(true);
    const handleSync = () => loadCashPageData(false);
    if (typeof window !== "undefined") {
      window.addEventListener(CASH_SESSION_EVENT, handleSync);
      window.addEventListener("db_event_orders", handleSync);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(CASH_SESSION_EVENT, handleSync);
        window.removeEventListener("db_event_orders", handleSync);
      }
    };
  }, []);

  const orphanOrders = useMemo(() => {
    if (isSupabaseConfigured() && UUID_REGEX.test(String(activeTenantId || ""))) {
      return serverOrphanOrders;
    }
    return findOrphanShiftOrders(orders, lastClosedAtRef);
  }, [activeTenantId, serverOrphanOrders, orders, lastClosedAtRef]);

  const isBlindActive = Boolean(
    (tenantBlindClosing || cashDrawerInfo.blindClosing) && isCashDrawerOpen
  );

  // Sincroniza a query string com a aba ativa
  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    const search = new URLSearchParams(location.search);
    search.set("tab", newTab);
    navigate({ search: search.toString() }, { replace: true });
  };

  // Informações do Turno
  const _shiftInfo = useMemo(() => getStoreShiftInfo(settings), [settings]);

  // Cálculo Oficial do Fechamento do Turno com vínculo real (cash_session_id) e janela exata
  const activeCashSessionId = useMemo(() => {
    if (periodMode !== "today") return null;
    if (isCashDrawerOpen && cashDrawerInfo?.sessionId) return cashDrawerInfo.sessionId;
    if (!isCashDrawerOpen && closingSaved && cashDrawerInfo?.lastClosedSessionId) {
      return cashDrawerInfo.lastClosedSessionId;
    }
    return null;
  }, [periodMode, isCashDrawerOpen, closingSaved, cashDrawerInfo?.sessionId, cashDrawerInfo?.lastClosedSessionId]);

  const shiftClosingData = useMemo(() => {
    let customRange = null;
    if (periodMode === "today" && cashDrawerInfo?.openedAt) {
      const endPoint =
        !isCashDrawerOpen && cashDrawerInfo?.closedAt
          ? cashDrawerInfo.closedAt
          : new Date(
              Math.max(Date.now(), new Date(cashDrawerInfo.openedAt).getTime())
            ).toISOString();
      customRange = {
        start: cashDrawerInfo.openedAt,
        end: endPoint,
      };
    }

    return calculateShiftClosing({
      orders,
      drivers,
      tenantSettings: settings,
      periodMode,
      customRange,
      activeCashSessionId,
    });
  }, [orders, drivers, settings, periodMode, cashDrawerInfo?.openedAt, cashDrawerInfo?.closedAt, isCashDrawerOpen, activeCashSessionId]);

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
  const cashAtCounter = SHOW_DRIVER_CLOSING_SECTIONS
    ? cashDrawer.cashDirectCounter
    : cashDrawer.totalCashExpected;
  const cashWithDrivers = cashDrawer.cashCollectedByDrivers;

  // Saldo Esperado Físico na Gaveta:
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

  // Consolidação de Movimentações para a Tabela
  const allShiftMovements = useMemo(() => {
    const list = [...manualMovements];

    if (isCashDrawerOpen || cashDrawerInfo.openedAt) {
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
          title: `Venda em Dinheiro (#${ord.order_number || ord.id?.slice(-4) || ord.id})`,
          category: isCounter ? "Balcão / Mesa" : SHOW_DRIVER_CLOSING_SECTIONS ? "Entrega (com Motoboy)" : "Entrega (Delivery)",
          amount: Number(ord.total_amount || ord.total || 0),
          direction: isCounter || !SHOW_DRIVER_CLOSING_SECTIONS ? "in" : "pending_driver",
          operator: ord.customer_name || "Cliente Balcão",
          timestamp: ord.created_date || new Date().toISOString(),
          notes: isCounter
            ? "Recebido direto no caixa"
            : SHOW_DRIVER_CLOSING_SECTIONS
            ? `Em trânsito com ${ord.driver_name || "entregador"}`
            : "Pedido Delivery em dinheiro",
        });
      }
    }

    return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [manualMovements, shiftClosingData, isCashDrawerOpen, cashDrawerInfo.openedAt]);

  // Filtro da tabela de movimentações
  const filteredMovements = useMemo(() => {
    if (movementFilter === "all") return allShiftMovements;
    if (movementFilter === "sales") return allShiftMovements.filter((m) => m.type === "sale_cash");
    if (movementFilter === "bleeds") return allShiftMovements.filter((m) => m.type === "bleed");
    if (movementFilter === "supplies") return allShiftMovements.filter((m) => m.type === "supply");
    if (movementFilter === "expenses") return allShiftMovements.filter((m) => m.type === "expense");
    return allShiftMovements;
  }, [allShiftMovements, movementFilter]);

  const periodFilteredPastClosings = useMemo(() => {
    const nowParts = getBrasiliaParts(new Date());
    const nowMs = Date.now();
    return pastClosings.filter((c) => {
      if (historyPeriodFilter === "all") return true;
      const refDate = c.closed_at || c.created_at;
      if (!refDate) return true;
      const parsed = new Date(refDate);
      if (Number.isNaN(parsed.getTime())) return true;
      if (historyPeriodFilter === "today") {
        return getBrasiliaParts(parsed).dateKey === nowParts.dateKey;
      }
      const diffDays = (nowMs - parsed.getTime()) / (1000 * 60 * 60 * 24);
      if (historyPeriodFilter === "7d") return diffDays <= 7;
      if (historyPeriodFilter === "30d") return diffDays <= 30;
      return true;
    });
  }, [pastClosings, historyPeriodFilter]);

  const historyOperators = useMemo(() => {
    const names = new Set();
    for (const c of periodFilteredPastClosings) {
      const op = (c.cashier_name || c.cash_drawer?.openedBy || "Operador").trim();
      if (op) names.add(op);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [periodFilteredPastClosings]);

  const filteredPastClosings = useMemo(() => {
    if (historyOperatorFilter === "all") return periodFilteredPastClosings;
    return periodFilteredPastClosings.filter((c) => {
      const op = (c.cashier_name || c.cash_drawer?.openedBy || "Operador").trim();
      return op === historyOperatorFilter;
    });
  }, [periodFilteredPastClosings, historyOperatorFilter]);

  const formatHistoryTurnLabel = (c) => {
    if (c.opened_at && c.closed_at) {
      const openParts = getBrasiliaParts(new Date(c.opened_at));
      const closeParts = getBrasiliaParts(new Date(c.closed_at));
      if (openParts?.dateKey && closeParts?.dateKey) {
        const openDate = `${openParts.day}/${openParts.month}/${openParts.year}`;
        const openTime = `${openParts.hour}:${openParts.minute}`;
        const closeDate = `${closeParts.day}/${closeParts.month}`;
        const closeTime = `${closeParts.hour}:${closeParts.minute}`;
        if (openParts.dateKey === closeParts.dateKey) {
          return `${openDate} • ${openTime} → ${closeTime}`;
        }
        return `${openParts.day}/${openParts.month} ${openTime} → ${closeDate} ${closeTime}`;
      }
    }
    return (c.period_label || c.shift_date || "Turno")
      .replace(/^Personalizado:\s*/i, "")
      .replace(/\s+até\s+/i, " → ");
  };

  // Indicadores Executivos do Dono na Aba 3 (Histórico e Auditoria)
  const historyAuditStats = useMemo(() => {
    let totalShortage = 0;
    let shortageCount = 0;
    let totalSurplus = 0;
    let surplusCount = 0;
    let divergentTurns = 0;

    for (const c of filteredPastClosings) {
      const diff = Number(c.cash_drawer?.difference ?? 0);
      if (diff < -0.01) {
        totalShortage += Math.abs(diff);
        shortageCount += 1;
        divergentTurns += 1;
      } else if (diff > 0.01) {
        totalSurplus += diff;
        surplusCount += 1;
        divergentTurns += 1;
      }
    }

    return { totalShortage, shortageCount, totalSurplus, surplusCount, divergentTurns };
  }, [filteredPastClosings]);

  // Handlers de Ações Manuais (Supabase RPCs + fallback offline)
  const handleConfirmOpen = async ({ operator, initialFloat: floatVal, notes, openedAt, attachOrderIds }) => {
    const res = await openCashSessionAction({
      tenantId: activeTenantId,
      initialFloat: floatVal,
      operator,
      notes,
      openedAt,
      attachOrderIds,
      blindClosing: tenantBlindClosing,
    });

    setIsCashDrawerOpen(true);
    setClosingSaved(false);
    setCountedCashStr("");
    setCashDifferenceJustification("");
    setCalculatorCounts(null);
    setPeriodMode("today");
    setCashDrawerInfo({
      sessionId: res.sessionId,
      lastClosedSessionId: res.sessionId,
      openedAt: res.openedAt,
      closedAt: null,
      operator: res.operator,
      initialFloat: res.initialFloat,
      notes: res.notes,
      blindClosing: res.blindClosing,
    });
    setManualMovements(res.movements || []);
    await loadCashPageData(false);
    return res;
  };

  const handleAttachOrphans = async (orderIds = null) => {
    const res = await attachOrphanOrdersAction({
      tenantId: activeTenantId,
      sessionId: cashDrawerInfo.sessionId,
      orderIds,
    });
    await loadCashPageData(false);
    return res;
  };

  const handleConfirmBleed = async (data) => {
    if (isSupabaseConfigured() && supabase && UUID_REGEX.test(activeTenantId) && cashDrawerInfo.sessionId) {
      const { data: mov, error } = await supabase.rpc("add_cash_movement", {
        p_tenant_id: activeTenantId,
        p_session_id: cashDrawerInfo.sessionId,
        p_type: "bleed",
        p_title: "Sangria de Caixa (Retirada)",
        p_amount: data.amount,
        p_operator: data.operator || cashDrawerInfo.operator,
        p_category: data.reason,
        p_notes: data.notes || `Destino: ${data.reason}`,
      });
      if (error) throw new Error(error.message || "Falha ao registrar sangria.");
      setManualMovements((prev) => [mapDbCashMovement(mov), ...prev]);
      if (mov?.id) {
        createFinancialEntry({
          tenantId: activeTenantId,
          entryType: "transfer",
          description: `Sangria de Caixa (${data.reason || "Cofre"})`,
          category: "Sangria / Cofre",
          amount: data.amount,
          accountCode: "drawer",
          targetAccountCode: "safe",
          operatorName: data.operator || cashDrawerInfo.operator,
          notes: data.notes || `Destino: ${data.reason || "Cofre"}`,
          sourceType: "cash_bleed",
          sourceId: mov.id,
        }).catch((syncErr) => {
          console.warn("[CashManagement] Aviso ao sincronizar sangria no Financeiro:", syncErr);
        });
      }
      return;
    }

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

  const handleConfirmSupply = async (data) => {
    if (isSupabaseConfigured() && supabase && UUID_REGEX.test(activeTenantId) && cashDrawerInfo.sessionId) {
      const { data: mov, error } = await supabase.rpc("add_cash_movement", {
        p_tenant_id: activeTenantId,
        p_session_id: cashDrawerInfo.sessionId,
        p_type: "supply",
        p_title: "Suprimento de Caixa (Entrada)",
        p_amount: data.amount,
        p_operator: data.operator || cashDrawerInfo.operator,
        p_category: data.reason,
        p_notes: data.notes || `Origem: ${data.reason}`,
      });
      if (error) throw new Error(error.message || "Falha ao registrar suprimento.");
      setManualMovements((prev) => [mapDbCashMovement(mov), ...prev]);
      return;
    }

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
        notes: data.notes || `Origem: ${data.reason}`,
      },
      ...prev,
    ]);
  };

  const handleConfirmExpense = async (data) => {
    const title = `Despesa: ${data.categoryLabel}`;
    const noteText = data.description + (data.notes ? ` • ${data.notes}` : "");

    if (isSupabaseConfigured() && supabase && UUID_REGEX.test(activeTenantId) && cashDrawerInfo.sessionId) {
      const { data: mov, error } = await supabase.rpc("add_cash_movement", {
        p_tenant_id: activeTenantId,
        p_session_id: cashDrawerInfo.sessionId,
        p_type: "expense",
        p_title: title,
        p_amount: data.amount,
        p_operator: data.operator || cashDrawerInfo.operator,
        p_category: data.category,
        p_notes: noteText,
      });
      if (error) throw new Error(error.message || "Falha ao registrar despesa.");
      setManualMovements((prev) => [mapDbCashMovement(mov), ...prev]);
      if (mov?.id) {
        createFinancialEntry({
          tenantId: activeTenantId,
          entryType: "expense",
          description: `${data.categoryLabel || "Despesa"}: ${data.description || "Despesa no caixa"}`,
          category: data.categoryLabel || data.category || "Outros",
          amount: data.amount,
          accountCode: "drawer",
          operatorName: data.operator || cashDrawerInfo.operator,
          notes: noteText,
          sourceType: "cash_expense",
          sourceId: mov.id,
        }).catch((syncErr) => {
          console.warn("[CashManagement] Aviso ao sincronizar despesa no Financeiro:", syncErr);
        });
      }
      return;
    }

    setManualMovements((prev) => [
      {
        id: `mov-exp-${Date.now()}`,
        type: "expense",
        title,
        category: data.category,
        amount: data.amount,
        direction: "out",
        operator: data.operator,
        timestamp: data.timestamp,
        notes: noteText,
      },
      ...prev,
    ]);
  };

  const buildCompleteCashDrawerPayload = ({ counted, diff, justification, closedBy }) => ({
    ...cashDrawer,
    initialFloat,
    cashSales: cashAtCounter,
    supplies: movementsSummary.totalSupplies,
    bleeds: movementsSummary.totalBleeds,
    expenses: movementsSummary.totalExpenses,
    totalBleeds: movementsSummary.totalBleeds,
    totalSupplies: movementsSummary.totalSupplies,
    totalExpenses: movementsSummary.totalExpenses,
    expectedCashInDrawer,
    expectedInDrawer: expectedCashInDrawer,
    totalCashExpected: expectedCashInDrawer,
    countedCash: counted,
    difference: diff,
    justification,
    openedBy: cashDrawerInfo.operator,
    closedBy: closedBy || resolveLoggedOperatorName(),
    blindClosing: Boolean(tenantBlindClosing || cashDrawerInfo.blindClosing),
    movements: manualMovements,
    billCounts: calculatorCounts,
  });

  const handleFinalCloseShift = async ({
    countedCash: counted,
    difference: diff,
    justification,
    closedAt,
    retainedFloat,
    collectedToSafe,
  }) => {
    setIsSavingClosing(true);
    try {
      const shiftDate = bounds?.start
        ? getBrasiliaParts(bounds.start).dateKey
        : getBrasiliaParts(new Date()).dateKey;
      const closedBy = resolveLoggedOperatorName();
      const completeCashDrawer = buildCompleteCashDrawerPayload({
        counted,
        diff,
        justification,
        closedBy,
      });

      const payload = {
        tenant_id: activeTenantId,
        shift_date: shiftDate,
        period_mode: bounds?.mode || periodMode,
        period_label: bounds?.label || "Turno",
        opened_at: cashDrawerInfo.openedAt || (bounds?.start ? bounds.start.toISOString() : closedAt),
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
        cash_drawer: completeCashDrawer,
        driver_settlements: driversClosing?.settlements || [],
        raw_closing_data: {
          ...shiftClosingData,
          cashDrawer: completeCashDrawer,
          cash_drawer: completeCashDrawer,
          cashier_name: cashDrawerInfo.operator,
          closedBy,
          initialFloat,
          expectedCashInDrawer,
          countedCash: counted,
          difference: diff,
          justification,
        },
      };

      const saved = await ShiftClosing.create(payload);

      if (isSupabaseConfigured() && supabase && UUID_REGEX.test(activeTenantId) && cashDrawerInfo.sessionId) {
        const { error: closeRpcErr } = await supabase.rpc("close_cash_session", {
          p_tenant_id: activeTenantId,
          p_session_id: cashDrawerInfo.sessionId,
          p_expected_cash: expectedCashInDrawer,
          p_counted_cash: counted,
          p_difference: diff,
          p_justification: justification || "",
          p_closed_by: closedBy,
          p_blind_closing: Boolean(tenantBlindClosing || cashDrawerInfo.blindClosing),
          p_shift_closing_id: UUID_REGEX.test(String(saved?.id || "")) ? saved.id : null,
        });
        if (closeRpcErr) {
          throw new Error(closeRpcErr.message || "Erro ao encerrar sessão de caixa no servidor.");
        }

        const safeRetained =
          retainedFloat !== undefined && retainedFloat !== null
            ? Math.max(0, Number(retainedFloat))
            : Math.max(0, Number(counted || 0));
        const safeCollected = Math.max(0, Number(collectedToSafe || 0));

        await supabase
          .from("cash_sessions")
          .update({
            retained_float: safeRetained,
            collected_to_safe: safeCollected,
          })
          .eq("id", cashDrawerInfo.sessionId)
          .eq("tenant_id", activeTenantId);

        const syncTasks = [];
        if (safeCollected > 0) {
          syncTasks.push(
            createFinancialEntry({
              tenantId: activeTenantId,
              entryType: "transfer",
              description: `Recolhimento de fechamento de turno (${cashDrawerInfo.operator})`,
              category: "Fechamento de Caixa",
              amount: safeCollected,
              accountCode: "drawer",
              targetAccountCode: "safe",
              operatorName: closedBy,
              notes: `Troco mantido na gaveta: ${formatMoney(safeRetained)}`,
              sourceType: "shift_closing_safe",
              sourceId: cashDrawerInfo.sessionId,
            })
          );
        }

        const nonCashRevenue = Math.max(
          0,
          Number((Number(summary.grossRevenue || 0) - Number(cashAtCounter || 0)).toFixed(2))
        );
        if (nonCashRevenue > 0) {
          syncTasks.push(
            createFinancialEntry({
              tenantId: activeTenantId,
              entryType: "income",
              description: `Vendas Pix/Cartão do turno (${shiftDate})`,
              category: "Vendas do Turno",
              amount: nonCashRevenue,
              accountCode: "bank",
              operatorName: closedBy,
              sourceType: "shift_closing_bank",
              sourceId: cashDrawerInfo.sessionId,
            })
          );
        }

        const cashSalesTotal = Math.max(0, Number(Number(cashAtCounter || 0).toFixed(2)));
        if (cashSalesTotal > 0) {
          syncTasks.push(
            createFinancialEntry({
              tenantId: activeTenantId,
              entryType: "income",
              description: `Vendas em Dinheiro do turno (${shiftDate})`,
              category: "Vendas do Turno",
              amount: cashSalesTotal,
              accountCode: "drawer",
              operatorName: closedBy,
              sourceType: "shift_closing_cash_sales",
              sourceId: cashDrawerInfo.sessionId,
            })
          );
        }

        if (syncTasks.length > 0) {
          Promise.allSettled(syncTasks).catch(() => {});
        }
      }

      setIsCashDrawerOpen(false);
      setCashDrawerInfo((prev) => ({
        ...prev,
        lastClosedSessionId: prev.sessionId || prev.lastClosedSessionId || null,
        sessionId: null,
        closedAt,
      }));
      notifyCashSessionChanged({ type: "close" });
      setPastClosings((prev) => [saved, ...prev]);
      setClosingSaved(true);
      setCashDifferenceJustification(justification || "");
      toast.success("Fechamento de Caixa gravado no histórico!", {
        description: `Caixa fechado com sucesso por ${cashDrawerInfo.operator}.`,
      });
    } catch (err) {
      console.error("[CashManagement] Erro ao fechar caixa:", err);
      toast.error(err?.message || "Erro ao registrar fechamento no histórico.");
      throw err;
    } finally {
      setIsSavingClosing(false);
    }
  };

  const canExportCurrentClosing = !isCashDrawerOpen && closingSaved;

  // Ações de compartilhamento e impressão térmica
  const handlePrint = (closingRecord = null) => {
    try {
      if (!closingRecord && !canExportCurrentClosing) {
        toast.info("Feche o caixa primeiro para imprimir o cupom oficial de fechamento.");
        return;
      }
      if (!closingRecord && isBlindActive && periodMode === "today") {
        toast.info("No Modo Cego, o cupom completo é liberado após o encerramento do caixa.");
        return;
      }
      const closingToPrint = closingRecord
        ? {
            ...(closingRecord.raw_closing_data || closingRecord),
            cashDrawer:
              closingRecord.raw_closing_data?.cashDrawer ||
              closingRecord.cash_drawer ||
              closingRecord.raw_closing_data?.cash_drawer,
            cashier_name: closingRecord.cashier_name,
          }
        : (() => {
            const completeDrawer = buildCompleteCashDrawerPayload({
              counted: hasCountedInput ? countedCash : expectedCashInDrawer,
              diff: hasCountedInput ? difference : 0,
              justification: cashDifferenceJustification,
              closedBy: resolveLoggedOperatorName(),
            });
            return {
              ...shiftClosingData,
              cashDrawer: completeDrawer,
              cash_drawer: completeDrawer,
              cashier_name: cashDrawerInfo.operator,
              initialFloat,
              expectedCashInDrawer,
              countedCash: hasCountedInput ? countedCash : undefined,
              difference: hasCountedInput ? difference : 0,
              justification: cashDifferenceJustification,
            };
          })();

      sessionStorage.setItem("shift_closing_print_data", JSON.stringify(closingToPrint));
      sessionStorage.setItem("current_tenant_name", storeName);
      window.open(createPageUrl("PrintShiftClosing"), "_blank");
    } catch (err) {
      console.error("[CashManagement] Erro ao abrir impressão:", err);
      window.print();
    }
  };

  const handleCopyWhatsApp = (closingRecord = null) => {
    if (!closingRecord && !canExportCurrentClosing) {
      toast.info("Feche o caixa primeiro para copiar o resumo oficial de fechamento.");
      return;
    }
    if (!closingRecord && isBlindActive && periodMode === "today") {
      toast.info("No Modo Cego, o resumo para WhatsApp é liberado após o encerramento do caixa.");
      return;
    }
    const sourceData = closingRecord
      ? closingRecord.raw_closing_data || closingRecord
      : (() => {
          const completeDrawer = buildCompleteCashDrawerPayload({
            counted: hasCountedInput ? countedCash : expectedCashInDrawer,
            diff: hasCountedInput ? difference : 0,
            justification: cashDifferenceJustification,
            closedBy: resolveLoggedOperatorName(),
          });
          return {
            ...shiftClosingData,
            cashDrawer: completeDrawer,
            cash_drawer: completeDrawer,
            cashier_name: cashDrawerInfo.operator,
          };
        })();
    const text = generateWhatsAppClosingText(sourceData, storeName);
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
            {tenantBlindClosing && (
              <Badge
                variant="outline"
                className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-stone-900 text-white border-stone-800 gap-1"
              >
                <EyeOff className="w-3 h-3" />
                Modo Cego
              </Badge>
            )}
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {storeName} • Faturamento consolidado por canal e controle auditável da gaveta física
          </p>
        </div>

        {/* Barra de Ações Rápidas (exibida apenas com caixa aberto; quando fechado o banner abaixo já oferece abertura em 1 clique) */}
        {isCashDrawerOpen && (
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        )}
      </div>

      {/* Banner de Pedidos Órfãos (feitos antes da abertura do caixa) */}
      {(orphanOrders.length > 0 || !isCashDrawerOpen) && (
        <CashSessionBanner
          isLoading={isLoading}
          isCashDrawerOpen={isCashDrawerOpen}
          cashDrawerInfo={cashDrawerInfo}
          orphanOrders={orphanOrders}
          onOpenCashClick={() => setOpenModalVisible(true)}
          onAttachOrphans={handleAttachOrphans}
          compactWhenOpenWithoutOrphans={false}
        />
      )}

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
                {isBlindActive ? (
                  <Badge variant="outline" className="text-[9px] font-semibold text-stone-700 bg-stone-100 border-stone-300 px-1.5 py-0 gap-1">
                    <EyeOff className="w-2.5 h-2.5" /> Modo Cego
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] font-semibold text-emerald-800 bg-emerald-50 border-emerald-200 px-1.5 py-0">
                    Ao Vivo
                  </Badge>
                )}
              </div>
              <p className="text-2xl font-bold font-mono text-stone-900 mt-1">
                {isBlindActive ? "•••••" : formatMoney(expectedCashInDrawer)}
              </p>
              <span className="text-[11px] text-stone-500 mt-0.5 block">
                {isBlindActive ? "Saldo oculto até o fechamento" : "Físico disponível na loja"}
              </span>
            </Card>

            {/* Card 2: Faturamento Total */}
            <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide block">
                Faturamento do Turno
              </span>
              <p className="text-2xl font-bold font-mono text-stone-900 mt-1">
                {isBlindActive ? "•••••" : formatMoney(summary.grossRevenue)}
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

                <Badge variant="outline" className={`text-[10px] font-semibold ${isBlindActive ? "text-stone-700 bg-stone-100 border-stone-300" : "text-emerald-800 bg-emerald-50 border-emerald-200"}`}>
                  {isBlindActive ? "Saldo: Oculto (Modo Cego)" : `Saldo: ${formatMoney(expectedCashInDrawer)}`}
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
                      <span className="text-emerald-600 font-mono font-bold">(+)</span>{" "}
                      {SHOW_DRIVER_CLOSING_SECTIONS ? "Vendas em Dinheiro (Balcão):" : "Vendas em Dinheiro:"}
                    </span>
                    <span className="font-semibold font-mono text-emerald-700">
                      {isBlindActive ? "Oculto (Modo Cego)" : `+${formatMoney(cashAtCounter)}`}
                    </span>
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

                  {SHOW_DRIVER_CLOSING_SECTIONS && cashWithDrivers > 0 && (
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
                    disabled={!isCashDrawerOpen}
                    onClick={() => setSupplyModalVisible(true)}
                    className="bg-stone-50 hover:bg-blue-50 text-stone-700 hover:text-blue-800 border-stone-200 rounded-lg text-xs font-semibold gap-1 h-8.5 cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
                    <span>Suprimento</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!isCashDrawerOpen}
                    onClick={() => setBleedModalVisible(true)}
                    className="bg-stone-50 hover:bg-amber-50 text-stone-700 hover:text-amber-800 border-stone-200 rounded-lg text-xs font-semibold gap-1 h-8.5 cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    <ArrowDownRight className="w-3.5 h-3.5 text-amber-600" />
                    <span>Sangria</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!isCashDrawerOpen}
                    onClick={() => setExpenseModalVisible(true)}
                    className="bg-stone-50 hover:bg-rose-50 text-stone-700 hover:text-rose-800 border-stone-200 rounded-lg text-xs font-semibold gap-1 h-8.5 cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    <Receipt className="w-3.5 h-3.5 text-rose-600" />
                    <span>Despesa</span>
                  </Button>
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                  <span>Operador: <b className="text-stone-800">{cashDrawerInfo.operator}</b></span>
                  <span>
                    {cashDrawerInfo.openedAt
                      ? `Aberto às ${formatInBrasilia(cashDrawerInfo.openedAt, { includeSeconds: false })}`
                      : "Caixa fechado"}
                  </span>
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
                    isCash: true,
                  },
                  {
                    label: "Vale Refeição / Alimentação",
                    icon: <UtensilsCrossed className="w-4 h-4 text-amber-600" />,
                    val: payments.mealVoucher.total,
                    count: payments.mealVoucher.count,
                    note: "Pluxee / Sodexo, VR, Ticket, Alelo",
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
                        {row.isCash && isBlindActive ? "Oculto (Modo Cego)" : formatMoney(row.val)}
                      </span>
                      <span className="text-[10px] text-stone-400 font-medium">
                        {isBlindActive ? "Modo Cego" : `${calculatePct(row.val)} do faturamento`}
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
          {/* Barra do Turno Atual e Ações de Exportação (liberadas após o fechamento) */}
          <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-900 text-white">
                {isCashDrawerOpen ? (
                  <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-stone-300" />
                )}
                <span>Turno Atual • {cashDrawerInfo.operator}</span>
              </span>

              <span className="text-xs font-medium text-stone-500 bg-stone-50 px-3 py-1.5 rounded-lg border border-stone-200">
                {(bounds?.label || "Turno Atual").replace(/^Personalizado:\s*/i, "Período: ")}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!canExportCurrentClosing && (
                <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                  Libera após fechar o caixa
                </span>
              )}

              <Button
                type="button"
                variant="outline"
                disabled={!canExportCurrentClosing}
                onClick={() => handleCopyWhatsApp()}
                title={
                  canExportCurrentClosing
                    ? "Copiar resumo oficial do fechamento para WhatsApp"
                    : "Conclua o fechamento do caixa para liberar o envio"
                }
                className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded-lg text-xs font-semibold gap-1.5 h-9 cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Share2 className="w-3.5 h-3.5 text-emerald-700" />
                <span>{copiedWhatsApp ? "Copiado!" : "Copiar p/ WhatsApp"}</span>
              </Button>

              <Button
                type="button"
                disabled={!canExportCurrentClosing}
                onClick={() => handlePrint()}
                title={
                  canExportCurrentClosing
                    ? "Imprimir cupom térmico oficial do fechamento"
                    : "Conclua o fechamento do caixa para liberar a impressão"
                }
                className="bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-xs font-semibold gap-1.5 h-9 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
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
                {isBlindActive && periodMode === "today" ? "•••••" : formatMoney(summary.grossRevenue)}
              </p>
              <span className="text-[10px] text-stone-400 mt-0.5 block">
                {isBlindActive && periodMode === "today" ? "Oculto no Modo Cego" : "Todas as vendas do período"}
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
                Ticket Médio: {isBlindActive && periodMode === "today" ? "•••••" : formatMoney(summary.averageTicket)}
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
                {isBlindActive && periodMode === "today" ? "•••••" : formatMoney(expectedCashInDrawer)}
              </p>
              <span className="text-[10px] text-stone-400 mt-0.5 block">
                {isBlindActive && periodMode === "today" ? "Modo Cego (Antifraude)" : "Dinheiro físico a conferir"}
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
                  {isBlindActive && periodMode === "today"
                    ? "Fechamento Cego ativo: conte as cédulas e moedas da gaveta sem visualizar o saldo esperado"
                    : "Informe o valor físico apurado em notas e moedas para checar se houve sobra ou falta de caixa"}
                </p>
              </div>

              {isBlindActive && periodMode === "today" ? (
                <Badge className="bg-stone-900 text-white border-0 text-[11px] font-semibold px-3 py-1 gap-1.5 self-start sm:self-auto">
                  <EyeOff className="w-3.5 h-3.5 text-amber-300" />
                  Modo Cego Ativo (Saldo Oculto)
                </Badge>
              ) : (
                <div className="text-right">
                  <span className="text-[10px] uppercase font-semibold text-stone-400 block">Saldo Esperado pelo Sistema</span>
                  <span className="text-lg font-bold font-mono text-stone-900">{formatMoney(expectedCashInDrawer)}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Campo de Entrada: Valor Contado */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-semibold text-stone-700">
                    Valor Total Contado na Gaveta:
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBillCalculatorOpen(true)}
                    className="h-7 px-2.5 text-[11px] font-semibold text-stone-800 border-stone-300 hover:bg-stone-100 gap-1.5 cursor-pointer"
                  >
                    <Calculator className="w-3.5 h-3.5 text-emerald-700" />
                    Contar Notas e Moedas
                  </Button>
                </div>

                <CurrencyInput
                  value={countedCashStr}
                  onChange={(e) => setCountedCashStr(e.target.value)}
                  placeholder="R$ 0,00"
                  className="text-2xl h-14 font-bold font-mono text-center rounded-lg border-2 border-stone-300 focus-visible:border-stone-900 text-stone-900 bg-stone-50/50"
                />

                <p className="text-[11px] text-stone-500">
                  Conte o dinheiro na gaveta no final do turno e digite o total ou use a calculadora de cédulas.
                </p>
              </div>

              {/* Resultado do Confronto */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-stone-700">Resultado da Auditoria:</Label>

                {!hasCountedInput ? (
                  <div className="p-4 rounded-lg bg-stone-50 border border-stone-200 text-center text-xs text-stone-500">
                    Aguardando a digitação do valor contado para liberar o fechamento...
                  </div>
                ) : isBlindActive && periodMode === "today" ? (
                  <div className="p-4 rounded-lg bg-stone-900 text-white space-y-1.5">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <EyeOff className="w-4 h-4 text-amber-300" />
                      <span>Contagem Cega Declarada: {formatMoney(countedCash)}</span>
                    </div>
                    <p className="text-[11px] text-stone-300 leading-relaxed">
                      Para evitar manipulação, o comparativo (Sobra/Falta) só será revelado após travar sua contagem no botão de encerramento abaixo.
                    </p>
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

                {/* Justificativa no modo aberto */}
                {!(isBlindActive && periodMode === "today") && hasCountedInput && !isExactDifference && (
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
          {SHOW_DRIVER_CLOSING_SECTIONS && driversClosing?.hasDrivers && (
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
                {!hasCountedInput && !closingSaved
                  ? "Digite o valor contado na gaveta acima para liberar o encerramento oficial do caixa."
                  : "Ao encerrar, este expediente é arquivado no Histórico e Auditoria com o comprovante imutável gerado para reimpressão."}
              </p>
            </div>

            <Button
              type="button"
              onClick={() => {
                if (!hasCountedInput) {
                  toast.error("Informe quanto há em dinheiro na gaveta antes de encerrar.");
                  return;
                }
                setClosingConfirmModalVisible(true);
              }}
              disabled={isSavingClosing || closingSaved || !hasCountedInput || (!isCashDrawerOpen && periodMode === "today")}
              className={`rounded-lg text-xs font-semibold px-5 py-2.5 shadow-xs gap-2 cursor-pointer transition-all disabled:opacity-50 ${
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
        <TabsContent value="history" className="space-y-5 animate-in fade-in-50">
          {/* Barra de Filtros da Auditoria (Período + Operador) */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-stone-200 rounded-xl px-4 py-2.5 shadow-2xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-stone-500 mr-1">Período:</span>
              {[
                { id: "all", label: "Tudo" },
                { id: "today", label: "Hoje" },
                { id: "7d", label: "7 dias" },
                { id: "30d", label: "30 dias" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setHistoryPeriodFilter(opt.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    historyPeriodFilter === opt.id
                      ? "bg-stone-900 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {historyOperators.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-stone-500">Operador:</span>
                <select
                  value={historyOperatorFilter}
                  onChange={(e) => setHistoryOperatorFilter(e.target.value)}
                  className="h-7.5 rounded-md border border-stone-200 bg-stone-50 px-2.5 text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300 cursor-pointer"
                >
                  <option value="all">Todos</option>
                  {historyOperators.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Painel Executivo do Dono (Quebras, Sobras e Turnos Divergentes) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
              <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wide block">
                Total de Faltas (Quebras)
              </span>
              <p className="text-xl font-bold font-mono text-rose-700 mt-1">
                -{formatMoney(historyAuditStats.totalShortage)}
              </p>
              <span className="text-[11px] text-stone-500 mt-0.5 block">
                Em {historyAuditStats.shortageCount} {historyAuditStats.shortageCount === 1 ? "turno fechado" : "turnos fechados"}
              </span>
            </Card>

            <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
              <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide block">
                Total de Sobras
              </span>
              <p className="text-xl font-bold font-mono text-blue-700 mt-1">
                +{formatMoney(historyAuditStats.totalSurplus)}
              </p>
              <span className="text-[11px] text-stone-500 mt-0.5 block">
                Em {historyAuditStats.surplusCount} {historyAuditStats.surplusCount === 1 ? "turno fechado" : "turnos fechados"}
              </span>
            </Card>

            <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
              <span className="text-[11px] font-semibold text-stone-600 uppercase tracking-wide block">
                Turnos com Divergência
              </span>
              <p className="text-xl font-bold font-mono text-stone-900 mt-1">
                {historyAuditStats.divergentTurns}{" "}
                <span className="text-xs font-normal text-stone-400">de {filteredPastClosings.length}</span>
              </p>
              <span className="text-[11px] text-stone-500 mt-0.5 block">
                Clique em "Raio-X" para auditar os detalhes
              </span>
            </Card>
          </div>

          <Card className="rounded-xl bg-white border border-stone-200 shadow-xs overflow-hidden">
            <CardHeader className="bg-stone-50/60 border-b border-stone-200/80 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-bold text-stone-900">
                  Histórico de Turnos e Fechamentos Anteriores
                </CardTitle>
                <p className="text-xs text-stone-500 mt-0.5">
                  Livro-caixa digital e auditoria completa de divergências, justificativas e movimentações
                </p>
              </div>

              <Badge variant="outline" className="text-xs font-semibold bg-white border-stone-300 text-stone-700 self-start sm:self-auto">
                {filteredPastClosings.length} {filteredPastClosings.length === 1 ? "fechamento" : "fechamentos"}
              </Badge>
            </CardHeader>

            <CardContent className="p-0">
              {filteredPastClosings.length === 0 ? (
                <div className="py-16 px-4 flex flex-col items-center justify-center text-center text-stone-400 gap-1.5">
                  <Receipt className="w-8 h-8 stroke-1 text-stone-300" />
                  <p className="text-xs font-semibold text-stone-700">
                    {pastClosings.length === 0
                      ? "Nenhum fechamento registrado no histórico"
                      : "Nenhum fechamento encontrado para o filtro selecionado"}
                  </p>
                  <p className="text-[11px] text-stone-400 max-w-sm">
                    {pastClosings.length === 0
                      ? "Quando você encerrar um turno na aba Fechamento de Caixa, ele será arquivado aqui com comprovante térmico e extrato completo."
                      : "Altere o período ou o operador acima para visualizar outros turnos."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200/80 bg-stone-50/70 text-stone-500 font-semibold uppercase text-[10px]">
                        <th className="py-2.5 px-4">Turno</th>
                        <th className="py-2.5 px-4">Operador</th>
                        <th className="py-2.5 px-4">Faturamento Bruto</th>
                        <th className="py-2.5 px-4">Gaveta (Dinheiro)</th>
                        <th className="py-2.5 px-4">Conferência & Justificativa</th>
                        <th className="py-2.5 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {filteredPastClosings.map((c) => {
                        const expectedVal = Number(
                          c.cash_drawer?.expectedCashInDrawer ??
                            c.cash_drawer?.expectedInDrawer ??
                            c.cash_drawer?.totalCashExpected ??
                            0
                        );
                        const initialFloatVal = Number(c.cash_drawer?.initialFloat ?? 0);
                        const suppliesVal = Number(c.cash_drawer?.totalSupplies ?? c.cash_drawer?.supplies ?? 0);
                        const bleedsVal = Number(c.cash_drawer?.totalBleeds ?? c.cash_drawer?.bleeds ?? 0);
                        const expensesVal = Number(c.cash_drawer?.totalExpenses ?? c.cash_drawer?.expenses ?? 0);
                        const hasCounted =
                          c.cash_drawer?.countedCash !== undefined &&
                          c.cash_drawer?.countedCash !== null;
                        const countedVal = hasCounted ? Number(c.cash_drawer.countedCash) : expectedVal;
                        const diff = Number(c.cash_drawer?.difference || 0);
                        const isDiffZero = Math.abs(diff) < 0.01;
                        const just = (c.cash_drawer?.justification || "").trim();

                        return (
                          <tr key={c.id} className="hover:bg-stone-50/60 transition-colors align-top">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-stone-900">
                                  {formatHistoryTurnLabel(c)}
                                </span>
                                {c.cash_drawer?.blindClosing && (
                                  <Badge className="bg-stone-900 text-white border-0 text-[9px] px-1.5 py-0">
                                    Cego
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[10px] text-stone-400 font-mono block mt-0.5">
                                Fechado em: {formatInBrasilia(c.closed_at || c.created_at, { includeSeconds: false })}
                              </span>
                              {(suppliesVal > 0 || bleedsVal > 0 || expensesVal > 0) && (
                                <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                  {suppliesVal > 0 && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                      +Suprimento {formatMoney(suppliesVal)}
                                    </span>
                                  )}
                                  {bleedsVal > 0 && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                      -Sangria {formatMoney(bleedsVal)}
                                    </span>
                                  )}
                                  {expensesVal > 0 && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                      -Despesa {formatMoney(expensesVal)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 font-medium text-stone-700">
                              <span>{c.cashier_name || c.cash_drawer?.openedBy || "Operador"}</span>
                              {c.cash_drawer?.closedBy && c.cash_drawer.closedBy !== (c.cashier_name || c.cash_drawer?.openedBy) && (
                                <span className="text-[10px] text-stone-400 block">
                                  Fechou: {c.cash_drawer.closedBy}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 font-mono font-bold text-stone-900">
                              {formatMoney(c.gross_revenue)}
                              <span className="text-[10px] text-stone-400 block font-normal font-sans">
                                {c.total_orders || 0} {c.total_orders === 1 ? "pedido" : "pedidos"} (todos os meios)
                              </span>
                            </td>

                            <td className="py-3 px-4 font-mono text-stone-700">
                              <span className="font-semibold block">Esperado: {formatMoney(expectedVal)}</span>
                              <span className="text-[10px] text-stone-500 block">
                                Contado: {hasCounted ? formatMoney(countedVal) : "—"}
                              </span>
                              {initialFloatVal > 0 && (
                                <span className="text-[10px] text-stone-400 block font-sans">
                                  Troco inicial: {formatMoney(initialFloatVal)}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 max-w-xs">
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
                              {just && (
                                <p className="text-[11px] text-stone-700 font-medium whitespace-normal break-words mt-1 bg-stone-50 border border-stone-200 rounded px-2 py-1">
                                  "{just}"
                                </p>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setAuditModalClosing(c)}
                                  className="h-7.5 px-2 rounded-md text-xs font-semibold text-stone-800 hover:bg-stone-100 gap-1 cursor-pointer"
                                  title="Ver Raio-X Completo e Movimentações"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Raio-X</span>
                                </Button>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePrint(c)}
                                  className="h-7.5 px-2 rounded-md text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 gap-1 cursor-pointer"
                                  title="Reimprimir Cupom Térmico"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </Button>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCopyWhatsApp(c)}
                                  className="h-7.5 px-2 rounded-md text-xs font-medium text-emerald-800 hover:bg-emerald-50 gap-1 cursor-pointer"
                                  title="Copiar para WhatsApp"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
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
        orphanOrders={orphanOrders}
        tenantId={activeTenantId}
        onConfirmOpen={handleConfirmOpen}
      />

      {/* 2. Modal Retirada de Dinheiro (Sangria) */}
      <CashBleedModal
        isOpen={bleedModalVisible}
        onClose={() => setBleedModalVisible(false)}
        currentDrawerBalance={expectedCashInDrawer}
        hideBalance={isBlindActive}
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
        isBlindClosing={isBlindActive && periodMode === "today"}
        onConfirmCloseShift={handleFinalCloseShift}
      />

      {/* 6. Calculadora de Cédulas e Moedas */}
      <BillCoinCalculatorModal
        isOpen={billCalculatorOpen}
        onClose={() => setBillCalculatorOpen(false)}
        initialCounts={calculatorCounts}
        onApplyTotal={(total, countsMap) => {
          setCountedCashStr(`R$ ${Number(total || 0).toFixed(2).replace(".", ",")}`);
          setCalculatorCounts(countsMap);
        }}
      />

      {/* 7. Raio-X Auditável de Fechamento Anterior (Visão do Dono) */}
      <CashClosingAuditModal
        isOpen={Boolean(auditModalClosing)}
        onClose={() => setAuditModalClosing(null)}
        closing={auditModalClosing}
        onPrint={(c) => handlePrint(c)}
        onCopyWhatsApp={(c) => handleCopyWhatsApp(c)}
      />
    </div>
  );
}

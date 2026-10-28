import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getActiveTenantId, invalidateCache } from "@/entities/storage";
import { RestaurantTable, TableSession } from "@/entities/RestaurantTable";
import { Order } from "@/entities/Order";
import { Settings as SettingsEntity } from "@/entities/Settings";
import { Product } from "@/entities/Product";
import { Category } from "@/entities/Category";
import { 
  UtensilsCrossed, 
  Plus, 
  Search, 
  QrCode, 
  Receipt, 
  Users, 
  User,
  CheckCircle2, 
  Printer, 
  Trash2, 
  Sparkles, 
  Layers, 
  CreditCard, 
  Banknote, 
  Split, 
  X, 
  ShoppingBag,
  Flame,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function TablesPage() {
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // 'all' | 'available' | 'occupied' | 'bill_requested'

  // Modals state
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [isComandaDrawerOpen, setIsComandaDrawerOpen] = useState(false);
  const [isOpenTableModalOpen, setIsOpenTableModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isAddTableModalOpen, setIsAddTableModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [isPrintPreBillOpen, setIsPrintPreBillOpen] = useState(false);

  // Open Table Form State
  const [openCustomerName, setOpenCustomerName] = useState("");
  const [openCustomerPhone, setOpenCustomerPhone] = useState("");
  const [isOpeningTable, setIsOpeningTable] = useState(false);

  // Add Table Form State
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableLabel, setNewTableLabel] = useState("Salão Principal");
  const [newTableCapacity, setNewTableCapacity] = useState(4);
  const [isAddingTable, setIsAddingTable] = useState(false);

  // Batch Generation Form State
  const [batchCount, setBatchCount] = useState(10);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);

  // Quick Order Item Addition inside Comanda
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [itemSearch, setItemSearch] = useState("");
  const [quickCart, setQuickCart] = useState([]);
  const [isSubmittingQuickOrder, setIsSubmittingQuickOrder] = useState(false);

  // Settlement / Payment Form State
  const [includeServiceFee, setIncludeServiceFee] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("dinheiro");
  const [cashGiven, setCashGiven] = useState("");
  const [isClosingSession, setIsClosingSession] = useState(false);

  const [comandaViewMode, setComandaViewMode] = useState("by_person"); // 'by_person' | 'summary' | 'rounds'
  const [quickOrderPersonName, setQuickOrderPersonName] = useState("");
  const [preBillViewMode, setPreBillViewMode] = useState("by_person"); // 'by_person' | 'items'
  const [isCopiedSummary, setIsCopiedSummary] = useState(false);
  const [isPrintingPreBill, setIsPrintingPreBill] = useState(false);

  // Configuração da taxa de serviço da mesa
  const isServiceFeeEnabled = settings?.table_service_fee_enabled === true;
  const serviceFeeRate = Number(settings?.table_service_fee_rate ?? 10);
  const serviceFeeMultiplier = serviceFeeRate / 100;

  // Timer para atualizar cronômetros das mesas a cada 30 segundos em tempo real
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Load Data
  const loadAllData = async (includeStatic = true) => {
    try {
      const dynamicPromises = [
        RestaurantTable.list().catch(() => []),
        TableSession.list("-opened_at", 100).catch(() => []),
        Order.list("-created_date", 250).catch(() => []),
      ];

      const staticPromises = includeStatic ? [
        Product.list().catch(() => []),
        Category.list().catch(() => []),
        SettingsEntity.list().catch(() => [])
      ] : [];

      const [loadedTables, loadedSessions, loadedOrders, loadedProducts, loadedCategories, settingsList] = await Promise.all([
        ...dynamicPromises,
        ...staticPromises
      ]);

      let finalTables = loadedTables || [];
      // Se não houver mesas cadastradas ainda para este restaurante, gera automaticamente
      if (finalTables.length === 0) {
        const activeTenantId = getActiveTenantId();
        if (activeTenantId && isSupabaseConfigured() && supabase) {
          try {
            await supabase.rpc("generate_default_tables", {
              p_tenant_id: activeTenantId,
              p_count: 10,
            });
            finalTables = await RestaurantTable.list().catch(() => []);
          } catch {}
        }
      }

      setTables(finalTables);
      setSessions(loadedSessions || []);
      setOrders(loadedOrders || []);
      if (includeStatic) {
        if (loadedProducts) setProducts(loadedProducts);
        if (loadedCategories) setCategories(loadedCategories);
        if (settingsList && settingsList.length > 0) {
          setSettings(settingsList[0]);
          setIncludeServiceFee(settingsList[0]?.table_service_fee_enabled === true);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar dados do salão & mesas:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Carrega tudo na montagem inicial da tela
    loadAllData(true);

    // Sincronização em tempo real via subscriptions
    const unsubTables = RestaurantTable.subscribe(() => loadAllData(false));
    const unsubSessions = TableSession.subscribe(() => loadAllData(false));
    const unsubOrders = Order.subscribe(() => loadAllData(false));

    // Polling inteligente e leve a cada 15s (apenas se a aba estiver visível e apenas mesas/pedidos)
    const intervalId = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        loadAllData(false);
      }
    }, 15000);

    // Atualiza instantaneamente quando o usuário volta à aba de Mesas
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        loadAllData(false);
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      clearInterval(intervalId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (typeof unsubTables === "function") unsubTables();
      if (typeof unsubSessions === "function") unsubSessions();
      if (typeof unsubOrders === "function") unsubOrders();
    };
  }, []);

  // Map active sessions to tables
  const tablesWithSessions = useMemo(() => {
    const cleanNum = (val) => String(val || "").replace(/^Mesa\s*/i, "").trim().toLowerCase();

    return tables.map(table => {
      const thisNum = cleanNum(table.table_number);

      // Localiza sessão aberta ou com pré-conta pedida para esta mesa
      const activeSession = sessions.find(s => 
        (s.table_id === table.id || cleanNum(s.table_number) === thisNum) &&
        (s.status === 'open' || s.status === 'bill_requested')
      );

      // Localiza todos os pedidos ativos vinculados a esta mesa ou sessão
      const tableOrders = orders.filter(o => {
        if (o.status === 'cancelado') return false;
        // Pedidos pagos já foram liquidados e não contam como consumo em aberto
        if (o.payment_status === 'paid') return false;

        // Se vinculado pela sessão ativa
        if (activeSession && o.table_session_id && o.table_session_id === activeSession.id) {
          return true;
        }

        // Se vinculado pelo número da mesa
        const orderNum = cleanNum(o.table_number);
        if (orderNum && orderNum === thisNum) {
          return true;
        }

        return false;
      });

      // Calcula itens consumidos e agrupa itens por produto (para listar o que a mesa consumiu)
      const itemMap = new Map();
      tableOrders.forEach(ord => {
        const items = Array.isArray(ord.items) ? ord.items : [];
        items.forEach(it => {
          const key = it.product_id || it.product_name || it.name || "Item";
          const name = it.product_name || it.name || "Item";
          const qty = Math.max(1, parseInt(it.quantity || it.qty || 1, 10));
          const unitPrice = Number(it.product_price ?? it.price ?? 0);
          const subtotal = Number(it.subtotal ?? (unitPrice * qty));

          if (itemMap.has(key)) {
            const prev = itemMap.get(key);
            itemMap.set(key, {
              ...prev,
              quantity: prev.quantity + qty,
              totalPrice: prev.totalPrice + subtotal,
            });
          } else {
            itemMap.set(key, {
              id: key,
              name,
              quantity: qty,
              unitPrice,
              totalPrice: subtotal,
              notes: it.notes || "",
            });
          }
        });
      });
      const aggregatedItems = Array.from(itemMap.values());

      const totalConsumed = tableOrders.reduce((sum, o) => {
        const amt = Number(o.total_amount ?? o.total ?? 0);
        if (!isNaN(amt) && amt > 0) return sum + amt;
        const items = Array.isArray(o.items) ? o.items : [];
        return sum + items.reduce((iSum, i) => iSum + Number(i.subtotal ?? ((i.price ?? i.product_price ?? 0) * (i.quantity ?? i.qty ?? 1))), 0);
      }, 0);

      const totalItemsCount = aggregatedItems.reduce((sum, it) => sum + it.quantity, 0);

      // Agrupamento detalhado por pessoa (cliente que pediu na mesa)
      const customerMap = new Map();
      tableOrders.forEach(ord => {
        const rawName = (ord.customer_name || "").trim();
        const fallbackName = activeSession?.customer_name || `Mesa ${table.table_number}`;
        const personName = rawName || fallbackName;
        const normKey = personName.toLowerCase();

        const orderAmt = Number(ord.total_amount ?? ord.total ?? 0) || 
          (Array.isArray(ord.items) ? ord.items.reduce((acc, it) => acc + Number(it.subtotal ?? ((it.price ?? it.product_price ?? 0) * (it.quantity ?? it.qty ?? 1))), 0) : 0);

        if (!customerMap.has(normKey)) {
          customerMap.set(normKey, {
            name: personName,
            phone: ord.customer_phone || "",
            totalAmount: 0,
            itemsCount: 0,
            items: [],
            orderCount: 0,
          });
        }

        const personData = customerMap.get(normKey);
        personData.totalAmount += orderAmt;
        personData.orderCount += 1;

        const items = Array.isArray(ord.items) ? ord.items : [];
        items.forEach(it => {
          const qty = Math.max(1, parseInt(it.quantity || it.qty || 1, 10));
          const unitPrice = Number(it.product_price ?? it.price ?? 0);
          const subtotal = Number(it.subtotal ?? (unitPrice * qty));
          personData.itemsCount += qty;

          const existingItem = personData.items.find(pi => (pi.product_id && pi.product_id === it.product_id) || pi.name === (it.product_name || it.name));
          if (existingItem) {
            existingItem.quantity += qty;
            existingItem.totalPrice += subtotal;
          } else {
            personData.items.push({
              id: it.product_id || it.id || Math.random().toString(),
              name: it.product_name || it.name || "Item",
              quantity: qty,
              unitPrice,
              totalPrice: subtotal,
              notes: it.notes || "",
            });
          }
        });
      });
      const ordersByCustomer = Array.from(customerMap.values());

      // Status efetivo: mesa ocupada apenas se houver sessão aberta ou pedidos em aberto não liquidados
      const hasActiveOrders = tableOrders.length > 0;
      const isBillRequested = (activeSession?.status === 'bill_requested') || (table.status === 'bill_requested');
      const isOccupied = isBillRequested ? false : (Boolean(activeSession) || hasActiveOrders);
      const effectiveStatus = isBillRequested ? 'bill_requested' : (isOccupied ? 'occupied' : 'available');

      // Sessão resolvida (com fallback para pedidos feitos no PDV)
      const resolvedSession = activeSession || (hasActiveOrders || isOccupied ? {
        id: tableOrders[0]?.table_session_id || `virtual_${table.id}`,
        table_id: table.id,
        table_number: table.table_number,
        customer_name: tableOrders[0]?.customer_name || `Mesa ${table.table_number}`,
        customer_phone: tableOrders[0]?.customer_phone || "",
        status: isBillRequested ? 'bill_requested' : 'open',
        opened_at: tableOrders[0]?.created_date || new Date().toISOString(),
        is_virtual: !activeSession,
      } : null);

      // ⏱️ Cronômetro: Duração total da mesa aberta
      let tableDurationText = "";
      const openDateStr = resolvedSession?.opened_at || tableOrders[0]?.created_date;
      if (openDateStr && (isOccupied || isBillRequested)) {
        const openTime = new Date(openDateStr).getTime();
        const diffMinutes = Math.max(0, Math.floor((Date.now() - openTime) / (1000 * 60)));
        if (diffMinutes < 60) {
          tableDurationText = `${diffMinutes}m`;
        } else {
          const hours = Math.floor(diffMinutes / 60);
          const mins = diffMinutes % 60;
          tableDurationText = `${hours}h ${mins > 0 ? `${mins}m` : ""}`.trim();
        }
      }

      // 🍽️ Cronômetro Inteligente: Tempo decorrido desde o último pedido (Giro de Mesa)
      let lastOrderMinutes = null;
      let lastOrderText = "";
      let lastOrderStatus = "none"; // 'recent' | 'idle' | 'warning' | 'waiting_first' | 'none'
      let lastOrderBadge = null;

      if (isOccupied || isBillRequested) {
        if (tableOrders.length > 0) {
          let latestTimestamp = 0;
          tableOrders.forEach(ord => {
            const t = new Date(ord.created_date || ord.created_at || 0).getTime();
            if (t > latestTimestamp) latestTimestamp = t;
          });

          if (latestTimestamp > 0) {
            lastOrderMinutes = Math.max(0, Math.floor((Date.now() - latestTimestamp) / (1000 * 60)));
            if (lastOrderMinutes < 60) {
              lastOrderText = `${lastOrderMinutes}m`;
            } else {
              const h = Math.floor(lastOrderMinutes / 60);
              const m = lastOrderMinutes % 60;
              lastOrderText = `${h}h ${m > 0 ? `${m}m` : ""}`.trim();
            }

            if (lastOrderMinutes < 25) {
              lastOrderStatus = "recent";
              lastOrderBadge = {
                text: `🍽️ Pedido há ${lastOrderText}`,
                label: `Último pedido há ${lastOrderText}`,
                style: "bg-emerald-50 text-emerald-800 border-emerald-200/90",
                dot: "bg-emerald-500",
              };
            } else if (lastOrderMinutes <= 45) {
              lastOrderStatus = "idle";
              lastOrderBadge = {
                text: `⏳ Sem pedir há ${lastOrderText}`,
                label: `Sem novos pedidos há ${lastOrderText}`,
                style: "bg-amber-50 text-amber-800 border-amber-200/90",
                dot: "bg-amber-500",
              };
            } else {
              lastOrderStatus = "warning";
              lastOrderBadge = {
                text: `⚠️ Parada há ${lastOrderText}`,
                label: `Mesa parada há ${lastOrderText}`,
                style: "bg-rose-50 text-rose-800 border-rose-200/90",
                dot: "bg-rose-500",
              };
            }
          }
        } else {
          lastOrderStatus = "waiting_first";
          lastOrderBadge = {
            text: `⚡ Aguardando 1º pedido${tableDurationText ? ` (${tableDurationText})` : ""}`,
            label: `Aguardando primeiro pedido`,
            style: "bg-amber-50 text-amber-900 border-amber-300 animate-pulse",
            dot: "bg-amber-500",
          };
        }
      }

      return {
        ...table,
        effectiveStatus,
        activeSession: resolvedSession,
        tableOrders,
        aggregatedItems,
        ordersByCustomer,
        totalConsumed,
        totalItemsCount,
        tableDurationText,
        lastOrderMinutes,
        lastOrderText,
        lastOrderStatus,
        lastOrderBadge,
      };
    }).sort((a, b) => {
      const numA = parseInt(a.table_number, 10);
      const numB = parseInt(b.table_number, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return String(a.table_number).localeCompare(String(b.table_number));
    });
  }, [tables, sessions, orders, nowTick]);

  // Statistics
  const metrics = useMemo(() => {
    const total = tablesWithSessions.length;
    const available = tablesWithSessions.filter(t => t.effectiveStatus === 'available').length;
    const occupied = tablesWithSessions.filter(t => t.effectiveStatus === 'occupied').length;
    const billRequested = tablesWithSessions.filter(t => t.effectiveStatus === 'bill_requested').length;
    const totalRevenueOpen = tablesWithSessions.reduce((sum, t) => sum + t.totalConsumed, 0);

    return {
      total,
      available,
      occupied,
      billRequested,
      totalRevenueOpen,
    };
  }, [tablesWithSessions]);

  // Filtered Tables
  const filteredTables = useMemo(() => {
    return tablesWithSessions.filter(table => {
      // Status filter
      if (filterStatus !== "all" && table.effectiveStatus !== filterStatus) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesNum = String(table.table_number).toLowerCase().includes(q);
        const matchesLabel = String(table.label || "").toLowerCase().includes(q);
        const matchesCustomer = table.activeSession?.customer_name?.toLowerCase().includes(q);
        return matchesNum || matchesLabel || matchesCustomer;
      }
      return true;
    });
  }, [tablesWithSessions, filterStatus, searchQuery]);

  // Live reference of the selected table synchronized with state updates
  const currentTable = useMemo(() => {
    if (!selectedTable) return null;
    return tablesWithSessions.find(t => t.id === selectedTable.id) || selectedTable;
  }, [tablesWithSessions, selectedTable]);

  // Handle click on table card
  const handleTableClick = (table) => {
    setSelectedTable(table);
    if (table.activeSession || table.effectiveStatus !== 'available') {
      setSelectedSession(table.activeSession || null);
      setIsComandaDrawerOpen(true);
    } else {
      setOpenCustomerName("");
      setOpenCustomerPhone("");
      setIsOpenTableModalOpen(true);
    }
  };

  // Open Table Session
  const handleOpenTable = async (e) => {
    e?.preventDefault();
    if (!selectedTable) return;

    try {
      setIsOpeningTable(true);
      const activeTenantId = getActiveTenantId() || "a0000000-0000-0000-0000-000000000001";

      // Call Supabase RPC or direct Entity creation
      let newSession = null;
      if (isSupabaseConfigured() && supabase) {
        const { data, error } = await supabase.rpc("open_table_session", {
          p_tenant_id: activeTenantId,
          p_table_id: selectedTable.id,
          p_customer_name: openCustomerName.trim() || `Mesa ${selectedTable.table_number}`,
          p_customer_phone: openCustomerPhone.trim() || null,
          p_people_count: 1,
        });

        if (error) {
          console.warn("RPC open_table_session falhou, usando fallback direto:", error);
          // Fallback manual
          newSession = await TableSession.create({
            tenant_id: activeTenantId,
            table_id: selectedTable.id,
            table_number: selectedTable.table_number,
            customer_name: openCustomerName.trim() || `Mesa ${selectedTable.table_number}`,
            customer_phone: openCustomerPhone.trim() || "",
            people_count: 1,
            opened_at: new Date().toISOString(),
            status: "open",
          });
          await RestaurantTable.update(selectedTable.id, { status: "occupied" });
        } else {
          newSession = data;
        }
      } else {
        newSession = await TableSession.create({
          tenant_id: activeTenantId,
          table_id: selectedTable.id,
          table_number: selectedTable.table_number,
          customer_name: openCustomerName.trim() || `Mesa ${selectedTable.table_number}`,
          customer_phone: openCustomerPhone.trim() || "",
          people_count: 1,
          opened_at: new Date().toISOString(),
          status: "open",
        });
        await RestaurantTable.update(selectedTable.id, { status: "occupied" });
      }

      toast.success(`Mesa ${selectedTable.table_number} aberta com sucesso!`);
      setIsOpenTableModalOpen(false);
      await loadAllData();

      // Open Comanda right away for adding items
      setSelectedSession(newSession);
      setIsComandaDrawerOpen(true);
    } catch (err) {
      console.error("Erro ao abrir mesa:", err);
      toast.error("Erro ao abrir mesa. Tente novamente.");
    } finally {
      setIsOpeningTable(false);
    }
  };

  // Add a single new table
  const handleAddTable = async (e) => {
    e.preventDefault();
    const num = newTableNumber.trim();
    if (!num) {
      toast.error("Informe o número ou nome da mesa.");
      return;
    }

    try {
      setIsAddingTable(true);
      const activeTenantId = getActiveTenantId() || "a0000000-0000-0000-0000-000000000001";
      await RestaurantTable.create({
        tenant_id: activeTenantId,
        table_number: num,
        label: newTableLabel.trim() || "Salão",
        capacity: Number(newTableCapacity) || 4,
        status: "available",
      });

      toast.success(`Mesa ${num} criada com sucesso!`);
      setNewTableNumber("");
      setIsAddTableModalOpen(false);
      await loadAllData();
    } catch (err) {
      console.error("Erro ao criar mesa:", err);
      toast.error("Erro ao criar mesa. Verifique se o número já existe.");
    } finally {
      setIsAddingTable(false);
    }
  };

  // Batch generate default tables
  const handleBatchGenerate = async () => {
    try {
      setIsGeneratingBatch(true);
      const activeTenantId = getActiveTenantId() || "a0000000-0000-0000-0000-000000000001";

      if (isSupabaseConfigured() && supabase) {
        const { error } = await supabase.rpc("generate_default_tables", {
          p_tenant_id: activeTenantId,
          p_count: Number(batchCount) || 10,
        });
        if (error) throw error;
      } else {
        // Fallback
        for (let i = 1; i <= batchCount; i++) {
          await RestaurantTable.create({
            tenant_id: activeTenantId,
            table_number: String(i),
            label: "Salão Principal",
            capacity: 4,
            status: "available",
          }).catch(() => {});
        }
      }

      toast.success(`${batchCount} mesas geradas com sucesso!`);
      setIsBatchModalOpen(false);
      await loadAllData();
    } catch (err) {
      console.error("Erro ao gerar mesas em lote:", err);
      toast.error("Erro ao gerar mesas em lote.");
    } finally {
      setIsGeneratingBatch(false);
    }
  };

  // Delete an available table
  const handleDeleteTable = async (tableId, tableNum, e) => {
    e?.stopPropagation();
    if (!window.confirm(`Tem certeza que deseja excluir a Mesa ${tableNum}?`)) return;

    try {
      await RestaurantTable.delete(tableId);
      toast.success(`Mesa ${tableNum} excluída.`);
      if (selectedTable?.id === tableId) {
        setIsComandaDrawerOpen(false);
        setSelectedTable(null);
      }
      await loadAllData();
    } catch (err) {
      console.error("Erro ao excluir mesa:", err);
      toast.error("Erro ao excluir mesa. Verifique se não há pedidos pendentes.");
    }
  };

  // Request Pre-Bill (sets status to bill_requested)
  const handleRequestPreBill = async () => {
    if (!selectedTable) return;
    try {
      if (selectedSession?.id) {
        await TableSession.update(selectedSession.id, { status: "bill_requested" });
      }
      await RestaurantTable.update(selectedTable.id, { status: "bill_requested" });

      toast.info(`Mesa ${selectedTable.table_number}: Pré-conta solicitada!`);
      setIsPrintPreBillOpen(true);
      await loadAllData();
    } catch (err) {
      console.error("Erro ao solicitar pré-conta:", err);
      toast.error("Erro ao solicitar pré-conta.");
    }
  };

  // Gera texto da pré-conta para impressão térmica (80mm/58mm) com separação por pessoa
  const generatePreBillThermalText = (table, storeSettings) => {
    const width = 42;
    const storeName = (storeSettings?.restaurant_name || "RESTAURANTE").toUpperCase();
    const tableNum = String(table?.table_number || "");
    const session = table?.activeSession;
    const ordersByCustomer = table?.ordersByCustomer || [];
    const subtotal = Number(table?.totalConsumed || 0);
    const isFeeEnabled = storeSettings?.table_service_fee_enabled === true;
    const feeRate = Number(storeSettings?.table_service_fee_rate ?? 10);
    const feeMultiplier = feeRate / 100;
    const serviceFee = isFeeEnabled ? (subtotal * feeMultiplier) : 0;
    const totalWithService = subtotal + serviceFee;

    const pad = (left, right) => {
      const l = String(left || "");
      const r = String(right || "");
      const space = Math.max(1, width - l.length - r.length);
      return l + " ".repeat(space) + r;
    };

    const center = (text) => {
      const s = String(text || "").trim();
      if (s.length >= width) return s.slice(0, width);
      const leftPad = Math.floor((width - s.length) / 2);
      return " ".repeat(leftPad) + s;
    };

    const lines = [];
    lines.push(center(storeName));
    lines.push(center("*** PRE-CONTA / CONFERENCIA ***"));
    lines.push("-".repeat(width));
    lines.push(pad(`MESA ${tableNum}`, session?.customer_name ? `Resp: ${session.customer_name}` : ""));
    lines.push(pad(`Data: ${new Date().toLocaleDateString("pt-BR")}`, `Hora: ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`));
    lines.push("=".repeat(width));

    // CONSUMO POR PESSOA
    if (ordersByCustomer.length > 0) {
      lines.push(center("CONSUMO DETALHADO POR PESSOA"));
      lines.push("-".repeat(width));

      ordersByCustomer.forEach((person, idx) => {
        const pSubtotal = Number(person.totalAmount || 0);
        const pService = isFeeEnabled ? (pSubtotal * feeMultiplier) : 0;
        const pTotal = pSubtotal + pService;

        lines.push(`>> ${person.name.toUpperCase()}`);
        (person.items || []).forEach(it => {
          const itemLine = `  ${it.quantity}x ${it.name}`;
          const itemPrice = `R$ ${Number(it.totalPrice || 0).toFixed(2).replace(".", ",")}`;
          lines.push(pad(itemLine.slice(0, 28), itemPrice));
        });
        lines.push(pad("   Subtotal cliente:", `R$ ${pSubtotal.toFixed(2).replace(".", ",")}`));
        if (isFeeEnabled) {
          lines.push(pad(`   c/ ${feeRate}% opcional:`, `R$ ${pTotal.toFixed(2).replace(".", ",")}`));
        }
        if (idx < ordersByCustomer.length - 1) {
          lines.push("- - - - - - - - - - - - - - - - - - - - - -");
        }
      });
      lines.push("=".repeat(width));
    }

    // TOTAIS DA MESA
    lines.push(center("TOTAIS DA MESA"));
    lines.push(pad("SUBTOTAL DE CONSUMO:", `R$ ${subtotal.toFixed(2).replace(".", ",")}`));
    if (isFeeEnabled) {
      lines.push(pad(`TAXA SERVICO (${feeRate}% OPC.):`, `R$ ${serviceFee.toFixed(2).replace(".", ",")}`));
      lines.push("-".repeat(width));
      lines.push(pad(`TOTAL GERAL C/ ${feeRate}%:`, `R$ ${totalWithService.toFixed(2).replace(".", ",")}`));
    } else {
      lines.push("-".repeat(width));
      lines.push(pad("TOTAL GERAL:", `R$ ${subtotal.toFixed(2).replace(".", ",")}`));
    }
    lines.push("-".repeat(width));

    // QUANTO CADA UM PAGA
    if (ordersByCustomer.length > 1) {
      lines.push(center("QUANTO CADA UM PAGA" + (isFeeEnabled ? ` (C/ ${feeRate}%)` : "")));
      ordersByCustomer.forEach(person => {
        const pSubtotal = Number(person.totalAmount || 0);
        const pTotal = isFeeEnabled ? (pSubtotal * (1 + feeMultiplier)) : pSubtotal;
        lines.push(pad(`  ${person.name}:`, `R$ ${pTotal.toFixed(2).replace(".", ",")}`));
      });
      lines.push("-".repeat(width));
    }

    lines.push(center("CONFERENCIA DE MESA"));
    lines.push(center("NAO E DOCUMENTO FISCAL"));
    lines.push(center("OBRIGADO PELA PREFERENCIA!"));
    lines.push("\n\n\n");

    return lines.join("\n");
  };

  // Impressão da Pré-Conta (Direta via Spooler ou Navegador)
  const handlePrintPreBill = async (tableToPrint) => {
    const tbl = tableToPrint || currentTable || selectedTable;
    if (!tbl) return;

    try {
      setIsPrintingPreBill(true);
      const thermalText = generatePreBillThermalText(tbl, settings);

      let printedViaSpooler = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const res = await fetch("http://127.0.0.1:9100/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rawText: thermalText,
            order: { id: `prebill_${tbl.table_number}` },
            storeName: settings?.restaurant_name,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            printedViaSpooler = true;
            toast.success(`🖨️ Pré-conta da Mesa ${tbl.table_number} impressa com sucesso!`);
          }
        }
      } catch (_err) {
        // Spooler offline, prossegue com janela do navegador
      }

      if (!printedViaSpooler) {
        window.print();
      }
    } catch (err) {
      console.error("Erro ao imprimir pré-conta:", err);
      toast.error("Erro ao imprimir pré-conta.");
    } finally {
      setIsPrintingPreBill(false);
    }
  };

  // Copia resumo por pessoa para colar no WhatsApp
  const handleCopyPreBillSummary = (tableToCopy) => {
    const tbl = tableToCopy || currentTable || selectedTable;
    if (!tbl) return;

    const subtotal = Number(tbl.totalConsumed || 0);
    const isFeeEnabled = settings?.table_service_fee_enabled === true;
    const feeRate = Number(settings?.table_service_fee_rate ?? 10);
    const feeMultiplier = feeRate / 100;
    const serviceFee = isFeeEnabled ? (subtotal * feeMultiplier) : 0;
    const totalWithService = subtotal + serviceFee;
    const ordersByCustomer = tbl.ordersByCustomer || [];

    let text = `🧾 *PRÉ-CONTA - MESA ${tbl.table_number}*\n`;
    text += `🏬 ${settings?.restaurant_name || "Restaurante"}\n`;
    text += `📅 ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}\n\n`;

    if (ordersByCustomer.length > 0) {
      text += `👥 *CONSUMO POR PESSOA:*\n`;
      ordersByCustomer.forEach(p => {
        const pSub = Number(p.totalAmount || 0);
        const pTotal = isFeeEnabled ? (pSub * (1 + feeMultiplier)) : pSub;
        text += `\n👤 *${p.name}* (${p.itemsCount} ${p.itemsCount === 1 ? "item" : "itens"}):\n`;
        (p.items || []).forEach(it => {
          text += `  • ${it.quantity}x ${it.name} - R$ ${Number(it.totalPrice || 0).toFixed(2).replace(".", ",")}\n`;
        });
        text += isFeeEnabled 
          ? `  Subtotal: R$ ${pSub.toFixed(2).replace(".", ",")} | c/ ${feeRate}%: R$ ${pTotal.toFixed(2).replace(".", ",")}\n`
          : `  Subtotal: R$ ${pSub.toFixed(2).replace(".", ",")}\n`;
      });
      text += `\n-------------------------\n`;
    }

    text += `💰 *Subtotal Consumo:* R$ ${subtotal.toFixed(2).replace(".", ",")}\n`;
    if (isFeeEnabled) {
      text += `🛎️ *Taxa de Serviço (${feeRate}%):* R$ ${serviceFee.toFixed(2).replace(".", ",")}\n`;
      text += `💳 *TOTAL GERAL (c/ ${feeRate}%):* R$ ${totalWithService.toFixed(2).replace(".", ",")}\n`;
    } else {
      text += `💳 *TOTAL GERAL:* R$ ${subtotal.toFixed(2).replace(".", ",")}\n`;
    }

    if (ordersByCustomer.length > 1) {
      text += isFeeEnabled 
        ? `\n📊 *QUANTO CADA UM PAGA (c/ ${feeRate}%):*\n`
        : `\n📊 *QUANTO CADA UM PAGA:*\n`;
      ordersByCustomer.forEach(p => {
        const pTotal = isFeeEnabled ? Number(p.totalAmount || 0) * (1 + feeMultiplier) : Number(p.totalAmount || 0);
        text += `  • ${p.name}: R$ ${pTotal.toFixed(2).replace(".", ",")}\n`;
      });
    }

    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setIsCopiedSummary(true);
      toast.success("Resumo por pessoa copiado! Pronto para colar no WhatsApp 📲");
      setTimeout(() => setIsCopiedSummary(false), 2500);
    }
  };

  // Quick Release Table (1-click with confirmation)
  const handleQuickReleaseTable = async (tableToRelease) => {
    const tbl = tableToRelease || currentTable || selectedTable;
    if (!tbl) return;

    if (!window.confirm(`Deseja realmente liberar a Mesa ${tbl.table_number}? A conta será encerrada e a mesa voltará a ficar Livre.`)) {
      return;
    }

    try {
      const activeTenantId = getActiveTenantId() || "a0000000-0000-0000-0000-000000000001";
      const cleanNum = (val) => String(val || "").replace(/^Mesa\s*/i, "").trim().toLowerCase();
      const thisNum = cleanNum(tbl.table_number);
      const targetSessionId = tbl.activeSession?.id;

      // 1. Atualização Otimista Imediata na UI (0ms) - Mesa desocupa instantaneamente
      setIsSettlementModalOpen(false);
      setIsComandaDrawerOpen(false);
      setSelectedTable(null);
      setSelectedSession(null);

      setTables(prev => prev.map(t => (t.id === tbl.id || cleanNum(t.table_number) === thisNum) ? { ...t, status: "available" } : t));
      setSessions(prev => prev.filter(s => !(s.table_id === tbl.id || (cleanNum(s.table_number) === thisNum && (s.status === 'open' || s.status === 'bill_requested')))));
      setOrders(prev => prev.map(o => (cleanNum(o.table_number) === thisNum || (targetSessionId && o.table_session_id === targetSessionId)) ? { ...o, payment_status: "paid", status: "entregue" } : o));

      toast.success(`Mesa ${tbl.table_number} liberada com sucesso! 🟢`);

      // 2. Persistência no Supabase / Banco
      if (isSupabaseConfigured() && supabase) {
        if (targetSessionId && !String(targetSessionId).startsWith("virtual_")) {
          await supabase.rpc("close_table_session", {
            p_tenant_id: activeTenantId,
            p_session_id: targetSessionId,
            p_payment_method: "liberacao_rapida",
            p_payment_details: { quick_release: true },
            p_service_fee: 0,
            p_discount: 0,
          }).catch(() => {});

          await supabase.from("table_sessions").update({
            status: "closed",
            closed_at: new Date().toISOString(),
            payment_method: "liberacao_rapida"
          }).eq("id", targetSessionId).catch(() => {});
        }

        // Libera mesa física no banco
        await supabase.from("restaurant_tables").update({
          status: "available",
          updated_at: new Date().toISOString()
        }).eq("tenant_id", activeTenantId).eq("table_number", String(tbl.table_number)).catch(() => {});

        if (tbl.id) {
          await supabase.from("restaurant_tables").update({
            status: "available",
            updated_at: new Date().toISOString()
          }).eq("id", tbl.id).catch(() => {});
        }

        // Marca todos os pedidos da mesa como pagos e entregues
        await supabase.from("orders").update({
          payment_status: "paid",
          status: "entregue",
          payment_method: "liberacao_rapida"
        }).match({ tenant_id: activeTenantId, table_number: String(tbl.table_number) }).catch(() => {});

        await supabase.from("orders").update({
          payment_status: "paid",
          status: "entregue",
          payment_method: "liberacao_rapida"
        }).match({ tenant_id: activeTenantId, table_number: `Mesa ${tbl.table_number}` }).catch(() => {});

        if (targetSessionId && !String(targetSessionId).startsWith("virtual_")) {
          await supabase.from("orders").update({
            payment_status: "paid",
            status: "entregue",
            payment_method: "liberacao_rapida"
          }).eq("table_session_id", targetSessionId).catch(() => {});
        }
      }

      // Atualiza também via Entity
      if (tbl.id) {
        await RestaurantTable.update(tbl.id, { status: "available" }).catch(() => {});
      }
      if (targetSessionId && !String(targetSessionId).startsWith("virtual_")) {
        await TableSession.update(targetSessionId, { status: "closed", closed_at: new Date().toISOString() }).catch(() => {});
      }
      if (tbl.tableOrders && tbl.tableOrders.length > 0) {
        for (const ord of tbl.tableOrders) {
          await Order.update(ord.id, { status: "entregue", payment_status: "paid", payment_method: "liberacao_rapida" }).catch(() => {});
        }
      }

      // 3. Invalidação de cache
      invalidateCache("restaurant_tables");
      invalidateCache("table_sessions");
      invalidateCache("orders");

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("db_event_restaurant_tables", { detail: { type: "update" } }));
        window.dispatchEvent(new CustomEvent("db_event_table_sessions", { detail: { type: "update" } }));
        window.dispatchEvent(new CustomEvent("db_event_orders", { detail: { type: "update" } }));
      }

      await loadAllData(false);
    } catch (err) {
      console.error("Erro ao liberar mesa:", err);
      toast.error("Erro ao liberar mesa.");
    }
  };

  // Close Session & Liquidate Bill
  const handleFinalizeSettlement = async () => {
    const tbl = currentTable || selectedTable;
    if (!tbl) return;

    try {
      setIsClosingSession(true);
      const activeTenantId = getActiveTenantId() || "a0000000-0000-0000-0000-000000000001";
      const cleanNum = (val) => String(val || "").replace(/^Mesa\s*/i, "").trim().toLowerCase();
      const thisNum = cleanNum(tbl.table_number);
      const targetSessionId = selectedSession?.id || tbl.activeSession?.id;
      const isRealSession = targetSessionId && !String(targetSessionId).startsWith("virtual_");

      const subtotal = tbl.totalConsumed || 0;
      const feeMultiplier = serviceFeeRate / 100;
      const serviceFeeValue = (includeServiceFee && isServiceFeeEnabled) ? (subtotal * feeMultiplier) : 0;
      const discountVal = Number(discountAmount) || 0;
      const totalAmount = Math.max(0, subtotal + serviceFeeValue - discountVal);

      // 1. Atualização Otimista Imediata na UI (0ms) - Desocupa a mesa instantaneamente
      setIsSettlementModalOpen(false);
      setIsComandaDrawerOpen(false);
      setSelectedTable(null);
      setSelectedSession(null);

      setTables(prev => prev.map(t => (t.id === tbl.id || cleanNum(t.table_number) === thisNum) ? { ...t, status: "available" } : t));
      setSessions(prev => prev.filter(s => !(s.table_id === tbl.id || (cleanNum(s.table_number) === thisNum && (s.status === 'open' || s.status === 'bill_requested')))));
      setOrders(prev => prev.map(o => (cleanNum(o.table_number) === thisNum || (targetSessionId && o.table_session_id === targetSessionId)) ? { ...o, payment_status: "paid", status: "entregue" } : o));

      toast.success(`Mesa ${tbl.table_number} liquidada e liberada com sucesso! 🟢`);

      // 2. Persistência no Supabase / RPC
      if (isSupabaseConfigured() && supabase) {
        if (isRealSession) {
          const { error } = await supabase.rpc("close_table_session", {
            p_tenant_id: activeTenantId,
            p_session_id: targetSessionId,
            p_payment_method: paymentMethod,
            p_payment_details: {
              cash_given: cashGiven ? Number(cashGiven) : null,
              service_fee_included: includeServiceFee,
              discount: discountVal,
            },
            p_service_fee: serviceFeeValue,
            p_discount: discountVal,
          });

          if (error) {
            console.warn("RPC close_table_session falhou, aplicando fallback:", error);
          }

          await supabase.from("table_sessions").update({
            status: "closed",
            closed_at: new Date().toISOString(),
            subtotal: subtotal,
            service_fee: serviceFeeValue,
            discount: discountVal,
            total_amount: totalAmount,
            payment_method: paymentMethod,
          }).eq("id", targetSessionId).catch(() => {});
        }

        // Libera mesa física no banco
        await supabase.from("restaurant_tables").update({
          status: "available",
          updated_at: new Date().toISOString()
        }).eq("tenant_id", activeTenantId).eq("table_number", String(tbl.table_number)).catch(() => {});

        if (tbl.id) {
          await supabase.from("restaurant_tables").update({
            status: "available",
            updated_at: new Date().toISOString()
          }).eq("id", tbl.id).catch(() => {});
        }

        // Marca todos os pedidos da mesa como pagos e entregues
        await supabase.from("orders").update({
          payment_status: "paid",
          status: "entregue",
          payment_method: paymentMethod
        }).match({ tenant_id: activeTenantId, table_number: String(tbl.table_number) }).catch(() => {});

        await supabase.from("orders").update({
          payment_status: "paid",
          status: "entregue",
          payment_method: paymentMethod
        }).match({ tenant_id: activeTenantId, table_number: `Mesa ${tbl.table_number}` }).catch(() => {});

        if (targetSessionId && !String(targetSessionId).startsWith("virtual_")) {
          await supabase.from("orders").update({
            payment_status: "paid",
            status: "entregue",
            payment_method: paymentMethod
          }).eq("table_session_id", targetSessionId).catch(() => {});
        }
      }

      // Atualiza também via Entity
      if (tbl.id) {
        await RestaurantTable.update(tbl.id, { status: "available" }).catch(() => {});
      }
      if (isRealSession) {
        await TableSession.update(targetSessionId, {
          status: "closed",
          closed_at: new Date().toISOString(),
          subtotal: subtotal,
          service_fee: serviceFeeValue,
          discount: discountVal,
          total_amount: totalAmount,
          payment_method: paymentMethod,
        }).catch(() => {});
      }
      if (tbl.tableOrders && tbl.tableOrders.length > 0) {
        for (const ord of tbl.tableOrders) {
          await Order.update(ord.id, { 
            status: "entregue",
            payment_status: "paid",
            payment_method: paymentMethod
          }).catch(() => {});
        }
      }

      // 3. Invalidação de cache
      invalidateCache("restaurant_tables");
      invalidateCache("table_sessions");
      invalidateCache("orders");

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("db_event_restaurant_tables", { detail: { type: "update" } }));
        window.dispatchEvent(new CustomEvent("db_event_table_sessions", { detail: { type: "update" } }));
        window.dispatchEvent(new CustomEvent("db_event_orders", { detail: { type: "update" } }));
      }

      await loadAllData(false);
    } catch (err) {
      console.error("Erro ao fechar mesa:", err);
      toast.error("Erro ao liquidar comanda.");
    } finally {
      setIsClosingSession(false);
    }
  };

  // Quick launch to PDV with this table preselected
  const handleLaunchToPDV = (tableNum) => {
    localStorage.setItem("pdv_preselected_table", String(tableNum));
    navigate(createPageUrl("PDV"));
  };

  // Add Item to Quick Cart inside Comanda
  const addToQuickCart = (product) => {
    setQuickCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateQuickCartQty = (productId, delta) => {
    setQuickCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQty = item.qty + delta;
        return newQty > 0 ? { ...item, qty: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  // Submit Quick Order round to Table
  const handleSubmitQuickOrder = async () => {
    const effectiveTable = currentTable || selectedTable;
    if (quickCart.length === 0 || !effectiveTable) return;

    try {
      setIsSubmittingQuickOrder(true);
      const activeTenantId = getActiveTenantId() || "a0000000-0000-0000-0000-000000000001";
      const totalCart = quickCart.reduce((sum, it) => sum + (Number(it.price) * it.qty), 0);
      const personName = quickOrderPersonName.trim() || effectiveTable.activeSession?.customer_name || `Mesa ${effectiveTable.table_number}`;

      const orderData = {
        tenant_id: activeTenantId,
        customer_name: personName,
        customer_phone: effectiveTable.activeSession?.customer_phone || "",
        total_amount: totalCart,
        status: "confirmado",
        payment_method: "comanda_mesa",
        order_type: "dine_in",
        table_number: String(effectiveTable.table_number),
        table_session_id: effectiveTable.activeSession?.id && !String(effectiveTable.activeSession.id).startsWith("virtual_") ? effectiveTable.activeSession.id : null,
        items: quickCart.map(item => {
          const cat = categories.find(c => c.id === item.category_id || c.id === item.category);
          return {
            product_id: item.id,
            product_name: item.name,
            name: item.name,
            product_price: Number(item.price) || 0,
            price: Number(item.price) || 0,
            category_name: cat?.name || "Geral",
            quantity: item.qty,
            subtotal: (Number(item.price) || 0) * item.qty,
            additionals: [],
          };
        }),
      };

      await Order.create(orderData);
      toast.success(`Pedido de ${personName} lançado na Mesa ${effectiveTable.table_number}! 🍻`);
      setQuickCart([]);
      setQuickOrderPersonName("");
      setIsAddItemModalOpen(false);
      await loadAllData();
    } catch (err) {
      console.error("Erro ao lançar itens na mesa:", err);
      toast.error("Erro ao lançar itens.");
    } finally {
      setIsSubmittingQuickOrder(false);
    }
  };

  // Base URL for QR Codes
  const origin = typeof window !== "undefined" ? window.location.origin : "https://pedemuleke.com.br";
  const storeSlug = settings?.slug || localStorage.getItem("current_tenant_slug") || "vrumm";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header com Título e Ações Globais */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#047857] shadow-xs">
              <UtensilsCrossed className="w-5 h-5 text-[#047857]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-950 tracking-tight">Salão & Mesas</h1>
              <p className="text-xs text-gray-500 font-medium">Gestão em tempo real de comandas, pré-contas e consumo local</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setIsQrModalOpen(true)}
            variant="outline"
            className="h-10 rounded-xl border-gray-200 font-bold text-gray-700 hover:text-emerald-700 hover:border-emerald-300 gap-2 cursor-pointer shadow-2xs"
          >
            <QrCode className="w-4 h-4 text-[#047857]" />
            <span className="hidden sm:inline">QR Codes das Mesas</span>
            <span className="sm:hidden">QR Codes</span>
          </Button>

          <Button
            onClick={() => setIsBatchModalOpen(true)}
            variant="outline"
            className="h-10 rounded-xl border-gray-200 font-bold text-gray-700 hover:text-gray-900 gap-1.5 cursor-pointer shadow-2xs"
          >
            <Layers className="w-4 h-4 text-gray-500" />
            <span className="hidden md:inline">Gerar Lote</span>
          </Button>

          <Button
            onClick={() => {
              setNewTableNumber(String(tables.length + 1));
              setIsAddTableModalOpen(true);
            }}
            className="h-10 rounded-xl bg-[#047857] hover:bg-[#036348] text-white font-bold gap-1.5 cursor-pointer shadow-sm shadow-emerald-900/10 active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Mesa</span>
          </Button>
        </div>
      </div>

      {/* Cards de Métricas em Tempo Real */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total de Mesas</p>
            <p className="text-2xl font-black text-gray-900 mt-0.5">{metrics.total}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
        </div>

        {/* Livres 🟢 */}
        <div className="bg-emerald-50/60 rounded-2xl p-4 border border-emerald-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Livres</p>
            <p className="text-2xl font-black text-emerald-700 mt-0.5">{metrics.available}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100/80 flex items-center justify-center text-emerald-700 font-black text-sm">
            🟢
          </div>
        </div>

        {/* Ocupadas 🟡 */}
        <div className="bg-amber-50/60 rounded-2xl p-4 border border-amber-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Ocupadas</p>
            <p className="text-2xl font-black text-amber-700 mt-0.5">{metrics.occupied}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100/80 flex items-center justify-center text-amber-700 font-black text-sm">
            🟡
          </div>
        </div>

        {/* Pré-Conta 🔵 */}
        <div className="bg-blue-50/60 rounded-2xl p-4 border border-blue-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Pré-Conta</p>
            <p className="text-2xl font-black text-blue-700 mt-0.5">{metrics.billRequested}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-100/80 flex items-center justify-center text-blue-700 font-black text-sm">
            🔵
          </div>
        </div>

        {/* Consumo Aberto R$ */}
        <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-emerald-900 to-slate-900 text-white rounded-2xl p-4 border border-emerald-800/40 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Consumo Aberto</p>
            <p className="text-xl font-black text-white mt-0.5">
              R$ {metrics.totalRevenueOpen.toFixed(2).replace(".", ",")}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400">
            <Receipt className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-gray-200/80 shadow-2xs">
        {/* Tabs de Status */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setFilterStatus("all")}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
              filterStatus === "all"
                ? "bg-gray-900 text-white shadow-2xs"
                : "text-gray-600 hover:bg-gray-100"
            )}
          >
            Todas ({metrics.total})
          </button>

          <button
            onClick={() => setFilterStatus("available")}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5",
              filterStatus === "available"
                ? "bg-emerald-600 text-white shadow-2xs"
                : "text-emerald-800 hover:bg-emerald-50"
            )}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            Livres ({metrics.available})
          </button>

          <button
            onClick={() => setFilterStatus("occupied")}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5",
              filterStatus === "occupied"
                ? "bg-amber-600 text-white shadow-2xs"
                : "text-amber-800 hover:bg-amber-50"
            )}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
            Ocupadas ({metrics.occupied})
          </button>

          <button
            onClick={() => setFilterStatus("bill_requested")}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5",
              filterStatus === "bill_requested"
                ? "bg-blue-600 text-white shadow-2xs"
                : "text-blue-800 hover:bg-blue-50"
            )}
          >
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
            Pré-Conta ({metrics.billRequested})
          </button>
        </div>

        {/* Input de Busca */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por mesa ou cliente..."
            className="pl-9 h-9 rounded-xl border-gray-200 text-xs bg-gray-50/50 focus:bg-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Grid de Mesas */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm font-semibold text-gray-600">Carregando mesas do salão...</p>
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-12 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[#047857] mx-auto mb-4">
            <UtensilsCrossed className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-gray-900">Nenhuma mesa encontrada</h3>
          <p className="text-xs text-gray-500 mt-1 mb-6">
            {searchQuery 
              ? "Tente buscar por outro número ou limpe o filtro."
              : "Você ainda não possui mesas cadastradas para este estabelecimento."}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              onClick={() => setIsBatchModalOpen(true)}
              className="bg-[#047857] hover:bg-[#036348] text-white font-bold h-10 px-5 rounded-xl gap-2 cursor-pointer"
            >
              <Layers className="w-4 h-4" />
              <span>Gerar 10 Mesas em 1 Clique</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredTables.map((table) => {
            const isAvailable = table.effectiveStatus === 'available';
            const isOccupied = table.effectiveStatus === 'occupied';
            const isBillRequested = table.effectiveStatus === 'bill_requested';

            return (
              <div
                key={table.id}
                onClick={() => handleTableClick(table)}
                className={cn(
                  "group relative rounded-3xl p-5 border transition-all duration-200 cursor-pointer flex flex-col justify-between select-none shadow-2xs hover:shadow-md hover:-translate-y-0.5",
                  isAvailable && "bg-white border-emerald-200/80 hover:border-emerald-400",
                  isOccupied && "bg-amber-50/50 border-amber-300/80 hover:border-amber-400 ring-1 ring-amber-300/30",
                  isBillRequested && "bg-blue-50/50 border-blue-300/80 hover:border-blue-400 ring-1 ring-blue-300/30 animate-pulse-subtle"
                )}
              >
                {/* Top: Número da mesa e Badge de Status */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-black uppercase tracking-wider text-gray-400">MESA</span>
                      <span className={cn(
                        "text-3xl font-black tracking-tight",
                        isAvailable && "text-gray-900 group-hover:text-emerald-700",
                        isOccupied && "text-amber-900",
                        isBillRequested && "text-blue-900"
                      )}>
                        {table.table_number}
                      </span>
                    </div>

                    {/* Status Pill */}
                    <span className={cn(
                      "text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border flex items-center gap-1",
                      isAvailable && "bg-emerald-50 text-emerald-700 border-emerald-200",
                      isOccupied && "bg-amber-100 text-amber-800 border-amber-300",
                      isBillRequested && "bg-blue-100 text-blue-800 border-blue-300"
                    )}>
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        isAvailable && "bg-emerald-500",
                        isOccupied && "bg-amber-500 animate-ping-slow",
                        isBillRequested && "bg-blue-500 animate-ping-slow"
                      )}></span>
                      {isAvailable && "Livre"}
                      {isOccupied && "Ocupada"}
                      {isBillRequested && "Pré-Conta"}
                    </span>
                  </div>

                  {/* Detalhes de Ocupação & Cronômetros */}
                  {isAvailable ? (
                    <div className="py-2 space-y-1">
                      <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                        <UtensilsCrossed className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Mesa Livre</span>
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">{table.label || "Salão Principal"}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 py-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900 truncate">
                          <User className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                          <span className="truncate">{table.activeSession?.customer_name || "Cliente"}</span>
                        </div>
                        {table.tableDurationText && (
                          <span className="text-[10px] font-bold text-gray-500 bg-white/80 border border-gray-200/80 px-1.5 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                            <Clock className="w-2.5 h-2.5 text-gray-400" />
                            {table.tableDurationText}
                          </span>
                        )}
                      </div>

                      {/* Badge Inteligente do Último Pedido (Giro de Mesa) */}
                      {table.lastOrderBadge && (
                        <div>
                          <span className={cn(
                            "text-[10px] font-black px-2 py-0.5 rounded-lg border inline-flex items-center gap-1.5 shadow-2xs",
                            table.lastOrderBadge.style
                          )}>
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", table.lastOrderBadge.dot)} />
                            <span>{table.lastOrderBadge.text}</span>
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-gray-500 font-medium">
                        <span className="flex items-center gap-1">
                          <ShoppingBag className="w-3 h-3 text-gray-400" />
                          {table.totalItemsCount} {table.totalItemsCount === 1 ? "item pedido" : "itens pedidos"}
                        </span>
                        {table.ordersByCustomer && table.ordersByCustomer.length > 1 && (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-150">
                            {table.ordersByCustomer.length} clientes
                          </span>
                        )}
                      </div>

                      {/* Prévia do que a mesa consumiu */}
                      {table.aggregatedItems && table.aggregatedItems.length > 0 && (
                        <div className="pt-1.5 border-t border-amber-200/60 space-y-0.5">
                          {table.aggregatedItems.slice(0, 2).map((it, itIdx) => (
                            <p key={itIdx} className="text-[11px] text-gray-700 truncate font-medium">
                              <span className="font-bold text-amber-900 mr-1">{it.quantity}x</span>
                              {it.name}
                            </p>
                          ))}
                          {table.aggregatedItems.length > 2 && (
                            <p className="text-[10px] text-amber-800 font-bold">
                              +{table.aggregatedItems.length - 2} outro{table.aggregatedItems.length - 2 > 1 ? 's' : ''} produto{table.aggregatedItems.length - 2 > 1 ? 's' : ''}...
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom: Valor Consumido ou Ação de Abrir */}
                <div className="mt-4 pt-3 border-t border-gray-200/60 flex items-center justify-between">
                  {isAvailable ? (
                    <>
                      <span className="text-[11px] text-emerald-700 font-bold group-hover:underline flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" />
                        Abrir Mesa
                      </span>
                      <button
                        onClick={(e) => handleDeleteTable(table.id, table.table_number, e)}
                        title="Excluir mesa"
                        className="text-gray-300 hover:text-red-600 transition-colors p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-gray-400">Total Aberto</p>
                        <p className="text-base font-black text-gray-950">
                          R$ {table.totalConsumed.toFixed(2).replace(".", ",")}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className={cn(
                          "w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs transition-colors",
                          isOccupied && "bg-amber-200/80 text-amber-900 group-hover:bg-amber-300",
                          isBillRequested && "bg-blue-200/80 text-blue-900 group-hover:bg-blue-300"
                        )}>
                          <ChevronRight className="w-4 h-4" />
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DRAWER / MODAL: COMANDA DA MESA (CLEAN & SEPARAÇÃO POR PESSOA) */}
      <Dialog open={isComandaDrawerOpen} onOpenChange={setIsComandaDrawerOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-hidden flex flex-col p-0 rounded-3xl bg-white border border-gray-150 shadow-2xl">
          {currentTable && (
            <>
              {/* Header da Comanda Clean & Arejado */}
              <div className="p-5 sm:p-6 bg-gradient-to-b from-stone-50/70 to-white border-b border-gray-100 flex items-start justify-between relative">
                <div className="space-y-1.5 pr-8">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
                      Mesa {currentTable.table_number}
                    </span>
                    <span className={cn(
                      "text-[11px] font-black uppercase tracking-wider px-3 py-0.5 rounded-full border shadow-2xs",
                      currentTable.effectiveStatus === 'bill_requested'
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-amber-50 text-amber-800 border-amber-200"
                    )}>
                      {currentTable.effectiveStatus === 'bill_requested' ? '● Pré-Conta Solicitada' : '● Mesa Ocupada'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 font-medium">
                    <span className="flex items-center gap-1 font-bold text-gray-800">
                      <User className="w-3.5 h-3.5 text-gray-400" />
                      {currentTable.activeSession?.customer_name || `Mesa ${currentTable.table_number}`}
                    </span>
                    {currentTable.activeSession?.customer_phone && (
                      <span>• {currentTable.activeSession.customer_phone}</span>
                    )}
                    {currentTable.tableDurationText && (
                      <span className="flex items-center gap-1 font-semibold text-gray-700">
                        • ⏱️ Aberta há {currentTable.tableDurationText}
                      </span>
                    )}
                    {currentTable.lastOrderBadge && (
                      <span className="flex items-center gap-1 font-semibold text-gray-700">
                        • {currentTable.lastOrderBadge.text}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Total da Comanda</p>
                  <p className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight">
                    R$ {currentTable.totalConsumed.toFixed(2).replace(".", ",")}
                  </p>
                </div>
              </div>

              {/* Barra de Abas da Comanda: Por Pessoa vs Todos os Itens vs Rodadas */}
              <div className="px-5 sm:px-6 py-2.5 bg-gray-50/60 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-gray-200/70 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setComandaViewMode("by_person")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                      comandaViewMode === "by_person"
                        ? "bg-white text-gray-900 shadow-2xs"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    <User className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Por Pessoa ({currentTable.ordersByCustomer?.length || 1})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setComandaViewMode("summary")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                      comandaViewMode === "summary"
                        ? "bg-white text-gray-900 shadow-2xs"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Itens ({currentTable.totalItemsCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setComandaViewMode("rounds")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                      comandaViewMode === "rounds"
                        ? "bg-white text-gray-900 shadow-2xs"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    <Receipt className="w-3.5 h-3.5 text-stone-500" />
                    <span>Rodadas ({currentTable.tableOrders?.length || 0})</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setIsAddItemModalOpen(true)}
                    size="sm"
                    className="h-8 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold border border-emerald-200 text-xs gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Lançar Itens</span>
                  </Button>

                  <Button
                    onClick={() => handleLaunchToPDV(currentTable.table_number)}
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-xl font-bold text-xs gap-1.5 cursor-pointer text-gray-700 border-gray-200 hover:bg-gray-100"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>PDV</span>
                  </Button>
                </div>
              </div>

              {/* Corpo da Comanda */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                {currentTable.tableOrders.length === 0 ? (
                  <div className="bg-gray-50 border border-dashed border-gray-200 rounded-3xl p-8 text-center">
                    <p className="text-xs text-gray-500 font-medium">Nenhum item lançado ainda nesta mesa.</p>
                    <Button
                      onClick={() => setIsAddItemModalOpen(true)}
                      className="mt-3 bg-[#047857] hover:bg-[#036348] text-white text-xs font-bold rounded-xl h-8 cursor-pointer"
                    >
                      Lançar Primeiro Item
                    </Button>
                  </div>
                ) : comandaViewMode === "by_person" ? (
                  /* ABA 1: CONSUMO SEPARADO POR PESSOA (O QUE CADA UM PEDIU) */
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between pb-1">
                      <p className="text-xs font-black uppercase tracking-wider text-gray-400">
                        O que cada pessoa pediu na mesa ({currentTable.ordersByCustomer?.length || 1})
                      </p>
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-150">
                        ✓ Valores individuais
                      </span>
                    </div>

                    {currentTable.ordersByCustomer?.map((person, pIdx) => {
                      const percent = currentTable.totalConsumed > 0 
                        ? ((person.totalAmount / currentTable.totalConsumed) * 100).toFixed(0) 
                        : 0;

                      const avatarColors = [
                        "bg-emerald-50 text-emerald-800 border-emerald-200",
                        "bg-blue-50 text-blue-800 border-blue-200",
                        "bg-purple-50 text-purple-800 border-purple-200",
                        "bg-amber-50 text-amber-800 border-amber-200",
                        "bg-rose-50 text-rose-800 border-rose-200"
                      ];
                      const avatarStyle = avatarColors[pIdx % avatarColors.length];
                      const initial = (person.name || "C").charAt(0).toUpperCase();

                      return (
                        <div
                          key={pIdx}
                          className="rounded-2xl border border-gray-200/90 bg-white shadow-2xs overflow-hidden hover:border-emerald-300 transition-all"
                        >
                          {/* Cabeçalho do Cliente */}
                          <div className="p-3.5 sm:p-4 bg-stone-50/70 border-b border-gray-150 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm border shadow-2xs", avatarStyle)}>
                                {initial}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-black text-gray-900 text-sm sm:text-base capitalize">
                                    {person.name}
                                  </p>
                                  {pIdx === 0 && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-gray-200 text-gray-700">
                                      Titular
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-gray-500 font-medium">
                                  {person.itemsCount} {person.itemsCount === 1 ? "item pedido" : "itens pedidos"} • {percent}% do total da mesa
                                </p>
                              </div>
                            </div>

                            <div className="text-right">
                              <p className="text-base sm:text-lg font-black text-emerald-700">
                                R$ {person.totalAmount.toFixed(2).replace(".", ",")}
                              </p>
                              {isServiceFeeEnabled && (
                                <p className="text-[10px] text-gray-400 font-medium">
                                  com {serviceFeeRate}%: R$ {(person.totalAmount * (1 + serviceFeeMultiplier)).toFixed(2).replace(".", ",")}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Itens deste cliente */}
                          <div className="p-3 divide-y divide-gray-100">
                            {person.items.map((it, itIdx) => (
                              <div key={itIdx} className="py-2.5 first:pt-1 last:pb-1 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2.5">
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-black text-xs border border-emerald-150">
                                    {it.quantity}x
                                  </span>
                                  <div>
                                    <p className="font-bold text-gray-900 text-xs sm:text-sm">{it.name}</p>
                                    {it.quantity > 1 && (
                                      <p className="text-[11px] text-gray-400">R$ {it.unitPrice.toFixed(2).replace(".", ",")} cada</p>
                                    )}
                                    {it.notes && (
                                      <p className="text-[10px] text-amber-700 italic font-medium">Obs: {it.notes}</p>
                                    )}
                                  </div>
                                </div>
                                <span className="font-black text-gray-950 text-xs sm:text-sm">
                                  R$ {it.totalPrice.toFixed(2).replace(".", ",")}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {currentTable.ordersByCustomer?.length === 1 && (
                      <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 text-amber-900 text-xs flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          <strong>Dica:</strong> Ao lançar novos itens pelo PDV ou no botão <em>+ Lançar Itens</em>, digite o nome de quem pediu para separar automaticamente o consumo de cada amigo na mesa!
                        </span>
                      </div>
                    )}
                  </div>
                ) : comandaViewMode === "summary" ? (
                  /* ABA 2: LISTAGEM DIRETA DO QUE A MESA CONSUMIU (AGRUPADA) */
                  <div className="space-y-2">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-2">
                      Lista Detalhada de Consumo da Mesa {currentTable.table_number}
                    </p>
                    {currentTable.aggregatedItems.map((it, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-gray-200/90 shadow-2xs hover:border-emerald-300 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-black text-xs flex items-center justify-center shrink-0">
                            {it.quantity}x
                          </span>
                          <div>
                            <p className="font-bold text-gray-900 text-xs sm:text-sm">{it.name}</p>
                            <p className="text-[11px] text-gray-400 font-medium">
                              {it.quantity > 1 
                                ? `${it.quantity} unidades • R$ ${it.unitPrice.toFixed(2).replace(".", ",")} cada` 
                                : `Valor unitário: R$ ${it.unitPrice.toFixed(2).replace(".", ",")}`}
                            </p>
                            {it.notes && (
                              <p className="text-[10px] text-amber-700 italic font-semibold mt-0.5">Obs: {it.notes}</p>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-black text-gray-950 text-sm sm:text-base">
                            R$ {it.totalPrice.toFixed(2).replace(".", ",")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* ABA 3: VISÃO POR RODADAS DE PEDIDO */
                  <div className="space-y-3">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-2">
                      Histórico Cronológico de Rodadas
                    </p>
                    {currentTable.tableOrders.map((ord, idx) => {
                      const items = Array.isArray(ord.items) ? ord.items : [];
                      const orderTime = ord.created_date ? new Date(ord.created_date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
                      const personName = (ord.customer_name || "").trim() || `Mesa ${currentTable.table_number}`;

                      return (
                        <div key={ord.id || idx} className="bg-white rounded-2xl p-4 border border-gray-200/90 shadow-2xs space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-gray-600 pb-2 border-b border-gray-100">
                            <span className="flex items-center gap-2 text-gray-900">
                              <span className="w-5 h-5 rounded-md bg-gray-100 text-gray-700 flex items-center justify-center text-[10px] font-black">
                                #{idx + 1}
                              </span>
                              <span className="font-black">Rodada {idx + 1}</span>
                              <span className="text-emerald-700 font-medium">👤 {personName}</span>
                              {orderTime && <span className="text-gray-400 font-normal">({orderTime})</span>}
                            </span>
                            <span className="text-emerald-700 font-black text-sm">
                              R$ {(Number(ord.total_amount || ord.total || 0)).toFixed(2).replace(".", ",")}
                            </span>
                          </div>

                          <div className="space-y-1.5 pt-1">
                            {items.map((it, itIdx) => (
                              <div key={itIdx} className="flex items-start justify-between text-xs">
                                <div>
                                  <p className="font-semibold text-gray-900">
                                    <span className="text-emerald-700 font-black mr-1.5">{it.quantity || it.qty || 1}x</span>
                                    {it.product_name || it.name}
                                  </p>
                                  {it.notes && (
                                    <p className="text-[11px] text-gray-400 italic">Obs: {it.notes}</p>
                                  )}
                                </div>
                                <span className="font-bold text-gray-800">
                                  R$ {(Number(it.subtotal || ((it.product_price || it.price || 0) * (it.quantity || it.qty || 1)))).toFixed(2).replace(".", ",")}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Resumo da Conta & Divisão por Pessoa */}
                <div className="mt-4 p-4 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                    <span>Subtotal de Consumo:</span>
                    <span className="font-bold text-gray-900">
                      R$ {currentTable.totalConsumed.toFixed(2).replace(".", ",")}
                    </span>
                  </div>

                  {isServiceFeeEnabled && (
                    <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                      <span>Taxa de Serviço Opcional ({serviceFeeRate}%):</span>
                      <span className="font-bold text-gray-900">
                        R$ {(currentTable.totalConsumed * serviceFeeMultiplier).toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-gray-200 flex items-center justify-between text-sm font-black text-gray-950">
                    <span>Total {isServiceFeeEnabled ? `com ${serviceFeeRate}%:` : "Final:"}</span>
                    <span className="text-base text-emerald-700">
                      R$ {(currentTable.totalConsumed * (isServiceFeeEnabled ? (1 + serviceFeeMultiplier) : 1)).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Rodapé com Botões de Ação */}
              <div className="p-4 sm:p-5 bg-white border-t border-gray-150 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    onClick={handleRequestPreBill}
                    variant="outline"
                    className="flex-1 sm:flex-none h-11 rounded-2xl border-gray-200 font-bold text-gray-700 hover:text-emerald-700 hover:border-emerald-300 gap-2 cursor-pointer shadow-2xs"
                  >
                    <Printer className="w-4 h-4 text-emerald-600" />
                    <span>Pré-Conta</span>
                  </Button>

                  <Button
                    onClick={() => handleQuickReleaseTable(currentTable)}
                    variant="outline"
                    className="flex-1 sm:flex-none h-11 rounded-2xl border-amber-200 text-amber-800 hover:bg-amber-50 font-bold gap-1.5 cursor-pointer"
                    title="Libera a mesa imediatamente"
                  >
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>Liberar Mesa</span>
                  </Button>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    onClick={() => setIsComandaDrawerOpen(false)}
                    variant="ghost"
                    className="h-11 rounded-2xl font-bold text-gray-500 hover:text-gray-900 cursor-pointer px-4"
                  >
                    Fechar
                  </Button>

                  <Button
                    onClick={() => {
                      setIncludeServiceFee(isServiceFeeEnabled);
                      setIsSettlementModalOpen(true);
                    }}
                    className="flex-1 sm:flex-none h-11 px-6 rounded-2xl bg-[#047857] hover:bg-[#036348] text-white font-black gap-2 cursor-pointer shadow-sm active:scale-[0.98] transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Fechar / Receber Mesa</span>
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: ABRIR MESA */}
      <Dialog open={isOpenTableModalOpen} onOpenChange={setIsOpenTableModalOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 bg-white border border-gray-200 shadow-2xl">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#047857] mb-2">
              <Plus className="w-6 h-6" />
            </div>
            <DialogTitle className="text-xl font-black text-gray-950">
              Abrir Mesa {selectedTable?.table_number}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Inicie a comanda da mesa para começar a lançar pedidos.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleOpenTable} className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Nome do Cliente (ou identificação)
              </label>
              <Input
                value={openCustomerName}
                onChange={(e) => setOpenCustomerName(e.target.value)}
                placeholder="Ex: João Silva ou Aniversário"
                className="h-10 rounded-xl text-sm"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                WhatsApp / Telefone (Opcional)
              </label>
              <Input
                value={openCustomerPhone}
                onChange={(e) => setOpenCustomerPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                className="h-10 rounded-xl text-sm"
              />
            </div>

            <div className="pt-3 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpenTableModalOpen(false)}
                className="h-10 rounded-xl font-bold cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isOpeningTable}
                className="h-10 px-5 rounded-xl bg-[#047857] hover:bg-[#036348] text-white font-bold cursor-pointer shadow-sm"
              >
                {isOpeningTable ? "Abrindo..." : "Confirmar Abertura"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: LANÇAR ITENS NA COMANDA */}
      <Dialog open={isAddItemModalOpen} onOpenChange={setIsAddItemModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-3xl bg-white border border-gray-200 shadow-2xl">
          <div className="p-4 sm:p-5 bg-stone-50/80 border-b border-gray-150 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#047857] shadow-2xs">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <p className="text-base font-black text-gray-950">Lançar Itens na Mesa {currentTable?.table_number || selectedTable?.table_number}</p>
                <p className="text-xs text-gray-400 font-medium">Selecione os produtos e atribua à pessoa que pediu</p>
              </div>
            </div>
            <button
              onClick={() => setIsAddItemModalOpen(false)}
              className="w-8 h-8 rounded-full hover:bg-gray-200/60 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Barra de Pesquisa, Quem Pediu e Categorias */}
          <div className="p-4 border-b border-gray-150/80 bg-white space-y-2.5">
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Buscar produto pelo nome..."
                  className="pl-9 h-9 rounded-xl text-xs bg-gray-50/70 border-gray-200"
                />
              </div>

              <div className="relative w-full sm:w-72">
                <User className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={quickOrderPersonName}
                  onChange={(e) => setQuickOrderPersonName(e.target.value)}
                  placeholder="Quem pediu? (Ex: Carlos, Ana...)"
                  className="pl-9 h-9 rounded-xl text-xs bg-emerald-50/40 border-emerald-200/90 font-medium text-emerald-950 placeholder:text-gray-400 focus:bg-white"
                />
              </div>
            </div>

            {/* Pílulas rápidas de pessoas já na mesa */}
            {currentTable?.ordersByCustomer && currentTable.ordersByCustomer.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
                <span className="text-[11px] font-bold text-gray-400 shrink-0">Na mesa:</span>
                {currentTable.ordersByCustomer.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setQuickOrderPersonName(p.name)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border shrink-0",
                      quickOrderPersonName === p.name
                        ? "bg-[#047857] text-white border-[#047857]"
                        : "bg-gray-100/80 text-gray-700 border-gray-200 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200"
                    )}
                  >
                    👤 {p.name}
                  </button>
                ))}
              </div>
            )}

            {/* Categorias */}
            <div className="flex items-center gap-1 overflow-x-auto pt-1 pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all",
                  selectedCategory === "all" ? "bg-[#047857] text-white shadow-2xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200/70"
                )}
              >
                Todos
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all",
                    selectedCategory === cat.id ? "bg-[#047857] text-white shadow-2xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200/70"
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {products
              .filter(p => {
                if (p.available === false) return false;
                if (selectedCategory !== "all" && p.category_id !== selectedCategory && p.category !== selectedCategory) return false;
                if (itemSearch.trim() && !p.name.toLowerCase().includes(itemSearch.toLowerCase())) return false;
                return true;
              })
              .map(prod => {
                const inCart = quickCart.find(it => it.id === prod.id);

                return (
                  <div
                    key={prod.id}
                    onClick={() => addToQuickCart(prod)}
                    className="p-3 rounded-2xl border border-gray-200 hover:border-emerald-400 bg-white hover:bg-emerald-50/20 transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <p className="font-bold text-xs text-gray-900 leading-tight">{prod.name}</p>
                      {prod.description && (
                        <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{prod.description}</p>
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                      <span className="font-black text-xs text-emerald-700">
                        R$ {Number(prod.price || 0).toFixed(2).replace(".", ",")}
                      </span>

                      {inCart ? (
                        <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center">
                          {inCart.qty}
                        </span>
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-700 font-bold text-xs flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-colors">
                          +
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Carrinho Rápido Selecionado */}
          {quickCart.length > 0 && (
            <div className="p-4 bg-emerald-50 border-t border-emerald-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-emerald-950">
                  Itens Selecionados ({quickCart.reduce((s, it) => s + it.qty, 0)})
                </span>
                <span className="text-sm font-black text-emerald-700">
                  R$ {quickCart.reduce((s, it) => s + (Number(it.price) * it.qty), 0).toFixed(2).replace(".", ",")}
                </span>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                {quickCart.map(it => (
                  <div key={it.id} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-emerald-200 shrink-0 text-xs">
                    <span className="font-bold text-gray-900">{it.name}</span>
                    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => updateQuickCartQty(it.id, -1)}
                        className="w-4 h-4 flex items-center justify-center font-black text-gray-600 hover:text-red-600"
                      >
                        -
                      </button>
                      <span className="font-black text-xs px-1">{it.qty}</span>
                      <button
                        type="button"
                        onClick={() => updateQuickCartQty(it.id, 1)}
                        className="w-4 h-4 flex items-center justify-center font-black text-gray-600 hover:text-emerald-600"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickCart([])}
                  className="rounded-xl text-xs font-bold"
                >
                  Limpar
                </Button>
                <Button
                  onClick={handleSubmitQuickOrder}
                  disabled={isSubmittingQuickOrder}
                  className="bg-[#047857] hover:bg-[#036348] text-white rounded-xl text-xs font-bold h-9 px-4 gap-1.5 cursor-pointer shadow-sm"
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Enviar para Cozinha/Bar</span>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: FECHAMENTO / RECEBIMENTO DE CONTA */}
      <Dialog open={isSettlementModalOpen} onOpenChange={setIsSettlementModalOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 bg-white border border-gray-200 shadow-2xl">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#047857] mb-2">
              <Receipt className="w-6 h-6" />
            </div>
            <DialogTitle className="text-xl font-black text-gray-950">
              Receber Mesa {selectedTable?.table_number}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Selecione o método de pagamento e liquide a comanda.
            </DialogDescription>
          </DialogHeader>

          {selectedTable && (
            <div className="space-y-4 mt-2">
              {/* Valores */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-2 text-xs">
                <div className="flex items-center justify-between font-medium text-gray-600">
                  <span>Subtotal:</span>
                  <span className="font-bold text-gray-900">
                    R$ {selectedTable.totalConsumed.toFixed(2).replace(".", ",")}
                  </span>
                </div>

                {/* Switch de Serviço se ativado */}
                {isServiceFeeEnabled && (
                  <div className="flex items-center justify-between pt-1 border-t border-gray-200/80">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeServiceFee}
                        onChange={(e) => setIncludeServiceFee(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-bold text-gray-800">Incluir {serviceFeeRate}% de Serviço</span>
                    </label>
                    <span className="font-bold text-emerald-700">
                      R$ {(selectedTable.totalConsumed * serviceFeeMultiplier).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                )}

                {/* Desconto */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-gray-600">Desconto (R$):</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.50"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-24 h-7 text-xs text-right rounded-lg bg-white"
                  />
                </div>

                {/* Total Final */}
                <div className="pt-2 border-t border-gray-300 flex items-center justify-between text-sm font-black text-gray-950">
                  <span>Total a Pagar:</span>
                  <span className="text-xl text-[#047857]">
                    R$ {Math.max(0, selectedTable.totalConsumed + ((includeServiceFee && isServiceFeeEnabled) ? selectedTable.totalConsumed * serviceFeeMultiplier : 0) - (Number(discountAmount) || 0)).toFixed(2).replace(".", ",")}
                  </span>
                </div>
              </div>

              {/* Formas de Pagamento */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Forma de Pagamento
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "dinheiro", label: "Dinheiro", icon: Banknote },
                    { id: "pix", label: "Pix", icon: Sparkles },
                    { id: "cartao_debito", label: "Cartão Débito", icon: CreditCard },
                    { id: "cartao_credito", label: "Cartão Crédito", icon: CreditCard },
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      className={cn(
                        "h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer",
                        paymentMethod === m.id
                          ? "bg-emerald-50 border-[#047857] text-[#047857] shadow-xs"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      <m.icon className="w-4 h-4" />
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Troco se Dinheiro */}
              {paymentMethod === "dinheiro" && (
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Valor Recebido em Dinheiro (para troco)
                  </label>
                  <Input
                    type="number"
                    step="0.50"
                    placeholder="Ex: 100.00"
                    value={cashGiven}
                    onChange={(e) => setCashGiven(e.target.value)}
                    className="h-10 rounded-xl text-sm"
                  />
                  {cashGiven && Number(cashGiven) > (selectedTable.totalConsumed + ((includeServiceFee && isServiceFeeEnabled) ? selectedTable.totalConsumed * serviceFeeMultiplier : 0)) && (
                    <p className="text-xs font-bold text-emerald-700 mt-1">
                      Troco: R$ {(Number(cashGiven) - (selectedTable.totalConsumed + ((includeServiceFee && isServiceFeeEnabled) ? selectedTable.totalConsumed * serviceFeeMultiplier : 0) - Number(discountAmount))).toFixed(2).replace(".", ",")}
                    </p>
                  )}
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsSettlementModalOpen(false)}
                  className="h-10 rounded-xl font-bold cursor-pointer"
                >
                  Voltar
                </Button>
                <Button
                  onClick={handleFinalizeSettlement}
                  disabled={isClosingSession}
                  className="h-10 px-5 rounded-xl bg-[#047857] hover:bg-[#036348] text-white font-black cursor-pointer shadow-sm"
                >
                  {isClosingSession ? "Finalizando..." : "Liquidar e Liberar Mesa"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: PRÉ-CONTA / CONFERÊNCIA TÉRMICA (MODELO IMPRESSO) */}
      <Dialog open={isPrintPreBillOpen} onOpenChange={setIsPrintPreBillOpen}>
        <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto p-5 sm:p-6 bg-white border border-gray-300 shadow-2xl rounded-2xl font-mono text-xs">
          {(() => {
            const preBillTable = currentTable || selectedTable;
            if (!preBillTable) return null;

            const ordersByCustomer = preBillTable.ordersByCustomer || [];
            const subtotal = Number(preBillTable.totalConsumed || 0);
            const isFeeEnabled = settings?.table_service_fee_enabled === true;
            const feeRate = Number(settings?.table_service_fee_rate ?? 10);
            const feeMultiplier = feeRate / 100;
            const serviceFee = isFeeEnabled ? (subtotal * feeMultiplier) : 0;
            const totalWithService = subtotal + serviceFee;
            const session = preBillTable.activeSession;

            return (
              <div className="space-y-3 text-gray-900">
                {/* Cabeçalho do Cupom Impresso */}
                <div className="text-center space-y-1 border-b border-dashed border-gray-400 pb-3">
                  <p className="font-bold text-base tracking-wide uppercase text-gray-950">
                    {settings?.restaurant_name || "RESTAURANTE"}
                  </p>
                  <p className="text-[11px] font-bold text-gray-600 uppercase tracking-widest">
                    *** PRÉ-CONTA / CONFERÊNCIA ***
                  </p>
                  <p className="text-sm font-black text-gray-900">
                    MESA {preBillTable.table_number} {session?.customer_name ? `• ${session.customer_name}` : ""}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>

                {/* DETALHAMENTO DO CONSUMO POR PESSOA NO CUPOM */}
                {ordersByCustomer.length > 0 && (
                  <div className="space-y-2 border-b border-dashed border-gray-400 pb-3">
                    <p className="text-[11px] font-black uppercase text-center tracking-wider text-gray-700">
                      - - - CONSUMO POR PESSOA - - -
                    </p>

                    {ordersByCustomer.map((person, pIdx) => {
                      const pSubtotal = Number(person.totalAmount || 0);
                      const pTotal10 = pSubtotal * 1.10;

                      return (
                        <div key={pIdx} className="space-y-1">
                          <div className="flex justify-between font-black text-xs text-gray-950 border-b border-dotted border-gray-300 pb-0.5">
                            <span>👤 {person.name.toUpperCase()} ({person.itemsCount}):</span>
                            <span>R$ {pSubtotal.toFixed(2).replace(".", ",")}</span>
                          </div>

                          <div className="pl-2 space-y-0.5 text-gray-700 text-[11px]">
                            {(person.items || []).map((it, itIdx) => (
                              <div key={itIdx} className="flex justify-between">
                                <span>{it.quantity}x {it.name}</span>
                                <span>R$ {Number(it.totalPrice || 0).toFixed(2).replace(".", ",")}</span>
                              </div>
                            ))}
                          </div>

                          {isFeeEnabled && (
                            <div className="flex justify-between text-[10px] text-emerald-800 font-bold pl-2 pt-0.5">
                              <span>c/ {feeRate}% opcional:</span>
                              <span>R$ {(pSubtotal * (1 + feeMultiplier)).toFixed(2).replace(".", ",")}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ITENS TOTAIS DA MESA */}
                <div className="space-y-1 border-b border-dashed border-gray-400 pb-3">
                  <p className="text-[10px] font-bold uppercase text-gray-500 pb-0.5">
                    ITENS CONSUMIDOS NA MESA:
                  </p>
                  {preBillTable.aggregatedItems.map((it, idx) => (
                    <div key={idx} className="flex justify-between text-[11px] text-gray-800">
                      <span>{it.quantity}x {it.name}</span>
                      <span>R$ {Number(it.totalPrice || 0).toFixed(2).replace(".", ",")}</span>
                    </div>
                  ))}
                </div>

                {/* TOTAIS DO CUPOM IMPRESSO */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between font-bold text-gray-900">
                    <span>SUBTOTAL:</span>
                    <span>R$ {subtotal.toFixed(2).replace(".", ",")}</span>
                  </div>

                  {isFeeEnabled && (
                    <div className="flex justify-between text-gray-700">
                      <span>TAXA DE SERVIÇO ({feeRate}% OPC.):</span>
                      <span>R$ {serviceFee.toFixed(2).replace(".", ",")}</span>
                    </div>
                  )}

                  <div className="flex justify-between font-black text-sm pt-1.5 border-t border-dashed border-gray-400 text-gray-950">
                    <span>TOTAL GERAL:</span>
                    <span>R$ {totalWithService.toFixed(2).replace(".", ",")}</span>
                  </div>

                  {/* QUANTO CADA UM PAGA */}
                  {ordersByCustomer.length > 1 && (
                    <div className="pt-2 border-t border-dotted border-gray-300 space-y-0.5">
                      <p className="text-[10px] font-black uppercase text-gray-600">
                        DIVISÃO POR PESSOA {isFeeEnabled ? `(COM ${feeRate}%):` : ":"}
                      </p>
                      {ordersByCustomer.map((p, idx) => {
                        const pTotal = isFeeEnabled ? Number(p.totalAmount || 0) * (1 + feeMultiplier) : Number(p.totalAmount || 0);
                        return (
                          <div key={idx} className="flex justify-between text-[11px] font-bold text-emerald-900">
                            <span>• {p.name}:</span>
                            <span>R$ {pTotal.toFixed(2).replace(".", ",")}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-center text-gray-400 pt-3 border-t border-dashed border-gray-400 uppercase tracking-wider">
                  NÃO É DOCUMENTO FISCAL • OBRIGADO PELA PREFERÊNCIA!
                </p>

                {/* Botões de Ação */}
                <div className="pt-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCopyPreBillSummary(preBillTable)}
                    className="h-9 px-3 rounded-xl border-gray-300 font-bold text-xs gap-1.5 text-gray-700 hover:text-emerald-800 cursor-pointer"
                  >
                    {isCopiedSummary ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-gray-500" />
                        <span>Copiar WhatsApp</span>
                      </>
                    )}
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsPrintPreBillOpen(false)}
                      className="h-9 px-3 rounded-xl font-bold text-xs cursor-pointer"
                    >
                      Fechar
                    </Button>

                    <Button
                      onClick={() => handlePrintPreBill(preBillTable)}
                      disabled={isPrintingPreBill}
                      className="h-9 px-4 rounded-xl bg-[#047857] hover:bg-[#036348] text-white font-bold text-xs gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>{isPrintingPreBill ? "Enviando..." : "Imprimir"}</span>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* MODAL: QR CODES DAS MESAS PARA IMPRESSÃO */}
      <Dialog open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 bg-white border border-gray-200 shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-200 pb-4">
            <div>
              <DialogTitle className="text-xl font-black text-gray-950 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-[#047857]" />
                <span>QR Codes das Mesas (Displays de Mesa)</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500 mt-0.5">
                Imprima e coloque nos displays ou totens das mesas para que os clientes façam pedidos com o celular.
              </DialogDescription>
            </div>

            <Button
              onClick={() => window.print()}
              className="h-9 rounded-xl bg-[#047857] hover:bg-[#036348] text-white font-bold text-xs gap-1.5 cursor-pointer shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Displays</span>
            </Button>
          </div>

          {/* Grid de Displays para Recorte / Impressão */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-4 print:grid-cols-2 print:gap-8">
            {tablesWithSessions.map(table => {
              const qrUrl = `${origin}/${storeSlug}/menu?mesa=${table.table_number}`;

              return (
                <div
                  key={table.id}
                  className="rounded-3xl border-2 border-dashed border-gray-300 p-6 flex flex-col items-center text-center bg-white shadow-2xs print:border-solid print:border-gray-900"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#047857] mb-2">
                    <UtensilsCrossed className="w-4 h-4" />
                  </div>

                  <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                    {settings?.restaurant_name || "PedeMuleke"}
                  </p>

                  <h3 className="text-3xl font-black text-gray-950 mt-1 mb-3">
                    Mesa {table.table_number}
                  </h3>

                  <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-xs mb-3">
                    <QRCodeCanvas
                      value={qrUrl}
                      size={160}
                      level="H"
                      includeMargin={false}
                    />
                  </div>

                  <p className="text-xs font-bold text-gray-900 leading-tight">
                    Aponte a câmera do celular
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Faça seu pedido diretamente da mesa sem esperar garçom!
                  </p>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL: NOVA MESA */}
      <Dialog open={isAddTableModalOpen} onOpenChange={setIsAddTableModalOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 bg-white border border-gray-200 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-gray-950">Cadastrar Nova Mesa</DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Adicione uma nova mesa física ou área ao seu salão.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddTable} className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Número ou Identificador da Mesa *
              </label>
              <Input
                value={newTableNumber}
                onChange={(e) => setNewTableNumber(e.target.value)}
                placeholder="Ex: 11, 12, Varanda 1..."
                className="h-10 rounded-xl text-sm"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Setor / Ambiente
              </label>
              <Input
                value={newTableLabel}
                onChange={(e) => setNewTableLabel(e.target.value)}
                placeholder="Ex: Salão Principal, Deck, Área Externa"
                className="h-10 rounded-xl text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Capacidade (Pessoas)
              </label>
              <Input
                type="number"
                min="1"
                max="50"
                value={newTableCapacity}
                onChange={(e) => setNewTableCapacity(e.target.value)}
                className="h-10 rounded-xl text-sm"
              />
            </div>

            <div className="pt-3 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddTableModalOpen(false)}
                className="h-10 rounded-xl font-bold cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isAddingTable}
                className="h-10 px-5 rounded-xl bg-[#047857] hover:bg-[#036348] text-white font-bold cursor-pointer shadow-sm"
              >
                {isAddingTable ? "Salvando..." : "Criar Mesa"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: GERAR MESAS EM LOTE */}
      <Dialog open={isBatchModalOpen} onOpenChange={setIsBatchModalOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 bg-white border border-gray-200 shadow-2xl">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#047857] mb-2">
              <Layers className="w-6 h-6" />
            </div>
            <DialogTitle className="text-xl font-black text-gray-950">Gerar Mesas em Lote</DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Gere de forma instantânea a numeração sequencial de mesas para o seu restaurante.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Quantidade de Mesas para Gerar
              </label>
              <div className="flex items-center gap-2">
                {[5, 10, 15, 20, 30].map(cnt => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setBatchCount(cnt)}
                    className={cn(
                      "flex-1 h-9 rounded-xl text-xs font-bold transition-all border cursor-pointer",
                      batchCount === cnt
                        ? "bg-[#047857] text-white border-[#047857]"
                        : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                    )}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsBatchModalOpen(false)}
                className="h-10 rounded-xl font-bold cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleBatchGenerate}
                disabled={isGeneratingBatch}
                className="h-10 px-5 rounded-xl bg-[#047857] hover:bg-[#036348] text-white font-bold cursor-pointer shadow-sm"
              >
                {isGeneratingBatch ? "Gerando..." : `Gerar ${batchCount} Mesas`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

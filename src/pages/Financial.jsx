import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Vault,
  Landmark,
  Wallet,
  Plus,
  ArrowLeftRight,
  CheckCircle2,
  Trash2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  CalendarClock,
  Receipt,
  AlertTriangle,
  Pencil,
  Star,
  Archive,
} from "lucide-react";
import { toast } from "sonner";
import { parseBRLToNumber } from "@/utils/moneyMask";
import { getBrasiliaParts } from "@/utils/dateTime";
import {
  fetchFinancialOverview,
  fetchPayablesReceivablesOverview,
  createFinancialEntry,
  createFinancialInstallments,
  markFinancialEntryPaid,
  deleteFinancialEntry,
  createBankAccount,
  updateBankAccount,
  archiveBankAccount,
  BANK_ACCOUNT_KINDS,
  FINANCIAL_CATEGORIES,
  ACCOUNT_LABELS,
} from "@/services/financialService";

function formatMoney(val) {
  return `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;
}

function getDateRange(preset) {
  const now = new Date();
  const parts = getBrasiliaParts(now);
  const todayStr = parts.dateKey;
  const [y, m] = todayStr.split("-").map(Number);

  if (preset === "today") {
    return { startDate: todayStr, endDate: todayStr };
  }
  if (preset === "7d") {
    const past = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { startDate: getBrasiliaParts(past).dateKey, endDate: todayStr };
  }
  if (preset === "last_month") {
    const prevMonthEnd = new Date(Date.UTC(y, m - 1, 0));
    const prevMonthStart = new Date(Date.UTC(y, m - 2, 1));
    return {
      startDate: prevMonthStart.toISOString().slice(0, 10),
      endDate: prevMonthEnd.toISOString().slice(0, 10),
    };
  }
  // month (default)
  const monthStart = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  return { startDate: monthStart, endDate: todayStr };
}

export default function Financial() {
  const tenantId =
    (typeof window !== "undefined" ? localStorage.getItem("current_tenant_id") : null) ||
    "a0000000-0000-0000-0000-000000000001";

  const [activeTab, setActiveTab] = useState("overview");
  const [periodPreset, setPeriodPreset] = useState("month");
  const [typeFilter, setTypeFilter] = useState("all");
  const [prFilter, setPrFilter] = useState("payable");
  const [isLoading, setIsLoading] = useState(true);
  const [overview, setOverview] = useState({
    accounts: {
      drawer: { balance: 0, is_open: false },
      safe: { balance: 0 },
      bank: { balance: 0 },
    },
    summary: {
      income_total: 0,
      expense_total: 0,
      net_total: 0,
      pending_expense_total: 0,
    },
    entries: [],
  });
  const [prData, setPrData] = useState({
    today: null,
    kpis: {
      overdue_payable_total: 0,
      overdue_payable_count: 0,
      due_today_payable_total: 0,
      due_today_payable_count: 0,
      upcoming_30d_payable_total: 0,
      upcoming_30d_payable_count: 0,
      pending_receivable_total: 0,
      pending_receivable_count: 0,
    },
    items: [],
  });

  // Modal: Novo Lançamento / Conta a Pagar ou Receber
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryType, setEntryType] = useState("expense");
  const [entryStatus, setEntryStatus] = useState("paid");
  const [entryDesc, setEntryDesc] = useState("");
  const [entryCounterparty, setEntryCounterparty] = useState("");
  const [entryCategory, setEntryCategory] = useState(FINANCIAL_CATEGORIES[0]);
  const [entryAmountStr, setEntryAmountStr] = useState("R$ 0,00");
  const [entryAccount, setEntryAccount] = useState("bank");
  const [entryDueDate, setEntryDueDate] = useState(() => getBrasiliaParts(new Date()).dateKey);
  const [entryInstallments, setEntryInstallments] = useState(1);

  // Modal: Gerenciar Bancos / Contas Digitais
  const [banksModalOpen, setBanksModalOpen] = useState(false);
  const [editingBankId, setEditingBankId] = useState(null);
  const [bankFormName, setBankFormName] = useState("");
  const [bankFormKind, setBankFormKind] = useState("checking");
  const [bankFormInitialStr, setBankFormInitialStr] = useState("R$ 0,00");
  const [bankFormDefault, setBankFormDefault] = useState(false);
  const [bankFormSaving, setBankFormSaving] = useState(false);
  const [entrySaving, setEntrySaving] = useState(false);

  // Modal: Baixa de Conta Pendente (escolhendo Cofre ou Banco)
  const [settleModalItem, setSettleModalItem] = useState(null);
  const [settleAccount, setSettleAccount] = useState("bank");
  const [settleSaving, setSettleSaving] = useState(false);

  // Modal: Transferência entre Contas (Gaveta <-> Cofre <-> Banco)
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("safe");
  const [transferTo, setTransferTo] = useState("bank");
  const [transferAmountStr, setTransferAmountStr] = useState("R$ 0,00");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const range = getDateRange(periodPreset);
      const [overviewRes, prRes] = await Promise.all([
        fetchFinancialOverview(tenantId, range),
        fetchPayablesReceivablesOverview(tenantId),
      ]);
      setOverview(overviewRes);
      setPrData(prRes);
    } catch (err) {
      console.error("[Financial] Erro ao carregar financeiro:", err);
      toast.error(err?.message || "Erro ao carregar dados financeiros.");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, periodPreset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredEntries = useMemo(() => {
    const list = overview.entries || [];
    if (typeFilter === "all") return list;
    if (typeFilter === "pending") return list.filter((e) => e.status === "pending");
    if (typeFilter === "expense") return list.filter((e) => e.entry_type === "expense");
    if (typeFilter === "income") return list.filter((e) => e.entry_type === "income");
    if (typeFilter === "transfer") return list.filter((e) => e.entry_type === "transfer");
    return list;
  }, [overview.entries, typeFilter]);

  const todayKey = prData.today || getBrasiliaParts(new Date()).dateKey;

  const filteredPrItems = useMemo(() => {
    const list = prData.items || [];
    if (prFilter === "pending") return list.filter((e) => e.status === "pending");
    if (prFilter === "payable") return list.filter((e) => e.status === "pending" && e.entry_type === "expense");
    if (prFilter === "receivable") return list.filter((e) => e.status === "pending" && e.entry_type === "income");
    if (prFilter === "overdue") return list.filter((e) => e.status === "pending" && e.due_date && e.due_date < todayKey);
    if (prFilter === "paid") return list.filter((e) => e.status === "paid");
    return list;
  }, [prData.items, prFilter, todayKey]);

  const banksList = useMemo(() => {
    const list = overview.accounts?.banks;
    if (Array.isArray(list) && list.length > 0) return list;
    return [
      {
        id: null,
        name: overview.accounts?.bank?.name || "Banco / Conta Digital",
        balance: overview.accounts?.bank?.balance || 0,
        is_default: true,
        account_kind: "checking",
      },
    ];
  }, [overview.accounts]);

  const defaultBank = useMemo(
    () => banksList.find((b) => b.is_default) || banksList[0],
    [banksList]
  );

  const defaultBankKey = defaultBank?.id ? `bank:${defaultBank.id}` : "bank";

  const accountOptions = useMemo(() => {
    const opts = banksList.map((b) => ({
      key: b.id ? `bank:${b.id}` : "bank",
      code: "bank",
      id: b.id || null,
      shortLabel: b.name,
      label: b.is_default && banksList.length > 1 ? `${b.name} (Padrão)` : b.name,
    }));
    opts.push({
      key: "safe",
      code: "safe",
      id: overview.accounts?.safe?.id || null,
      shortLabel: "Cofre",
      label: "Cofre (Dinheiro Guardado)",
    });
    return opts;
  }, [banksList, overview.accounts?.safe?.id]);

  const resolveAccountSelection = useCallback(
    (key) => {
      const found = accountOptions.find((o) => o.key === key);
      if (found) return found;
      if (String(key).startsWith("bank:")) {
        return {
          key,
          code: "bank",
          id: String(key).slice(5),
          shortLabel: "Banco",
          label: "Banco",
        };
      }
      if (key === "bank") {
        return {
          key: defaultBankKey,
          code: "bank",
          id: defaultBank?.id || null,
          shortLabel: defaultBank?.name || "Banco",
          label: defaultBank?.name || "Banco",
        };
      }
      return {
        key: "safe",
        code: "safe",
        id: overview.accounts?.safe?.id || null,
        shortLabel: "Cofre",
        label: "Cofre",
      };
    },
    [accountOptions, defaultBank, defaultBankKey, overview.accounts?.safe?.id]
  );

  const handleOpenNewEntry = (defaultType = "expense", defaultStatus = "paid") => {
    setEntryType(defaultType);
    setEntryStatus(defaultStatus);
    setEntryDesc("");
    setEntryCounterparty("");
    setEntryCategory(defaultType === "income" ? "Outros" : FINANCIAL_CATEGORIES[0]);
    setEntryAmountStr("R$ 0,00");
    setEntryAccount(defaultStatus === "pending" ? defaultBankKey : "safe");
    setEntryDueDate(getBrasiliaParts(new Date()).dateKey);
    setEntryInstallments(1);
    setEntryModalOpen(true);
  };

  const handleSaveEntry = async (e) => {
    e.preventDefault();
    const amount = parseBRLToNumber(entryAmountStr);
    if (!entryDesc.trim()) {
      toast.error("Informe uma descrição.");
      return;
    }
    if (amount <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }

    const sel = resolveAccountSelection(entryAccount);
    setEntrySaving(true);
    try {
      const count = Math.max(1, Math.min(24, Number(entryInstallments || 1)));
      if (count > 1 || entryStatus === "pending" || entryCounterparty.trim()) {
        await createFinancialInstallments({
          tenantId,
          entryType,
          description: entryDesc.trim(),
          counterparty: entryCounterparty.trim(),
          category: entryCategory,
          amount,
          accountCode: sel.code,
          accountId: sel.id,
          firstDueDate: entryDueDate,
          installments: count,
          markFirstPaid: entryStatus === "paid",
        });
        toast.success(
          count > 1 ? `${count} parcelas registradas com sucesso!` : "Conta registrada com sucesso!"
        );
      } else {
        await createFinancialEntry({
          tenantId,
          entryType,
          description: entryDesc.trim(),
          category: entryCategory,
          amount,
          accountCode: sel.code,
          accountId: sel.id,
          status: entryStatus,
          dueDate: entryDueDate,
          sourceType: "manual",
        });
        toast.success("Lançamento registrado!");
      }
      setEntryModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err?.message || "Erro ao salvar lançamento.");
    } finally {
      setEntrySaving(false);
    }
  };

  const handleOpenTransferModal = () => {
    setTransferFrom("safe");
    setTransferTo(defaultBankKey);
    setTransferAmountStr("R$ 0,00");
    setTransferNotes("");
    setTransferModalOpen(true);
  };

  const handleSaveTransfer = async (e) => {
    e.preventDefault();
    const amount = parseBRLToNumber(transferAmountStr);
    if (transferFrom === transferTo) {
      toast.error("Escolha contas diferentes para origem e destino.");
      return;
    }
    if (amount <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }

    const fromSel = resolveAccountSelection(transferFrom);
    const toSel = resolveAccountSelection(transferTo);

    setTransferSaving(true);
    try {
      await createFinancialEntry({
        tenantId,
        entryType: "transfer",
        description: `Transferência: ${fromSel.shortLabel} → ${toSel.shortLabel}`,
        category: "Transferência entre Contas",
        amount,
        accountCode: fromSel.code,
        accountId: fromSel.id,
        targetAccountCode: toSel.code,
        targetAccountId: toSel.id,
        status: "paid",
        dueDate: getBrasiliaParts(new Date()).dateKey,
        notes: transferNotes.trim(),
        sourceType: "manual",
      });
      toast.success("Transferência registrada!");
      setTransferModalOpen(false);
      setTransferAmountStr("R$ 0,00");
      setTransferNotes("");
      await loadData();
    } catch (err) {
      toast.error(err?.message || "Erro ao transferir valor.");
    } finally {
      setTransferSaving(false);
    }
  };

  const handleOpenSettleModal = (entry) => {
    if (entry.account_code === "safe") {
      setSettleAccount("safe");
    } else if (entry.account_id) {
      setSettleAccount(`bank:${entry.account_id}`);
    } else {
      setSettleAccount(defaultBankKey);
    }
    setSettleModalItem(entry);
  };

  const handleConfirmSettle = async () => {
    if (!settleModalItem) return;
    const sel = resolveAccountSelection(settleAccount);
    setSettleSaving(true);
    try {
      await markFinancialEntryPaid({
        tenantId,
        entryId: settleModalItem.id,
        accountCode: sel.code,
        accountId: sel.id,
      });
      toast.success(
        settleModalItem.entry_type === "income"
          ? "Recebimento confirmado e saldo atualizado!"
          : "Pagamento confirmado e saldo atualizado!"
      );
      setSettleModalItem(null);
      await loadData();
    } catch (err) {
      toast.error(err?.message || "Erro ao dar baixa.");
    } finally {
      setSettleSaving(false);
    }
  };

  const handleMarkPaid = (entry) => {
    handleOpenSettleModal(entry);
  };

  const handleDeleteEntry = async (entry) => {
    try {
      await deleteFinancialEntry({ tenantId, entryId: entry.id });
      toast.success("Lançamento excluído e saldo estornado.");
      await loadData();
    } catch (err) {
      toast.error(err?.message || "Erro ao excluir lançamento.");
    }
  };

  const resetBankForm = () => {
    setEditingBankId(null);
    setBankFormName("");
    setBankFormKind("checking");
    setBankFormInitialStr("R$ 0,00");
    setBankFormDefault(false);
  };

  const handleOpenBanksModal = () => {
    resetBankForm();
    setBanksModalOpen(true);
  };

  const handleStartEditBank = (bank) => {
    setEditingBankId(bank.id);
    setBankFormName(bank.name || "");
    setBankFormKind(bank.account_kind || "checking");
    setBankFormDefault(Boolean(bank.is_default));
  };

  const handleSaveBankForm = async (e) => {
    e.preventDefault();
    const trimmed = bankFormName.trim();
    if (!trimmed) {
      toast.error("Informe o nome do banco ou conta.");
      return;
    }
    setBankFormSaving(true);
    try {
      if (editingBankId) {
        await updateBankAccount({
          tenantId,
          accountId: editingBankId,
          name: trimmed,
          accountKind: bankFormKind,
          isDefault: bankFormDefault,
        });
        toast.success("Banco atualizado!");
      } else {
        await createBankAccount({
          tenantId,
          name: trimmed,
          accountKind: bankFormKind,
          initialBalance: parseBRLToNumber(bankFormInitialStr),
          isDefault: bankFormDefault,
        });
        toast.success("Novo banco cadastrado!");
      }
      resetBankForm();
      await loadData();
    } catch (err) {
      toast.error(err?.message || "Erro ao salvar banco.");
    } finally {
      setBankFormSaving(false);
    }
  };

  const handleSetDefaultBank = async (bank) => {
    try {
      await updateBankAccount({
        tenantId,
        accountId: bank.id,
        name: bank.name,
        isDefault: true,
      });
      toast.success(`${bank.name} definido como banco padrão.`);
      await loadData();
    } catch (err) {
      toast.error(err?.message || "Erro ao definir banco padrão.");
    }
  };

  const handleArchiveBank = async (bank) => {
    try {
      await archiveBankAccount({ tenantId, accountId: bank.id });
      toast.success(`${bank.name} arquivado.`);
      if (editingBankId === bank.id) resetBankForm();
      await loadData();
    } catch (err) {
      toast.error(err?.message || "Erro ao arquivar banco.");
    }
  };

  const { accounts, summary } = overview;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Cabeçalho Executivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">
            Financeiro &amp; Cofre
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Saldos reais da loja, despesas pagas e contas a pagar em um único livro-caixa
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleOpenTransferModal}
            className="h-9 px-3 text-xs font-semibold bg-white border-stone-300 text-stone-800 hover:bg-stone-50 gap-1.5 cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-stone-600" />
            Transferir
          </Button>
          <Button
            type="button"
            onClick={() =>
              handleOpenNewEntry("expense", activeTab === "payables" ? "pending" : "paid")
            }
            className="h-9 px-3.5 text-xs font-semibold bg-stone-900 hover:bg-black text-white gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {activeTab === "payables" ? "Nova Conta (Pagar/Receber)" : "Nova Despesa / Lançamento"}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <TabsList className="bg-stone-100 p-1 rounded-xl border border-stone-200 w-full sm:w-auto flex">
          <TabsTrigger
            value="overview"
            className="flex-1 sm:flex-none rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-xs px-4 gap-2 cursor-pointer"
          >
            <Receipt className="w-3.5 h-3.5 text-stone-600" />
            <span>1. Caixa &amp; Extrato</span>
          </TabsTrigger>
          <TabsTrigger
            value="payables"
            className="flex-1 sm:flex-none rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-xs px-4 gap-2 cursor-pointer"
          >
            <CalendarClock className="w-3.5 h-3.5 text-stone-600" />
            <span>2. Contas a Pagar e Receber</span>
            {(prData.kpis.overdue_payable_count > 0 || prData.kpis.due_today_payable_count > 0) && (
              <Badge className="bg-rose-600 text-white border-0 text-[10px] px-1.5 py-0">
                {prData.kpis.overdue_payable_count + prData.kpis.due_today_payable_count}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5">

      {/* 1. Saldos das 3 Contas Reais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-stone-500" />
              Gaveta (PDV)
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] font-semibold ${
                accounts.drawer?.is_open
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-stone-100 text-stone-600 border-stone-200"
              }`}
            >
              {accounts.drawer?.is_open ? "Caixa Aberto" : "Caixa Fechado"}
            </Badge>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-2">
            {formatMoney(accounts.drawer?.balance)}
          </p>
          <span className="text-[11px] text-stone-400 mt-0.5 block">
            Dinheiro vivo no balcão agora
          </span>
        </Card>

        <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 flex items-center gap-1.5">
              <Vault className="w-3.5 h-3.5 text-emerald-700" />
              Cofre (Guardado)
            </span>
            <span className="text-[10px] font-semibold text-stone-400">Espécie</span>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-800 mt-2">
            {formatMoney(accounts.safe?.balance)}
          </p>
          <span className="text-[11px] text-stone-400 mt-0.5 block">
            Sangrias e recolhimentos de fechamento
          </span>
        </Card>

        <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 flex items-center gap-1.5 min-w-0">
              <Landmark className="w-3.5 h-3.5 text-blue-700 shrink-0" />
              <span className="truncate">
                {banksList.length > 1
                  ? `Bancos (${banksList.length})`
                  : banksList[0]?.name || "Banco / Conta Digital"}
              </span>
            </span>
            <button
              type="button"
              onClick={handleOpenBanksModal}
              title="Cadastrar ou gerenciar bancos"
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 hover:text-blue-900 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors cursor-pointer shrink-0"
            >
              <Pencil className="w-3 h-3" />
              <span>Gerenciar</span>
            </button>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-2">
            {formatMoney(accounts.bank?.balance)}
          </p>
          {banksList.length > 1 ? (
            <div className="mt-2 pt-2 border-t border-stone-100 space-y-1">
              {banksList.map((b) => (
                <div
                  key={b.id || b.name}
                  className="flex items-center justify-between text-[11px] text-stone-600"
                >
                  <span className="truncate pr-2 flex items-center gap-1">
                    <span className="truncate font-medium">{b.name}</span>
                    {b.is_default && (
                      <span className="text-[9px] font-semibold text-blue-700 bg-blue-50 px-1 rounded">
                        Padrão
                      </span>
                    )}
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-stone-800 shrink-0">
                    {formatMoney(b.balance)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-[11px] text-stone-400 mt-0.5 block">
              Pix, cartão e depósitos bancários
            </span>
          )}
        </Card>
      </div>

      {/* 2. Filtro de Período + Resultado Líquido em 3 Números */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-stone-500 mr-1">Período:</span>
          {[
            { id: "month", label: "Este Mês" },
            { id: "7d", label: "7 dias" },
            { id: "today", label: "Hoje" },
            { id: "last_month", label: "Mês Passado" },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriodPreset(opt.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                periodPreset === opt.id
                  ? "bg-stone-900 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            onClick={loadData}
            title="Atualizar"
            className="p-1.5 rounded-md text-stone-500 hover:bg-stone-100 cursor-pointer ml-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 sm:gap-8 border-t lg:border-t-0 pt-3 lg:pt-0 border-stone-100">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-400 block">
              Entrou (Pago)
            </span>
            <span className="text-sm sm:text-base font-bold font-mono tabular-nums text-emerald-700">
              +{formatMoney(summary.income_total)}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-400 block">
              Saiu (Pago)
            </span>
            <span className="text-sm sm:text-base font-bold font-mono tabular-nums text-rose-700">
              -{formatMoney(summary.expense_total)}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-400 block">
              Sobrou
            </span>
            <span
              className={`text-sm sm:text-base font-bold font-mono tabular-nums ${
                Number(summary.net_total || 0) >= 0 ? "text-stone-900" : "text-rose-700"
              }`}
            >
              {formatMoney(summary.net_total)}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Extrato Único (Lançamentos) */}
      <Card className="rounded-xl bg-white border border-stone-200 shadow-xs overflow-hidden">
        <CardHeader className="bg-stone-50/70 border-b border-stone-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-bold text-stone-900">
              Extrato de Lançamentos
            </CardTitle>
            <p className="text-xs text-stone-500 mt-0.5">
              Despesas manuais, contas a pagar, transferências e movimentações automáticas do caixa
            </p>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {[
              { id: "all", label: "Todos" },
              { id: "pending", label: `A Pagar (${formatMoney(summary.pending_expense_total)})` },
              { id: "expense", label: "Despesas" },
              { id: "income", label: "Entradas" },
              { id: "transfer", label: "Transferências" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  typeFilter === tab.id
                    ? "bg-stone-900 text-white"
                    : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredEntries.length === 0 ? (
            <div className="py-14 px-4 text-center text-stone-400 text-xs">
              Nenhum lançamento encontrado neste período.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/50 text-stone-500 font-semibold uppercase text-[10px]">
                    <th className="py-2.5 px-4">Data</th>
                    <th className="py-2.5 px-4">Descrição</th>
                    <th className="py-2.5 px-4">Categoria</th>
                    <th className="py-2.5 px-4">Conta</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Valor</th>
                    <th className="py-2.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredEntries.map((entry) => {
                    const isExpense = entry.entry_type === "expense";
                    const isTransfer = entry.entry_type === "transfer";
                    const isPending = entry.status === "pending";
                    const isAuto = entry.source_type && entry.source_type !== "manual";
                    const dateFormatted = entry.due_date
                      ? entry.due_date.split("-").reverse().join("/")
                      : "—";

                    return (
                      <tr key={entry.id} className="hover:bg-stone-50/60 transition-colors">
                        <td className="py-2.5 px-4 font-mono text-stone-600 whitespace-nowrap">
                          {dateFormatted}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-stone-900">
                              {entry.description}
                            </span>
                            {isAuto && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-stone-100 text-stone-600 border-stone-200">
                                PDV/Caixa
                              </Badge>
                            )}
                          </div>
                          {entry.notes && (
                            <span className="text-[11px] text-stone-400 block">
                              {entry.notes}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-stone-600">{entry.category}</td>
                        <td className="py-2.5 px-4 text-stone-700 font-medium whitespace-nowrap">
                          {isTransfer
                            ? `${
                                entry.account_name ||
                                ACCOUNT_LABELS[entry.account_code] ||
                                entry.account_code
                              } → ${
                                entry.target_account_name ||
                                ACCOUNT_LABELS[entry.target_account_code] ||
                                entry.target_account_code
                              }`
                            : entry.account_name ||
                              ACCOUNT_LABELS[entry.account_code] ||
                              entry.account_code}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          {isPending ? (
                            <Badge className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] gap-1 whitespace-nowrap shrink-0">
                              <Clock className="w-3 h-3 shrink-0" />
                              {isExpense ? "A Pagar" : "A Receber"}
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] gap-1 whitespace-nowrap shrink-0">
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              {isExpense ? "Pago" : isTransfer ? "Concluído" : "Recebido"}
                            </Badge>
                          )}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                            isTransfer
                              ? "text-stone-700"
                              : isExpense
                              ? "text-rose-700"
                              : "text-emerald-700"
                          }`}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {isTransfer ? (
                              <ArrowLeftRight className="w-3 h-3 text-stone-400" />
                            ) : isExpense ? (
                              <ArrowDownRight className="w-3 h-3" />
                            ) : (
                              <ArrowUpRight className="w-3 h-3" />
                            )}
                            {isExpense ? "-" : isTransfer ? "" : "+"}
                            {formatMoney(entry.amount)}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {isPending && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleMarkPaid(entry)}
                                className="h-7 px-2 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 cursor-pointer"
                              >
                                Dar Baixa
                              </Button>
                            )}
                            {!isAuto && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteEntry(entry)}
                                className="h-7 px-2 text-stone-400 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                                title="Excluir lançamento"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
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

        <TabsContent value="payables" className="space-y-5">
          {/* 4 KPIs de Vencimentos */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Vencidas
              </span>
              <p className="text-xl font-bold font-mono tabular-nums text-rose-700 mt-1.5">
                {formatMoney(prData.kpis.overdue_payable_total)}
              </p>
              <span className="text-[11px] text-stone-500 mt-0.5 block">
                {prData.kpis.overdue_payable_count}{" "}
                {prData.kpis.overdue_payable_count === 1 ? "conta atrasada" : "contas atrasadas"}
              </span>
            </Card>

            <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 block">
                Vence Hoje
              </span>
              <p className="text-xl font-bold font-mono tabular-nums text-amber-800 mt-1.5">
                {formatMoney(prData.kpis.due_today_payable_total)}
              </p>
              <span className="text-[11px] text-stone-500 mt-0.5 block">
                {prData.kpis.due_today_payable_count}{" "}
                {prData.kpis.due_today_payable_count === 1 ? "conta vence hoje" : "contas vencem hoje"}
              </span>
            </Card>

            <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-600 block">
                A Pagar (Próx. 30d)
              </span>
              <p className="text-xl font-bold font-mono tabular-nums text-stone-900 mt-1.5">
                {formatMoney(prData.kpis.upcoming_30d_payable_total)}
              </p>
              <span className="text-[11px] text-stone-500 mt-0.5 block">
                {prData.kpis.upcoming_30d_payable_count}{" "}
                {prData.kpis.upcoming_30d_payable_count === 1 ? "conta prevista" : "contas previstas"}
              </span>
            </Card>

            <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 block">
                A Receber
              </span>
              <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1.5">
                {formatMoney(prData.kpis.pending_receivable_total)}
              </p>
              <span className="text-[11px] text-stone-500 mt-0.5 block">
                {prData.kpis.pending_receivable_count}{" "}
                {prData.kpis.pending_receivable_count === 1 ? "recebimento previsto" : "recebimentos previstos"}
              </span>
            </Card>
          </div>

          <Card className="rounded-xl bg-white border border-stone-200 shadow-xs overflow-hidden">
            <CardHeader className="bg-stone-50/70 border-b border-stone-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-bold text-stone-900">
                  Agenda de Contas a Pagar e Receber
                </CardTitle>
                <p className="text-xs text-stone-500 mt-0.5">
                  Controle vencimentos futuros, parcelas e dê baixa escolhendo Cofre ou Banco
                </p>
              </div>

              <div className="flex items-center gap-1 flex-wrap">
                {[
                  { id: "payable", label: "A Pagar" },
                  {
                    id: "receivable",
                    label:
                      prData.kpis.pending_receivable_count > 0
                        ? `A Receber (${prData.kpis.pending_receivable_count})`
                        : "A Receber",
                  },
                  {
                    id: "overdue",
                    label:
                      prData.kpis.overdue_payable_count > 0
                        ? `Vencidas (${prData.kpis.overdue_payable_count})`
                        : "Vencidas",
                  },
                  { id: "pending", label: "Todas Pendentes" },
                  { id: "paid", label: "Baixadas" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPrFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      prFilter === tab.id
                        ? "bg-stone-900 text-white"
                        : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {filteredPrItems.length === 0 ? (
                <div className="py-14 px-4 text-center text-stone-400 text-xs space-y-2">
                  <p>Nenhuma conta encontrada neste filtro.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleOpenNewEntry(prFilter === "receivable" ? "income" : "expense", "pending")
                    }
                    className="text-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    {prFilter === "receivable" ? "Lançar Conta a Receber" : "Lançar Conta a Pagar"}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50/50 text-stone-500 font-semibold uppercase text-[10px]">
                        <th className="py-2.5 px-4">Vencimento</th>
                        <th className="py-2.5 px-4">Descrição &amp; Fornecedor/Cliente</th>
                        <th className="py-2.5 px-4">Categoria</th>
                        <th className="py-2.5 px-4">Conta Prevista</th>
                        <th className="py-2.5 px-4 text-right">Valor</th>
                        <th className="py-2.5 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {filteredPrItems.map((item) => {
                        const isPending = item.status === "pending";
                        const isOverdue = isPending && item.due_date && item.due_date < todayKey;
                        const isDueToday = isPending && item.due_date === todayKey;
                        const isIncome = item.entry_type === "income";
                        const dateFormatted = item.due_date
                          ? item.due_date.split("-").reverse().join("/")
                          : "—";

                        return (
                          <tr key={item.id} className="hover:bg-stone-50/60 transition-colors">
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-semibold text-stone-800">
                                  {dateFormatted}
                                </span>
                                {isOverdue && (
                                  <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[9px] px-1.5 py-0">
                                    VENCIDA
                                  </Badge>
                                )}
                                {isDueToday && (
                                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[9px] px-1.5 py-0">
                                    HOJE
                                  </Badge>
                                )}
                                {!isPending && (
                                  <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[9px] px-1.5 py-0">
                                    {isIncome ? "RECEBIDA" : "PAGA"}
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-4">
                              <span className="font-semibold text-stone-900 block">
                                {item.description}
                              </span>
                              {item.counterparty && (
                                <span className="text-[11px] text-stone-500 block">
                                  {isIncome ? "Cliente: " : "Fornecedor: "}
                                  {item.counterparty}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-stone-600">{item.category}</td>
                            <td className="py-2.5 px-4 text-stone-700 whitespace-nowrap">
                              {item.account_name ||
                                ACCOUNT_LABELS[item.account_code] ||
                                item.account_code}
                            </td>
                            <td
                              className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                                isIncome ? "text-emerald-700" : "text-rose-700"
                              }`}
                            >
                              {isIncome ? "+" : "-"}
                              {formatMoney(item.amount)}
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                {isPending && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOpenSettleModal(item)}
                                    className={`h-7 px-2.5 text-[11px] font-semibold cursor-pointer ${
                                      isIncome
                                        ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200"
                                        : "bg-stone-900 hover:bg-black text-white border-stone-900"
                                    }`}
                                  >
                                    {isIncome ? "Receber" : "Pagar"}
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteEntry(item)}
                                  className="h-7 px-2 text-stone-400 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                                  title="Excluir conta"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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

      {/* Modal: Novo Lançamento */}
      <Dialog open={entryModalOpen} onOpenChange={setEntryModalOpen}>
        <DialogContent className="max-w-md p-5 rounded-xl bg-white border border-stone-200">
          <DialogHeader className="pb-2 border-b border-stone-100">
            <DialogTitle className="text-base font-bold text-stone-900">
              Novo Lançamento Financeiro
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveEntry} className="space-y-3.5 py-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEntryType("expense")}
                className={`py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                  entryType === "expense"
                    ? "bg-rose-50 border-rose-300 text-rose-800"
                    : "bg-stone-50 border-stone-200 text-stone-600"
                }`}
              >
                Saída / A Pagar
              </button>
              <button
                type="button"
                onClick={() => setEntryType("income")}
                className={`py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                  entryType === "income"
                    ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                    : "bg-stone-50 border-stone-200 text-stone-600"
                }`}
              >
                Entrada / A Receber
              </button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-stone-700">Descrição</Label>
              <Input
                value={entryDesc}
                onChange={(e) => setEntryDesc(e.target.value)}
                placeholder="Ex: Compra de gás / Aluguel / Encomenda evento"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-stone-700">
                {entryType === "income" ? "Cliente / Origem (opcional)" : "Fornecedor (opcional)"}
              </Label>
              <Input
                value={entryCounterparty}
                onChange={(e) => setEntryCounterparty(e.target.value)}
                placeholder={entryType === "income" ? "Ex: Empresa XPTO" : "Ex: Distribuidora / Cemig"}
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-stone-700">Valor (por parcela)</Label>
                <CurrencyInput
                  value={entryAmountStr}
                  onChange={(e) => setEntryAmountStr(e.target.value)}
                  className="h-9 text-sm font-mono font-bold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-stone-700">1º Vencimento</Label>
                <Input
                  type="date"
                  value={entryDueDate}
                  onChange={(e) => setEntryDueDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="space-y-1 col-span-1">
                <Label className="text-xs font-semibold text-stone-700">Parcelas</Label>
                <select
                  value={entryInstallments}
                  onChange={(e) => setEntryInstallments(Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-stone-200 bg-white px-2 text-xs text-stone-800"
                >
                  <option value={1}>1x (Única)</option>
                  <option value={2}>2x mensais</option>
                  <option value={3}>3x mensais</option>
                  <option value={4}>4x mensais</option>
                  <option value={6}>6x mensais</option>
                  <option value={12}>12x (Anual)</option>
                </select>
              </div>
              <div className="space-y-1 col-span-1">
                <Label className="text-xs font-semibold text-stone-700">Categoria</Label>
                <select
                  value={entryCategory}
                  onChange={(e) => setEntryCategory(e.target.value)}
                  className="w-full h-9 rounded-md border border-stone-200 bg-white px-2 text-xs text-stone-800"
                >
                  {FINANCIAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 col-span-1">
                <Label className="text-xs font-semibold text-stone-700">Conta</Label>
                <select
                  value={entryAccount}
                  onChange={(e) => setEntryAccount(e.target.value)}
                  className="w-full h-9 rounded-md border border-stone-200 bg-white px-2 text-xs text-stone-800"
                >
                  {accountOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEntryStatus("paid")}
                className={`py-1.5 rounded-md text-xs font-semibold border cursor-pointer ${
                  entryStatus === "paid"
                    ? "bg-stone-900 border-stone-900 text-white"
                    : "bg-white border-stone-200 text-stone-600"
                }`}
              >
                {entryInstallments > 1
                  ? entryType === "income"
                    ? "1ª já recebida"
                    : "1ª já paga"
                  : entryType === "income"
                  ? "Já recebido"
                  : "Já foi pago"}
              </button>
              <button
                type="button"
                onClick={() => setEntryStatus("pending")}
                className={`py-1.5 rounded-md text-xs font-semibold border cursor-pointer ${
                  entryStatus === "pending"
                    ? "bg-amber-100 border-amber-300 text-amber-900"
                    : "bg-white border-stone-200 text-stone-600"
                }`}
              >
                {entryType === "income" ? "A Receber" : "Conta a Pagar"}
              </button>
            </div>

            <DialogFooter className="pt-3 border-t border-stone-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEntryModalOpen(false)}
                className="text-xs h-9 cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={entrySaving}
                className="bg-stone-900 hover:bg-black text-white text-xs font-semibold h-9 cursor-pointer"
              >
                {entrySaving ? "Salvando..." : "Salvar Lançamento"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Transferência entre Contas */}
      <Dialog open={transferModalOpen} onOpenChange={setTransferModalOpen}>
        <DialogContent className="max-w-md p-5 rounded-xl bg-white border border-stone-200">
          <DialogHeader className="pb-2 border-b border-stone-100">
            <DialogTitle className="text-base font-bold text-stone-900">
              Transferir entre Contas
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveTransfer} className="space-y-3.5 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-stone-700">De (Origem)</Label>
                <select
                  value={transferFrom}
                  onChange={(e) => setTransferFrom(e.target.value)}
                  className="w-full h-9 rounded-md border border-stone-200 bg-white px-2.5 text-xs text-stone-800"
                >
                  {accountOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-stone-700">Para (Destino)</Label>
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="w-full h-9 rounded-md border border-stone-200 bg-white px-2.5 text-xs text-stone-800"
                >
                  {accountOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-stone-700">Valor da Transferência</Label>
              <CurrencyInput
                value={transferAmountStr}
                onChange={(e) => setTransferAmountStr(e.target.value)}
                className="h-10 text-base font-mono font-bold"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-stone-700">Observação (opcional)</Label>
              <Input
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                placeholder="Ex: Depósito no banco do movimento de ontem"
                className="h-9 text-xs"
              />
            </div>

            <DialogFooter className="pt-3 border-t border-stone-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTransferModalOpen(false)}
                className="text-xs h-9 cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={transferSaving}
                className="bg-stone-900 hover:bg-black text-white text-xs font-semibold h-9 cursor-pointer"
              >
                {transferSaving ? "Transferindo..." : "Confirmar Transferência"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmar Baixa (Escolhendo Cofre ou Banco) */}
      <Dialog open={Boolean(settleModalItem)} onOpenChange={(open) => !open && setSettleModalItem(null)}>
        <DialogContent className="max-w-sm p-5 rounded-xl bg-white border border-stone-200">
          <DialogHeader className="pb-2 border-b border-stone-100">
            <DialogTitle className="text-base font-bold text-stone-900">
              {settleModalItem?.entry_type === "income" ? "Confirmar Recebimento" : "Confirmar Pagamento"}
            </DialogTitle>
          </DialogHeader>

          {settleModalItem && (
            <div className="space-y-3.5 py-2">
              <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-stone-900">{settleModalItem.description}</p>
                <p className="text-lg font-bold font-mono tabular-nums text-stone-900">
                  {formatMoney(settleModalItem.amount)}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-stone-700">
                  {settleModalItem.entry_type === "income"
                    ? "Onde o dinheiro entrou?"
                    : "De onde saiu o dinheiro?"}
                </Label>
                <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto">
                  {accountOptions.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSettleAccount(opt.key)}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border text-left cursor-pointer transition-colors ${
                        settleAccount === opt.key
                          ? "bg-stone-900 border-stone-900 text-white"
                          : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <DialogFooter className="pt-2 border-t border-stone-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSettleModalItem(null)}
                  className="text-xs h-9 cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={settleSaving}
                  onClick={handleConfirmSettle}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold h-9 cursor-pointer"
                >
                  {settleSaving ? "Confirmando..." : "Confirmar Baixa"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Gerenciar Bancos e Contas Digitais */}
      <Dialog open={banksModalOpen} onOpenChange={setBanksModalOpen}>
        <DialogContent className="sm:max-w-lg p-5 rounded-xl bg-white border border-stone-200">
          <DialogHeader className="pb-2 border-b border-stone-100">
            <DialogTitle className="text-base font-bold text-stone-900 flex items-center gap-2">
              <Landmark className="w-4 h-4 text-blue-700" />
              Bancos e Contas Digitais da Loja
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Lista de bancos cadastrados */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {banksList.map((b) => {
                const kindLabel =
                  BANK_ACCOUNT_KINDS.find((k) => k.id === b.account_kind)?.label ||
                  "Conta Bancária (Banco / Digital)";
                return (
                  <div
                    key={b.id || b.name}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-stone-200 bg-stone-50/70"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-stone-900 truncate">{b.name}</span>
                        {b.is_default && (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[9px] px-1.5 py-0">
                            Padrão
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5">
                        <span>{kindLabel}</span>
                        <span>•</span>
                        <span className="font-mono font-semibold text-stone-800">
                          {formatMoney(b.balance)}
                        </span>
                      </div>
                    </div>

                    {b.id && (
                      <div className="flex items-center gap-1 shrink-0">
                        {!b.is_default && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSetDefaultBank(b)}
                            title="Definir como banco padrão"
                            className="h-7 px-2 text-stone-500 hover:text-blue-700 hover:bg-blue-50 cursor-pointer"
                          >
                            <Star className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartEditBank(b)}
                          title="Editar banco"
                          className="h-7 px-2 text-stone-500 hover:text-stone-900 hover:bg-stone-200/70 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {banksList.length > 1 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleArchiveBank(b)}
                            title="Arquivar banco (mantém histórico)"
                            className="h-7 px-2 text-stone-400 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Formulário: Adicionar ou Editar Banco */}
            <form
              onSubmit={handleSaveBankForm}
              className="border-t border-stone-200 pt-3 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800">
                  {editingBankId ? "Editar Banco Selecionado" : "+ Adicionar Novo Banco"}
                </span>
                {editingBankId && (
                  <button
                    type="button"
                    onClick={resetBankForm}
                    className="text-[11px] font-semibold text-stone-500 hover:text-stone-800 cursor-pointer"
                  >
                    Cancelar edição
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-stone-700">Nome do Banco</Label>
                  <Input
                    value={bankFormName}
                    onChange={(e) => setBankFormName(e.target.value)}
                    maxLength={60}
                    placeholder="Ex: Nubank PJ, Itaú, Stone..."
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-stone-700">Tipo</Label>
                  <select
                    value={bankFormKind}
                    onChange={(e) => setBankFormKind(e.target.value)}
                    className="w-full h-9 rounded-md border border-stone-200 bg-white px-2.5 text-xs text-stone-800"
                  >
                    {BANK_ACCOUNT_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                {!editingBankId ? (
                  <div className="space-y-1 sm:w-44">
                    <Label className="text-[11px] font-semibold text-stone-700">
                      Saldo Inicial (opcional)
                    </Label>
                    <CurrencyInput
                      value={bankFormInitialStr}
                      onChange={(e) => setBankFormInitialStr(e.target.value)}
                      className="h-9 text-xs font-mono font-bold"
                    />
                  </div>
                ) : (
                  <div />
                )}

                <label className="inline-flex items-center gap-2 text-xs text-stone-700 cursor-pointer select-none pb-1.5">
                  <input
                    type="checkbox"
                    checked={bankFormDefault}
                    onChange={(e) => setBankFormDefault(e.target.checked)}
                    className="rounded border-stone-300"
                  />
                  <span>Definir como banco padrão</span>
                </label>

                <Button
                  type="submit"
                  disabled={bankFormSaving}
                  className="bg-stone-900 hover:bg-black text-white text-xs font-semibold h-9 px-4 cursor-pointer"
                >
                  {bankFormSaving
                    ? "Salvando..."
                    : editingBankId
                    ? "Salvar Alterações"
                    : "Adicionar Banco"}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


import React, { useState, useEffect, useMemo } from "react";
import {
  Lock,
  Unlock,
  AlertTriangle,
  Link2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatInBrasilia } from "@/utils/dateTime";
import { toast } from "sonner";

function formatBRL(val) {
  return `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;
}

function formatPaymentLabel(method) {
  const m = String(method || "").toLowerCase();
  if (m.includes("dinheiro") || m === "cash") return "Dinheiro";
  if (m.includes("pix")) return "Pix";
  if (m.includes("credito") || m.includes("crédito") || m === "credit") return "Crédito";
  if (m.includes("debito") || m.includes("débito") || m === "debit") return "Débito";
  if (m.includes("vale") || m.includes("refeicao") || m.includes("alimentacao")) return "Vale";
  if (m === "comanda_mesa") return "Comanda";
  return method || "Outro";
}

function formatChannelLabel(orderType) {
  const t = String(orderType || "").toLowerCase();
  if (t === "delivery") return "Delivery";
  if (t === "dine_in" || t === "mesa") return "Mesa";
  return "Balcão";
}

function OrphanOrdersDropdownList({
  orders,
  selectable = false,
  selectedIds,
  onToggleId,
  onToggleAll,
}) {
  const allSelected =
    orders.length > 0 && orders.every((o) => selectedIds.has(String(o.id)));

  return (
    <div className="mt-2 pt-2 border-t border-amber-200/80 space-y-1.5">
      {selectable && orders.length > 1 && (
        <div className="flex items-center justify-between px-1 pb-0.5">
          <label className="flex items-center gap-2 text-[11px] font-semibold text-amber-900 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onToggleAll(e.target.checked)}
              className="rounded border-amber-400 text-amber-700 focus:ring-amber-600 h-3.5 w-3.5 cursor-pointer"
            />
            <span>Selecionar todos ({orders.length})</span>
          </label>
          <span className="text-[11px] text-amber-800 font-medium">
            {selectedIds.size} selecionado(s)
          </span>
        </div>
      )}

      <div className="bg-white/90 border border-amber-200/80 rounded-lg divide-y divide-amber-100 max-h-52 overflow-y-auto">
        {orders.map((ord) => {
          const idStr = String(ord.id);
          const isChecked = selectedIds.has(idStr);
          const orderNum = ord.order_number || idStr.slice(-4).toUpperCase();
          const amt = Number(ord.total_amount ?? ord.total ?? 0);
          const timeStr = ord.created_date
            ? formatInBrasilia(ord.created_date, { includeSeconds: false })
            : "";

          return (
            <label
              key={idStr}
              className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs ${
                selectable ? "cursor-pointer hover:bg-amber-50/60" : ""
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {selectable && (
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleId(idStr)}
                    className="rounded border-amber-400 text-amber-700 focus:ring-amber-600 h-3.5 w-3.5 shrink-0 cursor-pointer"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-bold text-stone-900">
                      #{orderNum}
                    </span>
                    <span className="font-semibold text-stone-800 truncate max-w-[160px] sm:max-w-[240px]">
                      {ord.customer_name || "Cliente"}
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                      {formatChannelLabel(ord.order_type)}
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100/80 text-amber-900">
                      {formatPaymentLabel(ord.payment_method)}
                    </span>
                  </div>
                  {timeStr && (
                    <p className="text-[10px] text-stone-500 mt-0.5">{timeStr}</p>
                  )}
                </div>
              </div>

              <span className="font-mono font-bold text-stone-900 shrink-0">
                {formatBRL(amt)}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Barra compacta de status do caixa para páginas operacionais (PDV, Mesas, Pedidos).
 * Exibe se a gaveta está aberta/fechada e permite inspecionar/vincular pedidos órfãos.
 */
export default function CashSessionBanner({
  isLoading = false,
  isCashDrawerOpen = false,
  cashDrawerInfo = null,
  orphanOrders = [],
  onOpenCashClick,
  onAttachOrphans,
  compactWhenOpenWithoutOrphans = true,
  className = "",
}) {
  const [isAttaching, setIsAttaching] = useState(false);
  const [showOrdersList, setShowOrdersList] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const safeOrphans = useMemo(
    () => (Array.isArray(orphanOrders) ? orphanOrders : []),
    [orphanOrders]
  );

  useEffect(() => {
    setSelectedIds(new Set(safeOrphans.map((o) => String(o.id))));
    if (safeOrphans.length === 0) {
      setShowOrdersList(false);
    }
  }, [safeOrphans]);

  if (isLoading) return null;

  const orphanCount = safeOrphans.length;
  const orphanTotal = safeOrphans.reduce(
    (sum, o) => sum + Number(o.total_amount ?? o.total ?? 0),
    0
  );

  const selectedOrphans = safeOrphans.filter((o) => selectedIds.has(String(o.id)));
  const selectedTotal = selectedOrphans.reduce(
    (sum, o) => sum + Number(o.total_amount ?? o.total ?? 0),
    0
  );

  const handleToggleId = (idStr) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(idStr)) next.delete(idStr);
      else next.add(idStr);
      return next;
    });
  };

  const handleToggleAll = (checked) => {
    if (checked) {
      setSelectedIds(new Set(safeOrphans.map((o) => String(o.id))));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleAttachClick = async () => {
    if (typeof onAttachOrphans !== "function") return;
    const idsToLink = selectedOrphans.map((o) => o.id);
    if (idsToLink.length === 0) {
      toast.info("Selecione ao menos 1 pedido para vincular ao turno.");
      return;
    }

    setIsAttaching(true);
    try {
      const res = await onAttachOrphans(idsToLink);
      const linked = Number(res?.attachedCount ?? idsToLink.length);
      toast.success(
        `${linked} pedido(s) vinculado(s) ao turno atual (${formatBRL(res?.attachedTotal ?? selectedTotal)})!`
      );
      setShowOrdersList(false);
    } catch (err) {
      toast.error(err?.message || "Erro ao vincular pedidos ao turno.");
    } finally {
      setIsAttaching(false);
    }
  };

  // Caixa aberto SEM pedidos órfãos: apenas uma pílula discreta
  if (isCashDrawerOpen && orphanCount === 0) {
    if (compactWhenOpenWithoutOrphans) {
      return (
        <div
          className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-xs text-emerald-900 ${className}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span className="font-semibold truncate">
              Caixa Aberto • Operador: {cashDrawerInfo?.operator || "Operador Principal"}
            </span>
          </div>
          <span className="text-[11px] font-medium text-emerald-700 hidden sm:inline shrink-0">
            Vendas vinculadas ao turno
          </span>
        </div>
      );
    }
    return null;
  }

  // Caixa aberto COM pedidos órfãos para resgatar
  if (isCashDrawerOpen && orphanCount > 0) {
    return (
      <div
        className={`px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 shadow-2xs ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-950 leading-snug">
                {orphanCount === 1
                  ? "1 pedido entrou antes da abertura do caixa"
                  : `${orphanCount} pedidos entraram antes da abertura do caixa`}{" "}
                <span className="font-mono">({formatBRL(orphanTotal)})</span>
              </p>
              <p className="text-[11px] text-amber-800 leading-tight mt-0.5">
                Vincule ao turno aberto ({cashDrawerInfo?.operator}) para entrar na contagem da gaveta e no Raio-X.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowOrdersList((prev) => !prev)}
              className="h-8 bg-white hover:bg-amber-100/60 border-amber-300 text-amber-900 font-semibold text-xs rounded-lg gap-1 cursor-pointer"
            >
              <span>{showOrdersList ? "Ocultar pedidos" : "Ver pedidos"}</span>
              {showOrdersList ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleAttachClick}
              disabled={isAttaching || selectedOrphans.length === 0}
              className="h-8 bg-amber-700 hover:bg-amber-800 text-white font-semibold text-xs rounded-lg gap-1.5 cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>
                {isAttaching
                  ? "Vinculando..."
                  : selectedOrphans.length < orphanCount
                  ? `Vincular ${selectedOrphans.length} (${formatBRL(selectedTotal)})`
                  : "Vincular ao Turno"}
              </span>
            </Button>
          </div>
        </div>

        {showOrdersList && (
          <OrphanOrdersDropdownList
            orders={safeOrphans}
            selectable
            selectedIds={selectedIds}
            onToggleId={handleToggleId}
            onToggleAll={handleToggleAll}
          />
        )}
      </div>
    );
  }

  // Caixa FECHADO
  return (
    <div
      className={`px-3.5 py-2.5 rounded-xl bg-amber-50/90 border border-amber-300 text-amber-950 shadow-2xs ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-amber-950 leading-snug">
              Caixa do turno está fechado
              {orphanCount > 0 && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-950 font-mono text-[11px]">
                  {orphanCount} pedido(s) aguardando ({formatBRL(orphanTotal)})
                </span>
              )}
            </p>
            <p className="text-[11px] text-amber-800 leading-tight mt-0.5">
              O cardápio online continua recebendo pedidos normalmente. Recebimentos no balcão/mesa abrem o caixa em 1 clique.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {orphanCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowOrdersList((prev) => !prev)}
              className="h-8 bg-white hover:bg-amber-100/60 border-amber-300 text-amber-900 font-semibold text-xs rounded-lg gap-1 cursor-pointer"
            >
              <span>{showOrdersList ? "Ocultar pedidos" : "Ver pedidos"}</span>
              {showOrdersList ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </Button>
          )}

          {typeof onOpenCashClick === "function" && (
            <Button
              type="button"
              size="sm"
              onClick={onOpenCashClick}
              className="h-8 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-lg gap-1.5 cursor-pointer shadow-xs"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Abrir Caixa em 1 Clique</span>
            </Button>
          )}
        </div>
      </div>

      {showOrdersList && orphanCount > 0 && (
        <OrphanOrdersDropdownList
          orders={safeOrphans}
          selectable={false}
          selectedIds={selectedIds}
          onToggleId={handleToggleId}
          onToggleAll={handleToggleAll}
        />
      )}
    </div>
  );
}

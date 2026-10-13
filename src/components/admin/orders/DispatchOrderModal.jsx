import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Bike, 
  MapPin, 
  CheckCircle2, 
  Package, 
  Coins, 
  Car, 
  Clock, 
  User, 
  Send,
  AlertCircle
} from "lucide-react";

export default function DispatchOrderModal({
  isOpen,
  onClose,
  mainOrder,
  otherReadyOrders = [],
  drivers = [],
  onConfirmDispatch
}) {
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && mainOrder) {
      // Por padrão seleciona o primeiro entregador ativo se houver
      const firstActive = drivers.find((d) => d.active !== false);
      setSelectedDriverId(firstActive ? firstActive.id : "unassigned");
      // O pedido principal sempre está selecionado
      setSelectedOrderIds([mainOrder.id]);
    }
  }, [isOpen, mainOrder, drivers]);

  if (!mainOrder) return null;

  const activeDrivers = drivers.filter((d) => d.active !== false);
  const selectedDriver = drivers.find((d) => d.id === selectedDriverId) || null;

  const toggleOrderSelection = (orderId) => {
    if (orderId === mainOrder.id) return; // Pedido principal sempre incluído
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const tripId = `trip_${Date.now().toString().slice(-6)}`;
      await onConfirmDispatch({
        driver: selectedDriver,
        orderIds: selectedOrderIds,
        tripId
      });
      onClose();
    } catch (err) {
      console.error("[DispatchOrderModal] Erro ao despachar:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatOrderNum = (id) => String(id || "").slice(-4).toUpperCase();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-5 sm:p-6 rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="pb-3 border-b border-stone-100 flex-shrink-0">
          <DialogTitle className="text-lg font-black text-stone-900 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center">
              <Bike className="w-4 h-4" />
            </div>
            <span>Despachar para Entrega</span>
          </DialogTitle>
          <p className="text-xs text-stone-500 mt-0.5">
            Selecione o motoboy responsável e agrupe outros pedidos que sairão na mesma viagem.
          </p>
        </DialogHeader>

        <div className="overflow-y-auto py-3 space-y-4 flex-1 pr-1">
          {/* 1. Escolha do Entregador */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-stone-700 mb-2">
              1. Qual Entregador vai levar?
            </label>

            {activeDrivers.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Nenhum entregador cadastrado</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    Você pode despachar como <b>Avulso/Terceirizado</b> agora e cadastrar seus motoboys em <b>Configurações &gt; Entregadores</b> para controlar os acertos.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {activeDrivers.map((driver) => {
                  const isSelected = selectedDriverId === driver.id;

                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => setSelectedDriverId(driver.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                        isSelected
                          ? "border-orange-600 bg-orange-50/80 shadow-sm ring-1 ring-orange-500"
                          : "border-stone-200 hover:border-stone-300 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-stone-900 truncate">
                          {driver.name}
                        </span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />}
                      </div>

                      <div className="text-[10px] text-stone-500 font-semibold truncate">
                        {driver.fee_type === "none"
                          ? "Fixo / Diária"
                          : driver.fee_type === "per_trip"
                          ? `R$ ${Number(driver.fee_value || 0).toFixed(2).replace(".", ",")} / viagem`
                          : `R$ ${Number(driver.fee_value || 0).toFixed(2).replace(".", ",")} / comanda`}
                      </div>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setSelectedDriverId("unassigned")}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    selectedDriverId === "unassigned"
                      ? "border-stone-700 bg-stone-100 ring-1 ring-stone-700"
                      : "border-stone-200 hover:border-stone-300 bg-white"
                  }`}
                >
                  <span className="font-bold text-xs text-stone-800">Sem entregador</span>
                  <span className="text-[10px] text-stone-500">Avulso / Retirada</span>
                </button>
              </div>
            )}
          </div>

          {/* 2. Pedidos que vão na mesma saída / viagem */}
          <div className="pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black uppercase tracking-wider text-stone-700">
                2. Pedidos nesta Viagem ({selectedOrderIds.length})
              </label>
              {otherReadyOrders.length > 0 && (
                <span className="text-[11px] text-stone-500">
                  Marque outros pedidos que cabem na bag
                </span>
              )}
            </div>

            <div className="space-y-2">
              {/* Pedido Principal (Sempre selecionado) */}
              <div className="p-3 rounded-xl border border-orange-300 bg-orange-50/40 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-orange-600 text-white flex items-center justify-center text-xs font-black">
                    ✓
                  </div>
                  <div>
                    <span className="font-black text-xs text-stone-900">
                      Pedido #{formatOrderNum(mainOrder.id)} - {mainOrder.customer_name || "Cliente"}
                    </span>
                    <p className="text-[11px] text-stone-600 truncate max-w-[280px]">
                      📍 {mainOrder.customer_address || mainOrder.delivery_address || "Endereço não informado"}
                    </p>
                  </div>
                </div>

                <span className="font-extrabold text-xs text-stone-900 whitespace-nowrap">
                  R$ {(mainOrder.total_amount || mainOrder.total || 0).toFixed(2).replace(".", ",")}
                </span>
              </div>

              {/* Outros Pedidos Prontos para Entrega */}
              {otherReadyOrders.length > 0 ? (
                otherReadyOrders
                  .filter((o) => o.id !== mainOrder.id)
                  .map((otherOrder) => {
                    const isChecked = selectedOrderIds.includes(otherOrder.id);

                    return (
                      <div
                        key={otherOrder.id}
                        onClick={() => toggleOrderSelection(otherOrder.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isChecked
                            ? "border-orange-400 bg-orange-50/40 shadow-xs"
                            : "border-stone-200 hover:border-stone-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="rounded text-orange-600 focus:ring-orange-500 cursor-pointer h-4 w-4"
                          />
                          <div>
                            <span className="font-bold text-xs text-stone-900">
                              Pedido #{formatOrderNum(otherOrder.id)} - {otherOrder.customer_name || "Cliente"}
                            </span>
                            <p className="text-[11px] text-stone-500 truncate max-w-[280px]">
                              📍 {otherOrder.customer_address || otherOrder.delivery_address || "Endereço"}
                            </p>
                          </div>
                        </div>

                        <span className="font-bold text-xs text-stone-700 whitespace-nowrap">
                          R$ {(otherOrder.total_amount || otherOrder.total || 0).toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    );
                  })
              ) : (
                <p className="text-[11px] text-stone-400 italic py-1 px-1">
                  Não há outros pedidos prontos aguardando entrega no momento.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Rodapé com Resumo e Ação */}
        <DialogFooter className="pt-3 border-t border-stone-100 flex-shrink-0 flex items-center justify-between gap-3">
          <div className="text-left">
            <span className="text-xs text-stone-500 block leading-tight">Total na Bag:</span>
            <span className="text-sm font-black text-stone-900">
              {selectedOrderIds.length} {selectedOrderIds.length === 1 ? "pedido" : "pedidos"}{" "}
              {selectedDriver ? `com ${selectedDriver.name}` : ""}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl text-xs font-bold"
            >
              Cancelar
            </Button>

            <Button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs px-5 rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? "Despachando..." : "Confirmar Saída"}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

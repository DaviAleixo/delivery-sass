import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Trash2, Plus, Minus, ShoppingCart, CheckCircle, Printer, X, Users, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PDVClientSelectModal from "./PDVClientSelectModal";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getActiveTenantId } from "@/entities/storage";

export default function PDVCart({
  cart,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  _customerEmail,
  onCustomerEmailChange,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onFinalize,
  total,
  lastOrder,
  onDismissSuccess,
  onCloseMobile,
}) {
  const [showClientModal, setShowClientModal] = useState(false);
  const [isSearchingPhone, setIsSearchingPhone] = useState(false);
  const itemCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const formatPhone = (val) => {
    const raw = val.replace(/\D/g, "").slice(0, 11);
    if (raw.length <= 2) return raw.length > 0 ? `(${raw}` : "";
    if (raw.length <= 7) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
    return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
  };

  const handlePhoneChange = async (e) => {
    const formatted = formatPhone(e.target.value);
    onCustomerPhoneChange(formatted);

    const clean = formatted.replace(/\D/g, "");
    if (clean.length >= 10) {
      setIsSearchingPhone(true);
      try {
        if (isSupabaseConfigured() && supabase) {
          const activeTenantId = getActiveTenantId();
          const { data, error } = await supabase.rpc("lookup_customer_by_phone", {
            p_phone: formatted,
            p_tenant_id: activeTenantId || undefined
          });

          if (!error && data && data.length > 0) {
            const client = data[0];
            if (client.customer_name && (!customerName || customerName === "Balcão" || customerName === "Cliente")) {
              onCustomerNameChange(client.customer_name);
            }
            if (client.customer_email && onCustomerEmailChange) {
              onCustomerEmailChange(client.customer_email);
            }
          }
        }
      } catch (err) {
        console.warn("Erro ao buscar cliente por telefone no PDV:", err);
      } finally {
        setIsSearchingPhone(false);
      }
    }
  };

  const handleSelectClient = (client) => {
    if (client.name) onCustomerNameChange(client.name);
    if (client.phone) onCustomerPhoneChange(formatPhone(client.phone));
    if (client.email && onCustomerEmailChange) onCustomerEmailChange(client.email);
  };

  const handleClearCustomer = () => {
    onCustomerNameChange("");
    onCustomerPhoneChange("");
    if (onCustomerEmailChange) onCustomerEmailChange("");
  };

  return (
    <div className="w-full lg:w-72 xl:w-80 shrink-0 bg-white border-l border-gray-200 flex flex-col shadow-xl h-full min-h-0 min-w-0 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-900 text-white px-3.5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-[#D1E9DF]" />
          <h2 className="font-bold text-sm sm:text-base">Carrinho</h2>
          {itemCount > 0 && (
            <span className="bg-[#047857] text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center">
              {itemCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {cart.length > 0 && (
            <button
              onClick={onClearCart}
              className="text-gray-400 hover:text-white text-xs flex items-center gap-1 transition-colors px-1.5 py-1 rounded hover:bg-gray-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Limpar
            </button>
          )}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
              title="Fechar Carrinho"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Mensagem de sucesso */}
      {lastOrder && (
        <div className="m-2.5 bg-green-50 border-2 border-green-200 rounded-xl p-3 text-center shrink-0">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-1.5" />
          <p className="font-bold text-green-800 text-xs sm:text-sm">
            Pedido #{lastOrder.id.slice(-6).toUpperCase()} finalizado!
          </p>
          <div className="flex gap-2 mt-2">
            <Link to={createPageUrl(`PrintOrder?id=${lastOrder.id}`)} target="_blank" className="flex-1">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs h-8"
              >
                <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir
              </Button>
            </Link>
            <Button
              size="sm"
              className="flex-1 text-xs h-8 bg-[#047857] hover:bg-[#065f46] text-white font-bold"
              onClick={onDismissSuccess}
            >
              Novo Pedido
            </Button>
          </div>
        </div>
      )}

      {/* Identificação do Cliente */}
      <div className="px-3 py-2.5 border-b border-gray-100 bg-stone-50/80 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
            <User className="w-3.5 h-3.5 text-[#047857]" />
            <span>Identificação do Cliente</span>
          </div>
          <div className="flex items-center gap-1">
            {(customerName || customerPhone) && (
              <button
                type="button"
                onClick={handleClearCustomer}
                className="text-[11px] text-stone-400 hover:text-rose-600 px-1 font-semibold transition-colors cursor-pointer"
                title="Limpar cliente"
              >
                Limpar
              </button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowClientModal(true)}
              className="h-6 text-[11px] px-2 rounded-md bg-white border-stone-200 hover:bg-stone-100 text-stone-700 font-bold gap-1 shadow-2xs"
            >
              <Users className="w-3 h-3 text-[#047857]" />
              <span>Salvos</span>
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="relative">
            <Input
              placeholder="Telefone: (00) 00000-0000"
              value={customerPhone || ""}
              onChange={handlePhoneChange}
              className="h-8 text-xs bg-white rounded-lg pr-7 focus-visible:ring-[#047857]"
            />
            {isSearchingPhone && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <div className="w-3.5 h-3.5 border-2 border-[#047857] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div>
            <Input
              placeholder="Nome do Cliente (opcional)"
              value={customerName || ""}
              onChange={(e) => onCustomerNameChange(e.target.value)}
              className="h-8 text-xs bg-white rounded-lg"
            />
          </div>
        </div>

        {customerName && customerPhone && (
          <div className="bg-emerald-50 text-emerald-800 text-[11px] font-semibold px-2 py-1 rounded-md border border-emerald-200 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
            <span className="truncate">Vinculado: <b>{customerName}</b> ({customerPhone})</span>
          </div>
        )}
      </div>

      {/* Modal de Seleção de Clientes */}
      <PDVClientSelectModal
        isOpen={showClientModal}
        onClose={() => setShowClientModal(false)}
        onSelectClient={handleSelectClient}
      />

      {/* Itens do Carrinho */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
        {cart.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-25" />
            <p className="text-xs sm:text-sm font-medium">Carrinho vazio</p>
            <p className="text-[11px] mt-0.5 text-gray-400">Toque nos produtos para adicionar</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.id} className="bg-gray-50 rounded-xl p-2.5 border border-gray-100 hover:border-gray-200 transition-colors">
              <div className="flex justify-between items-start gap-1.5">
                <p className="font-semibold text-xs sm:text-sm text-gray-900 flex-1 leading-snug line-clamp-2">
                  {item.name}
                </p>
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors p-0.5 shrink-0 cursor-pointer"
                  title="Remover item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex justify-between items-center mt-2">
                {/* Controles de quantidade */}
                <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg p-0.5">
                  <button
                    onClick={() => onUpdateQty(item.id, -1)}
                    className="w-6 h-6 rounded-md hover:bg-stone-100 hover:text-stone-800 flex items-center justify-center transition-colors text-gray-600 cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center font-bold text-xs">{item.qty}</span>
                  <button
                    onClick={() => onUpdateQty(item.id, 1)}
                    className="w-6 h-6 rounded-md hover:bg-[#D1E9DF]/30 hover:text-[#047857] flex items-center justify-center transition-colors text-gray-600 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[#171717] text-xs sm:text-sm">
                    R$ {(item.price * item.qty).toFixed(2).replace(".", ",")}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {item.qty}x R$ {item.price.toFixed(2).replace(".", ",")}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Total e Finalizar */}
      <div className="p-3 sm:p-4 border-t border-gray-200 bg-white shrink-0 space-y-2.5">
        {cart.length > 0 && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Quantidade de itens:</span>
            <span className="font-bold text-gray-700">{itemCount} {itemCount === 1 ? "item" : "itens"}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-gray-700 font-semibold text-base sm:text-lg">Total</span>
          <span className="text-2xl sm:text-3xl font-black text-gray-950">
            R$ {total.toFixed(2).replace(".", ",")}
          </span>
        </div>
        <Button
          onClick={onFinalize}
          disabled={cart.length === 0}
          className="w-full h-11 sm:h-12 text-sm sm:text-base font-bold bg-[#047857] hover:bg-[#065f46] text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-md rounded-xl cursor-pointer"
        >
          ✓ Finalizar Pedido
        </Button>
      </div>
    </div>
  );
}
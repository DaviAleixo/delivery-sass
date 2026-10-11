import React, { useState, useEffect } from "react";
import { Order } from "@/entities/Order";
import { Settings } from "@/entities/Settings";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PrintOrderPage() {
  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState(null);
  const [customerOrderCount, setCustomerOrderCount] = useState(1);
  const [printTwoCopies, setPrintTwoCopies] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get("id");

    if (orderId) {
      loadOrderData(orderId);
    } else {
      setIsLoading(false);
    }
  }, []);

  const loadOrderData = async (orderId) => {
    try {
      const [orderData, settingsData, allOrders] = await Promise.all([
        Order.get(orderId),
        Settings.list(),
        Order.list("-created_date", 200).catch(() => []),
      ]);
      setOrder(orderData);
      if (settingsData && settingsData.length > 0) {
        setSettings(settingsData[0]);
      }
      if (orderData?.customer_phone && Array.isArray(allOrders)) {
        const clean = orderData.customer_phone.replace(/\D/g, "");
        if (clean.length >= 8) {
          const count = allOrders.filter(
            (o) => (o.customer_phone || "").replace(/\D/g, "") === clean
          ).length;
          setCustomerOrderCount(Math.max(1, count));
        }
      }
    } catch (error) {
      console.error("Erro ao carregar dados para impressão:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading && order) {
      // Pequeno delay para garantir que os estilos e fontes carregaram perfeitamente
      const timer = setTimeout(() => {
        window.print();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading, order]);

  if (isLoading) {
    return <div className="p-8 text-center text-sm font-mono">Carregando cupom para impressão...</div>;
  }

  if (!order) {
    return <div className="p-8 text-center text-red-500 font-mono">Pedido não encontrado.</div>;
  }

  const getPaymentMethodLabel = (method) => {
    if (!method) return "A Combinar";
    const m = String(method).toLowerCase();
    if (m.includes("pix")) return "Pix (na entrega)";
    if (m.includes("dinheiro")) return "Dinheiro";
    if (m.includes("credito") || m.includes("crédito")) return "Cartão de Crédito";
    if (m.includes("debito") || m.includes("débito")) return "Cartão de Débito";
    if (m.includes("cartao") || m.includes("cartão")) return "Cartão";
    if (m.includes("ticket") || m.includes("vale")) return "Vale / Ticket Refeição";
    return method;
  };

  const deliveryAddress = order.customer_address || order.delivery_address || "";
  const customerPhone = order.customer_phone || order.phone || "";
  const customerName = order.customer_name || order.name || "Cliente Balcão";
  const restaurantName = settings?.restaurant_name || "Delivery 1.0";
  const orderNumber = order.order_number || (order.id ? order.id.slice(-4).toUpperCase() : "0000");

  const orderDateFormatted = order.created_date
    ? format(new Date(order.created_date), "dd/MM/yyyy HH:mm", { locale: ptBR })
    : format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });

  const items = Array.isArray(order.items) ? order.items : [];
  
  const subtotal = items.reduce((sum, i) => {
    const itemSub = Number(i.subtotal) || ((Number(i.product_price || i.price || 0)) * (Number(i.quantity || i.qty || 1)));
    return sum + itemSub;
  }, 0);

  const deliveryFee = order.delivery_fee !== undefined 
    ? Number(order.delivery_fee) 
    : (order.order_type === 'delivery' ? 5.00 : 0);

  const discountAmount = Number(order.discount_amount || order.discount || 0);
  const totalAmount = Number(order.total_amount || order.total || (subtotal + deliveryFee - discountAmount));

  const orderTypeTitle = order.order_type === 'delivery'
    ? 'PARA ENTREGA'
    : (order.order_type === 'dine_in' || (order.table_number && String(order.table_number).toLowerCase().includes('mesa')))
      ? `PARA MESA (${order.table_number})`
      : 'PARA RETIRADA NO BALCÃO';

  // Componente de Cupom Único (Reutilizado na Via 1 e Via 2)
  const ReceiptCopy = ({ isKitchenOnly = false }) => (
    <div className="receipt-copy bg-white text-black font-mono text-[12px] leading-tight select-none">
      {/* Topo / Header */}
      <div className="text-center space-y-0.5 pb-1">
        <p className="font-extrabold text-sm tracking-widest uppercase">{orderTypeTitle}</p>
        <p className="text-[11px] text-gray-700">{orderDateFormatted}</p>
        <p className="text-[11px] font-bold">{restaurantName}</p>
      </div>

      <div className="border-t border-b border-dashed border-black py-1.5 my-1.5 text-center">
        <h1 className="text-xl font-black tracking-wide">
          Pedido {orderNumber}
        </h1>
      </div>

      {/* Itens */}
      <div className="pt-1 pb-1">
        <p className="font-extrabold text-[13px] mb-1.5">Itens</p>
        <div className="space-y-2">
          {items.map((item, idx) => {
            const qty = item.quantity || item.qty || 1;
            const price = Number(item.product_price || item.price || 0);
            const itemTotal = Number(item.subtotal || price * qty);
            const additionals = Array.isArray(item.additionals) ? item.additionals : [];

            return (
              <div key={idx} className="space-y-0.5">
                <div className="flex justify-between items-start font-bold">
                  <span className="flex-1 pr-2 leading-tight">
                    ({qty}) {item.product_name || item.name}
                  </span>
                  {!isKitchenOnly && (
                    <span className="whitespace-nowrap">
                      R$ {itemTotal.toFixed(2).replace(".", ",")}
                    </span>
                  )}
                </div>

                {/* Adicionais / Complementos */}
                {additionals.map((ad, adIdx) => (
                  <div key={adIdx} className="flex justify-between text-[11px] pl-3 text-stone-800">
                    <span className="flex-1 pr-2">({ad.quantity || 1}) {ad.name}</span>
                    {!isKitchenOnly && (
                      <span className="whitespace-nowrap">
                        {ad.price > 0 ? `R$ ${Number(ad.price).toFixed(2).replace(".", ",")}` : "-"}
                      </span>
                    )}
                  </div>
                ))}

                {/* Observações do Item */}
                {item.notes && (
                  <div className="text-[11px] pl-3 italic text-stone-800">
                    <span>(Obs) {item.notes}</span>
                  </div>
                )}

                {/* Linha separadora entre itens */}
                {idx < items.length - 1 && (
                  <div className="border-b border-dashed border-gray-400 my-1" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Observações Gerais do Pedido */}
      {order.notes && (
        <div className="border-t border-dashed border-black pt-1.5 my-1.5">
          <p className="font-extrabold text-[12px]">Observações:</p>
          <p className="text-[11px] italic font-semibold">{order.notes}</p>
        </div>
      )}

      {/* Seção Cliente */}
      <div className="border-t border-dashed border-black pt-1.5 my-1.5 space-y-0.5">
        <p className="font-extrabold text-[13px] mb-1">Cliente</p>
        <p><b>Nome:</b> {customerName}</p>
        {order.cpf && <p><b>CPF/CNPJ:</b> {order.cpf}</p>}
        {customerPhone && customerPhone !== "-" && (
          <p><b>Telefone:</b> {customerPhone}</p>
        )}
        <p><b>Quantidade de pedidos:</b> {String(customerOrderCount).padStart(2, "0")}</p>

        {order.order_type === 'delivery' && deliveryAddress && (
          <div className="pt-1 mt-1 border-t border-dotted border-gray-400 space-y-0.5">
            <p><b>Entrega:</b> {deliveryAddress}</p>
          </div>
        )}
      </div>

      {/* Seção Pagamento e Valores (na via completa) */}
      {!isKitchenOnly && (
        <>
          <div className="border-t border-dashed border-black pt-1.5 my-1.5 space-y-0.5">
            <p className="font-extrabold text-[13px] mb-1">Pagamento</p>
            <p><b>Forma de Pagamento:</b> {getPaymentMethodLabel(order.payment_method)}</p>
            <p className="text-[11px] text-gray-800">
              {order.order_type === 'delivery' ? "Pagar com o motorista / entregador" : "Pagamento no balcão / mesa"}
            </p>

            {/* Aviso de Cobrança para o Entregador */}
            <div className="text-center py-1 font-extrabold text-[11px] border border-black my-1 rounded-xs">
              <span>* Cobrar do cliente: R$ {totalAmount.toFixed(2).replace(".", ",")} *</span>
            </div>
          </div>

          {/* Totais */}
          <div className="border-t border-dashed border-black pt-1.5 my-1.5 space-y-0.5">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>R$ {subtotal.toFixed(2).replace(".", ",")}</span>
            </div>
            {order.order_type === 'delivery' && deliveryFee > 0 && (
              <div className="flex justify-between">
                <span>Taxa de entrega:</span>
                <span>R$ {deliveryFee.toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex justify-between text-gray-800">
                <span>Desconto / Cupom:</span>
                <span>- R$ {discountAmount.toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-[13px] pt-1 border-t border-black">
              <span>Total:</span>
              <span>R$ {totalAmount.toFixed(2).replace(".", ",")}</span>
            </div>
          </div>
        </>
      )}

      {/* Rodapé */}
      <div className="text-center pt-2 mt-2 border-t border-dashed border-black text-[10px] space-y-0.5 text-gray-700">
        <p className="font-bold">{restaurantName}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-200 py-4 px-2 print:p-0 print:bg-white print:min-h-0">
      <style>{`
        @page {
          margin: 0mm;
          size: auto;
        }
        @media print {
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            min-width: 100% !important;
            background: #fff !important;
            color: #000 !important;
            font-size: 11px !important;
            line-height: 1.25 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          body * {
            visibility: hidden;
          }
          #printable-area, #printable-area * {
            visibility: visible;
          }
          #printable-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 2mm 5mm 8mm 5mm !important;
            background: #fff !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
          }
          .receipt-copy {
            width: 100% !important;
            max-width: 100% !important;
            word-wrap: break-word !important;
            word-break: break-word !important;
            overflow-wrap: break-word !important;
          }
        }
      `}</style>

      {/* Barra de Ações Superior (Não sai na impressão) */}
      <div className="no-print max-w-[340px] mx-auto mb-4 bg-white p-3.5 rounded-2xl shadow-md space-y-3 border border-stone-300">
        <div className="flex items-center justify-between text-xs font-bold text-gray-800">
          <span>Opções de Impressão</span>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={printTwoCopies}
              onChange={(e) => setPrintTwoCopies(e.target.checked)}
              className="rounded text-red-600 focus:ring-red-500"
            />
            <span className="text-[11px] font-semibold">2 Vias (Completa)</span>
          </label>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition-all active:scale-95 cursor-pointer"
          >
            🖨️ Imprimir Cupom
          </button>
          <button
            onClick={() => window.close()}
            className="bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold py-2.5 px-3 rounded-xl text-xs shadow transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Área Imprimível (Térmica 58mm / 80mm com margens de segurança) */}
      <div
        id="printable-area"
        className="w-full max-w-[300px] mx-auto bg-white p-4 shadow-xl border border-stone-300 space-y-4 rounded-lg box-border"
      >
        {/* Via 1: Completa (Entrega / Caixa) */}
        <ReceiptCopy isKitchenOnly={false} />

        {/* Via 2: Cozinha / Entrega (se ativada) */}
        {printTwoCopies && (
          <>
            <div className="my-4 border-t-2 border-dashed border-black text-center relative py-1">
              <span className="bg-white px-2 text-[10px] font-bold uppercase tracking-wider text-black">
                ✂ - - - CORTE AQUI - - - ✂
              </span>
            </div>
            <ReceiptCopy isKitchenOnly={false} />
          </>
        )}
      </div>
    </div>
  );
}
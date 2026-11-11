import React, { useState, useEffect, useMemo } from "react";
import { Order } from "@/entities/Order";
import { Settings } from "@/entities/Settings";
import { ProductionSector } from "@/entities/ProductionSector";
import { Product } from "@/entities/Product";
import { Category } from "@/entities/Category";
import { findSectorByParam, filterOrderItemsForSector } from "@/utils/sectorUtils";
import { formatInBrasilia } from "@/utils/dateTime";

export default function PrintOrderPage() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const sectorParam = urlParams.get("sector") || "";
  const modeParam = urlParams.get("mode") || "";
  const paperParam = urlParams.get("paper") || "";

  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customerOrderCount, setCustomerOrderCount] = useState(1);
  const [printTwoCopies, setPrintTwoCopies] = useState(
    !sectorParam && modeParam !== "production_only" && modeParam !== "short_receipt"
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const orderId = urlParams.get("id");

    if (orderId) {
      loadOrderData(orderId);
    } else {
      setIsLoading(false);
    }
  }, [urlParams]);

  const loadOrderData = async (orderId) => {
    try {
      const [orderData, settingsData, allOrders, sectorsData, productsData, categoriesData] = await Promise.all([
        Order.get(orderId),
        Settings.list(),
        Order.list("-created_date", 200).catch(() => []),
        ProductionSector.list("order_index").catch(() => []),
        Product.list().catch(() => []),
        Category.list("order_index").catch(() => []),
      ]);
      setOrder(orderData);
      setSectors(Array.isArray(sectorsData) ? sectorsData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
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

  const selectedSector = useMemo(() => {
    return findSectorByParam(sectors, sectorParam);
  }, [sectors, sectorParam]);

  const effectiveContentMode = modeParam || selectedSector?.content_mode || "full_ticket";
  const isSectorProductionOnly = effectiveContentMode === "production_only";
  const isShortReceipt = effectiveContentMode === "short_receipt";

  const items = useMemo(() => (Array.isArray(order?.items) ? order.items : []), [order]);
  const filteredSectorItems = useMemo(() => {
    if (!order) return [];
    if (!selectedSector || effectiveContentMode === "full_ticket" || effectiveContentMode === "short_receipt") return items;
    return filterOrderItemsForSector(order, selectedSector, { sectors, products, categories });
  }, [order, items, selectedSector, effectiveContentMode, sectors, products, categories]);

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
    if (m.includes("caixa")) return "Pagar no Caixa (Mesa)";
    return method;
  };

  const deliveryAddress = order.customer_address || order.delivery_address || "";
  const customerPhone = order.customer_phone || order.phone || "";
  const customerName = order.customer_name || order.name || "Cliente Balcão";
  const restaurantName = settings?.restaurant_name || (typeof window !== "undefined" ? localStorage.getItem("current_tenant_name") : null) || "Vruum Burguer";
  const orderNumber = order.order_number || (order.id ? order.id.slice(-4).toUpperCase() : "0000");

  const orderDateFormatted = order.created_date
    ? formatInBrasilia(order.created_date)
    : formatInBrasilia(new Date());

  const subtotal = items.reduce((sum, i) => {
    const itemSub = Number(i.subtotal) || ((Number(i.product_price || i.price || 0)) * (Number(i.quantity || i.qty || 1)));
    return sum + itemSub;
  }, 0);

  const deliveryFee = order.delivery_fee !== undefined 
    ? Number(order.delivery_fee) 
    : (order.order_type === 'delivery' ? 5.00 : 0);

  const discountAmount = Number(order.discount_amount || order.discount || 0);
  const cashbackDiscount = Number(order.cashback_discount || 0);
  const cashbackEarned = Number(order.cashback_earned || 0);
  const totalAmount = Number(order.total_amount || order.total || (subtotal + deliveryFee - discountAmount - cashbackDiscount));

  const orderTypeTitle = order.order_type === 'delivery'
    ? 'PARA ENTREGA'
    : (order.order_type === 'dine_in' || (order.table_number && String(order.table_number).toLowerCase().includes('mesa')))
      ? `PARA MESA (${order.table_number})`
      : 'PARA RETIRADA NO BALCÃO';

  const orderCreatedAt = order.created_date ? new Date(order.created_date).getTime() : Date.now();
  const minutesDelayed = Math.floor((Date.now() - orderCreatedAt) / 60000);
  const isDelayedOffline = minutesDelayed >= 10;

  // Componente de Cupom Único (Reutilizado na Via 1 e Via 2 ou filtrado por Setor)
  const ReceiptCopy = ({ isKitchenOnly = false }) => (
    <div className="receipt-copy bg-white text-black font-sans text-[13px] leading-snug select-none font-bold">
      {/* Banner do Setor ou Senha Curta */}
      {isShortReceipt ? (
        <div className="border-2 border-black bg-black text-white text-center py-2 px-2 mb-2">
          <p className="font-black text-xl tracking-widest uppercase">
            SENHA #{orderNumber}
          </p>
          <p className="text-[11px] font-bold uppercase opacity-90">{restaurantName}</p>
        </div>
      ) : (
        selectedSector && (
          <div className="border-2 border-black bg-black text-white text-center py-1 px-2 mb-2">
            <p className="font-black text-sm tracking-widest uppercase">
              SETOR: {selectedSector.name}
            </p>
          </div>
        )
      )}

      {/* Topo / Header */}
      <div className="text-center space-y-0.5 pb-1">
        <p className="font-black text-base tracking-wider uppercase text-black">{orderTypeTitle}</p>
        <p className="text-[12px] font-bold text-black">{orderDateFormatted}</p>
        {!isShortReceipt && <p className="text-[12px] font-black text-black uppercase">{restaurantName}</p>}
      </div>

      {!isSectorProductionOnly && !isShortReceipt && order.driver_name && (
        <div className="border-2 border-black bg-stone-100 text-center py-1 px-2 my-1">
          <p className="font-black text-xs uppercase text-black">
            MOTOBOY: {order.driver_name}
          </p>
        </div>
      )}

      {isDelayedOffline && (
        <div className="border-2 border-black p-1.5 my-1 text-center font-black text-[12px] bg-black text-white leading-snug">
          ⚠️ PEDIDO RETIDO PELA REDE ({minutesDelayed} MIN ATRASO)
          <br />
          PRIORIDADE MÁXIMA NA COZINHA!
        </div>
      )}

      <div className="border-t-2 border-b-2 border-dashed border-black py-2 my-2 text-center">
        <h1 className="text-2xl font-black tracking-wide text-black uppercase">
          PEDIDO #{orderNumber}
        </h1>
      </div>

      {/* Itens */}
      <div className="pt-1 pb-1">
        <div className="border-b-2 border-black pb-1 mb-2 flex justify-between items-center">
          <p className="font-black text-[14px] uppercase text-black">
            {selectedSector && isKitchenOnly ? `ITENS — ${selectedSector.name}` : "ITENS DO PEDIDO"}
          </p>
          <p className="text-[11px] font-bold text-black">
            {isKitchenOnly ? "QTD" : "QTD / VALOR"}
          </p>
        </div>
        <div className="space-y-2.5">
          {filteredSectorItems.map((item, idx) => {
            const qty = item.quantity || item.qty || 1;
            const price = Number(item.product_price || item.price || 0);
            const itemTotal = Number(item.subtotal || price * qty);
            const additionals = Array.isArray(item.additionals) ? item.additionals : [];

            return (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between items-start font-black text-[14px] text-black">
                  <span className="flex-1 pr-2 leading-tight">
                    [{qty}x] {item.product_name || item.name}
                  </span>
                  {!isKitchenOnly && (
                    <span className="whitespace-nowrap font-black">
                      R$ {itemTotal.toFixed(2).replace(".", ",")}
                    </span>
                  )}
                </div>

                {/* Sabores Fracionados de Pizza */}
                {Array.isArray(item.pizza_flavors) && item.pizza_flavors.length > 0 && (
                  <div className="pl-3 space-y-0.5 my-1">
                    {item.pizza_flavors.map((f, fIdx) => (
                      <div key={fIdx} className="text-[12px] font-black text-black">
                        <span>[{f.fraction}] {f.name}</span>
                        {Array.isArray(f.additionals) && f.additionals.length > 0 && (
                          <div className="pl-2 space-y-0.5">
                            {f.additionals.map((fAd, fAdIdx) => (
                              <span key={fAdIdx} className="block text-[11px] font-bold text-black">
                                + {fAd.name} {Number(fAd.price) > 0 ? `(+R$ ${Number(fAd.price).toFixed(2).replace('.', ',')})` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        {f.notes && (
                          <span className="block text-[11px] font-bold text-black pl-2">
                            • Obs: {f.notes}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Adicionais / Complementos */}
                {additionals.map((ad, adIdx) => (
                  <div key={adIdx} className="flex justify-between text-[12px] font-bold pl-3 text-black">
                    <span className="flex-1 pr-2">+ ({ad.quantity || 1}x) {ad.name}</span>
                    {!isKitchenOnly && (
                      <span className="whitespace-nowrap">
                        {ad.price > 0 ? `R$ ${Number(ad.price).toFixed(2).replace(".", ",")}` : ""}
                      </span>
                    )}
                  </div>
                ))}

                {/* Observações do Item */}
                {item.notes && (
                  <div className="text-[12px] pl-3 font-black text-black bg-stone-100 p-1 border border-black my-0.5">
                    <span>OBS ITEM: {item.notes}</span>
                  </div>
                )}

                {/* Linha separadora entre itens */}
                {idx < filteredSectorItems.length - 1 && (
                  <div className="border-b border-dashed border-black my-1.5" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Observações Gerais do Pedido */}
      {order.notes && (
        <div className="border-2 border-black p-2 my-2 bg-stone-100 text-black">
          <p className="font-black text-[12px] uppercase">⚠️ OBSERVAÇÃO GERAL:</p>
          <p className="text-[13px] font-black leading-snug">{order.notes}</p>
        </div>
      )}

      {/* Seção Cliente (omite endereço e dados pessoais extras em comanda pura de cozinha) */}
      <div className="border-t-2 border-dashed border-black pt-2 my-2 space-y-1 text-black text-[13px]">
        <p className="font-black text-[14px] uppercase border-b border-black pb-0.5 mb-1">
          {order.order_type === 'dine_in' || (order.table_number && String(order.table_number).toLowerCase().includes('mesa'))
            ? `DADOS DA MESA (${order.table_number || 'Salão'})`
            : (order.order_type === 'pickup' || order.order_type === 'takeaway' || order.order_type === 'balcao'
                ? 'DADOS DO BALCÃO'
                : 'DADOS DE ENTREGA')}
        </p>
        <p className="leading-snug"><b>CLIENTE:</b> <span className="font-black">{customerName}</span></p>
        {!isKitchenOnly && !isShortReceipt && order.cpf && <p><b>CPF/CNPJ:</b> {order.cpf}</p>}
        {!isKitchenOnly && !isShortReceipt && customerPhone && customerPhone !== "-" && (
          <p className="leading-snug"><b>WHATSAPP:</b> <span className="font-black text-[14px]">{customerPhone}</span></p>
        )}
        {!isKitchenOnly && !isShortReceipt && (
          <p className="text-[12px]"><b>TOTAL DE PEDIDOS DO CLIENTE:</b> {String(customerOrderCount).padStart(2, "0")}</p>
        )}

        {!isKitchenOnly && !isShortReceipt && order.order_type === 'delivery' && deliveryAddress && (
          <div className="pt-1.5 mt-1.5 border-t border-black space-y-1">
            <p className="font-black text-[12px] uppercase">ENDEREÇO COMPLETO:</p>
            <p className="font-black text-[14px] leading-snug">{deliveryAddress}</p>
          </div>
        )}

        {!isKitchenOnly && !isShortReceipt && order.driver_name && (
          <div className="pt-1 mt-1 border-t border-dashed border-black">
            <p className="text-[12px]"><b>ENTREGADOR:</b> <span className="font-black uppercase">{order.driver_name}</span></p>
          </div>
        )}
      </div>

      {/* Seção Pagamento e Valores (na via completa) */}
      {!isKitchenOnly && (
        <>
          <div className="border-t-2 border-dashed border-black pt-2 my-2 space-y-1 text-black text-[13px]">
            <p className="font-black text-[14px] uppercase border-b border-black pb-0.5 mb-1">PAGAMENTO</p>
            <p><b>FORMA:</b> <span className="font-black uppercase">{getPaymentMethodLabel(order.payment_method)}</span></p>
            {order.card_brand && (
              <div className="bg-stone-100 border-2 border-black p-1.5 my-1.5 text-center font-black text-[13px] uppercase tracking-wide">
                * BANDEIRA: {order.card_brand.toUpperCase()} (LEVAR MAQUININHA) *
              </div>
            )}
            
            {order.payment_status === 'paid' ? (
              <div className="text-center py-1 font-black text-[13px] border-2 border-black my-1 bg-stone-100">
                <span>✓ JÁ PAGO (NÃO COBRAR)</span>
              </div>
            ) : (
              <div className="text-center py-1.5 font-black text-[14px] border-2 border-black my-1">
                <span>* COBRAR DO CLIENTE: R$ {totalAmount.toFixed(2).replace(".", ",")} *</span>
              </div>
            )}
          </div>

          {/* Totais */}
          <div className="border-t-2 border-dashed border-black pt-2 my-2 space-y-1 text-black text-[13px]">
            <div className="flex justify-between font-bold">
              <span>Subtotal:</span>
              <span>R$ {subtotal.toFixed(2).replace(".", ",")}</span>
            </div>
            {order.order_type === 'delivery' && deliveryFee > 0 && (
              <div className="flex justify-between font-bold">
                <span>Taxa de Entrega:</span>
                <span>R$ {deliveryFee.toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex justify-between font-black">
                <span>Desconto / Cupom:</span>
                <span>- R$ {discountAmount.toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            {cashbackDiscount > 0 && (
              <div className="flex justify-between font-black">
                <span>Desconto Cashback:</span>
                <span>- R$ {cashbackDiscount.toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            {cashbackEarned > 0 && (
              <div className="text-[11px] font-bold text-center border border-dashed border-black py-0.5 my-1">
                🎁 Cashback gerado nesta compra: R$ {cashbackEarned.toFixed(2).replace(".", ",")}
              </div>
            )}
            <div className="flex justify-between font-black text-lg pt-1.5 border-t-2 border-black">
              <span>TOTAL:</span>
              <span>R$ {totalAmount.toFixed(2).replace(".", ",")}</span>
            </div>
          </div>
        </>
      )}

      {/* Rodapé */}
      <div className="text-center pt-2 mt-2 border-t border-dashed border-black text-[11px] space-y-0.5 text-black font-bold">
        <p>{isShortReceipt ? "Aguarde chamar sua senha!" : `${restaurantName} - Delivery & Cardápio`}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-200 py-4 px-2 print:p-0 print:bg-white print:min-h-0 font-sans">
      <style>{`
        @page {
          margin: 0mm;
          size: auto;
        }
        @media print {
          *, *::before, *::after {
            box-sizing: border-box !important;
            color: #000 !important;
            border-color: #000 !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            min-width: 100% !important;
            background: #fff !important;
            color: #000 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
            font-size: 13px !important;
            font-weight: 700 !important;
            line-height: 1.3 !important;
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
            padding: 2mm 4mm 6mm 4mm !important;
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
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
            color: #000 !important;
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
              className="rounded text-[#047857] focus:ring-[#047857]"
            />
            <span className="text-[11px] font-semibold">2 Vias (Completa)</span>
          </label>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex-1 bg-[#047857] hover:bg-[#065f46] text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition-all active:scale-95 cursor-pointer"
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

      {/* Área Imprimível (Térmica 58mm / 80mm ou Folha Comum A4) */}
      <div
        id="printable-area"
        className={`w-full mx-auto bg-white shadow-xl border border-stone-300 space-y-4 rounded-lg box-border ${
          paperParam === "a4" ? "max-w-[680px] p-8" : "max-w-[300px] p-4"
        }`}
      >
        {/* Via 1 */}
        <ReceiptCopy isKitchenOnly={isSectorProductionOnly} />

        {/* Via 2 (somente em cupom completo padrão quando marcado 2 Vias) */}
        {printTwoCopies && !isSectorProductionOnly && !isShortReceipt && (
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
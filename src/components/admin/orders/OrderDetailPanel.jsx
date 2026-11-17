import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import {
  ShoppingBag,
  Truck,
  UtensilsCrossed,
  Clock,
  Check,
  CheckCircle,
  MapPin,
  Phone,
  User,
  CreditCard,
  FileText,
  Printer,
  ChevronDown,
  X,
  Star,
  Hash,
  Bike,
  ChefHat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import OrderCountdownTimer from "@/components/admin/OrderCountdownTimer";
import { createPageUrl } from "@/utils";
import {
  getOrderChannelMeta,
  getOrderStatusMeta,
  getPaymentMethodText,
  resolveItemImage,
} from "./orderDisplayHelpers";

export function ChannelIcon({ kind, className = "w-4 h-4" }) {
  if (kind === "delivery") return <Truck className={className} />;
  if (kind === "dine_in") return <UtensilsCrossed className={className} />;
  return <ShoppingBag className={className} />;
}

export function StatusIcon({ status, className = "w-3.5 h-3.5" }) {
  if (status === "pendente") return <Clock className={className} />;
  if (status === "confirmado") return <CheckCircle className={className} />;
  if (status === "preparando") return <ChefHat className={className} />;
  if (status === "pronto") return <CheckCircle className={className} />;
  if (status === "enviado") return <Bike className={className} />;
  if (status === "entregue") return <Check className={className} />;
  return <X className={className} />;
}

export default function OrderDetailPanel({
  order,
  deliveryTime,
  productImageMap,
  safeDate,
  safeMoney,
  onUpdateStatus,
  onRequestCancel,
  onPrint,
  onClose,
}) {
  if (!order) {
    return (
      <div className="bg-white border border-gray-200/90 rounded-2xl shadow-2xs p-8 text-center flex flex-col items-center justify-center min-h-[380px]">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-[#047857] mb-3">
          <ShoppingBag className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-gray-900">Selecione um pedido</h3>
        <p className="text-xs text-gray-500 mt-1 max-w-xs">
          Clique em qualquer pedido da lista ao lado para visualizar itens, cliente, pagamento e ações.
        </p>
      </div>
    );
  }

  const d = safeDate(order.created_date);
  const total = Number(order.total_amount ?? order.total ?? 0);
  const channel = getOrderChannelMeta(order);
  const statusMeta = getOrderStatusMeta(order.status);
  const cashbackEarned = Number(order.cashback_earned || 0);
  const cashbackDiscount = Number(order.cashback_discount || 0);
  const deliveryFee = Number(order.delivery_fee || 0);
  const couponDiscount = Number(order.discount_amount || order.discount || 0);
  const isCancellable = ["pendente", "confirmado", "preparando", "pronto", "enviado"].includes(order.status);

  const handleCancel = () => {
    if (onRequestCancel) {
      onRequestCancel(order);
    } else {
      onUpdateStatus(order.id, "cancelado");
    }
  };

  return (
    <div className="bg-white border border-gray-200/90 rounded-2xl shadow-2xs overflow-hidden flex flex-col lg:max-h-[calc(100vh-11.5rem)]">
      {/* Cabeçalho do Pedido Selecionado */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${channel.iconBoxClass}`}>
            <ChannelIcon kind={channel.kind} className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-gray-950 tracking-tight leading-none">
                Pedido #{String(order.id).slice(-6).toUpperCase()}
              </h2>
              <OrderCountdownTimer order={order} deliveryTimeSetting={deliveryTime} />
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {d ? format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "-"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${statusMeta.badgeClass}`}
          >
            <StatusIcon status={order.status} className="w-3.5 h-3.5" />
            <span>{statusMeta.label}</span>
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              title="Fechar detalhes"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Alerta visual quando finalizado pelo KDS / Cozinha */}
      {order.status === "pronto" && (
        <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2 text-xs font-bold text-[#047857] shrink-0">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>
            {order.order_type === "delivery"
              ? "Pronto na cozinha — já pode chamar ou despachar com o motoboy."
              : "Pronto na cozinha — já pode chamar o cliente ou servir."}
          </span>
        </div>
      )}

      {/* Corpo compacto para caber completo na tela */}
      <div className="px-4 py-3 space-y-2.5 flex-1 overflow-y-auto min-h-0">
        {/* Cliente */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <User className="w-3.5 h-3.5 text-gray-400" />
              <span>Cliente</span>
            </div>

            {(order.driver_name || order.payment_status === "paid" || order.pix_refund_status === "refunded") && (
              <div className="flex flex-wrap items-center gap-1">
                {order.payment_status === "paid" && (
                  <Badge className="text-[10px] bg-[#15803d] hover:bg-[#15803d] text-white font-bold px-2 py-0.5 rounded-full leading-none">
                    ✓ Pago Online
                  </Badge>
                )}
                {order.driver_name && (
                  <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-800 border-orange-200 font-bold px-2 py-0.5 leading-none">
                    <Bike className="w-3 h-3 mr-1" />
                    {order.driver_name}
                  </Badge>
                )}
                {order.pix_refund_status === "refunded" && (
                  <Badge className="text-[10px] bg-sky-600 text-white font-bold px-2 py-0.5 leading-none">
                    ✓ Pix Estornado {order.pix_refund_amount ? `(R$ ${safeMoney(order.pix_refund_amount)})` : ""}
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="pl-5 space-y-0.5">
            <p className="text-sm font-bold text-gray-950 leading-tight">{order.customer_name || "Cliente"}</p>

            {order.customer_phone && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                <span>{order.customer_phone}</span>
              </div>
            )}

            {channel.kind === "delivery" && (order.customer_address || order.delivery_address) && (
              <div className="flex items-start gap-1.5 text-xs text-gray-600">
                <MapPin className="w-3 h-3 text-[#047857] shrink-0 mt-0.5" />
                <span className="leading-snug">{order.customer_address || order.delivery_address}</span>
              </div>
            )}

            {channel.kind === "dine_in" && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700">
                <Hash className="w-3 h-3 shrink-0" />
                <span>{channel.detailSubtitle}</span>
              </div>
            )}

            {order.status === "cancelado" && order.cancel_reason && (
              <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200 font-bold mt-0.5">
                Motivo: {order.cancel_reason}
              </Badge>
            )}
          </div>
        </div>

        {/* Itens do Pedido */}
        <div className="pt-2 border-t border-gray-100 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <ShoppingBag className="w-3.5 h-3.5 text-gray-400" />
            <span>Itens do Pedido</span>
          </div>

          <div className="space-y-1.5 pl-1">
            {(order.items || []).map((item, idx) => {
              const qty = Number(item.quantity || 1);
              const unitPrice = Number(item.product_price ?? item.price ?? 0);
              const lineTotal = Number(item.subtotal ?? unitPrice * qty);
              const imgUrl = resolveItemImage(item, productImageMap);

              return (
                <div key={item.id || idx} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={item.product_name || item.name || "Produto"}
                        className="w-8 h-8 rounded-lg object-cover border border-gray-200 bg-gray-50 shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 shrink-0">
                        <ShoppingBag className="w-3.5 h-3.5" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-900 leading-tight truncate">
                        {item.product_name || item.name}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
                        {qty}x &nbsp; R$ {safeMoney(unitPrice)}
                      </p>
                      {Array.isArray(item.additionals) && item.additionals.length > 0 && (
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          + {item.additionals.map((ad) => `${ad.name} (R$ ${safeMoney(ad.price)})`).join(", ")}
                        </p>
                      )}
                      {Array.isArray(item.complements) && item.complements.length > 0 && (
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          • {item.complements.map((cp) => cp.option_name || cp.name).filter(Boolean).join(", ")}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-[11px] text-amber-700 mt-0.5 italic">
                          Obs: {item.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <p className="text-xs font-bold text-gray-950 shrink-0 tabular-nums">
                    R$ {safeMoney(lineTotal)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pagamento e Tipo de Pedido (2 colunas) */}
        <div className="grid grid-cols-2 gap-3 py-2 border-y border-gray-100">
          <div className="flex items-start gap-2 pr-2 border-r border-gray-100 min-w-0">
            <CreditCard className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[11px] text-gray-500 leading-none">Pagamento</p>
              <p className="text-xs font-bold text-gray-950 mt-0.5 break-words">
                {getPaymentMethodText(order.payment_method, order.card_brand)}
              </p>
              {order.change_for && (
                <span className="inline-block mt-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                  Troco p/ R$ {order.change_for}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 min-w-0">
            <ChannelIcon kind={channel.kind} className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[11px] text-gray-500 leading-none">{channel.title}</p>
              <p className="text-xs font-bold text-gray-950 mt-0.5 break-words">
                {channel.detailSubtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Observações */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <FileText className="w-3.5 h-3.5 text-gray-400" />
            <span>Observações</span>
          </div>
          <p className="text-xs text-gray-700 pl-5 leading-snug">
            {order.notes ? order.notes : "-"}
          </p>
        </div>

        {/* Taxas / Descontos / Cashback */}
        {(deliveryFee > 0 || couponDiscount > 0 || cashbackDiscount > 0 || cashbackEarned > 0) && (
          <div className="space-y-1">
            {deliveryFee > 0 && (
              <div className="flex justify-between text-xs text-gray-600">
                <span>Taxa de entrega</span>
                <span className="font-semibold tabular-nums">R$ {safeMoney(deliveryFee)}</span>
              </div>
            )}
            {couponDiscount > 0 && (
              <div className="flex justify-between text-xs text-emerald-700 font-semibold">
                <span>Cupom {order.coupon_code ? `(${order.coupon_code})` : ""}</span>
                <span className="tabular-nums">- R$ {safeMoney(couponDiscount)}</span>
              </div>
            )}
            {cashbackDiscount > 0 && (
              <div className="flex justify-between text-xs text-amber-700 font-semibold">
                <span>Cashback usado</span>
                <span className="tabular-nums">- R$ {safeMoney(cashbackDiscount)}</span>
              </div>
            )}
            {cashbackEarned > 0 && (
              <div className="bg-[#DCFCE7]/70 border border-[#86EFAC]/70 rounded-xl px-3 py-1 flex items-center justify-between text-xs font-bold text-[#15803d]">
                <span className="flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 fill-emerald-500/20 text-[#16a34a]" />
                  Cashback
                </span>
                <span className="tabular-nums">+ R$ {safeMoney(cashbackEarned)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rodapé Fixo: Total do Pedido + Barra de Ações */}
      <div className="px-4 py-2.5 border-t border-gray-100 bg-white space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-700">Total do Pedido</span>
          <span className="text-lg font-black text-gray-950 tabular-nums">
            R$ {safeMoney(total)}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Botão Split Imprimir (Cancelar fica no menu ⌄ para manter visual limpo igual à referência) */}
          <div className="inline-flex rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs shrink-0">
            <button
              type="button"
              onClick={() => onPrint && onPrint(order)}
              className="px-4 h-9 text-xs font-bold text-gray-800 hover:bg-gray-50 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-gray-600" />
              <span>Imprimir</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="px-2.5 h-9 border-l border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 cursor-pointer transition-colors"
                  title="Mais opções"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52 bg-white rounded-xl shadow-lg border border-gray-200 p-1">
                <DropdownMenuItem
                  onClick={() => onPrint && onPrint(order)}
                  className="cursor-pointer text-xs font-medium py-2 rounded-lg"
                >
                  🖨️ Imprimir comanda agora
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer text-xs font-medium py-2 rounded-lg">
                  <Link to={createPageUrl(`PrintOrder?id=${order.id}`)} target="_blank">
                    📄 Abrir folha de impressão
                  </Link>
                </DropdownMenuItem>
                {isCancellable && (
                  <DropdownMenuItem
                    onClick={handleCancel}
                    className="cursor-pointer text-xs font-semibold text-red-600 focus:text-red-700 py-2 rounded-lg"
                  >
                    ✖️ Cancelar pedido
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* CTA Principal conforme Status */}
          {order.status === "pendente" && (
            <Button
              type="button"
              onClick={() => onUpdateStatus(order.id, "confirmado")}
              className="flex-1 h-9 px-4 rounded-xl bg-[#15803d] hover:bg-[#166534] text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              <Check className="w-4 h-4 mr-1.5" />
              Confirmar pedido
            </Button>
          )}

          {order.status === "confirmado" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onUpdateStatus(order.id, order.order_type === "delivery" ? "enviado" : "entregue")
                }
                className="h-9 px-3 rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs font-bold cursor-pointer"
                title="Pular etapa de preparo (quando cozinha usa só impressora)"
              >
                {order.order_type === "delivery" ? "Despachar direto" : "Concluir direto"}
              </Button>
              <Button
                type="button"
                onClick={() => onUpdateStatus(order.id, "preparando")}
                className="flex-1 h-9 px-4 rounded-xl bg-[#15803d] hover:bg-[#166534] text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                <ChefHat className="w-4 h-4 mr-1.5" />
                Iniciar preparo
              </Button>
            </>
          )}

          {(order.status === "preparando" || order.status === "pronto") && (
            <Button
              type="button"
              onClick={() =>
                onUpdateStatus(order.id, order.order_type === "delivery" ? "enviado" : "entregue")
              }
              className="flex-1 h-9 px-4 rounded-xl bg-[#15803d] hover:bg-[#166534] text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              {order.order_type === "delivery" ? (
                <>
                  <Bike className="w-4 h-4 mr-1.5" />
                  Enviar para entrega
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                  Concluir / Entregar
                </>
              )}
            </Button>
          )}

          {order.status === "enviado" && (
            <Button
              type="button"
              onClick={() => onUpdateStatus(order.id, "entregue")}
              className="flex-1 h-9 px-4 rounded-xl bg-[#15803d] hover:bg-[#166534] text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              <CheckCircle className="w-4 h-4 mr-1.5" />
              Marcar como entregue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}


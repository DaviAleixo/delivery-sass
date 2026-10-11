import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Phone, MapPin, CreditCard, Printer, 
  Truck, Store, Hash
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import OrderCountdownTimer from "@/components/admin/OrderCountdownTimer";

export default function OrderCard({
  order,
  isExpanded,
  onToggleExpansion,
  onUpdateStatus,
  deliveryTime,
  safeDate,
  safeMoney,
  getStatusColor,
  getStatusIcon,
  getStatusText,
  getPaymentMethodText
}) {
  const d = safeDate(order.created_date);
  const total = order.total_amount || order.total || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
        <CardHeader 
          className="cursor-pointer p-4 md:p-6" 
          onClick={onToggleExpansion}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <span>Pedido #{String(order.id).slice(-6).toUpperCase()}</span>
                <span className="text-xs text-gray-500 font-normal">
                  {isExpanded ? "▼" : "▶"}
                </span>
              </CardTitle>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                {d ? format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "-"}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <p className="font-medium text-gray-700">{order.customer_name || "Cliente"}</p>
                {order.order_type === "delivery" ? (
                  <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 font-semibold">
                    <Truck className="w-3 h-3 mr-1 text-red-600" />
                    Delivery
                  </Badge>
                ) : (order.order_type === "dine_in" || (order.table_number && order.table_number.toLowerCase().includes("mesa"))) ? (
                  <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold">
                    <span className="mr-1">🍽️</span>
                    {order.table_number || "Mesa (Salão)"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-800 border-amber-200 font-semibold">
                    <Store className="w-3 h-3 mr-1 text-amber-600" />
                    Retirada (Balcão)
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between md:justify-end gap-2.5">
              <OrderCountdownTimer order={order} deliveryTimeSetting={deliveryTime} />

              <Badge className={`${getStatusColor(order.status)} border font-medium text-xs md:text-sm`}>
                {getStatusIcon(order.status)}
                <span className="ml-1">{getStatusText(order.status)}</span>
              </Badge>
              <Link to={createPageUrl(`PrintOrder?id=${order.id}`)} target="_blank" onClick={(e) => e.stopPropagation()}>
                <Button variant="outline" size="icon" className="h-8 w-8 md:h-9 md:w-9">
                  <Printer className="w-3 h-3 md:w-4 md:h-4" />
                </Button>
              </Link>
              <div className="text-right">
                <p className="font-bold text-lg md:text-xl text-gray-900">
                  R$ {safeMoney(total)}
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <CardContent className="p-4 md:p-6 border-t border-gray-100">
                <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
                  {/* Informações do Cliente */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3 text-sm md:text-base">Informações do Cliente</h3>
                    <div className="space-y-2">
                      <p className="text-gray-900 font-medium text-sm md:text-base">{order.customer_name || "Cliente"}</p>
                      <div className="flex items-center gap-2 text-gray-600 text-xs md:text-sm">
                        <Phone className="w-3 h-3 md:w-4 md:h-4" />
                        <span>{order.customer_phone || "-"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600 text-xs md:text-sm">
                        {order.order_type === "delivery" ? (
                          <>
                            <Truck className="w-3 h-3 md:w-4 md:h-4 text-red-600" />
                            <span className="font-medium text-red-700">Entrega (Delivery)</span>
                          </>
                        ) : (order.order_type === "dine_in" || (order.table_number && order.table_number.toLowerCase().includes("mesa"))) ? (
                          <>
                            <span className="text-sm">🍽️</span>
                            <span className="font-medium text-emerald-700">Consumo no Local (Salão)</span>
                          </>
                        ) : (
                          <>
                            <Store className="w-3 h-3 md:w-4 md:h-4 text-amber-600" />
                            <span className="font-medium text-amber-800">Retirada no Balcão</span>
                          </>
                        )}
                      </div>
                      {order.order_type === "delivery" ? (
                        <div className="flex items-start gap-2 text-gray-600 text-xs md:text-sm">
                          <MapPin className="w-3 h-3 md:w-4 md:h-4 mt-0.5 text-red-600 shrink-0" />
                          <span className="text-xs md:text-sm">{order.customer_address || order.delivery_address || "-"}</span>
                        </div>
                      ) : (order.order_type === "dine_in" || (order.table_number && order.table_number.toLowerCase().includes("mesa"))) ? (
                        <div className="flex items-center gap-2 text-gray-600 text-xs md:text-sm">
                          <Hash className="w-3 h-3 md:w-4 md:h-4 text-emerald-600 shrink-0" />
                          <span className="font-bold text-emerald-800">{order.table_number || "Mesa não especificada"}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-600 text-xs md:text-sm">
                          <Store className="w-3 h-3 md:w-4 md:h-4 text-amber-600 shrink-0" />
                          <span className="text-xs text-amber-800">Chamar cliente no balcão quando pronto</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-gray-600 text-xs md:text-sm">
                        <CreditCard className="w-3 h-3 md:w-4 md:h-4" />
                        <span className="font-medium text-stone-800">{getPaymentMethodText(order.payment_method)}</span>
                        {order.payment_status === 'paid' && (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-extrabold uppercase">
                            ✓ Pago Online
                          </Badge>
                        )}
                        {order.change_for && (
                          <span className="text-amber-700 font-bold text-xs bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Troco p/ R$ {order.change_for}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Itens do Pedido */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3 text-sm md:text-base">Itens do Pedido</h3>
                    <div className="space-y-2">
                      {order.items?.map((item, index) => (
                        <div key={index} className="flex justify-between items-start py-2 border-b border-gray-100 last:border-0">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 text-xs md:text-sm">{item.product_name || item.name}</p>
                            <p className="text-xs text-gray-600">
                              {item.quantity}x R$ {safeMoney(item.product_price || item.price)}
                            </p>
                            {item.additionals && item.additionals.length > 0 && (
                              <div className="text-xs text-gray-500 pl-2">
                                + {item.additionals.map(ad => `${ad.name} (R$ ${safeMoney(ad.price)})`).join(", ")}
                              </div>
                            )}
                          </div>
                          <p className="font-semibold text-gray-900 text-xs md:text-sm">
                            R$ {safeMoney(item.subtotal || ((item.product_price || item.price || 0) * (item.quantity || 1)))}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {order.notes && (
                  <div className="mb-4 md:mb-6">
                    <h3 className="font-semibold text-gray-900 mb-2 text-sm md:text-base">Observações</h3>
                    <p className="text-gray-600 bg-gray-50 p-3 rounded-lg text-xs md:text-sm">
                      {order.notes}
                    </p>
                  </div>
                )}

                {/* Ações de Status */}
                <div className="flex flex-wrap gap-2 md:gap-3 pt-2">
                  {order.status === "pendente" && (
                    <>
                      <Button
                        onClick={() => onUpdateStatus(order.id, "confirmado")}
                        className="bg-blue-600 hover:bg-blue-700 text-xs md:text-sm flex-1 md:flex-none cursor-pointer"
                      >
                        Confirmar Pedido
                      </Button>
                      <Button
                        onClick={() => onUpdateStatus(order.id, "cancelado")}
                        variant="outline"
                        className="text-red-600 hover:text-red-700 border-red-200 text-xs md:text-sm flex-1 md:flex-none cursor-pointer"
                      >
                        Cancelar
                      </Button>
                    </>
                  )}
                  
                  {order.status === "confirmado" && (
                    <>
                      <Button
                        onClick={() => onUpdateStatus(order.id, "preparando")}
                        className="bg-purple-600 hover:bg-purple-700 text-xs md:text-sm flex-1 md:flex-none cursor-pointer"
                      >
                        Iniciar Preparo
                      </Button>
                      <Button
                        onClick={() => onUpdateStatus(order.id, "cancelado")}
                        variant="outline"
                        className="text-red-600 hover:text-red-700 border-red-200 text-xs md:text-sm flex-1 md:flex-none cursor-pointer"
                      >
                        Cancelar
                      </Button>
                    </>
                  )}
                  
                  {order.status === "preparando" && (
                    <>
                      <Button
                        onClick={() => onUpdateStatus(order.id, "enviado")}
                        className="bg-indigo-600 hover:bg-indigo-700 text-xs md:text-sm flex-1 md:flex-none cursor-pointer"
                      >
                        Enviar para Entrega
                      </Button>
                      <Button
                        onClick={() => onUpdateStatus(order.id, "cancelado")}
                        variant="outline"
                        className="text-red-600 hover:text-red-700 border-red-200 text-xs md:text-sm flex-1 md:flex-none cursor-pointer"
                      >
                        Cancelar
                      </Button>
                    </>
                  )}
                  
                  {order.status === "enviado" && (
                    <>
                      <Button
                        onClick={() => onUpdateStatus(order.id, "entregue")}
                        className="bg-green-600 hover:bg-green-700 text-xs md:text-sm flex-1 md:flex-none cursor-pointer"
                      >
                        Marcar como Entregue
                      </Button>
                      <Button
                        onClick={() => onUpdateStatus(order.id, "cancelado")}
                        variant="outline"
                        className="text-red-600 hover:text-red-700 border-red-200 text-xs md:text-sm flex-1 md:flex-none cursor-pointer"
                      >
                        Cancelar
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

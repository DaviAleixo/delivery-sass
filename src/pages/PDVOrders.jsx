import React, { useState, useEffect } from "react";
import { Order } from "@/entities/Order";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import { format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const STATUS_COLORS = {
  pendente: "bg-yellow-100 text-yellow-800",
  confirmado: "bg-blue-100 text-blue-800",
  preparando: "bg-purple-100 text-purple-800",
  enviado: "bg-indigo-100 text-indigo-800",
  entregue: "bg-green-100 text-green-800",
  cancelado: "bg-red-100 text-red-800",
};

const PAYMENT_LABELS = { dinheiro: "Dinheiro", pix: "PIX", cartao: "Cartão" };

export default function PDVOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("today");

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setIsLoading(true);
    const data = await Order.list("-created_date", 200);
    setOrders(data);
    setIsLoading(false);
  };

  const filteredOrders = orders.filter((o) => {
    if (filter === "today") return isToday(new Date(o.created_date));
    return true;
  });

  const todayTotal = filteredOrders.reduce((s, o) => s + Number(o.total_amount || o.total || 0), 0);

  return (
    <div className="min-h-screen bg-[#F7F9F8]">
      {/* Header */}
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl("PDV")}>
            <Button variant="ghost" size="icon" className="text-white hover:bg-gray-800">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold">Pedidos do Balcão</h1>
            <p className="text-xs text-gray-400">{filteredOrders.length} pedido(s)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right mr-2">
            <p className="text-xs text-gray-400">{filter === "today" ? "Total hoje" : "Total geral"}</p>
            <p className="text-xl font-black text-[#D1E9DF]">
              R$ {todayTotal.toFixed(2).replace(".", ",")}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={loadOrders}
            className="text-white border-gray-700 bg-gray-800 hover:bg-gray-700 hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Filtros */}
      <div className="bg-white border-b border-stone-200 px-4 py-2 flex gap-2">
        {["today", "all"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors cursor-pointer ${
              filter === f
                ? "bg-[#047857] text-white shadow-xs"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {f === "today" ? "Hoje" : "Todos"}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="p-4 max-w-4xl mx-auto space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 animate-pulse rounded-xl" />
          ))
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Nenhum pedido encontrado</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-gray-900">
                    #{order.id.slice(-8)}
                  </span>
                  <Badge className={`${STATUS_COLORS[order.status]} text-xs`}>
                    {order.status}
                  </Badge>
                  <span className="text-xs text-gray-400">
                    {PAYMENT_LABELS[order.payment_method] || order.payment_method}
                  </span>
                </div>
                <p className="text-sm text-gray-700 font-medium">
                  {order.customer_name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {format(new Date(order.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
                {/* Itens resumidos */}
                <p className="text-xs text-gray-400 mt-1 truncate">
                  {order.items?.map((i) => `${i.quantity}x ${i.product_name}`).join(", ")}
                </p>
                {order.notes && (
                  <p className="text-xs text-amber-600 mt-1">📝 {order.notes}</p>
                )}
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-2">
                <p className="text-xl font-black text-[#171717]">
                  R$ {order.total_amount.toFixed(2).replace(".", ",")}
                </p>
                <Link to={createPageUrl(`PrintOrder?id=${order.id}`)} target="_blank">
                  <Button variant="outline" size="sm">
                    <Printer className="w-3.5 h-3.5 mr-1" />
                    Imprimir
                  </Button>
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
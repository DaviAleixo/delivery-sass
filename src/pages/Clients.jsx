import React, { useState, useEffect } from "react";
import { User } from "@/entities/User";
import { Order } from "@/entities/Order";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, ShoppingBag, DollarSign, Search, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";

import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const segments = window.location.pathname.split("/").filter(Boolean);
      const RESERVED = new Set(["clients", "dashboard", "orders", "pdv", "menu", "adminlogin", "login", "superadmin"]);
      const routeSlug = segments.length > 0 && !RESERVED.has(segments[0].toLowerCase()) ? segments[0].toLowerCase() : null;
      let activeTenantId = localStorage.getItem("current_tenant_id");
      const activeSlug = routeSlug || localStorage.getItem("current_tenant_slug");
      const isVruum = activeSlug === "vrumm" || activeSlug === "vruum-burguer" || activeTenantId === "a0000000-0000-0000-0000-000000000001";

      if (isSupabaseConfigured() && supabase) {
        if (activeSlug === "vrumm" || activeSlug === "vruum-burguer") {
          activeTenantId = "a0000000-0000-0000-0000-000000000001";
        } else if (activeSlug) {
          const { data: tData } = await supabase.from("tenants").select("id").eq("slug", activeSlug).maybeSingle();
          if (tData) activeTenantId = tData.id;
        }

        const effectiveId = activeTenantId || (isVruum ? "a0000000-0000-0000-0000-000000000001" : null);

        if (effectiveId) {
          const { data, error } = await supabase.rpc("get_clients_summary", {
            p_tenant_id: effectiveId
          });

          if (!error && Array.isArray(data)) {
            setClients(data.map(c => ({
              id: c.id || c.customer_phone,
              full_name: c.customer_name || "Cliente",
              email: c.customer_email || "-",
              phone: c.customer_phone || "-",
              totalOrders: Number(c.total_orders || 0),
              totalSpent: Number(c.total_spent || 0),
              lastOrderDate: c.last_order_at ? new Date(c.last_order_at) : null
            })));
            setIsLoading(false);
            return;
          }
        }
      }

      // Se for a loja piloto Vruum Burguer no fallback local
      if (isVruum) {
        const [usersData, ordersData] = await Promise.all([
          User.list("-created_date", 50),
          Order.list("-created_date", 50)
        ]);
        const nonAdmins = usersData.filter(u => u.role !== 'admin');
        const clientMap = new Map();

        nonAdmins.forEach(u => {
          const key = u.phone || u.email || u.id;
          clientMap.set(key, {
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            phone: u.phone,
            totalOrders: 0,
            totalSpent: 0,
            lastOrderDate: null
          });
        });

        ordersData.forEach(order => {
          if (order.status === 'cancelado') return;
          const key = order.customer_phone || order.user_email || order.customer_name || order.id;
          if (!clientMap.has(key)) {
            clientMap.set(key, {
              id: key,
              full_name: order.customer_name || "Cliente",
              email: order.user_email || order.customer_email || "-",
              phone: order.customer_phone || "-",
              totalOrders: 0,
              totalSpent: 0,
              lastOrderDate: null
            });
          }
          const client = clientMap.get(key);
          if (order.customer_name && order.customer_name !== "Cliente" && (!client.full_name || client.full_name === "Cliente")) {
            client.full_name = order.customer_name;
          }
          client.totalOrders += 1;
          client.totalSpent += Number(order.total_amount || 0);
          const orderDate = new Date(order.created_date);
          if (!client.lastOrderDate || orderDate > client.lastOrderDate) {
            client.lastOrderDate = orderDate;
          }
        });

        setClients(Array.from(clientMap.values()));
      } else {
        setClients([]);
      }
    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
      setClients([]);
    } finally {
      setIsLoading(false);
    }
  };

  const clientData = clients;

  const filteredClients = clientData.filter(client => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    const nameMatch = (client.full_name || '').toLowerCase().includes(q);
    const phoneClean = (client.phone || '').replace(/\D/g, '');
    const qClean = q.replace(/\D/g, '');
    const phoneMatch = (client.phone || '').includes(q) || (qClean.length > 0 && phoneClean.includes(qClean));
    return nameMatch || phoneMatch;
  });
  
  const totalOrders = clientData.reduce((sum, client) => sum + client.totalOrders, 0);
  const avgSpent = clientData.length > 0 ? (clientData.reduce((sum, c) => sum + c.totalSpent, 0) / clientData.length) : 0;

  const openWhatsApp = (phone) => {
    if (phone) {
      const sanitizedPhone = phone.replace(/\D/g, '');
      window.open(`https://wa.me/55${sanitizedPhone}`, '_blank');
    }
  };

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F7F9F8]">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#047857] mx-auto"></div>
          <p className="text-stone-600 font-semibold text-sm">Carregando base de clientes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-[#F7F9F8] min-h-screen space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho Executivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              Clientes & Atividade
            </h1>
            <Badge variant="outline" className="text-xs font-semibold bg-white text-stone-600 border-stone-300">
              {clientData.length} cadastrados
            </Badge>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            Histórico consolidado de pedidos, contato e valor acumulado (LTV)
          </p>
        </div>
      </div>

      {/* Grid Superior: 3 Cards de Indicadores */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
        <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
              Total de Clientes
            </span>
            <Users className="w-4 h-4 text-stone-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-stone-900 mt-1">
            {clientData.length}
          </p>
          <span className="text-[11px] text-stone-500 mt-0.5 block">
            Cadastrados na loja
          </span>
        </Card>

        <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
              Total de Pedidos
            </span>
            <ShoppingBag className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="text-2xl font-bold font-mono text-stone-900 mt-1">
            {totalOrders}
          </p>
          <span className="text-[11px] text-stone-500 mt-0.5 block">
            Compras concluídas
          </span>
        </Card>

        <Card className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
              Ticket Médio por Cliente
            </span>
            <DollarSign className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-stone-900 mt-1">
            {formatMoney(avgSpent)}
          </p>
          <span className="text-[11px] text-stone-500 mt-0.5 block">
            Média acumulada por cadastro
          </span>
        </Card>
      </div>

      {/* Card da Tabela de Clientes */}
      <Card className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
        <CardHeader className="bg-stone-50/60 border-b border-stone-200/80 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-bold text-stone-900">
              Base de Clientes
            </CardTitle>
            <p className="text-xs text-stone-500 mt-0.5">
              Lista auditável de clientes e canais de contato
            </p>
          </div>

          <div className="w-full sm:w-72 relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input 
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 rounded-lg border-stone-300 text-xs bg-white focus-visible:ring-stone-900"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200/80 bg-stone-50/70 text-stone-500 font-semibold uppercase text-[10px]">
                  <th className="py-2.5 px-4">Cliente</th>
                  <th className="py-2.5 px-4">WhatsApp / Contato</th>
                  <th className="py-2.5 px-4 text-center">Nº de Pedidos</th>
                  <th className="py-2.5 px-4 text-right">Gasto Total (LTV)</th>
                  <th className="py-2.5 px-4 text-right">Último Pedido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-stone-400 text-xs">
                      Nenhum cliente encontrado com os critérios de busca
                    </td>
                  </tr>
                ) : (
                  filteredClients.map(client => (
                    <tr key={client.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8 rounded-lg border border-stone-200">
                            <AvatarFallback className="bg-stone-100 text-stone-700 font-bold text-xs rounded-lg">
                              {client.full_name?.charAt(0).toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-stone-900 text-xs">{client.full_name}</p>
                            {client.email && client.email !== "-" && (
                              <p className="text-[10px] text-stone-400">{client.email}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-stone-700 text-xs">{client.phone || "-"}</span>
                          {client.phone && client.phone !== "-" && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-md cursor-pointer"
                              title="Abrir WhatsApp" 
                              onClick={() => openWhatsApp(client.phone)}
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <Badge variant="outline" className="font-mono text-[11px] font-semibold text-stone-700 bg-stone-50 border-stone-200">
                          {client.totalOrders}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-stone-900">
                        {formatMoney(client.totalSpent)}
                      </td>

                      <td className="py-3 px-4 text-right text-stone-500 font-mono text-[11px]">
                        {client.lastOrderDate ? format(client.lastOrderDate, "dd/MM/yyyy", { locale: ptBR }) : 'Nenhum'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

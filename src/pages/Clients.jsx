import React, { useState, useEffect } from "react";
import { User } from "@/entities/User";
import { Order } from "@/entities/Order";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, ShoppingCart, DollarSign, Search, MessageSquare } from "lucide-react";
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
      const RESERVED = new Set(["clients", "dashboard", "orders", "pdv", "menu", "adminlogin", "superadmin"]);
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
        // Nova loja: NUNCA herda os clientes da Vruum Burguer! Começa 100% zerada!
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

  const openWhatsApp = (phone) => {
    if (phone) {
      const sanitizedPhone = phone.replace(/\D/g, '');
      window.open(`https://wa.me/55${sanitizedPhone}`, '_blank');
    }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-600 mt-2">Visão geral dos seus clientes e atividade de compra</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total de Clientes</CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{clientData.length}</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total de Pedidos</CardTitle>
              <ShoppingCart className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{totalOrders}</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Ticket Médio por Cliente</CardTitle>
              <DollarSign className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                R$ {clientData.length > 0 ? (clientData.reduce((sum, c) => sum + c.totalSpent, 0) / clientData.length).toFixed(2).replace('.', ',') : '0,00'}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-md">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Lista de Clientes</CardTitle>
              <div className="w-full max-w-sm relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input 
                  placeholder="Buscar por nome ou WhatsApp..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>WhatsApp / Telefone</TableHead>
                  <TableHead className="text-center">Nº de Pedidos</TableHead>
                  <TableHead className="text-right">Gasto Total (LTV)</TableHead>
                  <TableHead className="text-right">Último Pedido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell></TableRow>
                ) : filteredClients.length > 0 ? (
                  filteredClients.map(client => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback className="bg-red-100 text-red-700 font-bold">
                              {client.full_name?.charAt(0).toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{client.full_name}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-stone-800 text-xs">{client.phone || "-"}</span>
                          {client.phone && client.phone !== "-" && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer"
                              title="Abrir conversa no WhatsApp" 
                              onClick={() => openWhatsApp(client.phone)}
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="font-bold">{client.totalOrders}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-black text-stone-900">
                        R$ {client.totalSpent.toFixed(2).replace('.', ',')}
                      </TableCell>
                      <TableCell className="text-right text-gray-600 text-xs">
                        {client.lastOrderDate ? format(client.lastOrderDate, "dd/MM/yyyy", { locale: ptBR }) : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Nenhum cliente encontrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
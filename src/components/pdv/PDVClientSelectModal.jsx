import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, User, Phone, X, Loader2 } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { User as UserEntity } from "@/entities/User";
import { Order } from "@/entities/Order";

export default function PDVClientSelectModal({ isOpen, onClose, onSelectClient }) {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const formatPhone = (val) => {
    if (!val || val === "-") return "";
    const raw = String(val).replace(/\D/g, "").slice(0, 11);
    if (raw.length <= 2) return raw.length > 0 ? `(${raw}` : "";
    if (raw.length <= 7) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
    return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
  };

  useEffect(() => {
    if (isOpen) {
      loadClients();
      setSearch("");
    }
  }, [isOpen]);

  const loadClients = async () => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured() && supabase) {
        const { data, error } = await supabase.rpc("get_clients_summary");
        if (!error && data && Array.isArray(data)) {
          const mapped = data
            .filter((c) => (c.phone && c.phone !== "-") || (c.full_name && c.full_name.toLowerCase() !== "balcão"))
            .map((c) => ({
              id: c.id || c.phone || c.email || String(Math.random()),
              name: c.full_name || c.customer_name || c.name || "Cliente",
              phone: formatPhone(c.phone || c.customer_phone),
              email: c.email || c.customer_email || "",
              totalOrders: Number(c.total_orders || 0),
              totalSpent: Number(c.total_spent || 0),
            }));
          setClients(mapped);
          setIsLoading(false);
          return;
        }
      }

      // Fallback
      const [usersData, ordersData] = await Promise.all([
        UserEntity.list("-created_date", 50),
        Order.list("-created_date", 100),
      ]);
      const clientMap = new Map();

      (usersData || []).filter(u => u.role !== 'admin').forEach((u) => {
        const key = (u.phone || "").replace(/\D/g, "") || u.email || u.id;
        if (key && u.phone !== "-") {
          clientMap.set(key, {
            id: u.id,
            name: u.full_name || "Cliente",
            phone: u.phone || "",
            email: u.email || "",
            totalOrders: 0,
            totalSpent: 0,
          });
        }
      });

      (ordersData || []).forEach((o) => {
        const key = (o.customer_phone || "").replace(/\D/g, "") || o.customer_email;
        if (!key || o.customer_phone === "-") return;
        const existing = clientMap.get(key) || {
          id: key,
          name: o.customer_name || "Cliente",
          phone: o.customer_phone || "",
          email: o.customer_email || "",
          totalOrders: 0,
          totalSpent: 0,
        };
        existing.totalOrders += 1;
        existing.totalSpent += Number(o.total_amount || o.total || 0);
        if ((!existing.name || existing.name === "Cliente") && o.customer_name && o.customer_name !== "Balcão") {
          existing.name = o.customer_name;
        }
        if (!existing.phone && o.customer_phone && o.customer_phone !== "-") {
          existing.phone = o.customer_phone;
        }
        clientMap.set(key, existing);
      });

      setClients(Array.from(clientMap.values()));
    } catch (err) {
      console.warn("Erro ao carregar lista de clientes no PDV:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredClients = clients.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const nameMatch = (c.name || "").toLowerCase().includes(q);
    const phoneClean = (c.phone || "").replace(/\D/g, "");
    const qClean = q.replace(/\D/g, "");
    const phoneMatch = phoneClean.includes(qClean) || (c.phone || "").includes(q);
    return nameMatch || (qClean.length > 0 && phoneMatch);
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden rounded-2xl border-stone-200">
        <DialogHeader className="p-4 bg-gray-900 text-white flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-[#D1E9DF]" />
            <DialogTitle className="text-base font-bold text-white">
              Selecionar Cliente Cadastrado
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Busca */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white border-gray-200 text-sm h-10 rounded-xl focus-visible:ring-[#047857]"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Lista de Clientes */}
        <div className="max-h-80 overflow-y-auto p-3 space-y-1.5 divide-y divide-gray-50">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#047857]" />
              <p className="text-xs font-medium">Carregando clientes...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="py-10 text-center text-gray-400 space-y-1">
              <User className="w-8 h-8 mx-auto opacity-30 mb-2" />
              <p className="text-sm font-semibold text-gray-700">Nenhum cliente encontrado</p>
              <p className="text-xs text-gray-400">
                {search ? "Tente outro nome ou número de telefone." : "Cadastre clientes através dos pedidos."}
              </p>
            </div>
          ) : (
            filteredClients.map((client) => (
              <button
                key={client.id || client.phone}
                type="button"
                onClick={() => {
                  onSelectClient(client);
                  onClose();
                }}
                className="w-full text-left p-3 rounded-xl hover:bg-[#D1E9DF]/20 hover:border-[#D1E9DF] border border-transparent transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#D1E9DF]/60 text-[#047857] font-extrabold flex items-center justify-center text-sm flex-shrink-0 transition-colors shadow-2xs">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-extrabold text-sm text-gray-900 truncate group-hover:text-[#047857] capitalize">
                      {client.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
                      {client.phone ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          <Phone className="w-3 h-3 text-emerald-600" />
                          {client.phone}
                        </span>
                      ) : (
                        <span className="text-[11px] text-stone-400 italic">Sem telefone</span>
                      )}
                      {client.totalOrders > 0 && (
                        <span className="text-[11px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md font-bold border border-stone-200">
                          {client.totalOrders} {client.totalOrders === 1 ? "pedido" : "pedidos"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right flex-shrink-0 pl-2">
                  <span className="text-xs font-bold text-[#047857] group-hover:underline flex items-center gap-1">
                    Selecionar →
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="p-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState, useEffect } from "react";
import DeliveryDriversTab from "@/components/admin/settings/DeliveryDriversTab";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default function DeliveryDriversPage() {
  const [tenantDetails, setTenantDetails] = useState(null);

  useEffect(() => {
    loadTenant();
  }, []);

  const loadTenant = async () => {
    const segments = window.location.pathname.split("/").filter(Boolean);
    const RESERVED = ["settings", "dashboard", "orders", "pdv", "menu", "adminlogin", "superadmin", "deliverydrivers", "kds"];
    const urlSlug = segments.length > 0 && !RESERVED.includes(segments[0].toLowerCase()) ? segments[0].toLowerCase() : null;
    const currentSlug = urlSlug || localStorage.getItem("current_tenant_slug");
    const activeTenantId = localStorage.getItem("current_tenant_id");

    if (isSupabaseConfigured() && supabase) {
      try {
        let tenantData = null;
        if (activeTenantId) {
          const { data } = await supabase
            .from("tenants")
            .select("*")
            .eq("id", activeTenantId)
            .maybeSingle();
          tenantData = data;
        }

        if (!tenantData && currentSlug) {
          let slugQuery = supabase.from("tenants").select("*");
          if (currentSlug === "vrumm" || currentSlug === "vruum-burguer") {
            slugQuery = slugQuery.or("slug.eq.vruum-burguer,slug.eq.vrumm,id.eq.a0000000-0000-0000-0000-000000000001");
          } else {
            slugQuery = slugQuery.eq("slug", currentSlug);
          }
          const { data } = await slugQuery.maybeSingle();
          tenantData = data;
        }

        if (!tenantData) {
          const { data } = await supabase
            .from("tenants")
            .select("*")
            .eq("id", "a0000000-0000-0000-0000-000000000001")
            .maybeSingle();
          tenantData = data;
        }

        if (tenantData) {
          setTenantDetails(tenantData);
          localStorage.setItem("current_tenant_id", tenantData.id);
          localStorage.setItem("current_tenant_slug", tenantData.slug);
          localStorage.setItem("current_tenant_name", tenantData.name);
        }
      } catch (err) {
        console.warn("[DeliveryDriversPage] Erro ao carregar dados da loja:", err);
      }
    }
  };

  return (
    <div className="p-4 sm:p-8 bg-stone-50/60 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            Entregadores & Motoboys
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Gerencie sua equipe de entregadores, taxas por comanda ou viagem e controle os acertos da noite.
          </p>
        </div>

        <DeliveryDriversTab
          tenantData={tenantDetails}
          onUpdateTenant={(updated) => setTenantDetails((prev) => ({ ...prev, ...updated }))}
        />
      </div>
    </div>
  );
}

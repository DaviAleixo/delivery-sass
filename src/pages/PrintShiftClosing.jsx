import React, { useState, useEffect } from "react";
import { Order } from "@/entities/Order";
import { Settings } from "@/entities/Settings";
import { calculateShiftClosing } from "@/utils/shiftClosingCalculator";
import ShiftClosingThermalSlip from "@/components/admin/orders/ShiftClosingThermalSlip";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default function PrintShiftClosingPage() {
  const [closingData, setClosingData] = useState(null);
  const [storeName, setStoreName] = useState("Vruum Burguer");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadClosingData();
  }, []);

  const loadClosingData = async () => {
    try {
      // 1. Tenta pegar o snapshot passado via sessionStorage
      const cached = sessionStorage.getItem("shift_closing_print_data");
      const cachedStore = sessionStorage.getItem("current_tenant_name") || localStorage.getItem("current_tenant_name") || "Vruum Burguer";
      setStoreName(cachedStore);

      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed?.summary) {
            setClosingData(parsed);
            setIsLoading(false);
            return;
          }
        } catch {}
      }

      // 2. Fallback: calcula ao vivo a partir dos pedidos e configurações
      const [settingsData, ordersData] = await Promise.all([
        Settings.list().catch(() => []),
        Order.list("-created_date", 100).catch(() => []),
      ]);

      const activeTenantId = localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";
      let drivers = [];
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data } = await supabase
            .from("tenants")
            .select("delivery_drivers, name")
            .eq("id", activeTenantId)
            .maybeSingle();
          if (data?.delivery_drivers) drivers = data.delivery_drivers;
          if (data?.name) setStoreName(data.name);
        } catch {}
      }

      const calculated = calculateShiftClosing({
        orders: Array.isArray(ordersData) ? ordersData : [],
        drivers,
        tenantSettings: settingsData?.[0] || null,
      });

      setClosingData(calculated);
    } catch (err) {
      console.error("[PrintShiftClosing] Erro ao carregar dados:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading && closingData) {
      const timer = setTimeout(() => {
        window.print();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isLoading, closingData]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-white text-stone-600 text-sm font-semibold">
        <div className="animate-pulse">Preparando cupom de fechamento de caixa...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 py-6 px-4">
      {/* Estilos Globais de Impressão Térmica 80mm & 58mm */}
      <style>{`
        @media print {
          @page {
            margin: 0 !important;
            size: auto !important;
          }
          body, html {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            background: #fff !important;
            color: #000 !important;
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
      <div className="no-print max-w-[340px] mx-auto mb-4 bg-white p-4 rounded-2xl shadow-md space-y-3 border border-stone-200">
        <div className="flex items-center justify-between text-xs font-bold text-gray-800">
          <span>Fechamento de Caixa</span>
          <span className="text-[11px] text-stone-500 font-medium">Bobina Térmica 80mm/58mm</span>
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
        className="w-full max-w-[300px] mx-auto bg-white p-4 shadow-xl border border-stone-300 rounded-lg box-border"
      >
        <ShiftClosingThermalSlip
          closingData={closingData}
          storeName={storeName}
          cashierName={localStorage.getItem("admin_user") ? JSON.parse(localStorage.getItem("admin_user") || "{}").name || "Operador" : "Operador"}
        />
      </div>
    </div>
  );
}

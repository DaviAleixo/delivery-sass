import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Receipt,
  Printer,
  Share2,
  Eye,
  Calendar,
  Clock,
  DollarSign,
  Bike,
  Sparkles,
} from "lucide-react";
import { generateWhatsAppClosingText } from "@/utils/shiftClosingWhatsAppFormatter";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import ShiftClosingModal from "@/components/admin/orders/ShiftClosingModal";

export default function ShiftClosingHistoryTable({
  closings = [],
  isLoading = false,
  storeName = "Restaurante",
}) {
  const [selectedClosing, setSelectedClosing] = useState(null);

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const handlePrint = (closing) => {
    try {
      const dataToPrint = closing.raw_closing_data || closing;
      sessionStorage.setItem(
        "shift_closing_print_data",
        JSON.stringify(dataToPrint)
      );
      sessionStorage.setItem("current_tenant_name", storeName);
      window.open(createPageUrl("PrintShiftClosing"), "_blank");
    } catch (err) {
      console.error("[ShiftClosingHistoryTable] Erro ao imprimir:", err);
      toast.error("Erro ao abrir impressão térmica.");
    }
  };

  const handleShareWhatsApp = (closing) => {
    try {
      const dataToShare = closing.raw_closing_data || closing;
      const text = generateWhatsAppClosingText(dataToShare, storeName);
      navigator.clipboard.writeText(text);
      toast.success("Resumo copiado para o WhatsApp!", {
        description: "Pronto para colar na conversa com o proprietário.",
      });
    } catch (err) {
      console.error("[ShiftClosingHistoryTable] Erro ao copiar WhatsApp:", err);
      toast.error("Erro ao copiar resumo.");
    }
  };

  return (
    <>
      <Card className="border-0 shadow-md overflow-hidden bg-white">
        <CardHeader className="bg-stone-50 border-b border-stone-100 pb-3 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-stone-900">
                Histórico de Caixas Fechados
              </CardTitle>
              <p className="text-xs text-stone-500">
                Livro-caixa digital dos turnos e expedientes encerrados
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs font-bold bg-white">
            {closings.length} {closings.length === 1 ? "fechamento" : "fechamentos"}
          </Badge>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-stone-400 text-xs font-medium">
              Carregando histórico de fechamentos...
            </div>
          ) : closings.length === 0 ? (
            <div className="py-12 px-4 flex flex-col items-center justify-center text-center text-stone-400 gap-2">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center">
                <Receipt className="w-6 h-6 stroke-1" />
              </div>
              <p className="text-sm font-bold text-stone-700">
                Nenhum fechamento salvo no período
              </p>
              <p className="text-xs text-stone-400 max-w-sm">
                Ao encerrar o expediente ou fechar a loja, abra o Fechamento de Caixa e clique em <b>"Salvar Fechamento"</b> para registrar neste histórico.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-stone-100/70 text-stone-600 uppercase text-[11px] font-bold border-b border-stone-200">
                  <tr>
                    <th className="py-3 px-4">Data / Turno</th>
                    <th className="py-3 px-4 text-center">Pedidos</th>
                    <th className="py-3 px-4 text-right">Faturamento</th>
                    <th className="py-3 px-4 text-right">Gaveta (Dinheiro)</th>
                    <th className="py-3 px-4 text-center">Entregadores</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-white font-medium">
                  {closings.map((c, idx) => {
                    const raw = c.raw_closing_data || {};
                    const driversCount = Array.isArray(c.driver_settlements)
                      ? c.driver_settlements.length
                      : 0;

                    return (
                      <tr key={c.id || idx} className="hover:bg-stone-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <div>
                              <span className="font-bold text-stone-900 block">
                                {c.period_label || c.shift_date}
                              </span>
                              <span className="text-[11px] text-stone-400">
                                Fechado em: {new Date(c.closed_at || c.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-bold text-stone-800">{c.total_orders}</span>
                          <span className="text-[10px] text-stone-400 block">
                            {c.delivery_orders} deliv • {c.counter_orders} balc
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-stone-900">
                          {formatMoney(c.gross_revenue)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-700">
                          {formatMoney(c.cash_drawer?.totalCashExpected || 0)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {driversCount > 0 ? (
                            <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 border-orange-200 text-[10px] font-bold">
                              <Bike className="w-3 h-3 mr-1 text-orange-600" />
                              {driversCount} motoboys
                            </Badge>
                          ) : (
                            <span className="text-stone-400 text-xs">Sem entregadores</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedClosing(raw)}
                              className="p-1.5 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
                              title="Visualizar Raio-X Completo"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrint(c)}
                              className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Reimprimir Cupom Térmico (80mm/58mm)"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleShareWhatsApp(c)}
                              className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                              title="Reenviar Resumo no WhatsApp"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal em Modo Somente-Leitura ao Clicar em Visualizar */}
      {selectedClosing && (
        <ShiftClosingModal
          isOpen={Boolean(selectedClosing)}
          onClose={() => setSelectedClosing(null)}
          closingData={selectedClosing}
          storeName={storeName}
          readOnly={true}
        />
      )}
    </>
  );
}

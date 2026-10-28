import React, { useState } from "react";
import { 
  Printer, 
  ChevronDown, 
  Settings, 
  Zap, 
  Check, 
  RefreshCw, 
  AlertCircle 
} from "lucide-react";
import { useFifoPrintQueue } from "@/hooks/useFifoPrintQueue";
import SpoolerManagerModal from "@/components/admin/SpoolerManagerModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function PrinterNavbarControl() {
  const {
    isSpoolerOnline,
    spoolerConfig,
    autoPrintEnabled,
    setAutoPrintEnabled,
    testSpoolerPrint,
    queue,
  } = useFifoPrintQueue();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const handleToggleAutoPrint = (checked) => {
    setAutoPrintEnabled(checked);
    if (checked) {
      toast.success("🖨️ Auto-impressão ATIVADA: Novos pedidos serão impressos automaticamente!");
    } else {
      toast.info("Auto-impressão DESATIVADA: Impressão somente manual.");
    }
  };

  const handleTestPrint = async (e) => {
    e.stopPropagation();
    if (!testSpoolerPrint) return;
    setIsTesting(true);
    try {
      await testSpoolerPrint();
    } finally {
      setIsTesting(false);
    }
  };

  // Cores e estilos do botão da Navbar
  let pillStyle = "bg-white border-gray-200 text-gray-700 hover:bg-gray-50";
  let statusText = "Impressora Offline";
  let badgeText = "Navegador";
  let badgeStyle = "bg-amber-50 text-amber-700 border-amber-200";
  let dotColor = "bg-amber-400";

  if (isSpoolerOnline) {
    if (autoPrintEnabled) {
      pillStyle = "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100";
      statusText = "Auto-Imprimir";
      badgeText = "ON";
      badgeStyle = "bg-emerald-600 text-white border-emerald-600";
      dotColor = "bg-emerald-500 animate-pulse";
    } else {
      pillStyle = "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100";
      statusText = "Impressora Pronta";
      badgeText = "Manual";
      badgeStyle = "bg-blue-100 text-blue-700 border-blue-200";
      dotColor = "bg-blue-500";
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`${pillStyle} border rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-2 shadow-2xs transition-all cursor-pointer select-none outline-none focus:ring-2 focus:ring-emerald-500/20`}
            title={`Status da Impressão: ${isSpoolerOnline ? "Spooler Windows Conectado" : "Modo Navegador"}. Auto-Imprimir: ${autoPrintEnabled ? "ATIVO" : "DESLIGADO"}. Clique para opções.`}
          >
            <Printer className={`w-3.5 h-3.5 ${isSpoolerOnline ? (autoPrintEnabled ? "text-emerald-700" : "text-blue-700") : "text-gray-400"}`} />
            <span className={`w-2 h-2 rounded-full ${dotColor}`} />
            <span className="font-bold hidden sm:inline">{statusText}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border hidden sm:inline ${badgeStyle}`}>
              {badgeText}
            </span>
            {queue?.length > 0 && (
              <span className="bg-amber-500 text-stone-950 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {queue.length}
              </span>
            )}
            <ChevronDown className="w-3 h-3 text-gray-400 ml-0.5" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-72 p-2.5 bg-white rounded-2xl border border-gray-150 shadow-xl space-y-2 z-50">
          {/* Card de Status da Conexão */}
          <div className={`p-3 rounded-xl border ${isSpoolerOnline ? "bg-emerald-50/70 border-emerald-150" : "bg-gray-50 border-gray-200"}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Conexão Local
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5 ${
                isSpoolerOnline 
                  ? "bg-emerald-100 text-emerald-800" 
                  : "bg-gray-200 text-gray-700"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isSpoolerOnline ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`} />
                {isSpoolerOnline ? "Spooler Online" : "Modo Navegador"}
              </span>
            </div>
            <p className="text-xs font-black text-gray-900 truncate">
              {isSpoolerOnline ? (spoolerConfig?.selectedPrinter || "Impressora Térmica Conectada") : "Janela de Impressão Padrão"}
            </p>
            {isSpoolerOnline && spoolerConfig?.paperWidth && (
              <span className="text-[10px] text-gray-500 font-mono mt-0.5 block">
                Bobina: {spoolerConfig.paperWidth}
              </span>
            )}
          </div>

          {/* Toggle de Auto-Impressão */}
          <div className="p-3 bg-gray-50 hover:bg-gray-100/70 transition-colors rounded-xl border border-gray-200 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Zap className={`w-3.5 h-3.5 ${autoPrintEnabled ? "text-amber-500" : "text-gray-400"}`} />
                <span className="text-xs font-bold text-gray-900">Auto-Imprimir</span>
              </div>
              <p className="text-[11px] text-gray-500 leading-tight">
                Imprime comanda na hora que o pedido chega
              </p>
            </div>
            <Switch
              checked={autoPrintEnabled}
              onCheckedChange={handleToggleAutoPrint}
              className="data-[state=checked]:bg-[#047857]"
            />
          </div>

          <DropdownMenuSeparator className="bg-gray-100 my-1" />

          {/* Testar Impressão (se online) */}
          {isSpoolerOnline && (
            <DropdownMenuItem
              onClick={handleTestPrint}
              disabled={isTesting}
              className="cursor-pointer text-xs font-bold p-2.5 rounded-xl flex items-center justify-between text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Printer className={`w-3.5 h-3.5 ${isTesting ? "animate-pulse text-emerald-600" : "text-gray-500"}`} />
                {isTesting ? "Enviando teste..." : "Emitir Cupom Teste (1s)"}
              </span>
              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                80/58mm
              </span>
            </DropdownMenuItem>
          )}

          {/* Gerenciar Impressora / Download do .exe */}
          <DropdownMenuItem
            onClick={() => setIsModalOpen(true)}
            className="cursor-pointer text-xs font-bold p-2.5 rounded-xl flex items-center justify-between text-[#047857] hover:bg-emerald-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Settings className="w-3.5 h-3.5" />
              {isSpoolerOnline ? "Configurar Impressora" : "Como Ativar Spooler (.exe)"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 -rotate-90 text-emerald-600" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modal Completo de Configuração / Download do Spooler */}
      <SpoolerManagerModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </>
  );
}

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Printer, 
  AlertCircle, 
  RefreshCw, 
  Check, 
  Zap, 
  Download
} from "lucide-react";
import { toast } from "sonner";
import { useFifoPrintQueue } from "@/hooks/useFifoPrintQueue";

export default function SpoolerManagerModal({
  open: propOpen,
  onOpenChange: propOnOpenChange,
  isSpoolerOnline: propIsSpoolerOnline,
  spoolerConfig: propSpoolerConfig,
  checkSpooler: propCheckSpooler,
  testSpoolerPrint: propTestSpoolerPrint,
  fetchSpoolerPrinters: propFetchSpoolerPrinters,
  saveSpoolerConfig: propSaveSpoolerConfig,
  trigger,
}) {
  const queueCtx = useFifoPrintQueue();

  const isSpoolerOnline = propIsSpoolerOnline !== undefined ? propIsSpoolerOnline : queueCtx?.isSpoolerOnline;
  const spoolerConfig = propSpoolerConfig !== undefined ? propSpoolerConfig : queueCtx?.spoolerConfig;
  const checkSpooler = propCheckSpooler || queueCtx?.checkSpooler;
  const testSpoolerPrint = propTestSpoolerPrint || queueCtx?.testSpoolerPrint;
  const fetchSpoolerPrinters = propFetchSpoolerPrinters || queueCtx?.fetchSpoolerPrinters;
  const saveSpoolerConfig = propSaveSpoolerConfig || queueCtx?.saveSpoolerConfig;

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = propOpen !== undefined;
  const open = isControlled ? propOpen : internalOpen;
  const setOpen = isControlled ? propOnOpenChange : setInternalOpen;
  const [printersList, setPrintersList] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [paperWidth, setPaperWidth] = useState("80mm");
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Carrega a lista de impressoras e dados do spooler ao abrir
  useEffect(() => {
    if (open && isSpoolerOnline) {
      loadPrinters();
    }
  }, [open, isSpoolerOnline]);

  useEffect(() => {
    if (spoolerConfig) {
      if (spoolerConfig.selectedPrinter) {
        setSelectedPrinter(spoolerConfig.selectedPrinter);
      }
      if (spoolerConfig.paperWidth) {
        setPaperWidth(spoolerConfig.paperWidth);
      }
    }
  }, [spoolerConfig]);

  const loadPrinters = async () => {
    if (!fetchSpoolerPrinters) return;
    setIsLoadingPrinters(true);
    try {
      const data = await fetchSpoolerPrinters();
      if (data && Array.isArray(data.printers)) {
        setPrintersList(data.printers);
        if (!selectedPrinter) {
          setSelectedPrinter(data.selectedPrinter || data.defaultPrinter || "");
        }
        if (data.paperWidth) {
          setPaperWidth(data.paperWidth);
        }
      }
    } catch (_err) {
      console.error("Erro ao carregar impressoras:", _err);
    } finally {
      setIsLoadingPrinters(false);
    }
  };

  const handleTestPrint = async () => {
    if (!testSpoolerPrint) return;
    setIsTesting(true);
    try {
      await testSpoolerPrint();
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!saveSpoolerConfig) return;
    setIsSaving(true);
    try {
      const ok = await saveSpoolerConfig({
        selectedPrinter,
        paperWidth,
      });
      if (ok) {
        setOpen(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualCheck = async () => {
    if (!checkSpooler) return;
    setIsChecking(true);
    try {
      const res = await checkSpooler();
      if (res) {
        toast.success("🟢 Spooler conectado com sucesso!");
        loadPrinters();
      } else {
        toast.error("O executável do spooler ainda não foi detectado em 127.0.0.1:9100");
      }
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-md p-6 bg-white rounded-3xl border border-gray-100 shadow-2xl">
        <DialogHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#047857] flex items-center justify-center border border-emerald-100">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black text-gray-950">
                  Impressão Automática (.exe)
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-500">
                  PedeMuleke Spooler Silencioso para Windows
                </DialogDescription>
              </div>
            </div>

            {/* Status Badge */}
            {isSpoolerOnline ? (
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-bold px-2.5 py-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Online
              </Badge>
            ) : (
              <Badge className="bg-stone-100 text-stone-600 border-stone-200 text-xs font-bold px-2.5 py-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-stone-400" />
                Modo Navegador
              </Badge>
            )}
          </div>
        </DialogHeader>

        {isSpoolerOnline ? (
          /* CONTEÚDO QUANDO O SPOOLER ESTÁ ATIVO */
          <div className="space-y-5 pt-2">
            {/* Banner de Funcionamento */}
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-3.5 flex items-start gap-3">
              <Zap className="w-4 h-4 text-[#047857] shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-950 space-y-0.5">
                <p className="font-bold">Zero Diálogos ou Popups do Navegador</p>
                <p className="text-emerald-800 text-[11px] leading-relaxed">
                  Os pedidos são despachados diretamente ao driver da sua impressora térmica via porta local <code className="bg-white/80 px-1 py-0.2 rounded font-mono text-emerald-900">127.0.0.1:9100</code>.
                </p>
              </div>
            </div>

            {/* Seleção de Impressora */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                <label htmlFor="printer-select">Impressora Térmica do Windows</label>
                <button
                  type="button"
                  onClick={loadPrinters}
                  disabled={isLoadingPrinters}
                  className="text-[#047857] hover:underline flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingPrinters ? "animate-spin" : ""}`} />
                  Atualizar
                </button>
              </div>

              <select
                id="printer-select"
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-xl p-2.5 focus:bg-white focus:border-[#047857] outline-none font-medium cursor-pointer"
              >
                {printersList.length === 0 && (
                  <option value="">Impressora Padrão do Windows</option>
                )}
                {printersList.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.isDefault ? "(Padrão)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Largura da Bobina */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 block">
                Largura da Bobina Térmica
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaperWidth("80mm")}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    paperWidth === "80mm"
                      ? "border-[#047857] bg-emerald-50/50 text-[#047857] font-bold shadow-2xs"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 font-medium"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Bobina 80mm</span>
                    {paperWidth === "80mm" && <Check className="w-3.5 h-3.5 text-[#047857]" />}
                  </div>
                  <span className="text-[10px] text-gray-500 block mt-0.5 font-normal">
                    Padrão largo (Cozinha/KDS)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaperWidth("58mm")}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    paperWidth === "58mm"
                      ? "border-[#047857] bg-emerald-50/50 text-[#047857] font-bold shadow-2xs"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 font-medium"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Bobina 58mm</span>
                    {paperWidth === "58mm" && <Check className="w-3.5 h-3.5 text-[#047857]" />}
                  </div>
                  <span className="text-[10px] text-gray-500 block mt-0.5 font-normal">
                    Padrão estreito (Mini POS)
                  </span>
                </button>
              </div>
            </div>

            {/* Ações: Teste de Impressão e Salvar */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestPrint}
                disabled={isTesting}
                className="flex-1 text-xs h-10 rounded-xl border-gray-200 hover:bg-gray-50 text-gray-700 font-bold"
              >
                <Printer className={`w-3.5 h-3.5 mr-1.5 ${isTesting ? "animate-pulse" : ""}`} />
                {isTesting ? "Imprimindo..." : "Testar Impressão"}
              </Button>

              <Button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSaving}
                className="flex-1 text-xs h-10 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white font-bold"
              >
                {isSaving ? "Salvando..." : "Salvar Configuração"}
              </Button>
            </div>
          </div>
        ) : (
          /* CONTEÚDO QUANDO O SPOOLER ESTÁ OFFLINE */
          <div className="space-y-4 pt-2">
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 space-y-1">
                <p className="font-bold">Modo Navegador em Execução</p>
                <p className="text-amber-800 text-[11px] leading-relaxed">
                  Suas impressões continuam funcionando normalmente através da janela do navegador. Para imprimir <strong>sem popup</strong>, execute o Spooler (.exe) nesta máquina.
                </p>
              </div>
            </div>

            {/* Passo a Passo para Iniciar */}
            <div className="space-y-2.5">
              <p className="text-xs font-bold text-gray-800">Como ativar a impressão silenciosa:</p>
              
              <div className="space-y-2 text-xs">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    1
                  </span>
                  <div className="text-gray-700 space-y-1.5 flex-1">
                    <p className="font-bold">Baixe ou acesse o aplicativo</p>
                    <p className="text-[11px] text-gray-500">
                      Baixe o pacote para este computador do caixa ou acesse a pasta <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-800 font-mono text-[10px]">desktop-spooler</code>.
                    </p>
                    <a
                      href="https://pub-90fee729d11445a3b3a6aa0958f66fc8.r2.dev/downloads/pedemuleke-spooler.zip"
                      download="pedemuleke-spooler.zip"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#047857] hover:bg-[#065f46] text-white text-xs font-bold rounded-lg transition-colors shadow-2xs mt-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar PedeMuleke Spooler (.zip)
                    </a>
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    2
                  </span>
                  <div className="text-gray-700">
                    <p className="font-bold">Execute o Aplicativo</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Extraia o arquivo e dê dois cliques em <strong className="text-gray-900">pedemuleke-spooler.exe</strong>. Uma janela do console exibirá <strong className="text-emerald-700">STATUS: ONLINE 🟢</strong>.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    3
                  </span>
                  <div className="text-gray-700">
                    <p className="font-bold">Reconhecimento Instantâneo</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      O painel web reconhece na hora! O botão no topo ficará <strong className="text-emerald-700">🟢 Impressora Pronta</strong> e todos os novos pedidos imprimirão sem confirmação.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Botão de Verificação Manual */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="text-xs h-10 px-4 rounded-xl border-gray-200 text-gray-600 hover:text-gray-900"
              >
                Continuar no Navegador
              </Button>

              <Button
                type="button"
                onClick={handleManualCheck}
                disabled={isChecking}
                className="flex-1 text-xs h-10 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white font-bold flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? "animate-spin" : ""}`} />
                {isChecking ? "Verificando..." : "Verificar Conexão Agora"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

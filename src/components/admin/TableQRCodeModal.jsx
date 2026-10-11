import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QrCode, Printer } from "lucide-react";

export default function TableQRCodeModal({ settings }) {
  const [isOpen, setIsOpen] = useState(false);
  const [tableCount, setTableCount] = useState(10);
  const [customTables, setCustomTables] = useState("");
  const [selectedMesa, setSelectedMesa] = useState("1");

  const getTablesList = () => {
    if (customTables.trim()) {
      return customTables
        .split(",")
        .map(t => t.trim())
        .filter(Boolean);
    }
    const list = [];
    const count = Math.min(Math.max(1, Number(tableCount) || 1), 50);
    for (let i = 1; i <= count; i++) {
      list.push(String(i).padStart(2, "0"));
    }
    return list;
  };

  const tables = getTablesList();
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const activeSlug = (typeof window !== "undefined" ? localStorage.getItem("current_tenant_slug") : null) || "vrumm";

  const handlePrint = () => {
    const printContent = document.getElementById("table-qr-print-area");
    if (!printContent) return;

    const printWindow = window.open("", "_blank", "width=850,height=900");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Plaquinhas de Mesa com QR Code - ${settings?.restaurant_name || "Delivery 1.0"}</title>
          <style>
            @page {
              size: A4;
              margin: 10mm;
            }
            * { box-sizing: border-box; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
            body { margin: 0; padding: 10px; background: white; color: #111; }
            .grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 20px;
              page-break-inside: auto;
            }
            .card {
              border: 3px solid #1c1917;
              border-radius: 24px;
              padding: 24px 20px;
              text-align: center;
              background: #fff;
              page-break-inside: avoid;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              min-height: 380px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            }
            .brand-name {
              font-size: 20px;
              font-weight: 900;
              color: #dc2626;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 4px;
            }
            .table-badge {
              background: #1c1917;
              color: #ffffff;
              font-size: 26px;
              font-weight: 900;
              padding: 6px 24px;
              border-radius: 9999px;
              margin: 8px 0 16px 0;
              letter-spacing: 1px;
            }
            .qr-wrapper {
              padding: 12px;
              border: 2px dashed #e5e7eb;
              border-radius: 20px;
              background: #fafaf9;
              display: inline-block;
              margin-bottom: 12px;
            }
            .instruction {
              font-size: 13px;
              font-weight: 700;
              color: #292524;
              margin-top: 8px;
            }
            .sub-instruction {
              font-size: 11px;
              color: #78716c;
              margin-top: 2px;
            }
          </style>
        </head>
        <body>
          <div class="grid">
            ${printContent.innerHTML}
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 rounded-xl text-xs font-bold border-stone-300 hover:bg-stone-100 shadow-sm">
          <QrCode className="w-4 h-4 text-red-600" />
          <span>QR Code das Mesas</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-stone-900">
            <QrCode className="w-5 h-5 text-red-600" />
            <span>Gerador de Plaquinhas QR Code para Mesas</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          <p className="text-xs sm:text-sm text-stone-600">
            Imprima as plaquinhas para colocar nas mesas do seu salão. Quando o cliente apontar a câmera do celular, o cardápio abrirá automaticamente com o número da mesa já preenchido!
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-200">
            <div>
              <Label className="text-xs font-bold text-stone-700">Quantidade de Mesas Numéricas</Label>
              <Input
                type="number"
                min="1"
                max="50"
                value={tableCount}
                onChange={(e) => {
                  setTableCount(e.target.value);
                  setCustomTables("");
                }}
                className="mt-1 bg-white rounded-xl text-sm"
                placeholder="Ex: 10"
              />
              <span className="text-[11px] text-stone-500 mt-1 block">Gera Mesas de 01 até {tableCount || 1}</span>
            </div>

            <div>
              <Label className="text-xs font-bold text-stone-700">Ou Mesas Especiais / Personalizadas</Label>
              <Input
                type="text"
                value={customTables}
                onChange={(e) => setCustomTables(e.target.value)}
                className="mt-1 bg-white rounded-xl text-sm"
                placeholder="Ex: 01, 02, 03, Varanda 1, Deck"
              />
              <span className="text-[11px] text-stone-500 mt-1 block">Separadas por vírgula</span>
            </div>
          </div>

          {/* Prévia Interativa */}
          <div className="border border-stone-200 rounded-3xl p-5 bg-stone-100 flex flex-col items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">Prévia da Plaquinha</span>
            
            <div className="bg-white border-2 border-stone-900 rounded-2xl p-6 text-center shadow-xl w-full max-w-xs flex flex-col items-center">
              <span className="text-base font-black text-red-600 tracking-wide uppercase">
                {settings?.restaurant_name || "Delivery 1.0"}
              </span>
              
              <div className="bg-stone-900 text-white font-black text-xl px-5 py-1 rounded-full my-2">
                MESA {selectedMesa}
              </div>

              <div className="p-3 bg-stone-50 border-2 border-dashed border-stone-300 rounded-2xl my-2">
                <QRCodeSVG
                  value={`${baseUrl}/${activeSlug}/menu?mesa=${encodeURIComponent(selectedMesa)}`}
                  size={150}
                  level="H"
                  includeMargin={true}
                />
              </div>

              <p className="text-xs font-bold text-stone-800 mt-1">
                Aponte a câmera para ver o cardápio
              </p>
              <p className="text-[10px] text-stone-500">
                Faça seu pedido direto pelo celular!
              </p>
            </div>

            {/* Seletor de mesa para prévia */}
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-3 mt-2 scrollbar-hide">
              {tables.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedMesa(t)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                    selectedMesa === t 
                      ? "bg-red-600 text-white shadow-md scale-105" 
                      : "bg-white text-stone-700 hover:bg-stone-200 border border-stone-300"
                  }`}
                >
                  Mesa {t}
                </button>
              ))}
            </div>
          </div>

          {/* Botão de Impressão */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsOpen(false)}
              className="rounded-xl"
            >
              Fechar
            </Button>
            <Button
              type="button"
              onClick={handlePrint}
              className="bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl gap-2 shadow-lg shadow-red-950/20"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir {tables.length} Plaquinhas</span>
            </Button>
          </div>

          {/* Elemento oculto com o grid completo para impressão */}
          <div id="table-qr-print-area" style={{ display: "none" }}>
            {tables.map(tableNum => (
              <div key={tableNum} className="card">
                <div className="brand-name">{settings?.restaurant_name || "Delivery 1.0"}</div>
                <div className="table-badge">MESA {tableNum}</div>
                <div className="qr-wrapper">
                  <QRCodeSVG
                    value={`${baseUrl}/${activeSlug}/menu?mesa=${encodeURIComponent(tableNum)}`}
                    size={170}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <div className="instruction">Aponte a câmera do celular para pedir</div>
                <div className="sub-instruction">Cardápio digital direto no seu smartphone</div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

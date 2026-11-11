import React, { useState, useEffect, useCallback } from "react";
import { ProductionSector } from "@/entities/ProductionSector";
import { getActiveTenantId } from "@/entities/storage";
import { useFifoPrintQueue } from "@/hooks/useFifoPrintQueue";
import { slugifySector, buildSectorKdsLinks } from "@/utils/sectorUtils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Printer,
  Tv,
  Copy,
  ExternalLink,
  Edit,
  Trash2,
  RefreshCw,
  Check,
  Layers,
  Sparkles,
  Flame,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const OPERATION_MODE_LABELS = {
  kds_and_print: { label: "KDS + Impressora", badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  kds_only: { label: "Somente KDS (Tela)", badgeClass: "bg-sky-50 text-sky-800 border-sky-200" },
  print_only: { label: "Somente Impressora", badgeClass: "bg-amber-50 text-amber-800 border-amber-200" },
};

const CONTENT_MODE_LABELS = {
  production_only: {
    label: "Só Comanda de Preparo",
    desc: "Imprime apenas os itens deste setor + observações (sem preços/endereço).",
  },
  full_ticket: {
    label: "Cupom Completo",
    desc: "Imprime todos os itens do pedido, valores, entrega e pagamento (ideal para Caixa/Motoboy).",
  },
  short_receipt: {
    label: "Senha Curta (Totem / Balcão)",
    desc: "Cupom enxuto com número da senha, itens, valor e pagamento (sem endereço).",
  },
};

const CHANNEL_OPTIONS = [
  { id: "delivery", label: "Delivery" },
  { id: "pickup", label: "Balcão / Retirada" },
  { id: "dine_in", label: "Mesa / Salão" },
];

const EMPTY_FORM = {
  name: "",
  operation_mode: "kds_and_print",
  content_mode: "production_only",
  printer_type: "thermal_raw",
  printer_name: "",
  paper_width: "80mm",
  copies: 1,
  allowed_channels: ["delivery", "pickup", "dine_in"],
  print_on_delivery: "on_arrival",
  is_active: true,
};

export default function ProductionSectorsTab({ storeSlug }) {
  const { isSpoolerOnline, fetchSpoolerPrinters, checkSpooler } = useFifoPrintQueue() || {};
  const [sectors, setSectors] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingPrinters, setIsFetchingPrinters] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSector, setEditingSector] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadSectors = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await ProductionSector.list("order_index");
      const sorted = Array.isArray(list)
        ? [...list].sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0))
        : [];
      setSectors(sorted);
    } catch (err) {
      console.error("Erro ao carregar setores de produção:", err);
      toast.error("Não foi possível carregar os setores.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshPrinters = useCallback(async () => {
    if (!fetchSpoolerPrinters) return;
    setIsFetchingPrinters(true);
    try {
      await checkSpooler?.();
      const data = await fetchSpoolerPrinters();
      if (Array.isArray(data)) {
        setPrinters(data);
      }
    } catch (_err) {
      // Silencioso caso Spooler não esteja rodando neste computador
    } finally {
      setIsFetchingPrinters(false);
    }
  }, [fetchSpoolerPrinters, checkSpooler]);

  useEffect(() => {
    loadSectors();
    refreshPrinters();
  }, [loadSectors, refreshPrinters]);

  const openCreateModal = () => {
    setEditingSector(null);
    setForm(EMPTY_FORM);
    refreshPrinters();
    setIsModalOpen(true);
  };

  const openEditModal = (sector) => {
    setEditingSector(sector);
    setForm({
      name: sector.name || "",
      operation_mode: sector.operation_mode || "kds_and_print",
      content_mode: sector.content_mode || "production_only",
      printer_type: sector.printer_type || "thermal_raw",
      printer_name: sector.printer_name || "",
      paper_width: sector.paper_width || "80mm",
      copies: Number(sector.copies) || 1,
      allowed_channels:
        Array.isArray(sector.allowed_channels) && sector.allowed_channels.length > 0
          ? sector.allowed_channels
          : ["delivery", "pickup", "dine_in"],
      print_on_delivery: sector.print_on_delivery || "on_arrival",
      is_active: sector.is_active !== false,
    });
    refreshPrinters();
    setIsModalOpen(true);
  };

  const toggleFormChannel = (channelId) => {
    setForm((prev) => {
      const current = Array.isArray(prev.allowed_channels) ? prev.allowed_channels : [];
      if (current.includes(channelId)) {
        if (current.length <= 1) {
          toast.info("Deixe pelo menos 1 canal selecionado.");
          return prev;
        }
        return { ...prev, allowed_channels: current.filter((c) => c !== channelId) };
      }
      return { ...prev, allowed_channels: [...current, channelId] };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const cleanName = form.name.trim();
    if (!cleanName) {
      toast.error("Informe o nome do setor (ex: Cozinha, Bar, Caixa).");
      return;
    }

    setIsSaving(true);
    try {
      const baseSlug = slugifySector(cleanName);
      const duplicateSlug = sectors.some(
        (s) =>
          s.slug === baseSlug &&
          (!editingSector || String(s.id) !== String(editingSector.id))
      );
      const uniqueSlug = duplicateSlug ? `${baseSlug}-${Date.now().toString().slice(-4)}` : baseSlug;

      const usesPrinter = form.operation_mode !== "kds_only";
      const isA4 = usesPrinter && form.printer_type === "a4_browser";

      const payload = {
        tenant_id: getActiveTenantId(),
        name: cleanName,
        slug: editingSector ? (editingSector.name === cleanName ? editingSector.slug : uniqueSlug) : uniqueSlug,
        operation_mode: form.operation_mode,
        content_mode: form.content_mode,
        printer_type: usesPrinter ? form.printer_type : "thermal_raw",
        printer_name: usesPrinter && !isA4 ? (form.printer_name.trim() || null) : null,
        paper_width: isA4 ? "a4" : (form.paper_width === "58mm" ? "58mm" : "80mm"),
        copies: Math.max(1, Math.min(5, parseInt(form.copies, 10) || 1)),
        allowed_channels:
          Array.isArray(form.allowed_channels) && form.allowed_channels.length > 0
            ? form.allowed_channels
            : ["delivery", "pickup", "dine_in"],
        print_on_delivery: form.print_on_delivery || "on_arrival",
        is_active: Boolean(form.is_active),
        order_index: editingSector
          ? (Number(editingSector.order_index) || 0)
          : (sectors.length > 0 ? Math.max(...sectors.map((s) => Number(s.order_index) || 0)) + 1 : 1),
      };

      if (editingSector) {
        await ProductionSector.update(editingSector.id, payload);
        toast.success(`Setor "${cleanName}" atualizado!`);
      } else {
        await ProductionSector.create(payload);
        toast.success(`Setor "${cleanName}" criado!`);
      }

      setIsModalOpen(false);
      await loadSectors();
    } catch (err) {
      console.error("Erro ao salvar setor:", err);
      toast.error("Erro ao salvar setor de produção.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (sector) => {
    if (!confirm(`Excluir o setor "${sector.name}"? Categorias e produtos ligados a ele ficarão sem setor específico.`)) {
      return;
    }
    try {
      await ProductionSector.delete(sector.id);
      toast.success(`Setor "${sector.name}" excluído.`);
      await loadSectors();
    } catch (err) {
      console.error("Erro ao excluir setor:", err);
      toast.error("Não foi possível excluir este setor.");
    }
  };

  const handleCreateStarterPack = async () => {
    const activeTenantId = getActiveTenantId();
    if (!activeTenantId) return;

    setIsSaving(true);
    try {
      const presets = [
        {
          tenant_id: activeTenantId,
          name: "Cozinha",
          slug: "cozinha",
          operation_mode: "kds_and_print",
          content_mode: "production_only",
          printer_type: "thermal_raw",
          paper_width: "80mm",
          copies: 1,
          allowed_channels: ["delivery", "pickup", "dine_in"],
          print_on_delivery: "on_arrival",
          order_index: 1,
          is_active: true,
        },
        {
          tenant_id: activeTenantId,
          name: "Bar / Bebidas",
          slug: "bar",
          operation_mode: "kds_and_print",
          content_mode: "production_only",
          printer_type: "thermal_raw",
          paper_width: "80mm",
          copies: 1,
          allowed_channels: ["delivery", "pickup", "dine_in"],
          print_on_delivery: "on_arrival",
          order_index: 2,
          is_active: true,
        },
        {
          tenant_id: activeTenantId,
          name: "Caixa / Expedição",
          slug: "caixa",
          operation_mode: "print_only",
          content_mode: "full_ticket",
          printer_type: "thermal_raw",
          paper_width: "80mm",
          copies: 1,
          allowed_channels: ["delivery"],
          print_on_delivery: "on_accept",
          order_index: 3,
          is_active: true,
        },
      ];

      for (const preset of presets) {
        await ProductionSector.create(preset);
      }

      toast.success("Setores iniciais criados (Cozinha, Bar e Caixa)! Vincule suas categorias agora.");
      await loadSectors();
    } catch (err) {
      console.error("Erro ao criar modelo inicial:", err);
      toast.error("Erro ao criar setores iniciais.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyKdsLink = async (sector) => {
    const { absoluteUrl } = buildSectorKdsLinks(storeSlug, sector, { kiosk: true });
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopiedId(sector.id);
      toast.success(`Link da TV/Tablet "${sector.name}" copiado!`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.info(absoluteUrl);
    }
  };

  const handleOpenKdsLink = (sector) => {
    const { relativePath } = buildSectorKdsLinks(storeSlug, sector, { kiosk: true });
    window.open(relativePath, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho e Explicação do Fluxo */}
      <Card className="border-stone-200 bg-white shadow-2xs rounded-2xl">
        <CardContent className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-[#047857] flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-stone-900 tracking-tight">
                Setores de Produção & Impressoras por Área
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
              Crie quantos setores precisar (ex: <strong>Cozinha</strong>, <strong>Bar</strong>, <strong>Pizzaria</strong>, <strong>Caixa</strong>),
              escolha se cada um usa <strong>KDS, Impressora ou Ambos</strong>, e vincule nas{" "}
              <Link to={createPageUrl("Categories", storeSlug)} className="text-[#047857] font-bold underline">
                Categorias
              </Link>{" "}
              ou{" "}
              <Link to={createPageUrl("Products", storeSlug)} className="text-[#047857] font-bold underline">
                Produtos
              </Link>
              . Sem setores configurados, o sistema continua no modo padrão (1 cupom completo e KDS geral).
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Badge
              variant="outline"
              className={
                isSpoolerOnline
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200 text-xs py-1 px-2.5"
                  : "bg-stone-100 text-stone-600 border-stone-200 text-xs py-1 px-2.5"
              }
            >
              {isSpoolerOnline ? "🟢 Spooler Conectado" : "⚪ Spooler Offline neste PC"}
            </Badge>

            <Button
              type="button"
              onClick={openCreateModal}
              className="bg-[#047857] hover:bg-[#065f46] text-white font-bold text-xs h-9 px-4 rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Novo Setor
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Estado Vazio com Atalho Rápido */}
      {isLoading ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-sm text-stone-500">
          Carregando setores de produção...
        </div>
      ) : sectors.length === 0 ? (
        <Card className="border-dashed border-2 border-stone-300 bg-stone-50/60 rounded-2xl">
          <CardContent className="p-8 text-center space-y-4 max-w-xl mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-[#047857] flex items-center justify-center mx-auto">
              <Flame className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-stone-900">
                Operando no Modo Simples (Sem Setores Separados)
              </h3>
              <p className="text-xs sm:text-sm text-stone-600">
                Todos os pedidos imprimem por inteiro na impressora padrão e aparecem juntos no KDS.
                Quer separar automaticamente Lanches para a Cozinha e Bebidas para o Bar?
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
              <Button
                type="button"
                onClick={handleCreateStarterPack}
                disabled={isSaving}
                className="bg-[#047857] hover:bg-[#065f46] text-white font-bold text-xs h-10 px-4 rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                Criar Kit Inicial (Cozinha + Bar + Caixa)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={openCreateModal}
                className="border-stone-300 bg-white text-stone-700 font-semibold text-xs h-10 px-4 rounded-xl cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-1" />
                Criar Setor Personalizado
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sectors.map((sector) => {
            const opMeta = OPERATION_MODE_LABELS[sector.operation_mode] || OPERATION_MODE_LABELS.kds_and_print;
            const contentMeta = CONTENT_MODE_LABELS[sector.content_mode] || CONTENT_MODE_LABELS.production_only;
            const usesKds = sector.operation_mode === "kds_and_print" || sector.operation_mode === "kds_only";
            const usesPrint = sector.operation_mode === "kds_and_print" || sector.operation_mode === "print_only";
            const kdsLinks = buildSectorKdsLinks(storeSlug, sector, { kiosk: true });

            return (
              <Card
                key={sector.id}
                className={`border-stone-200 bg-white rounded-2xl shadow-2xs transition-opacity ${
                  sector.is_active === false ? "opacity-60" : ""
                }`}
              >
                <CardContent className="p-5 space-y-4">
                  {/* Topo do Card */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-black text-stone-900 truncate">
                          {sector.name}
                        </h3>
                        <Badge variant="outline" className={`text-[11px] font-bold ${opMeta.badgeClass}`}>
                          {opMeta.label}
                        </Badge>
                        {sector.is_active === false && (
                          <Badge variant="outline" className="text-[10px] bg-stone-100 text-stone-500">
                            Inativo
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-stone-500 font-medium">
                        {contentMeta.label} • Link: <code className="text-stone-700 bg-stone-100 px-1 rounded">?sector={sector.slug}</code>
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => openEditModal(sector)}
                        className="h-8 w-8 rounded-lg border-stone-200 text-stone-600 hover:text-[#047857] cursor-pointer"
                        title="Editar setor"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(sector)}
                        className="h-8 w-8 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="Excluir setor"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Info de Impressora e Canais */}
                  {usesPrint && (
                    <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 space-y-2 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Printer className="w-4 h-4 text-stone-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-bold text-stone-800 truncate">
                            {sector.printer_type === "a4_browser"
                              ? "Impressora Comum A4 (Navegador)"
                              : sector.printer_name || "Impressora Padrão do Spooler"}
                          </p>
                          <p className="text-[11px] text-stone-500">
                            {sector.printer_type === "a4_browser"
                              ? "Abre diálogo de impressão do sistema"
                              : `Bobina ${sector.paper_width || "80mm"}`} • {sector.copies || 1} via(s)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-stone-200/70">
                        {CHANNEL_OPTIONS.filter((ch) =>
                          !Array.isArray(sector.allowed_channels) ||
                          sector.allowed_channels.length === 0 ||
                          sector.allowed_channels.includes(ch.id)
                        ).map((ch) => (
                          <span
                            key={ch.id}
                            className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-stone-200 text-stone-700"
                          >
                            {ch.label}
                          </span>
                        ))}
                        {(!Array.isArray(sector.allowed_channels) ||
                          sector.allowed_channels.length === 0 ||
                          sector.allowed_channels.includes("delivery")) && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800">
                            {sector.print_on_delivery === "on_accept"
                              ? "Delivery: após Aceite"
                              : "Delivery: Automático"}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Link Direto do KDS da Seção */}
                  {usesKds && (
                    <div className="p-3 rounded-xl bg-sky-50/60 border border-sky-200/80 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-sky-900 flex items-center gap-1.5">
                          <Tv className="w-3.5 h-3.5 text-sky-700" />
                          Link KDS Exclusivo ({sector.name})
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyKdsLink(sector)}
                            className="h-7 px-2.5 text-[11px] bg-white border-sky-200 text-sky-800 hover:bg-sky-50 cursor-pointer"
                          >
                            {copiedId === sector.id ? (
                              <Check className="w-3 h-3 mr-1 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3 mr-1" />
                            )}
                            {copiedId === sector.id ? "Copiado" : "Copiar Link"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleOpenKdsLink(sector)}
                            className="h-7 px-2.5 text-[11px] bg-stone-900 hover:bg-black text-white cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Abrir TV
                          </Button>
                        </div>
                      </div>
                      <p className="text-[11px] font-mono text-sky-800/90 truncate select-all">
                        {kdsLinks.relativePath}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal Criar / Editar Setor */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg bg-white rounded-2xl border border-stone-200 shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-stone-900">
              {editingSector ? `Editar Setor: ${editingSector.name}` : "Novo Setor de Produção"}
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Configure onde este setor aparece (KDS, Impressora ou ambos) e o formato da comanda.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 pt-1">
            <div>
              <Label htmlFor="sector-name" className="text-xs font-bold text-stone-700">
                Nome do Setor *
              </Label>
              <Input
                id="sector-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Cozinha, Bar, Fritura, Pizzaria, Caixa..."
                className="mt-1 border-stone-200 focus:border-[#047857]"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-stone-700">Modo de Operação</Label>
                <Select
                  value={form.operation_mode}
                  onValueChange={(value) => setForm({ ...form, operation_mode: value })}
                >
                  <SelectTrigger className="mt-1 border-stone-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kds_and_print">KDS + Impressora</SelectItem>
                    <SelectItem value="kds_only">Somente KDS (Tela)</SelectItem>
                    <SelectItem value="print_only">Somente Impressora</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold text-stone-700">Conteúdo da Comanda</Label>
                <Select
                  value={form.content_mode}
                  onValueChange={(value) => setForm({ ...form, content_mode: value })}
                >
                  <SelectTrigger className="mt-1 border-stone-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production_only">Só Itens do Setor (Preparo)</SelectItem>
                    <SelectItem value="full_ticket">Cupom Completo (Valores/Entrega)</SelectItem>
                    <SelectItem value="short_receipt">Senha Curta (Totem / Balcão / Garçom)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-[11px] text-stone-600 flex items-start gap-2">
              <Info className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
              <span>
                {CONTENT_MODE_LABELS[form.content_mode]?.desc}
              </span>
            </div>

            {form.operation_mode !== "kds_only" && (
              <div className="space-y-3 p-3.5 rounded-xl bg-emerald-50/40 border border-emerald-200/80">
                <div>
                  <Label className="text-xs font-bold text-stone-800">Tipo de Impressora</Label>
                  <Select
                    value={form.printer_type}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        printer_type: value,
                        paper_width: value === "a4_browser" ? "a4" : (form.paper_width === "a4" ? "80mm" : form.paper_width),
                      })
                    }
                  >
                    <SelectTrigger className="mt-1 bg-white border-stone-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="thermal_raw">Impressora Térmica Automática (.exe Spooler)</SelectItem>
                      <SelectItem value="a4_browser">Impressora Comum A4 / Navegador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.printer_type === "thermal_raw" && (
                  <>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-stone-800">
                          Impressora Windows Destino
                        </Label>
                        <button
                          type="button"
                          onClick={refreshPrinters}
                          disabled={isFetchingPrinters}
                          className="text-[11px] font-bold text-[#047857] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${isFetchingPrinters ? "animate-spin" : ""}`} />
                          Atualizar Lista
                        </button>
                      </div>

                      {printers.length > 0 ? (
                        <Select
                          value={form.printer_name || "__default__"}
                          onValueChange={(value) =>
                            setForm({ ...form, printer_name: value === "__default__" ? "" : value })
                          }
                        >
                          <SelectTrigger className="mt-1 bg-white border-stone-200">
                            <SelectValue placeholder="Usar impressora padrão do Spooler" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__">Padrão configurada no Spooler</SelectItem>
                            {printers.map((p) => (
                              <SelectItem key={p.Name} value={p.Name}>
                                {p.Name} {p.Default ? "(Padrão Windows)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={form.printer_name}
                          onChange={(e) => setForm({ ...form, printer_name: e.target.value })}
                          placeholder="Deixe vazio para padrão ou digite o nome exato no Windows"
                          className="mt-1 bg-white border-stone-200 text-xs"
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs font-bold text-stone-800">Largura da Bobina</Label>
                        <Select
                          value={form.paper_width === "58mm" ? "58mm" : "80mm"}
                          onValueChange={(value) => setForm({ ...form, paper_width: value })}
                        >
                          <SelectTrigger className="mt-1 bg-white border-stone-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="80mm">80mm (Larga)</SelectItem>
                            <SelectItem value="58mm">58mm (Compacta)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="sector-copies" className="text-xs font-bold text-stone-800">
                          Vias por Pedido
                        </Label>
                        <Input
                          id="sector-copies"
                          type="number"
                          min={1}
                          max={5}
                          value={form.copies}
                          onChange={(e) => setForm({ ...form, copies: e.target.value })}
                          className="mt-1 bg-white border-stone-200"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Filtro de Canais para Impressão (Evita entupir Caixa com Mesa/Autoatendimento) */}
                <div className="pt-2 border-t border-emerald-200/70 space-y-2">
                  <Label className="text-xs font-bold text-stone-800 block">
                    Quais canais imprimem neste setor?
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {CHANNEL_OPTIONS.map((ch) => {
                      const active = Array.isArray(form.allowed_channels) && form.allowed_channels.includes(ch.id);
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => toggleFormChannel(ch.id)}
                          className={`py-2 px-2 rounded-lg border text-[11px] font-bold transition-all cursor-pointer text-center ${
                            active
                              ? "bg-[#047857] text-white border-[#047857] shadow-2xs"
                              : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                          }`}
                        >
                          {ch.label}
                        </button>
                      );
                    })}
                  </div>

                  {Array.isArray(form.allowed_channels) && form.allowed_channels.includes("delivery") && (
                    <div className="pt-1">
                      <Label className="text-xs font-bold text-stone-800">
                        Quando imprimir no Delivery?
                      </Label>
                      <Select
                        value={form.print_on_delivery}
                        onValueChange={(value) => setForm({ ...form, print_on_delivery: value })}
                      >
                        <SelectTrigger className="mt-1 bg-white border-stone-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="on_arrival">Imediato ao entrar o pedido</SelectItem>
                          <SelectItem value="on_accept">Somente após Aceitar / Confirmar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-stone-50">
              <div>
                <Label htmlFor="sector-active" className="text-xs font-bold text-stone-800 cursor-pointer">
                  Setor Ativo
                </Label>
                <p className="text-[11px] text-stone-500">
                  Desative temporariamente se não quiser imprimir/exibir este setor agora.
                </p>
              </div>
              <Switch
                id="sector-active"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 rounded-xl border-stone-200 cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="flex-1 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white font-bold cursor-pointer"
              >
                {isSaving ? "Salvando..." : (editingSector ? "Salvar Alterações" : "Criar Setor")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}


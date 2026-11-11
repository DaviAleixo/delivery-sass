import React, { useState, useEffect } from "react";
import { BannerImage } from "@/entities/BannerImage";
import { UploadFile } from "@/integrations/Core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Edit,
  Trash2,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Star,
  Sparkles,
  Info,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function BannersPage() {
  const [banners, setBanners] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [bannerForm, setBannerForm] = useState({
    title: "",
    image_url: "",
    order_index: 0,
    active: true,
  });

  useEffect(() => {
    loadBanners();
  }, []);

  const loadBanners = async () => {
    setIsLoading(true);
    try {
      const bannersData = await BannerImage.list("order_index");
      const sorted = Array.isArray(bannersData)
        ? [...bannersData].sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0))
        : [];
      setBanners(sorted);
    } catch (err) {
      console.error("Erro ao carregar banners:", err);
      toast.error("Erro ao carregar lista de banners.");
    } finally {
      setIsLoading(false);
    }
  };

  // Reordenação por setas (Move para a esquerda ou direita no carrossel)
  const handleMove = async (index, direction) => {
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= banners.length) return;

    const newBanners = [...banners];
    const currentItem = newBanners[index];
    const targetItem = newBanners[targetIndex];

    // Inverte itens na lista
    newBanners[index] = targetItem;
    newBanners[targetIndex] = currentItem;

    // Normaliza posições sequenciais (1, 2, 3...)
    const updated = newBanners.map((b, idx) => ({
      ...b,
      order_index: idx + 1,
    }));

    setBanners(updated);

    try {
      await Promise.all([
        BannerImage.update(currentItem.id, { order_index: targetIndex + 1 }),
        BannerImage.update(targetItem.id, { order_index: index + 1 }),
      ]);
      toast.success(
        targetIndex === 0
          ? `⭐ "${currentItem.title || "Banner"}" agora é a Capa Principal!`
          : `"${currentItem.title || "Banner"}" movido para a ${targetIndex + 1}ª posição!`
      );
    } catch (err) {
      console.error("Erro ao salvar ordem dos banners:", err);
      toast.error("Erro ao salvar ordem dos banners.");
      loadBanners();
    }
  };

  // Define um banner imediatamente como o 1º da fila (Capa Principal)
  const handleSetAsCover = async (index) => {
    if (index === 0) return;

    const newBanners = [...banners];
    const [selected] = newBanners.splice(index, 1);
    newBanners.unshift(selected);

    const updated = newBanners.map((b, idx) => ({
      ...b,
      order_index: idx + 1,
    }));

    setBanners(updated);

    try {
      await Promise.all(
        updated.map((b) => BannerImage.update(b.id, { order_index: b.order_index }))
      );
      toast.success(`⭐ "${selected.title || "Banner"}" definido como Capa Principal!`);
    } catch (err) {
      console.error("Erro ao definir capa:", err);
      toast.error("Erro ao salvar nova ordem.");
      loadBanners();
    }
  };

  // Toggle rápido de ativação/pausa de campanha
  const handleToggleActive = async (banner, checked) => {
    const updated = banners.map((b) => (b.id === banner.id ? { ...b, active: checked } : b));
    setBanners(updated);

    try {
      await BannerImage.update(banner.id, { active: checked });
      if (checked) {
        toast.success(`🟢 Banner ativado e no ar no cardápio!`);
      } else {
        toast.info(`⏸️ Banner pausado (oculto no cardápio).`);
      }
    } catch (err) {
      console.error("Erro ao alternar status do banner:", err);
      toast.error("Erro ao atualizar status do banner.");
      loadBanners();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (editingBanner) {
        await BannerImage.update(editingBanner.id, {
          title: bannerForm.title,
          image_url: bannerForm.image_url,
          active: bannerForm.active,
        });
        toast.success("Banner atualizado com sucesso!");
      } else {
        const nextOrder = banners.length + 1;
        await BannerImage.create({
          title: bannerForm.title,
          image_url: bannerForm.image_url,
          order_index: nextOrder,
          active: bannerForm.active,
        });
        toast.success("Novo banner adicionado ao final do carrossel!");
      }

      setShowModal(false);
      resetForm();
      loadBanners();
    } catch (err) {
      console.error("Erro ao salvar banner:", err);
      toast.error("Erro ao salvar banner.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (bannerId) => {
    if (confirm("Tem certeza que deseja excluir este banner?")) {
      try {
        await BannerImage.delete(bannerId);
        toast.success("Banner excluído com sucesso!");
        loadBanners();
      } catch (err) {
        console.error("Erro ao excluir banner:", err);
        toast.error("Erro ao excluir banner.");
      }
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setIsUploading(true);
      try {
        const { file_url } = await UploadFile({ file, maxDimension: 1200 });
        setBannerForm((prev) => ({ ...prev, image_url: file_url }));
        toast.success("Imagem enviada com sucesso!");
      } catch (err) {
        console.error("Erro no upload:", err);
        toast.error("Erro ao fazer upload da imagem.");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const resetForm = () => {
    setBannerForm({
      title: "",
      image_url: "",
      order_index: 0,
      active: true,
    });
    setEditingBanner(null);
  };

  const openEditModal = (banner) => {
    setBannerForm({
      title: banner.title || "",
      image_url: banner.image_url,
      order_index: banner.order_index || 0,
      active: banner.active !== false,
    });
    setEditingBanner(banner);
    setShowModal(true);
  };

  return (
    <div className="p-4 sm:p-8 bg-[#F7F9F8] min-h-screen text-stone-900">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Cabeçalho da Página */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                Banners & Destaques
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-stone-200 text-stone-700">
                {banners.length} banner(s)
              </span>
            </div>
            <p className="text-xs sm:text-sm text-stone-500 mt-1">
              Controle visual do carrossel do cardápio: defina a ordem de exibição e a capa principal com 1 clique.
            </p>
          </div>

          <Button
            type="button"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="bg-[#047857] hover:bg-[#036348] text-white font-bold text-xs h-10 px-4 rounded-xl shadow-xs flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Banner</span>
          </Button>
        </div>

        {/* Banner Informativo com Dica Operacional */}
        <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs flex items-start gap-3">
          <Info className="w-5 h-5 text-[#047857] shrink-0 mt-0.5" />
          <div className="text-xs text-stone-600 space-y-0.5">
            <span className="font-bold text-stone-900">Como funciona a ordem no carrossel:</span>
            <p>
              O banner marcado com <strong className="text-amber-800">⭐ 1º Capa Principal</strong> é a primeira imagem que o cliente vê ao abrir seu cardápio no celular. Use as setas <strong>[◀️ Antes]</strong> e <strong>[Depois ▶️]</strong> nos cards abaixo para reposicionar ou clique em <strong>"Virar Capa"</strong> para destacar uma campanha imediatamente.
            </p>
          </div>
        </div>

        {/* Grade de Banners */}
        {isLoading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-[#047857] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-stone-500 font-medium">Carregando banners...</p>
          </div>
        ) : banners.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-stone-300 p-8">
            <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-stone-400">
              <ImageIcon className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-stone-900 mb-1">
              Nenhum banner cadastrado
            </h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto mb-4">
              Adicione fotos de combos, promoções da semana ou pratos especiais para atrair mais pedidos no cardápio.
            </p>
            <Button
              type="button"
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="bg-[#047857] hover:bg-[#036348] text-white font-bold text-xs h-9 px-4 rounded-xl cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Adicionar Primeiro Banner
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence>
              {banners.map((banner, index) => {
                const isCover = index === 0;

                return (
                  <motion.div
                    key={banner.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className={cn(
                      "overflow-hidden border rounded-2xl shadow-2xs hover:shadow-md transition-all duration-200 bg-white flex flex-col",
                      isCover ? "border-amber-300 ring-1 ring-amber-200" : "border-stone-200"
                    )}>
                      {/* Imagem Panorâmica 3:1 com Badges de Posição */}
                      <div className="aspect-[3/1] overflow-hidden bg-stone-950 relative group">
                        {banner.image_url ? (
                          <img
                            src={banner.image_url}
                            alt={banner.title || "Banner"}
                            className={cn(
                              "w-full h-full object-cover transition-transform duration-300 group-hover:scale-102",
                              !banner.active && "opacity-40 grayscale-40"
                            )}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-stone-600">
                            <ImageIcon className="w-10 h-10" />
                          </div>
                        )}

                        {/* Badges Superiores */}
                        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1 pointer-events-none">
                          {isCover ? (
                            <span className="bg-amber-400 text-stone-950 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-amber-300 uppercase tracking-wider">
                              <Star className="w-3 h-3 fill-stone-950 text-stone-950" />
                              1º Capa Principal
                            </span>
                          ) : (
                            <span className="bg-stone-900/85 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-white/20">
                              {index + 1}º no Carrossel
                            </span>
                          )}

                          {banner.active ? (
                            <span className="bg-[#047857] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                              No Ar
                            </span>
                          ) : (
                            <span className="bg-stone-800/90 text-stone-300 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md border border-stone-600">
                              ⏸️ Pausado
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Conteúdo do Card */}
                      <CardContent className="p-4 flex-1 flex flex-col justify-between space-y-3.5">
                        {/* Título & Switch Ativo/Pausado */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-sm text-stone-900 truncate">
                              {banner.title?.trim() || `Banner Promocional #${index + 1}`}
                            </h3>
                            <p className="text-[11px] text-stone-500 font-medium">
                              {banner.active ? "Visível no carrossel do cardápio" : "Pausado temporariamente"}
                            </p>
                          </div>

                          <Switch
                            checked={banner.active}
                            onCheckedChange={(checked) => handleToggleActive(banner, checked)}
                            className="data-[state=checked]:bg-[#047857] shrink-0"
                            title={banner.active ? "Clique para pausar" : "Clique para ativar"}
                          />
                        </div>

                        {/* Barra de Reordenação Rápida (1 Toque) */}
                        <div className="p-2 bg-stone-50 border border-stone-200/80 rounded-xl flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={index === 0}
                              onClick={() => handleMove(index, "left")}
                              className="h-7.5 px-2 rounded-lg border-stone-200 bg-white hover:bg-stone-100 text-stone-700 text-xs font-semibold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-2xs"
                              title="Mover para antes no carrossel"
                            >
                              <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
                              <span>Antes</span>
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={index === banners.length - 1}
                              onClick={() => handleMove(index, "right")}
                              className="h-7.5 px-2 rounded-lg border-stone-200 bg-white hover:bg-stone-100 text-stone-700 text-xs font-semibold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-2xs"
                              title="Mover para depois no carrossel"
                            >
                              <span>Depois</span>
                              <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                            </Button>
                          </div>

                          {!isCover && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetAsCover(index)}
                              className="h-7.5 px-2 text-amber-800 hover:text-amber-950 hover:bg-amber-100/70 text-[11px] font-bold rounded-lg cursor-pointer"
                              title="Definir como 1º Banner (Capa Principal)"
                            >
                              <Star className="w-3 h-3 mr-1 fill-amber-500 text-amber-600" />
                              <span>Virar Capa</span>
                            </Button>
                          )}
                        </div>

                        {/* Ações de Edição e Exclusão */}
                        <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEditModal(banner)}
                            className="flex-1 h-8 rounded-lg border-stone-200 text-stone-700 hover:bg-stone-50 font-semibold text-xs cursor-pointer shadow-2xs"
                          >
                            <Edit className="w-3.5 h-3.5 mr-1 text-stone-500" />
                            <span>Editar</span>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(banner.id)}
                            className="h-8 px-2.5 rounded-lg border-stone-200 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-semibold text-xs cursor-pointer shadow-2xs"
                            title="Excluir este banner"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Modal de Cadastro / Edição */}
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="sm:max-w-md bg-white border border-stone-200 rounded-2xl shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-stone-900">
                {editingBanner ? "Editar Banner" : "Novo Banner Promocional"}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              {/* Título Identificador (Opcional) */}
              <div>
                <Label htmlFor="title" className="text-xs font-bold text-stone-700">
                  Nome / Título da Campanha (Opcional)
                </Label>
                <Input
                  id="title"
                  type="text"
                  placeholder="Ex: Combo Família, Promoção de Sexta..."
                  value={bannerForm.title}
                  onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
                  className="mt-1 h-9 rounded-lg border-stone-300 text-xs"
                />
              </div>

              {/* Upload da Imagem */}
              <div>
                <Label htmlFor="image" className="text-xs font-bold text-stone-700">
                  Imagem do Banner *
                </Label>
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="cursor-pointer mt-1 h-9 text-xs file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200"
                  required={!editingBanner && !bannerForm.image_url}
                />

                {bannerForm.image_url && (
                  <div className="mt-3 relative group rounded-xl overflow-hidden border border-stone-200 bg-stone-950 aspect-[3/1] flex items-center justify-center shadow-xs">
                    <img
                      src={bannerForm.image_url}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setBannerForm((prev) => ({ ...prev, image_url: "" }));
                        const fileInput = document.getElementById("image");
                        if (fileInput) fileInput.value = "";
                      }}
                      className="absolute top-2 right-2 bg-rose-600 hover:bg-rose-700 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg transition-transform hover:scale-110 cursor-pointer"
                      title="Remover foto do banner"
                    >
                      <X className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>
                )}

                <div className="mt-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-1">
                  <p className="font-bold flex items-center gap-1 text-amber-950">
                    📐 Proporção Recomendada:
                  </p>
                  <p className="font-medium text-amber-900">
                    • <strong>1200 x 400 px</strong> (Panorâmica 3:1) ou <strong>1920 x 640 px</strong>.
                  </p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Mantenha o texto e logo centralizados para que fiquem bem visíveis tanto no celular quanto no computador.
                  </p>
                </div>
              </div>

              {/* Dica de Ordem Visual */}
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-600 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  A ordem de exibição é controlada visualmente nos cards da tela principal através dos botões <strong>[Antes]</strong>, <strong>[Depois]</strong> e <strong>[Virar Capa]</strong>.
                </span>
              </div>

              {/* Toggle Ativo */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200">
                <div>
                  <Label htmlFor="active" className="text-xs font-bold text-stone-900 cursor-pointer">
                    Colocar banner no ar agora
                  </Label>
                  <p className="text-[11px] text-stone-500">
                    Se desativado, o banner ficará pausado como rascunho.
                  </p>
                </div>
                <Switch
                  id="active"
                  checked={bannerForm.active}
                  onCheckedChange={(checked) => setBannerForm({ ...bannerForm, active: checked })}
                  className="data-[state=checked]:bg-[#047857]"
                />
              </div>

              {/* Botões do Modal */}
              <div className="flex gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="flex-1 h-9 rounded-xl border-stone-200 text-stone-700 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || isUploading}
                  className="flex-1 h-9 rounded-xl bg-[#047857] hover:bg-[#036348] text-white font-bold text-xs cursor-pointer shadow-xs"
                >
                  {isSubmitting ? "Salvando..." : isUploading ? "Enviando foto..." : "Salvar Banner"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

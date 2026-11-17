import React, { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Coupon } from "@/entities/Coupon";
import { Product } from "@/entities/Product";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber, formatToBRL } from "@/utils/moneyMask";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { appConfirm } from "@/components/ui/ConfirmDialogHost";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import CouponListTable from "@/components/admin/CouponListTable";
import CouponCardGrid from "@/components/admin/CouponCardGrid";
import { isCouponExpired } from "@/components/admin/CouponViewShared";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Tag,
  CheckCircle2,
  PauseCircle,
  AlertCircle,
  Sparkles,
  Layers,
} from "lucide-react";
import { format } from "date-fns";

export default function CouponsPage() {
  const [coupons, setCoupons] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtros, Busca e Modo de Visualização (Lista padrão)
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem("pedemuleke_coupons_view_mode") || "list";
    } catch {
      return "list";
    }
  });

  const handleChangeViewMode = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("pedemuleke_coupons_view_mode", mode);
    } catch {
      // ignore storage error
    }
  };

  const [couponForm, setCouponForm] = useState({
    code: "",
    name: "",
    description: "",
    discount_type: "percentage",
    discount_value: "",
    apply_to: "order_total",
    applicable_products: [],
    min_order_value: "",
    usage_limit: "",
    start_date: "",
    end_date: "",
    active: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [couponsData, productsData] = await Promise.all([
        Coupon.list("-created_date"),
        Product.list(),
      ]);
      setCoupons(couponsData || []);
      setProducts(productsData || []);
    } catch (err) {
      console.error("Erro ao carregar cupons:", err);
      toast.error("Erro ao carregar cupons.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const couponData = {
        ...couponForm,
        code: couponForm.code.trim().toUpperCase(),
        discount_value:
          couponForm.discount_type === "fixed_amount"
            ? parseBRLToNumber(couponForm.discount_value)
            : parseFloat(couponForm.discount_value) || 0,
        min_order_value: parseBRLToNumber(couponForm.min_order_value),
        usage_limit: couponForm.usage_limit ? parseInt(couponForm.usage_limit) : null,
        start_date: couponForm.start_date
          ? new Date(couponForm.start_date + "T00:00:00").toISOString()
          : null,
        end_date: couponForm.end_date
          ? new Date(couponForm.end_date + "T23:59:59").toISOString()
          : null,
      };

      if (editingCoupon) {
        await Coupon.update(editingCoupon.id, couponData);
        toast.success("Cupom atualizado com sucesso!");
      } else {
        await Coupon.create(couponData);
        toast.success("Cupom criado com sucesso!");
      }

      setShowModal(false);
      resetForm();
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar cupom.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (coupon, checked) => {
    try {
      await Coupon.update(coupon.id, { active: checked });
      setCoupons((prev) =>
        prev.map((c) => (c.id === coupon.id ? { ...c, active: checked } : c))
      );
      toast.success(checked ? `Cupom "${coupon.code}" ativado!` : `Cupom "${coupon.code}" pausado.`);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao alterar status do cupom.");
    }
  };

  const handleDelete = async (couponId) => {
    const ok = await appConfirm({
      title: "Excluir cupom?",
      description: "Esta ação é irreversível. O código não poderá mais ser usado por clientes.",
      confirmText: "Excluir Cupom",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await Coupon.delete(couponId);
      toast.success("Cupom excluído com sucesso.");
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao excluir cupom.");
    }
  };

  const resetForm = () => {
    setCouponForm({
      code: "",
      name: "",
      description: "",
      discount_type: "percentage",
      discount_value: "",
      apply_to: "order_total",
      applicable_products: [],
      min_order_value: "",
      usage_limit: "",
      start_date: "",
      end_date: "",
      active: true,
    });
    setEditingCoupon(null);
  };

  const openEditModal = (coupon) => {
    setCouponForm({
      code: coupon.code,
      name: coupon.name,
      description: coupon.description || "",
      discount_type: coupon.discount_type,
      discount_value:
        coupon.discount_type === "fixed_amount"
          ? coupon.discount_value
            ? formatToBRL(coupon.discount_value)
            : ""
          : coupon.discount_value?.toString() || "",
      apply_to: coupon.apply_to,
      applicable_products: coupon.applicable_products || [],
      min_order_value: coupon.min_order_value ? formatToBRL(coupon.min_order_value) : "",
      usage_limit: coupon.usage_limit ? coupon.usage_limit.toString() : "",
      start_date: coupon.start_date ? format(new Date(coupon.start_date), "yyyy-MM-dd") : "",
      end_date: coupon.end_date ? format(new Date(coupon.end_date), "yyyy-MM-dd") : "",
      active: coupon.active,
    });
    setEditingCoupon(coupon);
    setShowModal(true);
  };

  const generateCouponCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setCouponForm((prev) => ({ ...prev, code }));
  };

  // KPIs
  const stats = useMemo(() => {
    const total = coupons.length;
    let active = 0;
    let inactive = 0;
    let expired = 0;

    for (const c of coupons) {
      const isExp = isCouponExpired(c);
      if (isExp) expired++;
      if (c.active && !isExp) active++;
      if (!c.active) inactive++;
    }

    return { total, active, inactive, expired };
  }, [coupons]);

  // Cupons filtrados
  const filteredCoupons = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return coupons.filter((coupon) => {
      const isExp = isCouponExpired(coupon);
      if (filterStatus === "active" && (!coupon.active || isExp)) return false;
      if (filterStatus === "inactive" && coupon.active) return false;
      if (filterStatus === "expired" && !isExp) return false;

      if (!term) return true;
      const inCode = (coupon.code || "").toLowerCase().includes(term);
      const inName = (coupon.name || "").toLowerCase().includes(term);
      const inDesc = (coupon.description || "").toLowerCase().includes(term);
      return inCode || inName || inDesc;
    });
  }, [coupons, searchTerm, filterStatus]);

  return (
    <div className="p-6 sm:p-8 bg-[#F7F9F8] min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">
              Cupons de Desconto
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Gerencie códigos promocionais, limites por cliente e regras de desconto para o cardápio.
            </p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="bg-[#047857] hover:bg-[#065f46] text-white font-bold rounded-xl shadow-sm cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Cupom
          </Button>
        </div>

        {/* KPIs Compactos e Clicáveis */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              key: "all",
              label: "Total de Cupons",
              value: stats.total,
              icon: Layers,
              iconColor: "text-stone-500",
              activeRing: "border-[#047857] ring-1 ring-[#047857]/20 bg-emerald-50/30",
              valueColor: "text-gray-900",
            },
            {
              key: "active",
              label: "Ativos",
              value: stats.active,
              icon: CheckCircle2,
              iconColor: "text-emerald-600",
              activeRing: "border-[#047857] ring-1 ring-[#047857]/20 bg-emerald-50/30",
              valueColor: "text-[#047857]",
            },
            {
              key: "inactive",
              label: "Pausados",
              value: stats.inactive,
              icon: PauseCircle,
              iconColor: "text-stone-400",
              activeRing: "border-stone-500 ring-1 ring-stone-500/20 bg-stone-100/60",
              valueColor: "text-stone-600",
            },
            {
              key: "expired",
              label: "Expirados",
              value: stats.expired,
              icon: AlertCircle,
              iconColor: "text-rose-500",
              activeRing: "border-rose-500 ring-1 ring-rose-500/20 bg-rose-50/30",
              valueColor: "text-rose-600",
            },
          ].map((kpi) => {
            const Icon = kpi.icon;
            const isSelected = filterStatus === kpi.key;
            return (
              <button
                key={kpi.key}
                type="button"
                onClick={() => setFilterStatus(isSelected && kpi.key !== "all" ? "all" : kpi.key)}
                className={`text-left px-4 py-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? kpi.activeRing
                    : "bg-white border-stone-200 hover:border-stone-300 shadow-2xs"
                }`}
              >
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    {kpi.label}
                  </p>
                  <p className={`text-2xl font-extrabold mt-0.5 tabular-nums ${kpi.valueColor}`}>
                    {kpi.value}
                  </p>
                </div>
                <Icon className={`w-5 h-5 ${kpi.iconColor} shrink-0`} />
              </button>
            );
          })}
        </div>

        {/* Barra de Busca, Filtro e Toggle Lista | Cards */}
        <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código, nome ou descrição (ex: BEMVINDO, 15% OFF)..."
              className="pl-9 bg-stone-50/60 border-stone-200 focus:bg-white rounded-lg"
            />
          </div>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-44 bg-stone-50/60 border-stone-200 rounded-lg">
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cupons</SelectItem>
              <SelectItem value="active">Somente ativos</SelectItem>
              <SelectItem value="inactive">Pausados</SelectItem>
              <SelectItem value="expired">Expirados</SelectItem>
            </SelectContent>
          </Select>

          <div className="inline-flex items-center p-1 rounded-lg bg-stone-100 border border-stone-200 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => handleChangeViewMode("list")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-white text-gray-900 shadow-2xs"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Lista
            </button>
            <button
              type="button"
              onClick={() => handleChangeViewMode("cards")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                viewMode === "cards"
                  ? "bg-white text-gray-900 shadow-2xs"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Cards
            </button>
          </div>
        </div>

        {/* Lista ou Cards de Cupons */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="animate-pulse bg-white h-20 border border-stone-200 rounded-xl shadow-2xs"
              />
            ))}
          </div>
        ) : coupons.length === 0 ? (
          <div className="border-dashed border-2 border-stone-200 p-12 text-center rounded-2xl bg-white shadow-2xs">
            <Tag className="w-12 h-12 text-stone-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-800">Nenhum cupom cadastrado</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto mt-1 mb-4">
              Crie seu primeiro cupom de desconto para impulsionar suas vendas e fidelizar clientes.
            </p>
            <Button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="bg-[#047857] hover:bg-[#065f46] text-white font-bold rounded-xl cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-2" /> Criar Cupom Agora
            </Button>
          </div>
        ) : filteredCoupons.length === 0 ? (
          <div className="border border-stone-200 p-10 text-center rounded-2xl bg-white shadow-2xs">
            <Search className="w-9 h-9 text-stone-400 mx-auto mb-2" />
            <h3 className="text-base font-bold text-gray-800">Nenhum cupom encontrado</h3>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Tente outro termo de busca ou limpe o filtro selecionado.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setFilterStatus("all");
              }}
              className="rounded-lg cursor-pointer"
            >
              Limpar filtros
            </Button>
          </div>
        ) : viewMode === "list" ? (
          <CouponListTable
            coupons={filteredCoupons}
            onToggleActive={handleToggleActive}
            onEdit={openEditModal}
            onDelete={handleDelete}
          />
        ) : (
          <CouponCardGrid
            coupons={filteredCoupons}
            onToggleActive={handleToggleActive}
            onEdit={openEditModal}
            onDelete={handleDelete}
          />
        )}

        {/* Modal: Criar / Editar Cupom */}
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden flex flex-col max-h-[90vh] rounded-2xl">
            <DialogHeader className="px-6 py-4 border-b border-stone-200 bg-white shrink-0">
              <DialogTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#047857]" />
                {editingCoupon ? "Editar Cupom de Desconto" : "Novo Cupom de Desconto"}
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500">
                Defina o código do voucher, regras de desconto, valor mínimo e período de validade.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto bg-[#F7F9F8] px-6 py-5 space-y-4">
                {/* Seção 1: Identificação & Código */}
                <div className="bg-white p-4 rounded-xl border border-stone-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="coupon-name" className="text-xs font-bold uppercase text-gray-600">
                        Nome do Cupom *
                      </Label>
                      <Input
                        id="coupon-name"
                        value={couponForm.name}
                        onChange={(e) => setCouponForm({ ...couponForm, name: e.target.value })}
                        placeholder="Ex: Primeira Compra, Sexta da Pizza"
                        required
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="coupon-code" className="text-xs font-bold uppercase text-gray-600">
                        Código do Cupom *
                      </Label>
                      <div className="flex gap-2 mt-1.5">
                        <Input
                          id="coupon-code"
                          value={couponForm.code}
                          onChange={(e) =>
                            setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })
                          }
                          placeholder="EX: BEMVINDO10"
                          required
                          className="font-mono uppercase font-bold"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={generateCouponCode}
                          className="shrink-0 text-xs font-semibold rounded-lg cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 mr-1 text-[#047857]" />
                          Gerar
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="coupon-desc" className="text-xs font-bold uppercase text-gray-600">
                      Descrição / Regra Exibida ao Cliente (Opcional)
                    </Label>
                    <Textarea
                      id="coupon-desc"
                      value={couponForm.description}
                      onChange={(e) => setCouponForm({ ...couponForm, description: e.target.value })}
                      placeholder="Ex: Válido para pedidos acima de R$ 40 em pizzas tradicionais."
                      rows={2}
                      className="mt-1.5 text-xs"
                    />
                  </div>
                </div>

                {/* Seção 2: Desconto & Onde Aplicar */}
                <div className="bg-white p-4 rounded-xl border border-stone-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="discount_type" className="text-xs font-bold uppercase text-gray-600">
                        Tipo de Desconto *
                      </Label>
                      <Select
                        value={couponForm.discount_type}
                        onValueChange={(value) =>
                          setCouponForm({
                            ...couponForm,
                            discount_type: value,
                            discount_value: "",
                          })
                        }
                      >
                        <SelectTrigger id="discount_type" className="mt-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                          <SelectItem value="fixed_amount">Valor Fixo (R$)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="discount_value" className="text-xs font-bold uppercase text-gray-600">
                        {couponForm.discount_type === "percentage"
                          ? "Desconto (%) *"
                          : "Desconto em Reais (R$) *"}
                      </Label>
                      {couponForm.discount_type === "fixed_amount" ? (
                        <CurrencyInput
                          id="discount_value"
                          value={couponForm.discount_value}
                          onChange={(e) =>
                            setCouponForm({ ...couponForm, discount_value: e.target.value })
                          }
                          placeholder="R$ 10,00"
                          required
                          className="mt-1.5"
                        />
                      ) : (
                        <Input
                          id="discount_value"
                          type="number"
                          step="1"
                          min="1"
                          max="100"
                          value={couponForm.discount_value}
                          onChange={(e) =>
                            setCouponForm({ ...couponForm, discount_value: e.target.value })
                          }
                          placeholder="Ex: 15"
                          required
                          className="mt-1.5"
                        />
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="apply_to" className="text-xs font-bold uppercase text-gray-600">
                      Aplicar Desconto Em *
                    </Label>
                    <Select
                      value={couponForm.apply_to}
                      onValueChange={(value) => setCouponForm({ ...couponForm, apply_to: value })}
                    >
                      <SelectTrigger id="apply_to" className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="order_total">Total do Pedido</SelectItem>
                        <SelectItem value="specific_products">Produtos Específicos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {couponForm.apply_to === "specific_products" && (
                    <div className="pt-2">
                      <Label className="text-xs font-bold uppercase text-gray-600 block mb-1.5">
                        Selecione os produtos aplicáveis ({couponForm.applicable_products.length} selecionados)
                      </Label>
                      <div className="max-h-48 overflow-y-auto border border-stone-200 rounded-xl p-2.5 space-y-1.5 bg-stone-50/50">
                        {products.map((product) => {
                          const isChecked = couponForm.applicable_products.includes(product.id);
                          return (
                            <label
                              key={product.id}
                              className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                                isChecked ? "bg-emerald-50 text-[#047857] font-semibold" : "hover:bg-white"
                              }`}
                            >
                              <Checkbox
                                id={`prod-${product.id}`}
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setCouponForm({
                                      ...couponForm,
                                      applicable_products: [
                                        ...couponForm.applicable_products,
                                        product.id,
                                      ],
                                    });
                                  } else {
                                    setCouponForm({
                                      ...couponForm,
                                      applicable_products: couponForm.applicable_products.filter(
                                        (id) => id !== product.id
                                      ),
                                    });
                                  }
                                }}
                                className="data-[state=checked]:bg-[#047857] data-[state=checked]:border-[#047857]"
                              />
                              <span className="truncate">{product.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Seção 3: Regras, Limites & Vigência */}
                <div className="bg-white p-4 rounded-xl border border-stone-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="min_order" className="text-xs font-bold uppercase text-gray-600">
                        Pedido Mínimo (Opcional)
                      </Label>
                      <CurrencyInput
                        id="min_order"
                        value={couponForm.min_order_value}
                        onChange={(e) =>
                          setCouponForm({ ...couponForm, min_order_value: e.target.value })
                        }
                        placeholder="R$ 0,00"
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="usage_limit" className="text-xs font-bold uppercase text-gray-600">
                        Limite de Usos por Cliente (Opcional)
                      </Label>
                      <Input
                        id="usage_limit"
                        type="number"
                        min="1"
                        value={couponForm.usage_limit}
                        onChange={(e) => setCouponForm({ ...couponForm, usage_limit: e.target.value })}
                        placeholder="Ex: 1 (deixe vazio para ilimitado)"
                        className="mt-1.5"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="start_date" className="text-xs font-bold uppercase text-gray-600">
                        Data de Início (Opcional)
                      </Label>
                      <Input
                        id="start_date"
                        type="date"
                        value={couponForm.start_date}
                        onChange={(e) => setCouponForm({ ...couponForm, start_date: e.target.value })}
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="end_date" className="text-xs font-bold uppercase text-gray-600">
                        Data de Expiração (Opcional)
                      </Label>
                      <Input
                        id="end_date"
                        type="date"
                        value={couponForm.end_date}
                        onChange={(e) => setCouponForm({ ...couponForm, end_date: e.target.value })}
                        className="mt-1.5"
                      />
                    </div>
                  </div>

                  {/* Ativo */}
                  <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                    <div>
                      <p className="font-semibold text-sm text-gray-800">Cupom Ativo</p>
                      <p className="text-xs text-gray-500">
                        Permite que clientes apliquem este cupom durante o checkout no cardápio.
                      </p>
                    </div>
                    <Switch
                      checked={couponForm.active}
                      onCheckedChange={(checked) => setCouponForm({ ...couponForm, active: checked })}
                      className="data-[state=checked]:bg-[#047857]"
                    />
                  </div>
                </div>
              </div>

              {/* Rodapé Fixo */}
              <div className="px-6 py-3.5 border-t border-stone-200 bg-white shrink-0 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="rounded-xl"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-[#047857] hover:bg-[#065f46] text-white font-semibold rounded-xl cursor-pointer"
                >
                  {isSubmitting ? "Salvando..." : editingCoupon ? "Salvar Alterações" : "Criar Cupom"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

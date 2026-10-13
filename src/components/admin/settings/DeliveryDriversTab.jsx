import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  Bike, 
  Plus, 
  Trash2, 
  Pencil, 
  Phone, 
  CheckCircle2, 
  AlertCircle, 
  Coins, 
  DollarSign, 
  Car, 
  Zap, 
  QrCode,
  UserCheck,
  UserX,
  Info,
  AlertTriangle
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";
import { formatPhone } from "./settingsConstants";

export default function DeliveryDriversTab({ tenantData, onUpdateTenant }) {
  const [drivers, setDrivers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Modal de Adicionar/Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    vehicle: "moto", // moto | carro | bike
    fee_type: "per_order", // per_order | per_trip | none
    fee_value: "6.00",
    pix_key: "",
    active: true,
  });

  useEffect(() => {
    loadDrivers();
  }, [tenantData?.id]);

  const loadDrivers = async () => {
    setIsLoading(true);
    const activeTenantId = tenantData?.id || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from("tenants")
          .select("delivery_drivers")
          .eq("id", activeTenantId)
          .maybeSingle();

        if (!error && data?.delivery_drivers && Array.isArray(data.delivery_drivers)) {
          setDrivers(data.delivery_drivers);
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.warn("[DeliveryDriversTab] Erro ao carregar do Supabase:", err);
      }
    }

    // Fallback local caso offline
    const local = tenantData?.delivery_drivers || [];
    setDrivers(Array.isArray(local) ? local : []);
    setIsLoading(false);
  };

  const persistDrivers = async (newDriversList) => {
    setIsSaving(true);
    const activeTenantId = tenantData?.id || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";

    setDrivers(newDriversList);

    if (onUpdateTenant) {
      onUpdateTenant({ delivery_drivers: newDriversList });
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        // Tenta primeiro via RPC dedicada
        const { error: rpcErr } = await supabase.rpc("update_tenant_delivery_drivers", {
          p_tenant_id: activeTenantId,
          p_drivers: newDriversList
        });

        if (rpcErr) {
          // Fallback update direto
          await supabase
            .from("tenants")
            .update({ delivery_drivers: newDriversList, updated_date: new Date().toISOString() })
            .eq("id", activeTenantId);
        }
      } catch (err) {
        console.error("[DeliveryDriversTab] Erro ao salvar:", err);
        toast.error("Erro ao salvar entregador no banco.");
        setIsSaving(false);
        return false;
      }
    }

    setIsSaving(false);
    return true;
  };

  const handleOpenNew = () => {
    setEditingDriver(null);
    setFormData({
      name: "",
      phone: "",
      vehicle: "moto",
      fee_type: "per_order",
      fee_value: "6.00",
      pix_key: "",
      active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (driver) => {
    setEditingDriver(driver);
    setFormData({
      name: driver.name || "",
      phone: driver.phone || "",
      vehicle: driver.vehicle || "moto",
      fee_type: driver.fee_type || "per_order",
      fee_value: driver.fee_value !== undefined ? String(driver.fee_value) : "6.00",
      pix_key: driver.pix_key || "",
      active: driver.active !== false,
    });
    setIsModalOpen(true);
  };

  const handleSaveDriver = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Por favor, informe o nome do entregador.");
      return;
    }

    const cleanFee = formData.fee_type === "none" 
      ? 0 
      : Number(String(formData.fee_value).replace(",", ".")) || 0;

    let updatedList = [];

    if (editingDriver) {
      // Atualiza existente
      updatedList = drivers.map((d) =>
        d.id === editingDriver.id
          ? {
              ...d,
              name: formData.name.trim(),
              phone: formatPhone(formData.phone),
              vehicle: formData.vehicle,
              fee_type: formData.fee_type,
              fee_value: cleanFee,
              pix_key: formData.pix_key.trim(),
              active: formData.active,
              updated_at: new Date().toISOString()
            }
          : d
      );
    } else {
      // Cria novo
      const newDriver = {
        id: `drv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name: formData.name.trim(),
        phone: formatPhone(formData.phone),
        vehicle: formData.vehicle,
        fee_type: formData.fee_type,
        fee_value: cleanFee,
        pix_key: formData.pix_key.trim(),
        active: formData.active,
        created_at: new Date().toISOString()
      };
      updatedList = [...drivers, newDriver];
    }

    const success = await persistDrivers(updatedList);
    if (success) {
      toast.success(editingDriver ? "Entregador atualizado!" : "Entregador cadastrado com sucesso!");
      setIsModalOpen(false);
    }
  };

  const handleToggleActive = async (driverId) => {
    const updated = drivers.map((d) => (d.id === driverId ? { ...d, active: !d.active } : d));
    await persistDrivers(updated);
    toast.success("Status do entregador alterado.");
  };

  const handleDeleteDriver = async (driverId) => {
    if (!window.confirm("Deseja realmente remover este entregador?")) return;
    const updated = drivers.filter((d) => d.id !== driverId);
    await persistDrivers(updated);
    toast.success("Entregador removido com sucesso.");
  };

  const getFeeTypeBadge = (driver) => {
    if (driver.fee_type === "none" || Number(driver.fee_value || 0) === 0) {
      return (
        <Badge variant="outline" className="bg-stone-100 text-stone-700 border-stone-300 font-semibold text-[11px]">
          Sem taxa por corrida (Fixo/Diária)
        </Badge>
      );
    }
    if (driver.fee_type === "per_trip") {
      return (
        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 font-bold text-[11px]">
          R$ {Number(driver.fee_value).toFixed(2).replace(".", ",")} por Viagem
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-[11px]">
        R$ {Number(driver.fee_value).toFixed(2).replace(".", ",")} por Comanda
      </Badge>
    );
  };

  const getVehicleIcon = (vehicle) => {
    if (vehicle === "carro") return <Car className="w-4 h-4 text-stone-600" />;
    return <Bike className="w-4 h-4 text-orange-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Card de Destaque / Instrução */}
      <Card className="border border-orange-200/80 bg-gradient-to-r from-orange-50/60 to-amber-50/40 rounded-2xl shadow-sm">
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center flex-shrink-0 shadow-md">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-stone-900 tracking-tight">
                Gestão de Entregadores & Motoboys
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                Cadastre sua equipe para despachar pedidos com 1 clique, agrupar saídas na mesma bag e fechar o caixa sem confusão.
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleOpenNew}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs sm:text-sm h-10 px-4 rounded-xl shadow-md flex items-center gap-2 cursor-pointer self-start sm:self-auto flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Entregador</span>
          </Button>
        </CardContent>
      </Card>

      {/* Aviso Operacional Importante */}
      <div className="p-4 sm:p-5 rounded-2xl border border-amber-300 bg-amber-50/95 shadow-sm text-amber-950 flex flex-col md:flex-row items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 border border-amber-300 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-700" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-black text-sm text-amber-950 uppercase tracking-wide">
              Aviso Operacional: Como Funciona o Despacho de Pedidos
            </h4>
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-extrabold text-[10px]">
              Atenção
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-amber-900 leading-relaxed font-medium">
            Se você cadastrar entregadores na equipe, <b>sempre que clicar em "Enviar para Entrega" no painel de Pedidos</b>, o sistema exigirá selecionar <b>qual entregador está levando</b> e <b>quais outros pedidos prontos vão juntos na mesma viagem/bag</b>.
          </p>
          <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-white/70 border border-amber-200 flex items-start gap-2">
              <span className="text-amber-600 font-black">✓</span>
              <div>
                <b className="text-amber-950">Com entregadores cadastrados:</b>
                <p className="text-[11px] text-amber-800 mt-0.5">Permite agrupar saídas na mesma bag e calcular acerto exato de taxas por comanda ou por viagem no caixa.</p>
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-white/70 border border-amber-200 flex items-start gap-2">
              <span className="text-stone-500 font-black">•</span>
              <div>
                <b className="text-stone-900">Sem entregadores cadastrados:</b>
                <p className="text-[11px] text-stone-600 mt-0.5">O pedido vai direto para "Saiu para Entrega" com 1 clique, sem pedir seleção de motoboy.</p>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-amber-800 font-semibold pt-0.5">
            💡 <i>Cadastre sua equipe apenas se você realmente deseja ter esse controle detalhado de saídas e acertos de taxas.</i>
          </p>
        </div>
      </div>

      {/* Lista de Entregadores */}
      <Card className="border border-stone-200/80 rounded-2xl shadow-sm bg-white overflow-hidden">
        <CardHeader className="p-4 sm:p-5 border-b border-stone-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-extrabold text-stone-900">
              Entregadores Cadastrados ({drivers.length})
            </CardTitle>
            <p className="text-xs text-stone-500 mt-0.5">
              Defina o valor por entrega, por viagem ou sem taxa (diária fixa).
            </p>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-stone-400 animate-pulse">
              Carregando lista de entregadores...
            </div>
          ) : drivers.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-200/60 text-orange-600 flex items-center justify-center mx-auto">
                <Bike className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-sm text-stone-800">Nenhum entregador cadastrado</h4>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                Adicione os motoboys que realizam as entregas da sua hamburgueria para poder selecioná-los ao enviar os pedidos.
              </p>
              <Button
                type="button"
                onClick={handleOpenNew}
                variant="outline"
                className="text-orange-600 border-orange-300 hover:bg-orange-50 text-xs font-bold rounded-xl mt-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Cadastrar Primeiro Entregador
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {drivers.map((driver) => (
                <div
                  key={driver.id}
                  className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-3 ${
                    driver.active
                      ? "border-stone-200 bg-white hover:border-orange-300 hover:shadow-sm"
                      : "border-stone-200/60 bg-stone-50/80 opacity-75"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0">
                        {getVehicleIcon(driver.vehicle)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-sm text-stone-900 leading-snug">
                            {driver.name}
                          </h4>
                          {driver.active ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 text-[10px] font-bold border-0">
                              Ativo
                            </Badge>
                          ) : (
                            <Badge className="bg-stone-200 text-stone-600 text-[10px] font-bold border-0">
                              Inativo
                            </Badge>
                          )}
                        </div>
                        {driver.phone && (
                          <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-stone-400" />
                            <span>{driver.phone}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleOpenEdit(driver)}
                        className="h-8 w-8 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg cursor-pointer"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteDriver(driver.id)}
                        className="h-8 w-8 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
                    <div>{getFeeTypeBadge(driver)}</div>

                    {driver.pix_key && (
                      <span className="text-[11px] text-stone-500 font-mono truncate max-w-[140px]" title={`Chave Pix: ${driver.pix_key}`}>
                        🔑 {driver.pix_key}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Criação / Edição de Entregador */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl bg-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-stone-900 flex items-center gap-2">
              <Bike className="w-5 h-5 text-orange-600" />
              <span>{editingDriver ? "Editar Entregador" : "Novo Entregador"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/80 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-extrabold text-amber-950 text-[11px] uppercase tracking-wide">
                Lembrete de Operação
              </p>
              <p className="text-[11px] text-amber-800 leading-snug">
                Ao manter entregadores cadastrados, ao clicar em <b>"Enviar para Entrega"</b> no painel de Pedidos você precisará sempre selecionar o entregador e confirmar os pedidos que vão juntos na mesma viagem.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveDriver} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-bold text-stone-700">Nome do Entregador *</Label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: João da Moto, Carlos Silva..."
                required
                className="mt-1 h-10 rounded-xl text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-stone-700">WhatsApp / Telefone</Label>
                <Input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                  placeholder="(31) 99999-9999"
                  maxLength={15}
                  className="mt-1 h-10 rounded-xl text-sm"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-stone-700">Veículo</Label>
                <select
                  value={formData.vehicle}
                  onChange={(e) => setFormData({ ...formData, vehicle: e.target.value })}
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-stone-200 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="moto">🏍️ Moto</option>
                  <option value="carro">🚗 Carro</option>
                  <option value="bike">🚲 Bicicleta</option>
                </select>
              </div>
            </div>

            {/* Modelo de Remuneração Flexível */}
            <div className="pt-2 border-t border-stone-100 space-y-2.5">
              <Label className="text-xs font-bold text-stone-900 flex items-center justify-between">
                <span>Modelo de Remuneração</span>
                <span className="text-[10px] text-stone-400 font-normal">Como este motoboy recebe</span>
              </Label>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, fee_type: "per_order" })}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    formData.fee_type === "per_order"
                      ? "border-orange-600 bg-orange-50/70 text-orange-950 font-bold"
                      : "border-stone-200 hover:border-stone-300 text-stone-600 font-medium"
                  }`}
                >
                  <span className="block text-xs font-extrabold leading-tight">Por Comanda</span>
                  <span className="block text-[10px] text-stone-500 mt-0.5">R$ por entrega</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, fee_type: "per_trip" })}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    formData.fee_type === "per_trip"
                      ? "border-purple-600 bg-purple-50/70 text-purple-950 font-bold"
                      : "border-stone-200 hover:border-stone-300 text-stone-600 font-medium"
                  }`}
                >
                  <span className="block text-xs font-extrabold leading-tight">Por Viagem</span>
                  <span className="block text-[10px] text-stone-500 mt-0.5">R$ por saída</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, fee_type: "none" })}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    formData.fee_type === "none"
                      ? "border-emerald-600 bg-emerald-50/70 text-emerald-950 font-bold"
                      : "border-stone-200 hover:border-stone-300 text-stone-600 font-medium"
                  }`}
                >
                  <span className="block text-xs font-extrabold leading-tight">Nenhum</span>
                  <span className="block text-[10px] text-stone-500 mt-0.5">Diária / Fixo</span>
                </button>
              </div>

              {formData.fee_type !== "none" ? (
                <div className="pt-1">
                  <Label className="text-xs font-semibold text-stone-700">
                    Valor Pago ao Entregador (R$)
                  </Label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-stone-400">R$</span>
                    <Input
                      type="text"
                      value={formData.fee_value}
                      onChange={(e) => setFormData({ ...formData, fee_value: e.target.value })}
                      placeholder="6,00"
                      className="pl-8 h-10 rounded-xl text-sm font-bold"
                    />
                  </div>
                  <p className="text-[11px] text-stone-400 mt-1">
                    {formData.fee_type === "per_order"
                      ? "Se o motoboy levar 3 pedidos na bag, ele receberá 3x este valor no acerto da noite."
                      : "Independente de quantos pedidos saírem na mesma viagem, ele receberá este valor fixo por saída."}
                  </p>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-[11px] text-stone-600">
                  ℹ️ O sistema não somará taxas de corrida para ele, apenas registrará os pedidos despachados e o <b>dinheiro que ele deve devolver ao caixa</b>.
                </div>
              )}
            </div>

            {/* Chave Pix para Acerto */}
            <div className="pt-2 border-t border-stone-100">
              <Label className="text-xs font-bold text-stone-700">Chave Pix do Entregador (Opcional)</Label>
              <Input
                type="text"
                value={formData.pix_key}
                onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                placeholder="CPF, Telefone, E-mail ou Chave Aleatória"
                className="mt-1 h-10 rounded-xl text-sm"
              />
              <p className="text-[10px] text-stone-400 mt-0.5">
                Facilita para o dono fazer o Pix do acerto no final do turno.
              </p>
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl text-xs font-bold"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold px-5 cursor-pointer shadow"
              >
                {isSaving ? "Salvando..." : editingDriver ? "Atualizar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

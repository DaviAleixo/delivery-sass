import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  CreditCard, 
  Banknote, 
  CheckCircle2, 
  ExternalLink, 
  AlertCircle,
  Save,
  Sparkles,
  UtensilsCrossed,
  Info
} from "lucide-react";
import { testMercadoPagoCredentials } from "@/services/mercadoPagoService";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";
import { CARD_BRANDS, MEAL_VOUCHER_BRANDS } from "@/constants/paymentBrands";

export default function PaymentMethodsTab({ tenantData, onUpdateTenant }) {
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingMP, setIsTestingMP] = useState(false);
  const [mpAccountName, setMpAccountName] = useState(null);
  const [mpError, setMpError] = useState(null);

  // Estado das Formas de Pagamento (inicializado diretamente com os dados recebidos do tenant)
  const [config, setConfig] = useState(() => {
    const pm = tenantData?.payment_methods || {};
    return {
      accept_cash: pm.accept_cash !== false,
      accept_card_credit: pm.accept_card_credit !== undefined ? Boolean(pm.accept_card_credit) : (pm.accept_card_delivery !== false),
      accept_card_debit: pm.accept_card_debit !== undefined ? Boolean(pm.accept_card_debit) : (pm.accept_card_delivery !== false),
      accept_card_meal: Boolean(pm.accept_card_meal),
      accept_online_mp: Boolean(pm.accept_online_mp),
      mp_access_token: pm.mp_access_token || "",
      accepted_card_brands: Array.isArray(pm.accepted_card_brands) ? pm.accepted_card_brands : CARD_BRANDS.map(b => b.id),
      accepted_meal_brands: Array.isArray(pm.accepted_meal_brands) ? pm.accepted_meal_brands : MEAL_VOUCHER_BRANDS.map(b => b.id),
    };
  });

  useEffect(() => {
    let isMounted = true;
    const fetchFreshData = async () => {
      const activeId = tenantData?.id || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data } = await supabase.from("tenants").select("*").eq("id", activeId).maybeSingle();
          if (data && data.payment_methods && isMounted) {
            const pm = data.payment_methods;
            setConfig({
              accept_cash: pm.accept_cash !== false,
              accept_card_credit: pm.accept_card_credit !== undefined ? Boolean(pm.accept_card_credit) : (pm.accept_card_delivery !== false),
              accept_card_debit: pm.accept_card_debit !== undefined ? Boolean(pm.accept_card_debit) : (pm.accept_card_delivery !== false),
              accept_card_meal: Boolean(pm.accept_card_meal),
              accept_online_mp: Boolean(pm.accept_online_mp),
              mp_access_token: pm.mp_access_token || "",
              accepted_card_brands: Array.isArray(pm.accepted_card_brands) ? pm.accepted_card_brands : CARD_BRANDS.map(b => b.id),
              accepted_meal_brands: Array.isArray(pm.accepted_meal_brands) ? pm.accepted_meal_brands : MEAL_VOUCHER_BRANDS.map(b => b.id),
            });
            if (pm.mp_access_token && (pm.mp_access_token.startsWith("APP_USR-") || pm.mp_access_token.startsWith("TEST-"))) {
              testMercadoPagoCredentials(pm.mp_access_token).then((res) => {
                if (res.success && isMounted) setMpAccountName(res.nickname);
              });
            }
            return;
          }
        } catch (_err) {
          console.warn("Erro ao buscar formas de pagamento:", _err);
        }
      }

      if (tenantData?.payment_methods && isMounted) {
        const pm = tenantData.payment_methods;
        setConfig({
          accept_cash: pm.accept_cash !== false,
          accept_card_credit: pm.accept_card_credit !== undefined ? Boolean(pm.accept_card_credit) : (pm.accept_card_delivery !== false),
          accept_card_debit: pm.accept_card_debit !== undefined ? Boolean(pm.accept_card_debit) : (pm.accept_card_delivery !== false),
          accept_card_meal: Boolean(pm.accept_card_meal),
          accept_online_mp: Boolean(pm.accept_online_mp),
          mp_access_token: pm.mp_access_token || "",
          accepted_card_brands: Array.isArray(pm.accepted_card_brands) ? pm.accepted_card_brands : CARD_BRANDS.map(b => b.id),
          accepted_meal_brands: Array.isArray(pm.accepted_meal_brands) ? pm.accepted_meal_brands : MEAL_VOUCHER_BRANDS.map(b => b.id),
        });
      }
    };

    fetchFreshData();
    return () => { isMounted = false; };
  }, [tenantData?.id, tenantData?.payment_methods]);

  const handleTestMP = async () => {
    if (!config.mp_access_token) {
      toast.error("Informe o Access Token do Mercado Pago antes de testar.");
      return;
    }

    setIsTestingMP(true);
    setMpError(null);
    try {
      const res = await testMercadoPagoCredentials(config.mp_access_token);
      if (res.success) {
        setMpAccountName(res.nickname);
        toast.success(`Conexão confirmada com a conta: ${res.nickname}!`);
      } else {
        setMpAccountName(null);
        setMpError(res.error || "Token inválido.");
        toast.error(res.error || "Erro ao validar credenciais.");
      }
    } catch (err) {
      setMpError(err.message);
      toast.error("Erro ao conectar com o Mercado Pago.");
    } finally {
      setIsTestingMP(false);
    }
  };

  const updateSetting = async (key, val) => {
    const updated = {
      ...config,
      [key]: val,
    };
    setConfig(updated);

    const payload = {
      ...updated,
      accept_card_delivery: Boolean(
        (key === "accept_card_credit" ? val : updated.accept_card_credit) ||
        (key === "accept_card_debit" ? val : updated.accept_card_debit)
      ),
    };

    if (onUpdateTenant) {
      onUpdateTenant({
        payment_methods: payload,
      });
    }

    // Auto-salva imediatamente no banco para nunca perder o estado se trocar de aba!
    const targetTenantId = tenantData?.id || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";
    if (isSupabaseConfigured() && supabase) {
      try {
        await supabase.rpc("update_tenant_payment_methods", {
          p_tenant_id: targetTenantId,
          p_payment_methods: payload,
        });
      } catch (_e) {
        console.warn("Falha no auto-save imediato:", _e);
      }
    }
  };

  const toggleCardBrand = (brandId) => {
    const current = config.accepted_card_brands || CARD_BRANDS.map(b => b.id);
    const updated = current.includes(brandId)
      ? current.filter(id => id !== brandId)
      : [...current, brandId];
    updateSetting("accepted_card_brands", updated);
  };

  const toggleAllCardBrands = (selectAll) => {
    const updated = selectAll ? CARD_BRANDS.map(b => b.id) : [];
    updateSetting("accepted_card_brands", updated);
  };

  const toggleMealBrand = (brandId) => {
    const current = config.accepted_meal_brands || MEAL_VOUCHER_BRANDS.map(b => b.id);
    const updated = current.includes(brandId)
      ? current.filter(id => id !== brandId)
      : [...current, brandId];
    updateSetting("accepted_meal_brands", updated);
  };

  const toggleAllMealBrands = (selectAll) => {
    const updated = selectAll ? MEAL_VOUCHER_BRANDS.map(b => b.id) : [];
    updateSetting("accepted_meal_brands", updated);
  };

  const handleSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const targetTenantId = tenantData?.id || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";

    // Se ativou Mercado Pago, garantir que tem token
    if (config.accept_online_mp && !config.mp_access_token.trim()) {
      toast.error("Para ativar o pagamento online, preencha o Access Token do Mercado Pago.");
      return;
    }

    setIsSaving(true);
    try {
      // Mantém compatibilidade com accept_card_delivery se crédito ou débito estiver ativo
      const payload = {
        ...config,
        accept_card_delivery: Boolean(config.accept_card_credit || config.accept_card_debit),
      };

      if (isSupabaseConfigured() && supabase) {
        // Tenta via RPC Security Definer primeiro para garantir bypass de RLS
        const { error: rpcError } = await supabase.rpc("update_tenant_payment_methods", {
          p_tenant_id: targetTenantId,
          p_payment_methods: payload,
        });

        if (rpcError) {
          // Fallback para update direto
          const { error: directError } = await supabase
            .from("tenants")
            .update({
              payment_methods: payload,
            })
            .eq("id", targetTenantId);

          if (directError) throw directError;
        }
      }

      if (onUpdateTenant) {
        onUpdateTenant({
          payment_methods: payload,
        });
      }

      toast.success("Formas de pagamento salvas com sucesso!");
    } catch (err) {
      console.error("Erro ao salvar formas de pagamento:", err);
      toast.error(err.message || "Erro ao salvar formas de pagamento.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Bloco 1: Pagamento na Entrega & Balcão (Maquininha e Dinheiro) */}
      <Card className="border border-stone-200/80 shadow-xs bg-white rounded-2xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 border-b border-stone-150 bg-stone-50/40">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-700 shadow-2xs shrink-0">
                <Banknote className="w-5 h-5 text-stone-800" />
              </span>
              <div>
                <CardTitle className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">
                  Pagamento na Entrega / Balcão
                </CardTitle>
                <p className="text-xs text-stone-500 mt-0.5">
                  Métodos onde o cliente acerta diretamente na maquininha do entregador ou no caixa. As opções ativas aparecem imediatamente no checkout.
                </p>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 divide-y divide-stone-150">
          {/* Opção Dinheiro */}
          <div className="p-5 sm:p-6 flex items-center justify-between gap-4 hover:bg-stone-50/50 transition-colors">
            <div className="flex items-center gap-3.5">
              <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200/80 flex items-center justify-center text-stone-700 shrink-0">
                <Banknote className="w-4 h-4 text-emerald-700" />
              </span>
              <div>
                <span className="text-sm font-semibold text-stone-900 block">
                  Dinheiro em Espécie
                </span>
                <span className="text-xs text-stone-500 block mt-0.5">
                  Permite ao cliente informar no pedido se precisa de troco e para quanto.
                </span>
              </div>
            </div>
            <Switch
              checked={config.accept_cash}
              onCheckedChange={(val) => updateSetting("accept_cash", val)}
            />
          </div>

          {/* Opção Cartão de Crédito na Maquininha */}
          <div className="p-5 sm:p-6 flex items-center justify-between gap-4 hover:bg-stone-50/50 transition-colors">
            <div className="flex items-center gap-3.5">
              <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200/80 flex items-center justify-center text-stone-700 shrink-0">
                <CreditCard className="w-4 h-4 text-stone-800" />
              </span>
              <div>
                <span className="text-sm font-semibold text-stone-900 block">
                  Cartão de Crédito (na Maquininha)
                </span>
                <span className="text-xs text-stone-500 block mt-0.5">
                  O entregador leva a maquininha do restaurante para passar no Crédito.
                </span>
              </div>
            </div>
            <Switch
              checked={config.accept_card_credit}
              onCheckedChange={(val) => updateSetting("accept_card_credit", val)}
            />
          </div>

          {/* Opção Cartão de Débito na Maquininha */}
          <div className="p-5 sm:p-6 flex items-center justify-between gap-4 hover:bg-stone-50/50 transition-colors">
            <div className="flex items-center gap-3.5">
              <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200/80 flex items-center justify-center text-stone-700 shrink-0">
                <CreditCard className="w-4 h-4 text-stone-800" />
              </span>
              <div>
                <span className="text-sm font-semibold text-stone-900 block">
                  Cartão de Débito (na Maquininha)
                </span>
                <span className="text-xs text-stone-500 block mt-0.5">
                  O entregador leva a maquininha do restaurante para passar no Débito.
                </span>
              </div>
            </div>
            <Switch
              checked={config.accept_card_debit}
              onCheckedChange={(val) => updateSetting("accept_card_debit", val)}
            />
          </div>

          {/* Grade Executiva de Bandeiras de Cartão (Crédito & Débito) */}
          {(config.accept_card_credit || config.accept_card_debit) && (
            <div className="p-5 sm:p-6 bg-stone-50/40 space-y-3.5 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                    Bandeiras de Cartão Aceitas
                  </h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Selecione as bandeiras que suas máquinas de cartão aceitam ({config.accepted_card_brands?.length || 0} de {CARD_BRANDS.length} ativas).
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => toggleAllCardBrands(true)}
                    className="text-emerald-700 hover:text-emerald-800 font-bold hover:underline cursor-pointer"
                  >
                    Marcar todas
                  </button>
                  <span className="text-stone-300">•</span>
                  <button
                    type="button"
                    onClick={() => toggleAllCardBrands(false)}
                    className="text-stone-500 hover:text-stone-700 font-medium hover:underline cursor-pointer"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                {CARD_BRANDS.map((brand) => {
                  const isSelected = (config.accepted_card_brands || []).includes(brand.id);
                  return (
                    <button
                      key={brand.id}
                      type="button"
                      onClick={() => toggleCardBrand(brand.id)}
                      className={`relative p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-20 select-none ${
                        isSelected
                          ? "bg-white border-stone-300 shadow-2xs ring-1 ring-emerald-600/30"
                          : "bg-stone-50/70 border-stone-200/80 hover:border-stone-300 hover:bg-white opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="h-6 max-w-[85px] flex items-center justify-start">
                          {brand.image ? (
                            <img
                              src={brand.image}
                              alt={brand.name}
                              className={`max-h-5 max-w-full object-contain ${isSelected ? "" : "grayscale opacity-50"}`}
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-[10px] font-black text-stone-800">{brand.tag}</span>
                          )}
                        </div>
                        {isSelected ? (
                          <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-stone-300 bg-white shrink-0" />
                        )}
                      </div>
                      <span className={`text-xs font-semibold truncate ${isSelected ? "text-stone-900" : "text-stone-500"}`}>
                        {brand.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Opção Vale Alimentação / Refeição */}
          <div className="p-5 sm:p-6 flex items-center justify-between gap-4 hover:bg-stone-50/50 transition-colors">
            <div className="flex items-center gap-3.5">
              <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200/80 flex items-center justify-center text-stone-700 shrink-0">
                <UtensilsCrossed className="w-4 h-4 text-stone-800" />
              </span>
              <div>
                <span className="text-sm font-semibold text-stone-900 block">
                  Vale Refeição & Alimentação (VR, VA, Vales Corporativos)
                </span>
                <span className="text-xs text-stone-500 block mt-0.5">
                  Permite ao cliente pagar com cartões de benefício corporativo na maquininha.
                </span>
              </div>
            </div>
            <Switch
              checked={config.accept_card_meal}
              onCheckedChange={(val) => updateSetting("accept_card_meal", val)}
            />
          </div>

          {/* Grade Executiva de Bandeiras de Vales & Benefícios */}
          {config.accept_card_meal && (
            <div className="p-5 sm:p-6 bg-stone-50/40 space-y-3.5 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                    Bandeiras de Vales Aceitas
                  </h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Habilite apenas os cartões que suas máquinas passam na entrega ({config.accepted_meal_brands?.length || 0} de {MEAL_VOUCHER_BRANDS.length} ativas).
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => toggleAllMealBrands(true)}
                    className="text-emerald-700 hover:text-emerald-800 font-bold hover:underline cursor-pointer"
                  >
                    Marcar todas
                  </button>
                  <span className="text-stone-300">•</span>
                  <button
                    type="button"
                    onClick={() => toggleAllMealBrands(false)}
                    className="text-stone-500 hover:text-stone-700 font-medium hover:underline cursor-pointer"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
                {MEAL_VOUCHER_BRANDS.map((brand) => {
                  const isSelected = (config.accepted_meal_brands || []).includes(brand.id);
                  return (
                    <button
                      key={brand.id}
                      type="button"
                      onClick={() => toggleMealBrand(brand.id)}
                      className={`relative p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-20 select-none ${
                        isSelected
                          ? "bg-white border-stone-300 shadow-2xs ring-1 ring-emerald-600/30"
                          : "bg-stone-50/70 border-stone-200/80 hover:border-stone-300 hover:bg-white opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="h-6 max-w-[70px] flex items-center justify-start">
                          {brand.image ? (
                            <img
                              src={brand.image}
                              alt={brand.name}
                              className={`max-h-5 max-w-full object-contain ${isSelected ? "" : "grayscale opacity-50"}`}
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-[10px] font-black text-stone-800">{brand.tag}</span>
                          )}
                        </div>
                        {isSelected ? (
                          <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-stone-300 bg-white shrink-0" />
                        )}
                      </div>
                      <span className={`text-xs font-semibold truncate ${isSelected ? "text-stone-900" : "text-stone-500"}`}>
                        {brand.shortName || brand.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bloco 2: Pagamento Online Automático (Mercado Pago) */}
      <Card className="border border-stone-200/80 shadow-xs bg-white rounded-2xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 border-b border-stone-150 bg-stone-50/40">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-white border border-stone-200 flex items-center justify-center p-2 shrink-0 shadow-2xs">
                <img src="/bandeiras/pix.webp" alt="Pix" className="w-full h-full object-contain" />
              </span>
              <div>
                <CardTitle className="text-base sm:text-lg font-bold text-stone-900 flex items-center gap-2">
                  <span>PIX Online Automático</span>
                </CardTitle>
                <p className="text-xs text-stone-500 mt-0.5">
                  Gera QR Code dinâmico na tela do cliente via Mercado Pago e confirma o pagamento sozinho sem precisar conferir comprovante.
                </p>
              </div>
            </div>
            <Switch
              checked={config.accept_online_mp}
              onCheckedChange={(val) => updateSetting("accept_online_mp", val)}
            />
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 text-xs text-stone-700 space-y-2">
            <p className="font-semibold text-stone-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-700" />
              Benefícios do PIX Automatizado:
            </p>
            <ul className="list-disc list-inside space-y-1 text-stone-600 text-[11px] ml-1">
              <li>O cliente faz o PIX direto no cardápio e a tela aprova sozinha em <strong>2 segundos</strong>.</li>
              <li>O pedido é enviado imediatamente para a esteira e cozinha sem risco de golpe do falso comprovante.</li>
              <li>O valor cai <strong>direto na sua conta do Mercado Pago</strong> com taxa padrão reduzida de 0,99%.</li>
            </ul>
          </div>

          {config.accept_online_mp && (
            <div className="p-4.5 rounded-xl bg-white border border-stone-200 space-y-4 animate-in fade-in duration-150">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs font-semibold text-stone-800">
                    Access Token do Mercado Pago *
                  </Label>
                  <a
                    href="https://www.mercadopago.com.br/developers/panel/app"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 hover:underline"
                  >
                    <span>Onde encontrar meu Access Token?</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="flex gap-2">
                  <Input
                    required={config.accept_online_mp}
                    type="password"
                    placeholder="APP_USR-... ou TEST-..."
                    value={config.mp_access_token}
                    onChange={(e) => {
                      setConfig({ ...config, mp_access_token: e.target.value });
                      setMpAccountName(null);
                      setMpError(null);
                    }}
                    className="font-mono text-xs bg-stone-50/50 border-stone-200 flex-1 focus:bg-white"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestMP}
                    disabled={isTestingMP || !config.mp_access_token}
                    className="text-xs font-bold border-stone-200 hover:bg-stone-100 whitespace-nowrap cursor-pointer text-stone-800"
                  >
                    {isTestingMP ? "Testando..." : "Testar Conexão"}
                  </Button>
                </div>

                {mpAccountName && (
                  <p className="text-xs text-emerald-700 font-bold mt-2 flex items-center gap-1.5 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Conta Conectada: <span className="underline">{mpAccountName}</span>
                  </p>
                )}

                {mpError && (
                  <p className="text-xs text-rose-600 font-medium mt-2 flex items-center gap-1.5 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                    {mpError}
                  </p>
                )}
              </div>

              {/* Guia Rápido: Como Testar se Funciona */}
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/70 text-xs text-stone-700 space-y-1.5">
                <span className="font-semibold text-stone-900 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-stone-500" />
                  Passo a passo rápido para validar:
                </span>
                <ol className="list-decimal list-inside space-y-1 text-stone-600 text-[11px]">
                  <li>Cole o seu <strong>Access Token</strong> acima e clique em <strong>"Testar Conexão"</strong> para validar sua conta.</li>
                  <li>Clique em <strong>"Salvar Formas de Pagamento"</strong> logo abaixo.</li>
                  <li>Faça um pedido de teste no cardápio selecionando <strong>"PIX Online"</strong> para ver a aprovação automática de 2 segundos ao vivo.</li>
                </ol>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Botão de Salvar */}
      <div className="flex justify-end pt-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="bg-[#047857] hover:bg-[#036348] text-white font-bold text-sm h-11 px-8 rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
        >
          {isSaving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              <span>Salvando...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Salvar Formas de Pagamento</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  CreditCard, 
  Banknote, 
  CheckCircle2, 
  ExternalLink, 
  AlertCircle,
  Save,
  Zap,
  Sparkles,
  UtensilsCrossed,
  Info
} from "lucide-react";
import { testMercadoPagoCredentials } from "@/services/mercadoPagoService";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";

export default function PaymentMethodsTab({ tenantData, onUpdateTenant }) {
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingMP, setIsTestingMP] = useState(false);
  const [mpAccountName, setMpAccountName] = useState(null);
  const [mpError, setMpError] = useState(null);

  // Estado das Formas de Pagamento
  const [config, setConfig] = useState({
    accept_cash: true,
    accept_card_credit: true,
    accept_card_debit: true,
    accept_card_meal: false,
    accept_online_mp: false,
    mp_access_token: "",
  });

  useEffect(() => {
    if (tenantData) {
      const pm = tenantData.payment_methods || {};
      setConfig({
        accept_cash: pm.accept_cash !== false,
        accept_card_credit: pm.accept_card_credit !== undefined ? Boolean(pm.accept_card_credit) : (pm.accept_card_delivery !== false),
        accept_card_debit: pm.accept_card_debit !== undefined ? Boolean(pm.accept_card_debit) : (pm.accept_card_delivery !== false),
        accept_card_meal: Boolean(pm.accept_card_meal),
        accept_online_mp: Boolean(pm.accept_online_mp),
        mp_access_token: pm.mp_access_token || "",
      });

      // Se já houver token salvo, testar rapidamente para mostrar nome da conta
      if (pm.mp_access_token && (pm.mp_access_token.startsWith("APP_USR-") || pm.mp_access_token.startsWith("TEST-"))) {
        testMercadoPagoCredentials(pm.mp_access_token).then((res) => {
          if (res.success) {
            setMpAccountName(res.nickname);
          }
        });
      }
    }
  }, [tenantData]);

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

  const handleSave = async (e) => {
    e.preventDefault();
    if (!tenantData?.id) {
      toast.error("Identificador da empresa não encontrado.");
      return;
    }

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
        const { error } = await supabase
          .from("tenants")
          .update({
            payment_methods: payload,
          })
          .eq("id", tenantData.id);

        if (error) throw error;
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
    <form onSubmit={handleSave} className="space-y-6">
      {/* Bloco 1: Pagamento na Entrega & Balcão (Maquininha e Dinheiro) */}
      <Card className="border-0 shadow-md bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Banknote className="w-5 h-5" />
            </span>
            <div>
              <CardTitle className="text-lg font-bold text-stone-900">
                Pagamento na Entrega / Balcão
              </CardTitle>
              <p className="text-xs text-stone-500 mt-0.5">
                Formas onde o cliente paga diretamente ao motoboy ou no balcão da loja. Se desativar uma opção, ela desaparece imediatamente do checkout do cliente.
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Opção Dinheiro */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                <Banknote className="w-4 h-4" />
              </span>
              <div>
                <span className="text-sm font-bold text-stone-900 block">
                  Dinheiro em Espécie
                </span>
                <span className="text-xs text-stone-500">
                  Permite o cliente informar no pedido se precisa de troco e para quanto.
                </span>
              </div>
            </div>
            <Switch
              checked={config.accept_cash}
              onCheckedChange={(val) => setConfig({ ...config, accept_cash: val })}
            />
          </div>

          {/* Opção Cartão de Crédito na Maquininha */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-lg bg-blue-100 text-blue-700">
                <CreditCard className="w-4 h-4" />
              </span>
              <div>
                <span className="text-sm font-bold text-stone-900 block">
                  Cartão de Crédito (na Maquininha)
                </span>
                <span className="text-xs text-stone-500">
                  O entregador leva a máquina do restaurante para passar o cartão no Crédito.
                </span>
              </div>
            </div>
            <Switch
              checked={config.accept_card_credit}
              onCheckedChange={(val) => setConfig({ ...config, accept_card_credit: val })}
            />
          </div>

          {/* Opção Cartão de Débito na Maquininha */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
                <CreditCard className="w-4 h-4" />
              </span>
              <div>
                <span className="text-sm font-bold text-stone-900 block">
                  Cartão de Débito (na Maquininha)
                </span>
                <span className="text-xs text-stone-500">
                  O entregador leva a máquina do restaurante para passar o cartão no Débito.
                </span>
              </div>
            </div>
            <Switch
              checked={config.accept_card_debit}
              onCheckedChange={(val) => setConfig({ ...config, accept_card_debit: val })}
            />
          </div>

          {/* Opção Vale Alimentação / Refeição */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-lg bg-amber-100 text-amber-700">
                <UtensilsCrossed className="w-4 h-4" />
              </span>
              <div>
                <span className="text-sm font-bold text-stone-900 block">
                  Vale Refeição / Alimentação (VR, VA, Alelo, Sodexo, Ticket)
                </span>
                <span className="text-xs text-stone-500">
                  Permite o cliente pagar com cartões de benefício refeição na maquininha.
                </span>
              </div>
            </div>
            <Switch
              checked={config.accept_card_meal}
              onCheckedChange={(val) => setConfig({ ...config, accept_card_meal: val })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Bloco 2: Pagamento Online Automático (Mercado Pago) */}
      <Card className="border-0 shadow-md bg-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-sky-500/5 rounded-full blur-2xl pointer-events-none" />

        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-sky-50 text-sky-600">
                <Zap className="w-5 h-5" />
              </span>
              <div>
                <CardTitle className="text-lg font-bold text-stone-900 flex items-center gap-2">
                  PIX Automático na Tela (Mercado Pago)
                  <Badge className="bg-sky-100 text-sky-800 border-sky-300 text-[10px] uppercase font-bold tracking-wider">
                    ⚡ Instantâneo
                  </Badge>
                </CardTitle>
                <p className="text-xs text-stone-500 mt-0.5">
                  Gera QR Code na tela com confirmação automática em 2 segundos sem precisar de comprovante. Se ativado, aparece no checkout do cliente.
                </p>
              </div>
            </div>
            <Switch
              checked={config.accept_online_mp}
              onCheckedChange={(val) => setConfig({ ...config, accept_online_mp: val })}
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-100 text-xs text-sky-950 space-y-2">
            <p className="font-semibold flex items-center gap-1.5 text-sky-900">
              <Sparkles className="w-4 h-4 text-sky-600" />
              Como funciona o pagamento automatizado no seu restaurante:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sky-900/90 ml-1 text-[11px]">
              <li>O cliente escaneia o QR Code ou usa o PIX Copia e Cola no checkout do cardápio.</li>
              <li>O sistema detecta a aprovação em <strong>2 segundos</strong> e envia direto para a cozinha com alerta sonoro.</li>
              <li>O dinheiro cai <strong>100% na conta do Mercado Pago da sua loja</strong> (taxa de apenas 0,99% por Pix).</li>
            </ul>
          </div>

          {config.accept_online_mp && (
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-4 animate-in fade-in">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-semibold text-stone-800">
                    Access Token do Mercado Pago *
                  </Label>
                  <a
                    href="https://www.mercadopago.com.br/developers/panel/app"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-sky-600 hover:text-sky-800 font-bold flex items-center gap-1 underline"
                  >
                    <span>Onde pegar meu Access Token?</span>
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
                    className="font-mono text-xs bg-white flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestMP}
                    disabled={isTestingMP || !config.mp_access_token}
                    className="text-xs font-bold border-stone-300 hover:bg-stone-100 whitespace-nowrap cursor-pointer"
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
              <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-950 space-y-2">
                <span className="font-bold flex items-center gap-1.5 text-amber-900">
                  <Info className="w-4 h-4 text-amber-600" />
                  Como testar se o Mercado Pago está funcionando na prática:
                </span>
                <ol className="list-decimal list-inside space-y-1 text-amber-900/90 text-[11px]">
                  <li>Cole o seu <strong>Access Token</strong> acima e clique no botão <strong>"Testar Conexão"</strong> (ele deve confirmar o nome da sua conta).</li>
                  <li>Clique em <strong>"Salvar Formas de Pagamento"</strong> abaixo.</li>
                  <li>Abra o cardápio público da sua loja em outra aba.</li>
                  <li>Adicione um item qualquer ou faça um pedido teste de <strong>R$ 1,00</strong>.</li>
                  <li>No checkout, selecione <strong>"PIX Online ⚡ Instantâneo"</strong> e confirme o pedido.</li>
                  <li>O QR Code e o código Copia e Cola aparecerão na hora na tela. Pague pelo app de qualquer banco (Nubank, Inter, Itaú, etc.).</li>
                  <li>Assim que pagar, a tela do cardápio <strong>aprovará sozinha em 2 segundos</strong> e o pedido chegará confirmado no painel da cozinha!</li>
                </ol>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Botão de Salvar */}
      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={isSaving}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm h-11 px-8 rounded-xl shadow-md flex items-center gap-2 cursor-pointer"
        >
          {isSaving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              <span>Salvando Formas de Pagamento...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Salvar Formas de Pagamento</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

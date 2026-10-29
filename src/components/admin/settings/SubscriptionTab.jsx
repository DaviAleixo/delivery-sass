import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  CreditCard, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ShieldCheck, 
  Zap, 
  Receipt,
  Headphones,
  Mail,
  Phone,
  FileText,
  Save,
  Sparkles
} from "lucide-react";
import { updateAsaasCustomer } from "@/services/asaasService";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";

export default function SubscriptionTab({ tenantData, onUpdateTenant }) {
  const planName = 
    tenantData?.plan === "custom" ? "Plano Personalizado (White-Label VIP)" :
    tenantData?.plan === "table" || tenantData?.salon_mode === "table_only" ? "Plano Autoatendimento (QR Code Mesas & Salão)" :
    tenantData?.plan === "showcase" || tenantData?.salon_mode === "showcase" ? "Plano Visual (Cardápio Digital Vitrine)" :
    "Plano Pro Delivery & Balcão";
  const monthlyPrice = parseFloat(tenantData?.monthly_price) || 149.00;
  const status = tenantData?.subscription_status || "pending";
  const paymentLink = tenantData?.payment_link || "https://sandbox.asaas.com/i/r7wwc9plm0m0fp4n";
  const dueDate = tenantData?.next_due_date ? new Date(tenantData.next_due_date).toLocaleDateString("pt-BR") : "14/10/2026";

  // Formulário de Dados Fiscais / Cobrança
  const [billingEmail, setBillingEmail] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [billingCpfCnpj, setBillingCpfCnpj] = useState("");
  const [isSavingBilling, setIsSavingBilling] = useState(false);

  useEffect(() => {
    if (tenantData) {
      setBillingEmail(tenantData.email || "");
      setBillingPhone(tenantData.phone || tenantData.whatsapp || "");
      setBillingCpfCnpj(tenantData.cpf_cnpj || "");
    }
  }, [tenantData]);

  const handleSaveBillingData = async (e) => {
    e.preventDefault();
    if (!tenantData?.id) {
      toast.error("Identificador da empresa não encontrado.");
      return;
    }

    setIsSavingBilling(true);
    try {
      // 1. Atualizar no Supabase
      if (isSupabaseConfigured() && supabase) {
        const { error } = await supabase
          .from("tenants")
          .update({
            email: billingEmail.trim() || null,
            phone: billingPhone.trim() || null,
            whatsapp: billingPhone.trim() || null,
            cpf_cnpj: billingCpfCnpj.trim() || null,
          })
          .eq("id", tenantData.id);

        if (error) throw error;
      }

      // 2. Sincronizar com a API do Asaas se houver cliente cadastrado
      if (tenantData.asaas_customer_id) {
        await updateAsaasCustomer({
          customerId: tenantData.asaas_customer_id,
          name: tenantData.name,
          email: billingEmail.trim(),
          phone: billingPhone.trim(),
          cpfCnpj: billingCpfCnpj.trim(),
        });
      }

      if (onUpdateTenant) {
        onUpdateTenant({
          email: billingEmail.trim(),
          phone: billingPhone.trim(),
          whatsapp: billingPhone.trim(),
          cpf_cnpj: billingCpfCnpj.trim(),
        });
      }

      toast.success("Dados de cobrança salvos e sincronizados com o Asaas!");
    } catch (err) {
      console.error("Erro ao salvar dados de cobrança:", err);
      toast.error(err.message || "Erro ao atualizar dados de cobrança.");
    } finally {
      setIsSavingBilling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Card Principal da Assinatura */}
      <Card className="border-0 shadow-md bg-gradient-to-br from-white to-stone-50 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-rose-50 text-rose-600">
                  <CreditCard className="w-5 h-5" />
                </span>
                <CardTitle className="text-xl font-bold text-stone-900">
                  Minha Assinatura & Fatura
                </CardTitle>
              </div>
              <p className="text-xs text-stone-500 mt-1">
                Gerencie sua mensalidade, formas de pagamento e 2ª via de faturas.
              </p>
            </div>

            {status === "active" ? (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 flex items-center gap-1.5 w-fit py-1 px-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-bold">Assinatura Ativa (Em dia)</span>
              </Badge>
            ) : status === "overdue" ? (
              <Badge className="bg-rose-100 text-rose-800 border-rose-300 flex items-center gap-1.5 w-fit py-1 px-3">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span className="font-bold">Fatura Vencida</span>
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 border-amber-300 flex items-center gap-1.5 w-fit py-1 px-3">
                <Clock className="w-4 h-4 text-amber-600" />
                <span className="font-bold">Aguardando Pagamento</span>
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 bg-white rounded-2xl border border-stone-100 shadow-sm">
            <div>
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                Plano Contratado
              </span>
              <p className="text-lg font-extrabold text-stone-900 mt-0.5">
                {planName}
              </p>
              <span className="text-xs text-stone-500">
                Cobrança recorrente mensal
              </span>
            </div>

            <div>
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                Valor da Mensalidade
              </span>
              <p className="text-2xl font-black text-rose-600 mt-0.5">
                R$ {monthlyPrice.toFixed(2).replace(".", ",")}
                <span className="text-xs font-normal text-stone-500"> /mês</span>
              </p>
              <span className="text-xs font-medium text-emerald-600">
                ZERO taxa ou comissão por pedidos
              </span>
            </div>

            <div>
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                Próximo Vencimento
              </span>
              <p className="text-lg font-extrabold text-stone-900 mt-0.5">
                {dueDate}
              </p>
              <span className="text-xs text-stone-500">
                Pague via PIX, Cartão ou Boleto
              </span>
            </div>
          </div>

          {/* Botão de Pagamento com Link do Asaas */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-lg shadow-rose-900/20">
            <div className="space-y-1">
              <h4 className="font-bold text-base flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-200" />
                Fatura Oficial Disponível
              </h4>
              <p className="text-xs text-rose-100 max-w-md">
                Clique no botão ao lado para abrir a sua fatura segura no Asaas. Você pode pagar via PIX instantâneo ou cadastrar seu cartão para cobrança automática.
              </p>
            </div>

            <Button
              asChild
              className="bg-white text-rose-600 hover:bg-stone-100 font-extrabold text-sm h-12 px-6 rounded-xl shadow-md cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              <a href={paymentLink} target="_blank" rel="noreferrer">
                <span>Pagar Fatura / 2ª Via</span>
                <ExternalLink className="w-4 h-4 ml-2" />
              </a>
            </Button>
          </div>

          {/* Benefícios Inclusos */}
          <div className="pt-2">
            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">
              O que está incluso na sua assinatura
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-stone-700">
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50/80 border border-stone-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span><strong>100% do lucro é seu</strong>: ZERO comissão por vendas</span>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50/80 border border-stone-100">
                <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                <span><strong>Painel KDS em Tempo Real</strong> com alertas sonoros</span>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50/80 border border-stone-100">
                <ShieldCheck className="w-4 h-4 text-sky-500 shrink-0" />
                <span><strong>Cardápio Web Ilimitado</strong>: fotos, produtos e adicionais</span>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50/80 border border-stone-100">
                <Headphones className="w-4 h-4 text-rose-500 shrink-0" />
                <span><strong>Suporte Prioritário</strong> direto pelo WhatsApp</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card Secundário: Dados de Cobrança & Faturamento (Autoatendimento do Lojista) */}
      <Card className="border-0 shadow-md bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-stone-100 text-stone-700">
                <Receipt className="w-5 h-5" />
              </span>
              <div>
                <CardTitle className="text-lg font-bold text-stone-900">
                  Dados de Cobrança & Faturamento
                </CardTitle>
                <p className="text-xs text-stone-500 mt-0.5">
                  Mantenha seu e-mail e documento atualizados para envio de faturas e comprovantes oficiais pelo Asaas.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="border-stone-200 text-stone-500 text-xs gap-1 hidden sm:flex">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Sincronizado com Asaas
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSaveBillingData} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-stone-400" />
                  E-mail para Faturas *
                </Label>
                <Input
                  type="email"
                  required
                  placeholder="financeiro@seurestaurante.com"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  className="mt-1 text-sm bg-stone-50/60 border-stone-200 focus:bg-white"
                />
                <p className="text-[11px] text-stone-400 mt-1">
                  Onde chegam os boletos, Pix e recibos.
                </p>
              </div>

              <div>
                <Label className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-stone-400" />
                  WhatsApp para Cobrança *
                </Label>
                <Input
                  placeholder="(31) 98888-7777"
                  value={billingPhone}
                  onChange={(e) => setBillingPhone(e.target.value)}
                  className="mt-1 text-sm bg-stone-50/60 border-stone-200 focus:bg-white"
                />
                <p className="text-[11px] text-stone-400 mt-1">
                  Para lembretes rápidos antes do vencimento.
                </p>
              </div>

              <div>
                <Label className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-stone-400" />
                  CPF ou CNPJ na Nota Fiscal
                </Label>
                <Input
                  placeholder="00.000.000/0001-00 ou CPF"
                  value={billingCpfCnpj}
                  onChange={(e) => setBillingCpfCnpj(e.target.value)}
                  className="mt-1 text-sm bg-stone-50/60 border-stone-200 focus:bg-white"
                />
                <p className="text-[11px] text-stone-400 mt-1">
                  Emitido no seu nome ou da sua empresa.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-stone-100">
              <Button
                type="submit"
                disabled={isSavingBilling}
                className="bg-stone-900 hover:bg-stone-800 text-white font-semibold text-sm h-10 px-6 rounded-xl flex items-center gap-2 cursor-pointer shadow-sm"
              >
                {isSavingBilling ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                    <span>Sincronizando com Asaas...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Salvar Dados de Cobrança</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

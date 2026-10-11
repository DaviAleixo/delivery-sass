import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { createPageUrl } from "@/utils";
import {
  Building2,
  Plus,
  ExternalLink,
  Power,
  RefreshCw,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Store,
  CheckCircle2,
  XCircle,
  LogOut,
  ChevronRight,
  Flame,
  Search,
  Sparkles,
  Pencil,
  Trash2,
  AlertTriangle,
  CreditCard,
  Copy,
  Check,
  MessageSquare,
  Phone,
  X,
  ArrowUpRight,
  Mail,
  FileText
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { createAsaasCustomerAndSubscription } from "@/services/asaasService";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invalidateCache } from "@/entities/storage";

export default function SuperAdminPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tenants, setTenants] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Formulário de Nova Empresa (com dados fiscais do Asaas)
  const [newTenant, setNewTenant] = useState({
    name: "",
    slug: "",
    plan: "basic",
    email: "",
    phone: "",
    cpf_cnpj: "",
    admin_username: "admin",
    admin_password: "",
    primary_color: "#E11D48",
  });

  // Modal e Formulário de Edição de Empresa
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    slug: "",
    plan: "basic",
    logo_url: "",
    admin_username: "admin",
    admin_password: "",
  });

  // Modal de Exclusão de Empresa
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingTenant, setDeletingTenant] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [selectedTenantDrawer, setSelectedTenantDrawer] = useState(null);

  const handleOpenWhatsAppBilling = (tenant) => {
    if (!tenant) return;
    const phone = (tenant.phone || tenant.whatsapp || "31982607426").replace(/\D/g, "");
    const price = (parseFloat(tenant.monthly_price) || 149).toFixed(2).replace(".", ",");
    const link = tenant.payment_link || "https://sandbox.asaas.com/i/r7wwc9plm0m0fp4n";
    const msg = encodeURIComponent(`Olá, pessoal da ${tenant.name}! Tudo bem?\n\nPassando para enviar a fatura da mensalidade da sua plataforma de cardápio digital (R$ ${price}).\n\nVocê pode pagar via PIX ou Cartão pelo link seguro oficial:\n${link}\n\nQualquer dúvida estou à disposição!`);
    window.open(`https://wa.me/55${phone}?text=${msg}`, "_blank");
  };

  const handleOpenWhatsAppChat = (tenant) => {
    if (!tenant) return;
    const phone = (tenant.phone || tenant.whatsapp || "31982607426").replace(/\D/g, "");
    const msg = encodeURIComponent(`Olá, pessoal da ${tenant.name}! Como estão os pedidos hoje?`);
    window.open(`https://wa.me/55${phone}?text=${msg}`, "_blank");
  };

  const handleCopyPaymentLink = (url, id) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast({
      title: "Link Copiado!",
      description: "Link da fatura do Asaas copiado para enviar no WhatsApp.",
    });
    setTimeout(() => setCopiedId(null), 2500);
  };

  // 1. Checa autenticação de Super Admin via Supabase Session
  useEffect(() => {
    let isMounted = true;

    const handleUnauthorized = () => {
      toast({
        title: "Acesso Não Autorizado",
        description: "Esta área é restrita ao Super Admin da plataforma.",
        variant: "destructive",
      });
      navigate(createPageUrl("AdminLogin"), { replace: true });
    };

    const checkSuperAdminAuth = async () => {
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.user) {
            handleUnauthorized();
            return;
          }

          const { data: profile } = await supabase
            .from("tenant_admins")
            .select("id, role, username")
            .eq("user_id", session.user.id)
            .maybeSingle();

          if (!profile || profile.role !== "super_admin") {
            handleUnauthorized();
            return;
          }
        } catch (_err) {
          handleUnauthorized();
          return;
        }
      } else {
        const adminAuth = localStorage.getItem("admin_auth");
        const rawUser = localStorage.getItem("admin_user");
        let user = null;
        try {
          user = rawUser ? JSON.parse(rawUser) : null;
        } catch (_e) {}

        if (adminAuth !== "authenticated" || !user || user.role !== "super_admin") {
          handleUnauthorized();
          return;
        }
      }

      if (isMounted) {
        loadTenants();
      }
    };

    checkSuperAdminAuth();

    // Listener reativo do Supabase para encerrar a sessão imediatamente em caso de logout
    const { data: authListener } = isSupabaseConfigured() && supabase
      ? supabase.auth.onAuthStateChange((event, session) => {
          if (event === "SIGNED_OUT" || !session) {
            handleUnauthorized();
          }
        })
      : { data: { subscription: null } };

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [navigate]);

  // 2. Carrega lista de tenants do Supabase
  const loadTenants = async () => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured() && supabase) {
        const { data, error } = await supabase.rpc("get_master_tenants");
        if (error) throw error;
        setTenants(Array.isArray(data) ? data : []);
      } else {
        // Mock de demonstração caso offline
        setTenants([
          {
            id: "a0000000-0000-0000-0000-000000000001",
            slug: "vruum-burguer",
            name: "Vruum Burguer",
            plan: "basic",
            is_active: true,
            total_orders: 142,
            total_revenue: 5680.00,
            admin_username: "admin",
            logo_url: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=300&h=300&fit=crop"
          }
        ]);
      }
    } catch (err) {
      toast({
        title: "Erro ao carregar restaurantes",
        description: err.message || "Não foi possível carregar os dados.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Gerador automático de slug ao digitar o nome
  const handleNameChange = (e) => {
    const val = e.target.value;
    const autoSlug = val
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    setNewTenant((prev) => ({
      ...prev,
      name: val,
      slug: autoSlug,
    }));
  };

  // 3. Criar nova empresa em 1 clique com automação Asaas
  const handleCreateTenant = async (e) => {
    e.preventDefault();
    if (!newTenant.name || !newTenant.slug || !newTenant.admin_password) {
      toast({
        title: "Preencha os campos obrigatórios",
        description: "Nome, slug e senha do administrador são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSupabaseConfigured() && supabase) {
        const monthlyPrice = newTenant.plan === "premium" ? 149.00 : 89.00;

        // 1. Cria a loja no Supabase com novo código sequencial e credenciais de login
        const { data, error } = await supabase.rpc("create_new_tenant", {
          p_name: newTenant.name.trim(),
          p_slug: newTenant.slug.trim(),
          p_plan: newTenant.plan,
          p_admin_username: newTenant.admin_username.trim() || "admin",
          p_admin_password: newTenant.admin_password,
          p_primary_color: newTenant.primary_color,
          p_admin_email: newTenant.email.trim() || null,
        });

        if (error) throw error;
        if (data && data.success === false) {
          throw new Error(data.message || "Erro ao criar empresa.");
        }

        const newTenantId = data.tenant_id;
        const newSlug = data.slug;
        const newName = newTenant.name.trim();

        // 2. Criação Automática do Cliente e Assinatura no Asaas
        let asaasSuccess = false;
        try {
          const asaasRes = await createAsaasCustomerAndSubscription({
            name: newName,
            email: newTenant.email.trim() || undefined,
            phone: newTenant.phone.trim() || undefined,
            cpfCnpj: newTenant.cpf_cnpj.trim() || undefined,
            plan: newTenant.plan === "premium" ? "pro" : "start",
            monthlyPrice: monthlyPrice,
            dueDays: 3,
          });

          if (asaasRes.success) {
            asaasSuccess = true;
            // 3. Atualiza os dados fiscais e o link oficial do Asaas no Supabase
            await supabase
              .from("tenants")
              .update({
                email: newTenant.email.trim() || null,
                phone: newTenant.phone.trim() || null,
                whatsapp: newTenant.phone.trim() || null,
                cpf_cnpj: newTenant.cpf_cnpj.trim() || null,
                asaas_customer_id: asaasRes.customerId,
                asaas_subscription_id: asaasRes.subscriptionId,
                payment_link: asaasRes.paymentLink,
                next_due_date: asaasRes.nextDueDate,
                monthly_price: monthlyPrice,
                subscription_status: "pending",
              })
              .eq("id", newTenantId);
          } else {
            console.warn("[Asaas] Falha na emissão automática:", asaasRes.error);
            await supabase
              .from("tenants")
              .update({
                email: newTenant.email.trim() || null,
                phone: newTenant.phone.trim() || null,
                whatsapp: newTenant.phone.trim() || null,
                cpf_cnpj: newTenant.cpf_cnpj.trim() || null,
                monthly_price: monthlyPrice,
              })
              .eq("id", newTenantId);
          }
        } catch (asErr) {
          console.error("[Asaas] Erro ao integrar:", asErr);
        }

        // Limpa caches locais de entidades
        ["categories", "products", "banners", "banner_images", "orders", "settings", "admin_users"].forEach((k) => {
          invalidateCache(k);
        });

        // Recarrega listagem completa de tenants no SuperAdmin
        await loadTenants();

        toast({
          title: "🎉 Restaurante Criado com Sucesso!",
          description: asaasSuccess
            ? `${newName} criado! Assinatura de R$ ${monthlyPrice.toFixed(2).replace(".", ",")}/mês gerada no Asaas com fatura pronta.`
            : `${newName} cadastrado no sistema.`,
        });

        setIsCreateModalOpen(false);
        setNewTenant({
          name: "",
          slug: "",
          plan: "basic",
          email: "",
          phone: "",
          cpf_cnpj: "",
          admin_username: "admin",
          admin_password: "",
          primary_color: "#E11D48",
        });
      }
    } catch (err) {
      toast({
        title: "Erro na criação",
        description: err.message || "Verifique se o slug já existe.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Ativar ou Bloquear Loja
  const handleToggleStatus = async (tenant) => {
    const newStatus = !tenant.is_active;
    try {
      if (isSupabaseConfigured() && supabase) {
        const { error } = await supabase.rpc("toggle_tenant_status", {
          p_tenant_id: tenant.id,
          p_is_active: newStatus,
        });
        if (error) throw error;
      }

      setTenants((prev) =>
        prev.map((t) => (t.id === tenant.id ? { ...t, is_active: newStatus } : t))
      );

      toast({
        title: newStatus ? "Loja Reativada" : "Loja Bloqueada",
        description: `${tenant.name} agora está ${newStatus ? "ativa para pedidos" : "bloqueada por assinatura"}.`,
      });
    } catch (err) {
      toast({
        title: "Erro ao alterar status",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // 5. Entrar no Painel do Restaurante (Modo Impersonation / Suporte)
  const handleAccessStoreDashboard = (tenant) => {
    localStorage.setItem("admin_auth", "authenticated");
    localStorage.setItem("current_tenant_id", tenant.id);
    localStorage.setItem("current_tenant_slug", tenant.slug);
    localStorage.setItem("current_tenant_name", tenant.name);

    ["categories", "products", "banners", "banner_images", "orders", "settings", "admin_users"].forEach((k) => {
      invalidateCache(k);
    });

    toast({
      title: "Entrando como Operador",
      description: `Acessando o painel de ${tenant.name}...`,
    });

    navigate(`/${tenant.slug}/Dashboard`);
  };

  // 6. Abrir Modal de Edição de Empresa
  const handleOpenEditModal = (tenant) => {
    setEditingTenant(tenant);
    setEditForm({
      name: tenant.name || "",
      slug: tenant.slug || "",
      plan: tenant.plan || "basic",
      logo_url: tenant.logo_url || "",
      admin_username: tenant.admin_username || "admin",
      admin_password: "",
    });
    setIsEditModalOpen(true);
  };

  // 7. Salvar Alterações da Empresa Editada
  const handleSaveEditTenant = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim() || !editForm.slug.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Nome e slug são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSupabaseConfigured() && supabase) {
        const { data, error } = await supabase.rpc("update_tenant_info", {
          p_tenant_id: editingTenant.id,
          p_name: editForm.name.trim(),
          p_slug: editForm.slug.trim(),
          p_plan: editForm.plan,
          p_logo_url: editForm.logo_url.trim() || null,
          p_admin_username: editForm.admin_username.trim() || "admin",
          p_admin_password: editForm.admin_password ? editForm.admin_password : null,
        });

        if (error) throw error;
        if (data && data.success === false) {
          throw new Error(data.message || "Erro ao atualizar empresa.");
        }

        // Se o tenant editado for o ativo no momento, atualiza o localStorage
        if (localStorage.getItem("current_tenant_id") === editingTenant.id) {
          localStorage.setItem("current_tenant_name", editForm.name.trim());
          localStorage.setItem("current_tenant_slug", editForm.slug.trim());
        }

        toast({
          title: "Restaurante Atualizado!",
          description: `Os dados de ${editForm.name} foram atualizados com sucesso.`,
        });

        setIsEditModalOpen(false);
        setEditingTenant(null);
        await loadTenants();
      }
    } catch (err) {
      toast({
        title: "Erro na atualização",
        description: err.message || "Não foi possível atualizar a empresa.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 8. Abrir Modal de Exclusão de Empresa
  const handleOpenDeleteModal = (tenant) => {
    setDeletingTenant(tenant);
    setIsDeleteModalOpen(true);
  };

  // 9. Confirmar Exclusão Definitiva da Empresa
  const handleConfirmDeleteTenant = async () => {
    if (!deletingTenant) return;
    setIsDeleting(true);
    try {
      if (isSupabaseConfigured() && supabase) {
        const { data, error } = await supabase.rpc("delete_tenant", {
          p_tenant_id: deletingTenant.id,
        });

        if (error) throw error;
        if (data && data.success === false) {
          throw new Error(data.message || "Erro ao excluir empresa.");
        }

        // Se o tenant excluído for o que estava na sessão, reseta para vrumm
        if (localStorage.getItem("current_tenant_id") === deletingTenant.id) {
          localStorage.removeItem("current_tenant_id");
          localStorage.removeItem("current_tenant_slug");
          localStorage.removeItem("current_tenant_name");
        }

        toast({
          title: "Restaurante Excluído",
          description: `${deletingTenant.name} e todos os seus dados foram excluídos com sucesso.`,
        });

        setIsDeleteModalOpen(false);
        setDeletingTenant(null);
        await loadTenants();
      }
    } catch (err) {
      toast({
        title: "Erro ao excluir",
        description: err.message || "Não foi possível excluir a empresa.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // 10. Logout do Super Admin
  const handleLogout = async () => {
    if (isSupabaseConfigured() && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (_e) {}
    }
    localStorage.removeItem("admin_auth");
    localStorage.removeItem("admin_user");
    localStorage.removeItem("current_tenant_id");
    localStorage.removeItem("current_tenant_slug");
    localStorage.removeItem("current_tenant_name");
    navigate(createPageUrl("AdminLogin"), { replace: true });
  };

  // Métricas calculadas
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter((t) => t.is_active).length;
  const totalOrdersProcessed = tenants.reduce((acc, t) => acc + (parseInt(t.total_orders) || 0), 0);
  const estimatedMRR = tenants.reduce((acc, t) => {
    if (!t.is_active) return acc;
    return acc + (parseFloat(t.monthly_price) || (t.plan === "premium" ? 149.00 : 89.00));
  }, 0);
  const pendingInvoicesCount = tenants.filter((t) => t.subscription_status === "pending" || t.subscription_status === "overdue").length;

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(t.code || "").includes(searchTerm)
  );


  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      {/* Header Superior */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 pb-8 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-900/40">
              <Flame className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Painel Master — Super Admin
              </h1>
              <p className="text-sm text-slate-400">
                Torre de controle do seu SaaS de Delivery & Cardápio Digital
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadTenants}
            className="border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-lg shadow-rose-900/30"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova Empresa
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Sair do Super Admin"
            className="text-slate-400 hover:text-rose-400 hover:bg-rose-950/30"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Grid de Métricas do Negócio */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-8">
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Restaurantes Ativos</CardTitle>
            <Building2 className="h-5 w-5 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">{activeTenants} <span className="text-sm text-slate-500 font-normal">/ {totalTenants}</span></div>
            <p className="text-xs text-emerald-400 mt-1 flex items-center">
              <CheckCircle2 className="h-3 w-3 mr-1 inline" /> 100% de adimplência na rede
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">MRR (Recorrência Mensal)</CardTitle>
            <DollarSign className="h-5 w-5 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-emerald-400">
              R$ {estimatedMRR.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Cobrança direta fixa sem taxa de pedidos
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total de Pedidos na Rede</CardTitle>
            <ShoppingBag className="h-5 w-5 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">{totalOrdersProcessed}</div>
            <p className="text-xs text-slate-400 mt-1">
              Pedidos processados nos painéis KDS
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Faturas Pendentes</CardTitle>
            <CreditCard className="h-5 w-5 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-amber-400">
              {pendingInvoicesCount}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {pendingInvoicesCount === 0 ? "Todas as lojas em dia" : "Aguardando pagamento no Asaas"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Empresas Cadastradas */}
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Store className="h-5 w-5 text-rose-500" />
              Restaurantes & Clientes
            </h2>
            <p className="text-xs text-slate-400">
              Gerencie acessos, planos e entre no painel de qualquer cliente
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Buscar por nome ou slug..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-slate-900/80 border-slate-800 text-white placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Tabela de Empresas */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-4 px-6">Restaurante</th>
                  <th className="py-4 px-4">Link Público</th>
                  <th className="py-4 px-4">Plano</th>
                  <th className="py-4 px-4">Status da Loja</th>
                  <th className="py-4 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-rose-500" />
                      Carregando empresas...
                    </td>
                  </tr>
                ) : filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      Nenhum restaurante encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((t) => (
                    <tr 
                      key={t.id} 
                      onClick={() => setSelectedTenantDrawer(t)}
                      className="hover:bg-slate-800/50 transition-colors cursor-pointer group"
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          {t.logo_url ? (
                            <img
                              src={t.logo_url}
                              alt={t.name}
                              className="h-10 w-10 rounded-lg object-cover border border-slate-700"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 font-bold border border-slate-700">
                              {t.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-white flex items-center gap-2 group-hover:text-rose-400 transition-colors">
                              <span className="font-mono text-xs font-black bg-slate-800 text-rose-400 px-2 py-0.5 rounded border border-slate-700/80 shadow-2xs" title="Código de Login da Loja">
                                #{t.code || 1}
                              </span>
                              <span>{t.name}</span>
                              {t.slug === "vruum-burguer" && (
                                <Badge variant="outline" className="text-[10px] bg-rose-950/60 border-rose-800 text-rose-300">
                                  Piloto
                                </Badge>
                              )}
                            </div>

                            <div className="text-xs text-slate-500 flex items-center gap-2">
                              <span>Admin: <span className="text-slate-400 font-mono">{t.admin_username || "admin"}</span></span>
                              <span className="text-slate-600">•</span>
                              <span className="text-[11px] text-rose-400/80 group-hover:underline">Ver detalhes ➔</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                        <a
                          href={`/${t.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 hover:underline"
                        >
                          /{t.slug}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>

                      <td className="py-4 px-4">
                        <Badge
                          className={
                            t.plan === "premium"
                              ? "bg-amber-950/60 border-amber-800 text-amber-300"
                              : "bg-slate-800 border-slate-700 text-slate-300"
                          }
                        >
                          {t.plan === "premium" ? "Premium (Custom)" : "Comum (Básico)"}
                        </Badge>
                      </td>

                      <td className="py-4 px-4">
                        {t.is_active ? (
                          <Badge className="bg-emerald-950/60 border-emerald-800 text-emerald-400 flex items-center gap-1 w-fit">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            No ar
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-950/60 border-rose-800 text-rose-400 flex items-center gap-1 w-fit">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                            Pausada
                          </Badge>
                        )}
                      </td>

                      <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <Button
                            size="sm"
                            onClick={() => setSelectedTenantDrawer(t)}
                            className="bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs h-8 px-2.5"
                          >
                            Detalhes
                            <ChevronRight className="h-3 w-3 ml-1" />
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleStatus(t)}
                            title={t.is_active ? "Pausar e tirar do ar" : "Reativar loja no ar"}
                            className={`text-xs h-8 px-2.5 ${
                              t.is_active
                                ? "border-slate-800 hover:bg-amber-950/40 hover:text-amber-400 text-slate-400"
                                : "border-emerald-800 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60"
                            }`}
                          >
                            <Power className="h-3 w-3 mr-1" />
                            {t.is_active ? "Pausar" : "Reativar"}
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenDeleteModal(t)}
                            title="Excluir empresa"
                            className="text-xs border-rose-900/50 bg-rose-950/30 hover:bg-rose-900/60 text-rose-300 hover:text-white h-8 px-2.5"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DRAWER LATERAL 360° DO CLIENTE */}
        {selectedTenantDrawer && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-all animate-in fade-in duration-200">
            <div 
              className="w-full max-w-lg bg-slate-900 border-l border-slate-800 h-full overflow-y-auto shadow-2xl p-6 sm:p-8 flex flex-col justify-between animate-in slide-in-from-right duration-300"
            >
              <div className="space-y-6">
                {/* Header do Drawer */}
                <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    {selectedTenantDrawer.logo_url ? (
                      <img
                        src={selectedTenantDrawer.logo_url}
                        alt={selectedTenantDrawer.name}
                        className="h-12 w-12 rounded-xl object-cover border border-slate-700 shadow"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 font-black text-lg border border-slate-700">
                        {selectedTenantDrawer.name.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-white">{selectedTenantDrawer.name}</h3>
                        {selectedTenantDrawer.is_active ? (
                          <Badge className="bg-emerald-950/60 border-emerald-800 text-emerald-400 text-xs">No ar</Badge>
                        ) : (
                          <Badge className="bg-rose-950/60 border-rose-800 text-rose-400 text-xs">Pausada</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">/{selectedTenantDrawer.slug}</p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedTenantDrawer(null)}
                    className="text-slate-400 hover:text-white hover:bg-slate-800 rounded-full h-8 w-8"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>

                {/* Botões de WhatsApp 1-Clique */}
                <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <MessageSquare className="h-4 w-4" />
                      Ações no WhatsApp
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      {selectedTenantDrawer.phone || selectedTenantDrawer.whatsapp || "(31) 98260-7426"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button
                      onClick={() => handleOpenWhatsAppBilling(selectedTenantDrawer)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-10 shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare className="h-4 w-4" />
                      Cobrar no WhatsApp
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => handleOpenWhatsAppChat(selectedTenantDrawer)}
                      className="border-emerald-700/60 bg-emerald-900/20 hover:bg-emerald-800/40 text-emerald-300 font-semibold text-xs h-10 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      Chamar no WhatsApp
                    </Button>
                  </div>
                </div>

                {/* Bloco 1: Raio-X Financeiro (Asaas) */}
                <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-rose-500" />
                      Situação Financeira (Asaas)
                    </h4>
                    {selectedTenantDrawer.subscription_status === "active" ? (
                      <Badge className="bg-emerald-950 border-emerald-700 text-emerald-300">🟢 Em dia</Badge>
                    ) : selectedTenantDrawer.subscription_status === "overdue" ? (
                      <Badge className="bg-rose-950 border-rose-700 text-rose-300">🔴 Fatura Vencida</Badge>
                    ) : (
                      <Badge className="bg-amber-950 border-amber-700 text-amber-300">🟡 Pagamento Pendente</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400">Mensalidade</span>
                      <p className="text-lg font-black text-rose-400 mt-0.5">
                        R$ {(parseFloat(selectedTenantDrawer.monthly_price) || 149).toFixed(2).replace(".", ",")}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400">Vencimento</span>
                      <p className="text-base font-bold text-slate-200 mt-1">
                        {selectedTenantDrawer.next_due_date ? new Date(selectedTenantDrawer.next_due_date).toLocaleDateString("pt-BR") : "14/10/2026"}
                      </p>
                    </div>
                  </div>

                  {selectedTenantDrawer.payment_link && (
                    <div className="pt-2 flex items-center gap-2">
                      <a
                        href={selectedTenantDrawer.payment_link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow transition-all"
                      >
                        Abrir Fatura Oficial Asaas
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyPaymentLink(selectedTenantDrawer.payment_link, selectedTenantDrawer.id)}
                        className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs h-10 px-3"
                      >
                        {copiedId === selectedTenantDrawer.id ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}

                  {/* Dados Fiscais & Cadastrais da Loja */}
                  <div className="pt-3 border-t border-slate-900 grid grid-cols-1 gap-2 text-xs text-slate-400">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-500" /> E-mail de Cobrança:</span>
                      <span className="font-mono text-slate-200">{selectedTenantDrawer.email || "Não informado"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-slate-500" /> CPF / CNPJ:</span>
                      <span className="font-mono text-slate-200">{selectedTenantDrawer.cpf_cnpj || "Não cadastrado"}</span>
                    </div>
                    {selectedTenantDrawer.asaas_customer_id && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">ID Asaas:</span>
                        <span className="font-mono text-emerald-400 text-[11px]">{selectedTenantDrawer.asaas_customer_id}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bloco 2: Métricas de Pedidos e Vendas Reais */}
                <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-amber-400" />
                    Métricas Operacionais da Loja
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400">Pedidos no Painel</span>
                      <p className="text-2xl font-black text-white mt-0.5">
                        {selectedTenantDrawer.total_orders || 0}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400">Faturamento da Loja</span>
                      <p className="text-2xl font-black text-emerald-400 mt-0.5">
                        R$ {parseFloat(selectedTenantDrawer.total_revenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rodapé com Ações da Loja */}
              <div className="pt-6 border-t border-slate-800 space-y-2 mt-6">
                <Button
                  onClick={() => handleAccessStoreDashboard(selectedTenantDrawer)}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs h-11 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  Entrar no Painel do Restaurante (Impersonate)
                  <ArrowUpRight className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      handleToggleStatus(selectedTenantDrawer);
                      setSelectedTenantDrawer(prev => prev ? { ...prev, is_active: !prev.is_active } : null);
                    }}
                    className={`flex-1 text-xs h-10 rounded-xl font-bold cursor-pointer ${
                      selectedTenantDrawer.is_active
                        ? "border-amber-900/60 bg-amber-950/20 hover:bg-amber-950/50 text-amber-300"
                        : "border-emerald-800 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60"
                    }`}
                  >
                    <Power className="h-3.5 w-3.5 mr-1.5" />
                    {selectedTenantDrawer.is_active ? "Pausar Loja (Tirar do Ar)" : "Reativar Loja (Colocar no Ar)"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      const t = selectedTenantDrawer;
                      setSelectedTenantDrawer(null);
                      handleOpenDeleteModal(t);
                    }}
                    className="border-rose-900/40 bg-rose-950/20 hover:bg-rose-900/50 text-rose-400 hover:text-white text-xs h-10 px-3 rounded-xl cursor-pointer"
                    title="Excluir Empresa"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Criação de Nova Empresa */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                  <Sparkles className="h-5 w-5 text-rose-500" />
                  Cadastrar Nova Empresa
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Cria a loja limpa, credenciais de login e emite a fatura oficial no Asaas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="space-y-4 pt-2">
              <div>
                <Label className="text-slate-300 text-xs">Nome do Restaurante *</Label>
                <Input
                  required
                  placeholder="Ex: Texas Burger & Grill"
                  value={newTenant.name}
                  onChange={handleNameChange}
                  className="bg-slate-950 border-slate-800 text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-slate-300 text-xs">Slug da URL (Endereço do Cardápio) *</Label>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-slate-500 text-xs font-mono">seusaas.com/</span>
                  <Input
                    required
                    placeholder="texas-burger"
                    value={newTenant.slug}
                    onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })}
                    className="bg-slate-950 border-slate-800 text-white font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <Label className="text-slate-300 text-xs">Plano de Assinatura</Label>
                <select
                  value={newTenant.plan}
                  onChange={(e) => setNewTenant({ ...newTenant, plan: e.target.value })}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                >
                  <option value="basic">Plano Start (R$ 89,00/mês — Layout Padrão)</option>
                  <option value="premium">Plano Pro (R$ 149,00/mês — Personalizado)</option>
                </select>
              </div>

              {/* Bloco de Faturamento & Asaas */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <CreditCard className="h-3.5 w-3.5" />
                    Faturamento & Notificações (Asaas)
                  </span>
                  <Badge variant="outline" className="border-slate-800 text-slate-400 text-[10px]">
                    Automação Ativa
                  </Badge>
                </div>

                <div>
                  <Label className="text-slate-300 text-xs flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-slate-500" />
                    E-mail do Lojista (Faturas & Recibos) *
                  </Label>
                  <Input
                    type="email"
                    required
                    placeholder="financeiro@lojista.com"
                    value={newTenant.email}
                    onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })}
                    className="bg-slate-900 border-slate-800 text-white mt-1 text-sm"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    O Asaas enviará as faturas, Pix e comprovantes para este e-mail.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-slate-300 text-xs flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-500" />
                      WhatsApp de Cobrança
                    </Label>
                    <Input
                      placeholder="(31) 98888-7777"
                      value={newTenant.phone}
                      onChange={(e) => setNewTenant({ ...newTenant, phone: e.target.value })}
                      className="bg-slate-900 border-slate-800 text-white mt-1 text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-slate-300 text-xs flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-slate-500" />
                      CPF ou CNPJ (Opcional)
                    </Label>
                    <Input
                      placeholder="00.000.000/0001-00"
                      value={newTenant.cpf_cnpj}
                      onChange={(e) => setNewTenant({ ...newTenant, cpf_cnpj: e.target.value })}
                      className="bg-slate-900 border-slate-800 text-white mt-1 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Bloco de Login do Lojista */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
                <div>
                  <Label className="text-slate-300 text-xs">Usuário de Login Admin *</Label>
                  <Input
                    required
                    placeholder="admin"
                    value={newTenant.admin_username}
                    onChange={(e) => setNewTenant({ ...newTenant, admin_username: e.target.value })}
                    className="bg-slate-950 border-slate-800 text-white mt-1 font-mono"
                  />
                </div>

                <div>
                  <Label className="text-slate-300 text-xs">Senha de Acesso do Dono *</Label>
                  <Input
                    required
                    type="password"
                    placeholder="Defina uma senha"
                    value={newTenant.admin_password}
                    onChange={(e) => setNewTenant({ ...newTenant, admin_password: e.target.value })}
                    className="bg-slate-950 border-slate-800 text-white mt-1"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer shadow-lg shadow-rose-950/40"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Gerando no Asaas...
                    </>
                  ) : (
                    "Criar Empresa & Gerar Asaas"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edição de Empresa */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                  <Pencil className="h-5 w-5 text-sky-400" />
                  Editar Restaurante
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Atualize os dados e acessos de <span className="font-semibold text-white">{editingTenant?.name}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditTenant} className="space-y-4 pt-2">
              <div>
                <Label className="text-slate-300 text-xs">Nome do Restaurante *</Label>
                <Input
                  required
                  placeholder="Ex: Texas Burger & Grill"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="bg-slate-950 border-slate-800 text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-slate-300 text-xs">Slug da URL (Endereço do Cardápio) *</Label>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-slate-500 text-xs font-mono">seusaas.com/</span>
                  <Input
                    required
                    placeholder="texas-grill"
                    value={editForm.slug}
                    onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                    className="bg-slate-950 border-slate-800 text-white font-mono text-sm"
                  />
                  <span className="text-slate-500 text-xs font-mono">/menu</span>
                </div>
              </div>

              <div>
                <Label className="text-slate-300 text-xs">Plano de Assinatura</Label>
                <Select
                  value={editForm.plan}
                  onValueChange={(val) => setEditForm({ ...editForm, plan: val })}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-white mt-1">
                    <SelectValue placeholder="Selecione o plano" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white">
                    <SelectItem value="basic">Comum (Plano Básico)</SelectItem>
                    <SelectItem value="premium">Premium (Plano Customizado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-slate-300 text-xs">Foto do Restaurante / Logo (URL da Imagem)</Label>
                <Input
                  placeholder="https://exemplo.com/minha-foto.png (ou deixe vazio para sem logo)"
                  value={editForm.logo_url}
                  onChange={(e) => setEditForm({ ...editForm, logo_url: e.target.value })}
                  className="bg-slate-950 border-slate-800 text-white mt-1 text-xs"
                />
                {editForm.logo_url && (
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={editForm.logo_url}
                      alt="Prévia"
                      className="h-10 w-10 rounded-lg object-cover border border-slate-700 bg-slate-950"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="text-[11px] text-slate-400">Prévia do logo da empresa</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                <div>
                  <Label className="text-slate-300 text-xs">Usuário de Acesso do Dono</Label>
                  <Input
                    placeholder="admin"
                    value={editForm.admin_username}
                    onChange={(e) => setEditForm({ ...editForm, admin_username: e.target.value })}
                    className="bg-slate-950 border-slate-800 text-white mt-1"
                  />
                </div>

                <div>
                  <Label className="text-slate-300 text-xs">Nova Senha (Opcional)</Label>
                  <Input
                    type="password"
                    placeholder="Deixe vazio p/ manter"
                    value={editForm.admin_password}
                    onChange={(e) => setEditForm({ ...editForm, admin_password: e.target.value })}
                    className="bg-slate-950 border-slate-800 text-white mt-1"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                💡 Só preencha a nova senha se desejar redefinir o acesso do restaurante.
              </p>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-semibold"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Alterações"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Exclusão de Empresa */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-rose-900/60 text-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl text-rose-400 shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Excluir Restaurante
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Tem certeza que deseja excluir <span className="font-bold text-rose-300">{deletingTenant?.name}</span>?
                </p>
              </div>
            </div>

            <div className="p-3 bg-rose-950/30 border border-rose-900/40 rounded-xl text-xs text-rose-200/90 leading-relaxed">
              ⚠️ <strong>Ação permanente:</strong> Isso apagará definitivamente o cardápio, pedidos, produtos, categorias, clientes e credenciais deste restaurante.
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <Button
                type="button"
                variant="ghost"
                disabled={isDeleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteTenant}
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  "Excluir Definitivamente"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

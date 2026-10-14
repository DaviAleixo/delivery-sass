import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  ExternalLink,
  Trash2,
  Search,
  Filter,
  Check,
  Copy,
  Bug,
  Flame,
  ArrowRight,
  ShieldAlert,
  Zap,
  Printer,
  CreditCard,
  Webhook,
  FileCode,
  Store,
  ChevronDown,
  Info,
  X
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchSystemIssues,
  reportIssue,
  resolveSystemIssue,
  reopenSystemIssue,
  updateSystemIssueStatus,
  deleteSystemIssue,
  simulateSentryTestIssue,
} from "@/services/issueTracker";

export default function IssuesCenter({ tenants = [] }) {
  const { toast } = useToast();
  const [issues, setIssues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filtros
  const [statusFilter, setStatusFilter] = useState("open"); // 'all', 'open', 'urgent', 'in_progress', 'resolved'
  const [sourceFilter, setSourceFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Modal de Criação Manual
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newIssue, setNewIssue] = useState({
    title: "",
    description: "",
    severity: "urgent", // 'urgent', 'warning', 'info'
    source: "manual",
    path: "",
    tenant_id: "",
  });

  // Modal de Detalhes / Raio-X do Erro
  const [selectedIssueDetails, setSelectedIssueDetails] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    loadIssues();

    // Listener para novas pendências disparadas em tempo real
    const handleNewIssue = () => {
      loadIssues(false);
    };
    window.addEventListener("system_issue_reported", handleNewIssue);
    return () => {
      window.removeEventListener("system_issue_reported", handleNewIssue);
    };
  }, []);

  const loadIssues = async (showLoadingState = true) => {
    if (showLoadingState) setIsLoading(true);
    setIsRefreshing(true);
    try {
      const data = await fetchSystemIssues();
      setIssues(data);
    } catch (err) {
      console.error("Erro ao carregar pendências:", err);
      toast({
        title: "Erro ao buscar pendências",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Submissão de Pendência Manual
  const handleCreateManualIssue = async (e) => {
    e.preventDefault();
    if (!newIssue.title.trim()) {
      toast({
        title: "Título obrigatório",
        description: "Informe o título da pendência.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedTenant = tenants.find((t) => t.id === newIssue.tenant_id);

      await reportIssue({
        title: newIssue.title.trim(),
        description: newIssue.description.trim(),
        severity: newIssue.severity,
        source: newIssue.source || "manual",
        path: newIssue.path?.trim() || null,
        tenant_id: selectedTenant?.id || null,
        tenant_name: selectedTenant?.name || null,
        metadata: {
          created_manually_by: "SuperAdmin (Davi)",
          created_at: new Date().toISOString(),
        },
      });

      toast({
        title: "Pendência Registrada!",
        description: newIssue.severity === "urgent" 
          ? "🚨 Pendência Urgente gravada e monitorada no Sentry." 
          : "Pendência cadastrada com sucesso.",
      });

      setIsCreateModalOpen(false);
      setNewIssue({
        title: "",
        description: "",
        severity: "urgent",
        source: "manual",
        path: "",
        tenant_id: "",
      });

      await loadIssues(false);
    } catch (err) {
      toast({
        title: "Erro ao cadastrar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resolução / Reabertura
  const handleToggleResolve = async (issue) => {
    const isResolved = issue.status === "resolved";
    try {
      if (isResolved) {
        await reopenSystemIssue(issue.id);
        toast({ title: "Pendência Reaberta", description: "O item voltou para o status aberto." });
      } else {
        await resolveSystemIssue(issue.id, "Davi (SuperAdmin)");
        toast({ title: "✓ Pendência Resolvida!", description: "Item marcado como concluído." });
      }
      await loadIssues(false);
    } catch (err) {
      toast({ title: "Erro na alteração", description: err.message, variant: "destructive" });
    }
  };

  // Mudar status para 'in_progress'
  const handleSetInProgress = async (issue) => {
    try {
      await updateSystemIssueStatus(issue.id, "in_progress");
      toast({ title: "Em Andamento", description: "Marcado como sendo investigado." });
      await loadIssues(false);
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  // Excluir pendência
  const handleDeleteIssue = async (issueId) => {
    if (!window.confirm("Deseja realmente excluir este registro de pendência?")) return;
    try {
      await deleteSystemIssue(issueId);
      toast({ title: "Excluído", description: "Registro removido com sucesso." });
      await loadIssues(false);
    } catch (err) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
  };

  // Simular Erro do Sentry
  const handleSimulateError = async (type) => {
    try {
      setIsRefreshing(true);
      await simulateSentryTestIssue(type);
      toast({
        title: "🧪 Erro Simulado com Sucesso!",
        description: "Exceção enviada ao Sentry e gravada como pendência urgente no painel.",
      });
      await loadIssues(false);
    } catch (err) {
      toast({ title: "Erro na simulação", description: err.message, variant: "destructive" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Métricas
  const totalIssues = issues.length;
  const urgentCount = issues.filter((i) => i.severity === "urgent" && i.status !== "resolved").length;
  const openCount = issues.filter((i) => i.status === "open").length;
  const inProgressCount = issues.filter((i) => i.status === "in_progress").length;
  const resolvedCount = issues.filter((i) => i.status === "resolved").length;
  const sentryCount = issues.filter((i) => i.source === "sentry" || i.sentry_event_id).length;

  // Filtragem
  const filteredIssues = issues.filter((issue) => {
    // Filtro por status
    if (statusFilter === "open" && issue.status === "resolved") return false;
    if (statusFilter === "urgent" && (issue.severity !== "urgent" || issue.status === "resolved")) return false;
    if (statusFilter === "in_progress" && issue.status !== "in_progress") return false;
    if (statusFilter === "resolved" && issue.status !== "resolved") return false;

    // Filtro por origem
    if (sourceFilter !== "all" && issue.source !== sourceFilter) return false;

    // Busca textual
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchTitle = issue.title?.toLowerCase().includes(term);
      const matchDesc = issue.description?.toLowerCase().includes(term);
      const matchPath = issue.path?.toLowerCase().includes(term);
      const matchTenant = issue.tenant_name?.toLowerCase().includes(term);
      if (!matchTitle && !matchDesc && !matchPath && !matchTenant) return false;
    }

    return true;
  });

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case "urgent":
        return (
          <Badge className="bg-rose-950/80 text-rose-300 border-rose-700/80 hover:bg-rose-900 flex items-center gap-1.5 shadow-sm shadow-rose-950">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            URGENTE
          </Badge>
        );
      case "warning":
        return (
          <Badge className="bg-amber-950/80 text-amber-300 border-amber-700/80 hover:bg-amber-900 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            ATENÇÃO
          </Badge>
        );
      default:
        return (
          <Badge className="bg-blue-950/80 text-blue-300 border-blue-700/80 hover:bg-blue-900 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            INFO
          </Badge>
        );
    }
  };

  const getSourceIcon = (source) => {
    switch (source) {
      case "sentry":
        return <Bug className="h-3.5 w-3.5 text-purple-400" />;
      case "checkout":
        return <CreditCard className="h-3.5 w-3.5 text-emerald-400" />;
      case "webhook":
        return <Webhook className="h-3.5 w-3.5 text-sky-400" />;
      case "printer":
        return <Printer className="h-3.5 w-3.5 text-amber-400" />;
      default:
        return <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />;
    }
  };

  const getSourceLabel = (source) => {
    switch (source) {
      case "sentry": return "Sentry Automático";
      case "checkout": return "Checkout PIX";
      case "webhook": return "Webhook Gateway";
      case "printer": return "Fila de Impressão";
      default: return "Manual";
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra de Ações do Topo */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-4 rounded-xl backdrop-blur-sm shadow-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Central de Pendências & Observabilidade Sentry
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Monitoramento proativo em tempo real de falhas de pedidos, webhooks e erros de sistema
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Menu de Simulação do Sentry para Testes */}
          <div className="flex items-center rounded-lg bg-slate-950/80 border border-slate-800 p-0.5">
            <span className="text-[11px] font-semibold text-slate-400 px-2 flex items-center gap-1">
              <Zap className="h-3 w-3 text-amber-400" /> Simular:
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleSimulateError("checkout")}
              className="h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
              title="Simular falha de pagamento PIX no checkout"
            >
              Checkout PIX
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleSimulateError("webhook")}
              className="h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
              title="Simular webhook do Asaas com erro"
            >
              Webhook Asaas
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleSimulateError("printer")}
              className="h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
              title="Simular impressora travada na cozinha"
            >
              Impressora
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadIssues(false)}
            className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-lg shadow-rose-900/30"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nova Pendência Manual
          </Button>
        </div>
      </div>

      {/* Grid de Métricas da Central */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card Urgentes */}
        <Card className={`border backdrop-blur-sm transition-all ${
          urgentCount > 0 
            ? "bg-rose-950/30 border-rose-800/80 shadow-lg shadow-rose-950/40" 
            : "bg-slate-900/50 border-slate-800"
        }`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${urgentCount > 0 ? "bg-rose-500 animate-ping" : "bg-slate-600"}`} />
              Pendências Urgentes
            </CardTitle>
            <AlertTriangle className={`h-5 w-5 ${urgentCount > 0 ? "text-rose-500 animate-bounce" : "text-slate-600"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-black ${urgentCount > 0 ? "text-rose-400" : "text-slate-400"}`}>
              {urgentCount}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {urgentCount === 0 ? "Nenhum problema crítico pendente" : "Requer ação imediata para não travar lojas"}
            </p>
          </CardContent>
        </Card>

        {/* Card Abertas */}
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total em Aberto</CardTitle>
            <Clock className="h-5 w-5 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-amber-400">
              {openCount + inProgressCount}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {inProgressCount > 0 ? `${inProgressCount} marcadas em andamento` : "Aguardando investigação"}
            </p>
          </CardContent>
        </Card>

        {/* Card Sentry / Auto */}
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Sentry & Automáticas</CardTitle>
            <Bug className="h-5 w-5 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-purple-400">
              {sentryCount}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Falhas capturadas por observabilidade
            </p>
          </CardContent>
        </Card>

        {/* Card Resolvidas */}
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Resolvidas</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-emerald-400">
              {resolvedCount}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Histórico de pendências sanadas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant={statusFilter === "open" ? "default" : "ghost"}
            onClick={() => setStatusFilter("open")}
            className={statusFilter === "open" ? "bg-rose-600 text-white font-bold" : "text-slate-400 hover:text-white"}
          >
            🔴 Abertas ({openCount + inProgressCount})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "urgent" ? "default" : "ghost"}
            onClick={() => setStatusFilter("urgent")}
            className={statusFilter === "urgent" ? "bg-rose-950 border border-rose-800 text-rose-200 font-bold" : "text-slate-400 hover:text-white"}
          >
            🚨 Urgentes ({urgentCount})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "in_progress" ? "default" : "ghost"}
            onClick={() => setStatusFilter("in_progress")}
            className={statusFilter === "in_progress" ? "bg-amber-600 text-white font-bold" : "text-slate-400 hover:text-white"}
          >
            🟡 Em Andamento ({inProgressCount})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "resolved" ? "default" : "ghost"}
            onClick={() => setStatusFilter("resolved")}
            className={statusFilter === "resolved" ? "bg-emerald-600 text-white font-bold" : "text-slate-400 hover:text-white"}
          >
            ✅ Resolvidas ({resolvedCount})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "all" ? "default" : "ghost"}
            onClick={() => setStatusFilter("all")}
            className={statusFilter === "all" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-white"}
          >
            Todas ({totalIssues})
          </Button>
        </div>

        {/* Filtro de Origem & Busca */}
        <div className="flex items-center gap-2">
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[150px] h-9 text-xs bg-slate-900 border-slate-800 text-slate-300">
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
              <SelectItem value="all">Todas as Origens</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="sentry">Sentry</SelectItem>
              <SelectItem value="checkout">Checkout</SelectItem>
              <SelectItem value="webhook">Webhook</SelectItem>
              <SelectItem value="printer">Impressora</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Buscar título, loja, rota..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 pl-9 text-xs bg-slate-900 border-slate-800 text-white placeholder:text-slate-500"
            />
          </div>
        </div>
      </div>

      {/* Lista de Pendências */}
      {isLoading ? (
        <div className="py-16 text-center text-slate-500 bg-slate-900/30 rounded-xl border border-slate-800">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-rose-500" />
          <p className="text-sm font-medium">Carregando pendências e eventos do Sentry...</p>
        </div>
      ) : filteredIssues.length === 0 ? (
        <div className="py-16 text-center bg-slate-900/20 rounded-xl border border-dashed border-slate-800">
          <CheckCircle2 className="h-12 w-12 text-emerald-500/60 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">Tudo Limpo e Operando Perfeitamente!</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            Nenhuma pendência ou falha encontrada com os filtros atuais.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setStatusFilter("all"); setSourceFilter("all"); setSearchTerm(""); }}
            className="mt-4 border-slate-800 bg-slate-900 text-slate-300"
          >
            Limpar Filtros
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIssues.map((issue) => {
            const isResolved = issue.status === "resolved";
            const isUrgent = issue.severity === "urgent";

            return (
              <div
                key={issue.id}
                className={`p-4 rounded-xl border transition-all ${
                  isResolved
                    ? "bg-slate-900/30 border-slate-800/80 opacity-75"
                    : isUrgent
                    ? "bg-slate-900/80 border-rose-900/60 shadow-lg shadow-rose-950/20 hover:border-rose-700/80"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    {/* Header do Card */}
                    <div className="flex flex-wrap items-center gap-2">
                      {getSeverityBadge(issue.severity)}
                      
                      <Badge variant="outline" className="bg-slate-950/60 border-slate-800 text-slate-400 text-xs flex items-center gap-1 font-mono">
                        {getSourceIcon(issue.source)}
                        {getSourceLabel(issue.source)}
                      </Badge>

                      {issue.status === "in_progress" && (
                        <Badge className="bg-amber-950 border-amber-800 text-amber-300 text-xs">
                          🟡 Em Investigação
                        </Badge>
                      )}

                      {isResolved && (
                        <Badge className="bg-emerald-950 border-emerald-800 text-emerald-300 text-xs">
                          ✓ Resolvida
                        </Badge>
                      )}

                      {issue.tenant_name && (
                        <Badge variant="outline" className="bg-slate-900 border-slate-700 text-slate-300 text-xs flex items-center gap-1">
                          <Store className="h-3 w-3 text-rose-400" />
                          {issue.tenant_name}
                        </Badge>
                      )}

                      {issue.path && (
                        <span 
                          onClick={() => copyToClipboard(issue.path, `path_${issue.id}`)}
                          className="font-mono text-[11px] bg-slate-950 px-2 py-0.5 rounded text-slate-400 border border-slate-800 hover:text-white cursor-pointer flex items-center gap-1"
                          title="Clique para copiar o caminho / rota"
                        >
                          <FileCode className="h-3 w-3 text-slate-500" />
                          {issue.path}
                          {copiedId === `path_${issue.id}` && <Check className="h-3 w-3 text-emerald-400" />}
                        </span>
                      )}

                      <span className="text-[11px] text-slate-500 ml-auto flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(issue.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {/* Título & Descrição */}
                    <div>
                      <h4 className={`text-base font-bold ${isResolved ? "line-through text-slate-500" : "text-white"}`}>
                        {issue.title}
                      </h4>
                      {issue.description && (
                        <p className="text-xs text-slate-400 line-clamp-2 mt-1 whitespace-pre-wrap font-sans">
                          {issue.description}
                        </p>
                      )}
                    </div>

                    {/* Sentry Event ID & Metadados */}
                    {issue.sentry_event_id && (
                      <div className="flex items-center gap-2 pt-1 text-[11px] text-purple-400/90 font-mono">
                        <Bug className="h-3.5 w-3.5 text-purple-400" />
                        <span>Sentry Event: {issue.sentry_event_id}</span>
                        <a
                          href={`https://sentry.io`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline flex items-center gap-0.5 text-slate-400 hover:text-white"
                        >
                          (Abrir no Sentry <ExternalLink className="h-2.5 w-2.5" />)
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Ações Rápidas */}
                  <div className="flex items-center gap-2 self-end md:self-center border-t md:border-t-0 border-slate-800 pt-3 md:pt-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedIssueDetails(issue)}
                      className="h-8 text-xs border-slate-800 bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800"
                    >
                      <Info className="h-3.5 w-3.5 mr-1" />
                      Raio-X
                    </Button>

                    {!isResolved && issue.status !== "in_progress" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSetInProgress(issue)}
                        className="h-8 text-xs border-amber-900/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900"
                      >
                        Investigar
                      </Button>
                    )}

                    <Button
                      size="sm"
                      onClick={() => handleToggleResolve(issue)}
                      className={`h-8 text-xs font-semibold ${
                        isResolved
                          ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                          : "bg-emerald-600 hover:bg-emerald-700 text-white"
                      }`}
                    >
                      {isResolved ? "Reabrir" : "✓ Resolver"}
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDeleteIssue(issue.id)}
                      className="h-8 w-8 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40"
                      title="Excluir pendência"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Nova Pendência Manual */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-white">Cadastrar Nova Pendência</h3>
                <p className="text-xs text-slate-400">Registre uma falha, tarefa urgente ou alerta operacional</p>
              </div>
            </div>

            <form onSubmit={handleCreateManualIssue} className="space-y-4">
              {/* Nível de Urgência */}
              <div>
                <Label className="text-xs text-slate-300 font-semibold">Nível de Urgência / Gravidade</Label>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setNewIssue({ ...newIssue, severity: "urgent" })}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      newIssue.severity === "urgent"
                        ? "bg-rose-950 border-rose-600 text-rose-200 shadow-sm shadow-rose-900/50"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    🚨 Urgente
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewIssue({ ...newIssue, severity: "warning" })}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      newIssue.severity === "warning"
                        ? "bg-amber-950 border-amber-600 text-amber-200 shadow-sm shadow-amber-900/50"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    ⚠️ Atenção
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewIssue({ ...newIssue, severity: "info" })}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      newIssue.severity === "info"
                        ? "bg-blue-950 border-blue-600 text-blue-200 shadow-sm shadow-blue-900/50"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    ℹ️ Informativo
                  </button>
                </div>
              </div>

              {/* Título */}
              <div>
                <Label htmlFor="issue_title" className="text-xs text-slate-300 font-semibold">
                  Título da Pendência *
                </Label>
                <Input
                  id="issue_title"
                  placeholder="Ex: Falha ao gerar PIX Mercado Pago na loja Texas Grill"
                  value={newIssue.title}
                  onChange={(e) => setNewIssue({ ...newIssue, title: e.target.value })}
                  className="mt-1 bg-slate-950 border-slate-800 text-white text-sm"
                  required
                />
              </div>

              {/* Descrição */}
              <div>
                <Label htmlFor="issue_desc" className="text-xs text-slate-300 font-semibold">
                  Descrição dos Fatos / Detalhes
                </Label>
                <Textarea
                  id="issue_desc"
                  placeholder="Explique o que aconteceu, mensagem de erro, cliente afetado..."
                  value={newIssue.description}
                  onChange={(e) => setNewIssue({ ...newIssue, description: e.target.value })}
                  className="mt-1 bg-slate-950 border-slate-800 text-white text-xs min-h-[90px]"
                />
              </div>

              {/* Caminho Opcional e Loja */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="issue_path" className="text-xs text-slate-300 font-semibold">
                    Caminho / Rota / URL (Opcional)
                  </Label>
                  <Input
                    id="issue_path"
                    placeholder="Ex: /texas-grill/menu ou /pdv"
                    value={newIssue.path}
                    onChange={(e) => setNewIssue({ ...newIssue, path: e.target.value })}
                    className="mt-1 bg-slate-950 border-slate-800 text-white text-xs font-mono"
                  />
                </div>

                <div>
                  <Label className="text-xs text-slate-300 font-semibold">
                    Loja Envolvida (Opcional)
                  </Label>
                  <Select
                    value={newIssue.tenant_id}
                    onValueChange={(val) => setNewIssue({ ...newIssue, tenant_id: val })}
                  >
                    <SelectTrigger className="mt-1 bg-slate-950 border-slate-800 text-white text-xs">
                      <SelectValue placeholder="Selecione a loja..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                      <SelectItem value="none">Nenhuma (Geral do SaaS)</SelectItem>
                      {tenants.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} ({t.slug})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
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
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                >
                  {isSubmitting ? "Salvando..." : "Registrar Pendência"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Raio-X da Pendência */}
      {selectedIssueDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setSelectedIssueDetails(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Bug className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-white">Raio-X da Ocorrência</h3>
                <p className="text-xs text-slate-400">Diagnóstico técnico completo capturado pelo sistema</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-xs text-slate-400 font-semibold mb-1">Título</div>
                <div className="text-sm text-white font-bold">{selectedIssueDetails.title}</div>
              </div>

              {selectedIssueDetails.description && (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-xs text-slate-400 font-semibold mb-1">Descrição / Stack Trace</div>
                  <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto bg-slate-900 p-2 rounded border border-slate-800/80">
                    {selectedIssueDetails.description}
                  </pre>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-500 font-semibold">Severidade</div>
                  <div className="mt-1">{getSeverityBadge(selectedIssueDetails.severity)}</div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-500 font-semibold">Origem</div>
                  <div className="text-white font-medium mt-1 flex items-center gap-1">
                    {getSourceIcon(selectedIssueDetails.source)}
                    {getSourceLabel(selectedIssueDetails.source)}
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-500 font-semibold">Loja / Cliente</div>
                  <div className="text-white font-medium mt-1">
                    {selectedIssueDetails.tenant_name || "Geral (Sem loja específica)"}
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-500 font-semibold">Caminho / Rota</div>
                  <div className="text-white font-mono mt-1 truncate" title={selectedIssueDetails.path}>
                    {selectedIssueDetails.path || "N/A"}
                  </div>
                </div>
              </div>

              {selectedIssueDetails.sentry_event_id && (
                <div className="bg-purple-950/30 p-3 rounded-xl border border-purple-800/60">
                  <div className="text-xs text-purple-300 font-semibold flex items-center gap-1.5">
                    <Bug className="h-4 w-4 text-purple-400" />
                    Sentry Event ID
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs font-mono text-purple-200">
                    <span>{selectedIssueDetails.sentry_event_id}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(selectedIssueDetails.sentry_event_id, "sentry_id")}
                      className="h-6 text-[10px] text-purple-300 hover:text-white hover:bg-purple-900/50"
                    >
                      {copiedId === "sentry_id" ? "Copiado!" : "Copiar ID"}
                    </Button>
                  </div>
                </div>
              )}

              {selectedIssueDetails.metadata && Object.keys(selectedIssueDetails.metadata).length > 0 && (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-xs text-slate-400 font-semibold mb-1">Metadados Adicionais (JSON)</div>
                  <pre className="text-[11px] text-slate-400 font-mono bg-slate-900 p-2 rounded overflow-x-auto max-h-36">
                    {JSON.stringify(selectedIssueDetails.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedIssueDetails(null)}
                className="border-slate-800 bg-slate-950 text-slate-300"
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

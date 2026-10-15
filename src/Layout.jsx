import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, Package, ShoppingBag, Settings, LogOut, Image as ImageIcon, Tag, BarChart, Folder, Users, Monitor, Layers, Flame, Lock, CreditCard, ExternalLink, RefreshCw, Bike, ChevronRight, ChevronDown } from "lucide-react";
import { Settings as SettingsEntity } from "@/entities/Settings";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { getStoreStatusInfo } from "@/utils/storeStatus";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navigationItems = [
  {
    title: "Dashboard",
    pageKey: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: LayoutDashboard,
  },
  {
    title: "Pedidos",
    pageKey: "Orders",
    url: createPageUrl("Orders"),
    icon: ShoppingBag,
  },
  {
    title: "KDS Cozinha",
    pageKey: "KDS",
    url: createPageUrl("KDS"),
    icon: Flame,
  },
  {
    title: "PDV Balcão",
    pageKey: "PDV",
    url: createPageUrl("PDV"),
    icon: Monitor,
  },
  {
    title: "Entregadores",
    pageKey: "DeliveryDrivers",
    url: createPageUrl("DeliveryDrivers"),
    icon: Bike,
  },
  {
    title: "Clientes",
    pageKey: "Clients",
    url: createPageUrl("Clients"),
    icon: Users,
  },
  {
    title: "Produtos",
    pageKey: "Products",
    url: createPageUrl("Products"),
    icon: Package,
  },
  {
    title: "Categorias",
    pageKey: "Categories",
    url: createPageUrl("Categories"),
    icon: Folder,
  },
  {
    title: "Complementos",
    pageKey: "Complements",
    url: createPageUrl("Complements"),
    icon: Layers,
  },
  {
    title: "Cupons",
    pageKey: "Coupons",
    url: createPageUrl("Coupons"),
    icon: Tag,
  },
  {
    title: "Banners",
    pageKey: "Banners",
    url: createPageUrl("Banners"),
    icon: ImageIcon,
  },
  {
    title: "Relatórios",
    pageKey: "Reports",
    url: createPageUrl("Reports"),
    icon: BarChart,
  },
  {
    title: "Configurações",
    pageKey: "Settings",
    url: createPageUrl("Settings"),
    icon: Settings,
  },
];

import { Order } from "@/entities/Order";
import { soundAlert } from "@/utils/soundAlert";
import { useToast } from "@/components/ui/use-toast";
import { Bell, BellOff, Volume2 } from "lucide-react";

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user: authUser, isAdminAuthenticated: isSessionAuth, isLoadingAuth, logout } = useAuth();
  const [user, setUser] = React.useState(null);
  const [settings, setSettings] = React.useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = React.useState(true);
  const [pendingOrdersCount, setPendingOrdersCount] = React.useState(0);
  
  const knownPendingIds = React.useRef(new Set());
  const isFirstLoad = React.useRef(true);
  const isFetchingRef = React.useRef(false);

  const publicPages = ["Menu", "MyOrders", "AdminLogin", "Home", "PrintOrder", "PrintShiftClosing", "SuperAdmin"];
  const isPublicPage = publicPages.includes(currentPageName);
  const isAdminAuthenticated = isSessionAuth || (typeof window !== "undefined" && localStorage.getItem("admin_auth") === "authenticated");

  React.useEffect(() => {
    if (authUser) {
      setUser(authUser);
    }
  }, [authUser]);

  React.useEffect(() => {
    loadUser();
    loadSettings();
    setIsCheckingAuth(false);
  }, [location.pathname, currentPageName]);

  const pathSegments = location.pathname.split("/").filter(Boolean);
  const RESERVED_LIST = new Set(["menu", "dashboard", "orders", "pedidos", "pdv", "kds", "deliverydrivers", "clients", "products", "categories", "banners", "coupons", "complements", "reports", "settings", "superadmin", "adminlogin", "myorders", "printorder", "home", "api"]);
  const routeStoreSlug = pathSegments.length > 0 && !RESERVED_LIST.has(pathSegments[0].toLowerCase()) ? pathSegments[0].toLowerCase() : null;
  const prettySlugName = routeStoreSlug ? routeStoreSlug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : null;

  const currentStoreName = settings?.restaurant_name 
    || (routeStoreSlug ? (routeStoreSlug === "vrumm" || routeStoreSlug === "vruum-burguer" ? "Vruum Burguer" : prettySlugName) : (typeof window !== "undefined" ? localStorage.getItem("current_tenant_name") : null)) 
    || 'Vruum Burguer';

  // Se estiver na página de Pedidos, limpa o contador de não lidos
  React.useEffect(() => {
    if (currentPageName === "Orders" || location.pathname.endsWith("/Orders")) {
      setPendingOrdersCount(0);
    }
  }, [currentPageName, location.pathname]);

  React.useEffect(() => {
    if (!isPublicPage && !isAdminAuthenticated && !isLoadingAuth && !isCheckingAuth) {
      navigate(createPageUrl("AdminLogin"), { replace: true });
    }
  }, [isPublicPage, isAdminAuthenticated, isLoadingAuth, isCheckingAuth, navigate]);

  // Alerta Global de Novos Pedidos para TODAS as abas do Painel Administrativo do RESTAURANTE (nunca SuperAdmin)
  React.useEffect(() => {
    if (isPublicPage || !isAdminAuthenticated || currentPageName === "SuperAdmin") {
      soundAlert.stopContinuousAlert();
      soundAlert.setPendingCount(0);
      return;
    }

    // Solicita permissão para notificações na área de trabalho do PC
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const checkNewOrders = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        const ordersData = await Order.list("-created_date", 25);
        const safeOrders = Array.isArray(ordersData) ? ordersData : [];
        const currentPending = safeOrders.filter(o => o.status === 'pendente');
        const currentPendingIds = currentPending.map(o => o.id);

        // Atualiza o alarme sonoro contínuo do restaurante
        soundAlert.setPendingCount(currentPending.length);

        // Se NÃO estiver na página de Pedidos, atualiza a numeração de notificação
        const isCurrentlyOnOrdersPage = currentPageName === "Orders" || window.location.pathname.endsWith("/Orders");
        if (!isCurrentlyOnOrdersPage) {
          setPendingOrdersCount(currentPending.length);
          if (typeof document !== "undefined" && currentPending.length > 0) {
            document.title = `(${currentPending.length}) 🛵 ${currentStoreName} — Pedidos`;
          }
        } else {
          setPendingOrdersCount(0);
        }

        if (!isFirstLoad.current) {
          const newOrders = currentPending.filter(o => !knownPendingIds.current.has(o.id));
          if (newOrders.length > 0) {
            // Notificação visual na tela
            const firstNew = newOrders[0];
            const orderNum = String(firstNew.id).slice(-6).toUpperCase();
            const clientName = firstNew.customer_name || "Cliente";
            
            toast({
              title: "🔔 Novo Pedido Recebido!",
              description: `Pedido #${orderNum} de ${clientName} (${firstNew.order_type === 'delivery' ? 'Delivery 🛵' : firstNew.order_type === 'dine_in' ? 'Mesa 🍽️' : 'Retirada 🥡'})`,
              duration: 10000,
            });

            // Notificação do Navegador (fecha automaticamente em 10 segundos)
            if ("Notification" in window && Notification.permission === "granted") {
              try {
                const notif = new Notification(`🔔 Novo Pedido #${orderNum}!`, {
                  body: `${clientName} acabou de enviar um pedido. Abra o painel para confirmar!`,
                  icon: "/favicon.ico",
                  tag: `order-${firstNew.id}`
                });
                setTimeout(() => {
                  try { notif.close(); } catch {}
                }, 10000);
              } catch (_e) {}
            }
          }
        }

        knownPendingIds.current = new Set(currentPendingIds);
        isFirstLoad.current = false;
      } catch (err) {
        console.log("Erro no monitor global de pedidos:", err);
      } finally {
        isFetchingRef.current = false;
      }
    };

    checkNewOrders();
    const interval = setInterval(checkNewOrders, 5000);

    let unsubscribe;
    try {
      const activeTenantId = typeof window !== "undefined" ? localStorage.getItem("current_tenant_id") : null;
      if (activeTenantId) {
        unsubscribe = Order.subscribe(() => {
          checkNewOrders();
        }, { filter: `tenant_id=eq.${activeTenantId}` });
      }
    } catch (_e) {}

    return () => {
      clearInterval(interval);
      if (unsubscribe && typeof unsubscribe === "function") unsubscribe();
      soundAlert.stopContinuousAlert();
      soundAlert.setPendingCount(0);
    };
  }, [isPublicPage, isAdminAuthenticated, currentPageName, settings, user]);


  const loadUser = async () => {
    try {
      // 1. Tentar ler sessão nativa do Supabase Auth
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const { data: member } = await supabase
              .from("tenant_admins")
              .select("id, tenant_id, role, username")
              .eq("user_id", session.user.id)
              .maybeSingle();

            if (member) {
              setUser({
                id: member.id,
                user_id: session.user.id,
                username: member.username,
                role: member.role,
                tenant_id: member.tenant_id,
                permissions: ["*"],
              });
              return;
            }
          }
        } catch (_authErr) {}
      }

      // 2. Fallback de transição: admin_user em localStorage
      const storedAdmin = localStorage.getItem("admin_user");
      if (storedAdmin) {
        let username = "admin";
        let role = "admin";
        let permissions = ["*"];
        let id = null;

        try {
          const parsed = JSON.parse(storedAdmin);
          if (typeof parsed === "string") {
            username = parsed;
          } else if (typeof parsed === "object" && parsed !== null) {
            username = parsed.username || parsed.name || parsed.email?.split("@")[0] || "admin";
            role = parsed.role || "admin";
            permissions = Array.isArray(parsed.permissions) ? parsed.permissions : ["*"];
            id = parsed.id || null;
          }
        } catch {
          username = storedAdmin;
        }

        setUser({
          id,
          username,
          role,
          permissions,
        });
        return;
      }

      // Se autenticado como admin sem admin_user salvo
      if (localStorage.getItem("admin_auth") === "authenticated") {
        setUser({
          id: null,
          username: "admin",
          role: "admin",
          permissions: ["*"],
        });
        return;
      }

      setUser(null);
    } catch (_error) {
      console.log("User not authenticated", _error);
      setUser(null);
    }
  };

  const userPermissions = React.useMemo(() => {
    if (!user) return ["*"];
    if (user.role === "admin" || user.role === "super_admin" || user.role === "owner") return ["*"];
    if (Array.isArray(user.permissions) && user.permissions.length > 0) {
      return user.permissions;
    }
    return ["*"];
  }, [user]);

  const hasPermission = React.useCallback((pageKey) => {
    if (!pageKey) return true;
    if (userPermissions.includes("*")) return true;
    if (userPermissions.includes(pageKey)) return true;
    if (pageKey === "DeliveryDrivers" && (userPermissions.includes("Orders") || userPermissions.includes("Settings") || userPermissions.includes("PDV"))) {
      return true;
    }
    return false;
  }, [userPermissions]);

  const activeSlug = routeStoreSlug || (typeof window !== "undefined" ? localStorage.getItem("current_tenant_slug") : null) || "vrumm";

  const allowedNavigationItems = React.useMemo(() => {
    const plan = settings?.plan;
    const salonMode = settings?.salon_mode || (plan === "showcase" || plan === "table" ? "showcase" : "full");
    const isVisualOnly = salonMode === "showcase";
    const isTableOnly = salonMode === "table_only";

    return navigationItems
      .filter(item => {
        if (!hasPermission(item.pageKey)) return false;
        if (isVisualOnly) {
          const hiddenInShowcase = ["Orders", "KDS", "PDV", "DeliveryDrivers", "Clients", "Coupons", "Reports"];
          if (hiddenInShowcase.includes(item.pageKey)) return false;
        } else if (isTableOnly) {
          const hiddenInTableOnly = ["DeliveryDrivers", "Clients"];
          if (hiddenInTableOnly.includes(item.pageKey)) return false;
        }
        return true;
      })
      .map(item => ({
        ...item,
        url: `/${activeSlug}/${item.pageKey}`
      }));
  }, [hasPermission, activeSlug, settings?.plan, settings?.salon_mode]);

  // Se o usuário tentar acessar uma tela para a qual não tem permissão, redireciona
  React.useEffect(() => {
    if (!isPublicPage && isAdminAuthenticated && user) {
      if (!hasPermission(currentPageName)) {
        const firstAllowed = allowedNavigationItems[0];
        if (firstAllowed) {
          toast({
            title: "Acesso Não Permitido",
            description: `Seu plano não possui acesso à tela "${currentPageName}".`,
            variant: "destructive",
          });
          navigate(firstAllowed.url, { replace: true });
        }
      }
    }
  }, [currentPageName, user, isPublicPage, isAdminAuthenticated, allowedNavigationItems, hasPermission, navigate, toast]);

  const loadSettings = async () => {
    try {
      const segments = location.pathname.split("/").filter(Boolean);
      const RESERVED = new Set(["menu", "dashboard", "orders", "pedidos", "pdv", "kds", "deliverydrivers", "clients", "products", "categories", "banners", "coupons", "complements", "reports", "settings", "superadmin", "adminlogin", "myorders", "printorder", "home", "api"]);
      const slugFromPath = segments.length > 0 && !RESERVED.has(segments[0].toLowerCase()) ? segments[0].toLowerCase() : null;
      const targetSlug = slugFromPath || localStorage.getItem("current_tenant_slug");
      const currentTenantId = localStorage.getItem("current_tenant_id");
      const currentTenantName = localStorage.getItem("current_tenant_name");

      if (slugFromPath && typeof window !== "undefined" && slugFromPath !== localStorage.getItem("current_tenant_slug")) {
        localStorage.setItem("current_tenant_slug", slugFromPath);
        const fastId = localStorage.getItem(`tenant_id_by_slug_${slugFromPath}`);
        if (fastId) {
          localStorage.setItem("current_tenant_id", fastId);
        } else if (slugFromPath === "vrumm" || slugFromPath === "vruum-burguer") {
          localStorage.setItem("current_tenant_id", "a0000000-0000-0000-0000-000000000001");
        } else {
          localStorage.removeItem("current_tenant_id");
        }
      }

      if (isSupabaseConfigured() && supabase) {
        let query = supabase.from("tenants").select("id, name, slug, plan, salon_mode, logo_url, banner_url, opening_time, closing_time, open_days, phone, address, whatsapp, instagram, delivery_fee, min_order_value, delivery_fee_type, delivery_neighborhoods, delivery_unlisted_policy, delivery_fallback_fee, free_delivery_threshold, address_city, address_state, address_neighborhood, cep");
        if (targetSlug) {
          query = query.eq("slug", targetSlug);
        } else if (currentTenantId) {
          query = query.eq("id", currentTenantId);
        }

        const { data: tenantData } = await query.maybeSingle();

        if (tenantData) {
          setSettings({
            restaurant_name: tenantData.name || currentTenantName || "Vruum Burguer",
            restaurant_logo: tenantData.logo_url || null,
            ...tenantData,
          });
          localStorage.setItem("current_tenant_id", tenantData.id);
          localStorage.setItem("current_tenant_slug", tenantData.slug);
          localStorage.setItem("current_tenant_name", tenantData.name);
          localStorage.setItem(`tenant_id_by_slug_${tenantData.slug}`, tenantData.id);
          localStorage.setItem(`tenant_name_by_slug_${tenantData.slug}`, tenantData.name);
          return;
        }
      }

      if (currentTenantName) {
        setSettings((prev) => ({
          ...prev,
          restaurant_name: currentTenantName,
          restaurant_logo: null,
        }));
        return;
      }

      const isVruum = currentTenantId === "a0000000-0000-0000-0000-000000000001" || localStorage.getItem("current_tenant_slug") === "vrumm";
      if (isVruum) {
        const settingsData = await SettingsEntity.list();
        if (settingsData && settingsData.length > 0) {
          setSettings(settingsData[0]);
        }
      } else {
        setSettings({
          restaurant_name: currentTenantName || "Minha Loja",
          restaurant_logo: null,
          instagram: null,
          phone: null,
          whatsapp: null,
          address: null,
          delivery_fee: 0,
          min_order_value: 0,
        });
      }
    } catch (_error) {
      console.log("Error loading settings", _error);
    }
  };

  const handleLogout = async () => {
    soundAlert.stopContinuousAlert();
    soundAlert.setPendingCount(0);
    try {
      await logout();
    } catch (_e) {}
    navigate(createPageUrl("AdminLogin"), { replace: true });
  };




  // Se for página de login, impressão ou SuperAdmin, mostrar sem layout de barra lateral de loja
  if (currentPageName === "AdminLogin" || currentPageName === "PrintOrder" || currentPageName === "PrintShiftClosing") {
    return <div className="min-h-screen bg-white">{children}</div>;
  }
  if (currentPageName === "SuperAdmin") {
    return <div className="min-h-screen bg-slate-950">{children}</div>;
  }

  // Se for página privada e não estiver logado como admin, redirecionar
  if (!isPublicPage && !isAdminAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600 mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Redirecionando para login...</p>
        </div>
      </div>
    );
  }

  // Se a loja estiver pausada / suspensa por inadimplência, bloquear o acesso administrativo da loja
  if (settings && settings.is_active === false && user?.role !== "super_admin") {
    const paymentLink = settings?.payment_link || "https://sandbox.asaas.com/i/r7wwc9plm0m0fp4n";
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-rose-900/60 rounded-3xl p-8 text-center shadow-2xl space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-rose-950/80 border border-rose-800 flex items-center justify-center mx-auto text-rose-400">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">{settings?.restaurant_name || "Loja"}</h2>
            <p className="text-rose-400 text-xs font-bold uppercase tracking-wider mt-1">
              🔒 Loja Pausada / Assinatura Pendente
            </p>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            O acesso a este painel e o cardápio público foram pausados temporariamente. Para reativar seu sistema instantaneamente, realize o pagamento da sua fatura no Asaas.
          </p>
          <div className="space-y-2.5 pt-2">
            <a
              href={paymentLink}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold text-sm py-3.5 px-6 rounded-2xl shadow-lg transition-all"
            >
              <CreditCard className="w-4 h-4" />
              Pagar Fatura no Asaas (PIX / Cartão)
              <ExternalLink className="w-4 h-4 ml-1" />
            </a>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-3 px-4 rounded-xl border border-slate-700 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Já realizei o pagamento (Reativar Agora)
            </button>
          </div>

          <div className="pt-4 border-t border-slate-800">
            <button
              onClick={handleLogout}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1.5 mx-auto cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair da conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Se não for a página do Menu, mostrar layout admin
  if (currentPageName !== "Menu" && currentPageName !== "MyOrders" && currentPageName !== "PrintOrder" && currentPageName !== "PrintShiftClosing") {
    const pageTitles = {
      Dashboard: "Dashboard",
      Orders: "Pedidos",
      KDS: "KDS (Cozinha)",
      PDV: "PDV (Balcão)",
      DeliveryDrivers: "Entregadores",
      Clients: "Clientes",
      Products: "Produtos",
      Categories: "Categorias",
      Complements: "Complementos",
      Coupons: "Cupons e Fidelidade",
      Banners: "Banners",
      Reports: "Relatórios",
      Settings: "Configurações",
    };
    const currentPageTitle = pageTitles[currentPageName] || currentPageName;
    const storeStatus = getStoreStatusInfo(settings);

    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-[#F7F9F8]">
          <Sidebar className="border-r border-gray-200/80 bg-white text-stone-900">
            {user?.role === "super_admin" && (
              <div className="p-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-200">
                <span className="font-semibold text-emerald-400">👑 Modo Super Admin</span>
                <Link
                  to={createPageUrl("SuperAdmin")}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded text-[11px] font-bold"
                >
                  Painel Master
                </Link>
              </div>
            )}
            
            {/* Header da Sidebar com a Logo PedeMuleke Oficial */}
            <SidebarHeader className="border-b border-gray-100 p-5 bg-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-[#047857] shadow-2xs">
                  <svg className="w-5 h-5 text-[#047857]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                    <path d="M3 6h18" />
                    <path d="M16 10a4 4 0 0 1-8 0" />
                  </svg>
                </div>
                <div className="flex items-baseline tracking-tight">
                  <span className="text-xl font-black text-gray-950">Pede</span>
                  <span className="text-xl font-black text-[#047857]">Muleke</span>
                </div>
              </div>
            </SidebarHeader>
            
            <SidebarContent className="p-3 bg-white">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1">
                    {allowedNavigationItems.map((item) => {
                      const isActive = location.pathname === item.url;
                      const isOrdersItem = item.title === "Pedidos";
                      const isSettingsItem = item.title === "Configurações";
                      const showCount = isOrdersItem;

                      return (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton 
                            asChild 
                            className={`h-10.5 transition-all duration-150 rounded-2xl px-3.5 text-[13.5px] ${
                              isActive 
                                ? 'bg-[#E6F4EA] text-[#047857] font-bold shadow-none hover:bg-[#E6F4EA] hover:text-[#047857]' 
                                : 'text-gray-600 hover:bg-gray-50/80 hover:text-gray-950 font-medium'
                            }`}
                          >
                            <Link to={item.url} className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-3 truncate">
                                <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#047857]' : 'text-gray-500'}`} />
                                <span className="truncate">{item.title}</span>
                              </div>
                              {showCount && (
                                <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full flex items-center justify-center min-w-[20px] ${
                                  isActive
                                    ? 'bg-[#D1E9DF] text-[#047857]'
                                    : pendingOrdersCount > 0
                                    ? 'bg-[#047857] text-white animate-pulse'
                                    : 'text-gray-400 bg-gray-100'
                                }`}>
                                  {pendingOrdersCount}
                                </span>
                              )}
                              {isSettingsItem && (
                                <ChevronRight className="w-4 h-4 text-gray-400 ml-auto shrink-0" />
                              )}
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup className="mt-auto pt-3 border-t border-gray-150">
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild className="rounded-2xl border border-[#D1E9DF] text-gray-800 hover:bg-[#D1E9DF]/30 hover:text-[#047857] hover:border-[#047857]/40 transition-all font-bold text-sm">
                        <Link to={`/${activeSlug}/menu`} target="_blank" className="flex items-center gap-3 px-3.5 py-2.5">
                          <ShoppingBag className="w-4 h-4 text-[#047857] flex-shrink-0" />
                          <span>Ver Cardápio Online</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            {/* Card da Loja no Rodapé da Sidebar */}
            <SidebarFooter className="border-t border-gray-100 p-3 bg-white">
              <div className="space-y-2">
                <div 
                  onClick={() => navigate(`/${activeSlug}/Settings`)}
                  className="border border-gray-200/90 bg-white rounded-2xl p-2.5 flex items-center justify-between shadow-2xs hover:bg-gray-50/70 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {settings?.restaurant_logo ? (
                      <img 
                        src={settings.restaurant_logo} 
                        alt="Logo" 
                        className="w-8 h-8 rounded-full object-cover border border-gray-100 shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-stone-900 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-2xs uppercase">
                        {(settings?.restaurant_name || currentStoreName || "SR").substring(0, 2)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900 text-xs truncate leading-tight group-hover:text-[#047857] transition-colors">
                        {settings?.restaurant_name || currentStoreName || "Seu Restaurante"}
                      </p>
                      <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${storeStatus.isOpen ? "bg-emerald-500" : "bg-rose-500"} shrink-0`} />
                        <span>{storeStatus.isOpen ? "Loja aberta" : "Loja fechada"}</span>
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-700 shrink-0 transition-colors" />
                </div>

                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] text-gray-400 font-medium truncate max-w-[150px]">
                    {user?.username || "admin"}
                  </span>
                  <button 
                    onClick={handleLogout}
                    className="text-[11px] text-gray-400 hover:text-rose-600 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    title="Sair do painel"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            </SidebarFooter>
          </Sidebar>

          <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
            {/* Top Navbar Moderna Idêntica à Foto (sem notificação) */}
            <header className="bg-white border-b border-gray-150 px-4 md:px-6 py-2.5 shrink-0 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 p-2 rounded-xl transition-colors cursor-pointer" />
                <h1 className="text-sm md:text-base font-bold text-gray-900">{currentPageTitle}</h1>
              </div>

              <div className="flex items-center gap-3">
                {/* Status da Loja */}
                <div 
                  onClick={() => navigate(`/${activeSlug}/Settings`)}
                  title="Clique para gerenciar o horário e status da loja"
                  className="bg-white border border-gray-200 text-gray-800 rounded-full px-3.5 py-1.5 text-xs font-semibold flex items-center gap-2 shadow-2xs hover:bg-gray-50 transition-colors cursor-pointer select-none"
                >
                  <span className={`w-2 h-2 rounded-full ${storeStatus.isOpen ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                  <span className="text-gray-800 font-bold">{storeStatus.isOpen ? "Loja Aberta" : "Loja Fechada"}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </div>

                {/* Avatar da Loja / Usuário */}
                <div 
                  onClick={() => navigate(`/${activeSlug}/Settings`)}
                  className="w-8 h-8 rounded-full bg-stone-900 text-white font-bold text-xs flex items-center justify-center shadow-2xs uppercase cursor-pointer hover:ring-2 hover:ring-emerald-500 transition-all"
                  title="Perfil do Restaurante"
                >
                  {(settings?.restaurant_name || currentStoreName || "SR").substring(0, 2)}
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-auto min-w-0 h-full">
              {children}
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  // Layout sem sidebar (Menu, Login, etc.)
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">{children}</div>
    </div>
  );
}
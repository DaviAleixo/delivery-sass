import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, Package, ShoppingBag, Settings, LogOut, Image as ImageIcon, Tag, BarChart, Folder, Users, Monitor, Layers, Flame } from "lucide-react";
import { Settings as SettingsEntity } from "@/entities/Settings";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
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
  const [soundEnabled, setSoundEnabled] = React.useState(soundAlert.isEnabled());
  const [pendingOrdersCount, setPendingOrdersCount] = React.useState(0);
  
  const knownPendingIds = React.useRef(new Set());
  const isFirstLoad = React.useRef(true);
  const isFetchingRef = React.useRef(false);

  const publicPages = ["Menu", "MyOrders", "AdminLogin", "Home", "PrintOrder", "SuperAdmin"];
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
  const RESERVED_LIST = new Set(["menu", "dashboard", "orders", "pedidos", "pdv", "clients", "products", "categories", "banners", "coupons", "complements", "reports", "settings", "superadmin", "adminlogin", "myorders", "printorder", "home", "api"]);
  const routeStoreSlug = pathSegments.length > 0 && !RESERVED_LIST.has(pathSegments[0].toLowerCase()) ? pathSegments[0].toLowerCase() : null;
  const prettySlugName = routeStoreSlug ? routeStoreSlug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : null;

  const currentStoreName = settings?.restaurant_name || (routeStoreSlug ? prettySlugName : (typeof window !== "undefined" ? localStorage.getItem("current_tenant_name") : null)) || 'Delivery 1.0';

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

  // Alerta Global de Novos Pedidos para TODAS as abas do Painel Administrativo
  React.useEffect(() => {
    if (isPublicPage || !isAdminAuthenticated) return;

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

        // Atualiza o alarme sonoro contínuo (toca sem parar enquanto houver pedidos pendentes)
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
    };
  }, [isPublicPage, isAdminAuthenticated, currentPageName, settings]);

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
    if (user.role === "admin") return ["*"];
    if (Array.isArray(user.permissions) && user.permissions.length > 0) {
      return user.permissions;
    }
    return ["*"];
  }, [user]);

  const hasPermission = React.useCallback((pageKey) => {
    if (!pageKey) return true;
    if (userPermissions.includes("*")) return true;
    return userPermissions.includes(pageKey);
  }, [userPermissions]);

  const activeSlug = routeStoreSlug || (typeof window !== "undefined" ? localStorage.getItem("current_tenant_slug") : null) || "vrumm";

  const allowedNavigationItems = React.useMemo(() => {
    return navigationItems
      .filter(item => hasPermission(item.pageKey))
      .map(item => ({
        ...item,
        url: `/${activeSlug}/${item.pageKey}`
      }));
  }, [hasPermission, activeSlug]);

  // Se o usuário tentar acessar uma tela para a qual não tem permissão, redireciona
  React.useEffect(() => {
    if (!isPublicPage && isAdminAuthenticated && user) {
      if (!hasPermission(currentPageName)) {
        const firstAllowed = allowedNavigationItems[0];
        if (firstAllowed) {
          toast({
            title: "Acesso Não Permitido",
            description: `Seu usuário não possui permissão para acessar a tela "${currentPageName}".`,
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
      const RESERVED = new Set(["menu", "dashboard", "orders", "pedidos", "pdv", "clients", "products", "categories", "banners", "coupons", "complements", "reports", "settings", "superadmin", "adminlogin", "myorders", "printorder", "home", "api"]);
      const slugFromPath = segments.length > 0 && !RESERVED.has(segments[0].toLowerCase()) ? segments[0].toLowerCase() : null;
      const targetSlug = slugFromPath || localStorage.getItem("current_tenant_slug");
      const currentTenantId = localStorage.getItem("current_tenant_id");
      const currentTenantName = localStorage.getItem("current_tenant_name");

      if (isSupabaseConfigured() && supabase) {
        let query = supabase.from("tenants").select("id, name, slug, logo_url, banner_url, opening_time, closing_time, open_days, phone, address, whatsapp, instagram, delivery_fee, min_order_value, delivery_fee_type, delivery_neighborhoods, delivery_unlisted_policy, delivery_fallback_fee, free_delivery_threshold, address_city, address_state, address_neighborhood, cep");
        if (targetSlug) {
          query = query.eq("slug", targetSlug);
        } else if (currentTenantId) {
          query = query.eq("id", currentTenantId);
        }

        const { data: tenantData } = await query.maybeSingle();

        if (tenantData) {
          setSettings({
            restaurant_name: tenantData.name || currentTenantName || "Delivery 1.0",
            restaurant_logo: tenantData.logo_url || null,
            ...tenantData,
          });
          localStorage.setItem("current_tenant_id", tenantData.id);
          localStorage.setItem("current_tenant_slug", tenantData.slug);
          localStorage.setItem("current_tenant_name", tenantData.name);
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
    try {
      await logout();
    } catch (_e) {}
    navigate(createPageUrl("AdminLogin"), { replace: true });
  };

  const toggleSoundAlert = () => {
    const nextState = !soundEnabled;
    soundAlert.setEnabled(nextState);
    setSoundEnabled(nextState);
    if (nextState) {
      soundAlert.playOrderChime();
    }
  };

  // Se for página de login, impressão ou SuperAdmin, mostrar sem layout de barra lateral de loja
  if (currentPageName === "AdminLogin" || currentPageName === "PrintOrder") {
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

  // Se não for a página do Menu, mostrar layout admin
  if (currentPageName !== "Menu" && currentPageName !== "MyOrders" && currentPageName !== "PrintOrder") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-gray-50">
          <Sidebar className="border-r border-stone-200 bg-white text-stone-900">
            {user?.role === "super_admin" && (
              <div className="p-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-200">
                <span className="font-semibold text-rose-400">👑 Modo Super Admin</span>
                <Link
                  to={createPageUrl("SuperAdmin")}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-2 py-0.5 rounded text-[11px] font-bold"
                >
                  Painel Master
                </Link>
              </div>
            )}
            <SidebarHeader className="border-b border-stone-200 p-4 bg-stone-50/50">
              <div className="flex items-center gap-3">
                {settings?.restaurant_logo ? (
                  <img 
                    src={settings.restaurant_logo} 
                    alt="Logo" 
                    className="w-10 h-10 rounded-xl object-cover shadow-sm border border-stone-200"
                  />
                ) : (
                  <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-sm shadow-sm border border-slate-800">
                    {(settings?.restaurant_name || "D").substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="font-extrabold text-base text-stone-950 leading-tight" style={{ letterSpacing: '-0.02em' }}>
                    {settings?.restaurant_name || 'Delivery 1.0'}
                  </h2>
                  <p className="text-xs font-bold text-red-600 mt-0.5">Painel Administrativo</p>
                </div>
              </div>
            </SidebarHeader>
            
            <SidebarContent className="p-3 bg-white">
              <SidebarGroup>
                <SidebarGroupLabel className="text-[11px] font-extrabold text-stone-400 uppercase tracking-widest px-3 py-2">
                  Menu Principal
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1">
                    {allowedNavigationItems.map((item) => {
                      const isActive = location.pathname === item.url;
                      const isOrdersItem = item.title === "Pedidos";
                      const showBadge = isOrdersItem && pendingOrdersCount > 0 && !isActive;

                      return (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton 
                            asChild 
                            className={`h-10 transition-all duration-150 rounded-xl px-3.5 font-semibold text-sm ${
                              isActive 
                                ? 'bg-red-600 text-white font-bold shadow-md shadow-red-200 hover:bg-red-700 hover:text-white' 
                                : 'text-stone-700 hover:bg-stone-100 hover:text-stone-950'
                            }`}
                          >
                            <Link to={item.url} className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-3 truncate">
                                <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-stone-500'}`} />
                                <span className="truncate">{item.title}</span>
                              </div>
                              {showBadge && (
                                <span className="ml-auto bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse flex items-center justify-center min-w-[20px] h-5">
                                  {pendingOrdersCount}
                                </span>
                              )}
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup className="mt-auto pt-4 border-t border-stone-100">
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild className="rounded-xl border border-stone-200 text-stone-800 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all font-bold text-sm">
                        <Link to={`/${activeSlug}/menu`} target="_blank" className="flex items-center gap-3 px-3 py-2.5">
                          <ShoppingBag className="w-4 h-4 text-red-600 flex-shrink-0" />
                          <span>Ver Cardápio Online</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="border-t border-stone-200 p-3 bg-stone-50/70 space-y-2">
              {/* Status do Som de Novos Pedidos */}
              <div className="flex items-center justify-between bg-white border border-stone-200 p-2 rounded-xl shadow-xs">
                <button
                  type="button"
                  onClick={toggleSoundAlert}
                  className="flex items-center gap-2 text-xs font-bold text-stone-700 hover:text-stone-900 transition-colors cursor-pointer"
                  title="Ativar/Desativar som de novos pedidos"
                >
                  {soundEnabled ? (
                    <>
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <Bell className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-[11px] text-emerald-800">Alerta de Pedido Ativo</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 rounded-full bg-red-400" />
                      <BellOff className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-[11px] text-red-700">Som Mudo</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => soundAlert.playOrderChime()}
                  className="p-1 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors"
                  title="Testar Campainha"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center flex-shrink-0 text-white font-black text-xs shadow-sm uppercase">
                    {(user?.username || 'a').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-stone-900 text-xs truncate">
                      {user?.username || "admin"}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-1.5 text-stone-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-1 cursor-pointer"
                  title="Sair do painel"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </SidebarFooter>
          </Sidebar>

          <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
            <header className="bg-white border-b border-gray-200 px-6 py-4 md:hidden shrink-0">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="hover:bg-gray-100 p-2 rounded-lg transition-colors duration-200" />
                <h1 className="text-xl font-semibold text-gray-900">{settings?.restaurant_name || 'Admin Panel'}</h1>
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
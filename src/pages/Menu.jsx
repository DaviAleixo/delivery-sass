import React, { useState, useEffect } from "react";
import { Product } from "@/entities/Product";
import { ProductAdditional } from "@/entities/ProductAdditional";
import { Order } from "@/entities/Order";
import { Settings } from "@/entities/Settings";
import { BannerImage } from "@/entities/BannerImage";
import { Category } from "@/entities/Category";
import { Coupon } from "@/entities/Coupon";
import { CouponUsage } from "@/entities/CouponUsage";
import { ComplementGroup } from "@/entities/ComplementGroup";
import { ComplementItem } from "@/entities/ComplementItem";
import { ProductComplementGroup } from "@/entities/ProductComplementGroup";
import { User } from "@/entities/User";
import { base44 } from "@/api/base44Client";
import { AnimatePresence, motion } from "framer-motion";
import ProductCard from "../components/menu/ProductCard";
import PopularProductsRow from "../components/menu/PopularProductsRow";
import RecentOrdersRow from "../components/menu/RecentOrdersRow";
import Cart from "../components/menu/Cart";
import OrderModal from "../components/menu/OrderModal";
import PixOnlineModal from "../components/menu/PixOnlineModal";
import BannerCarousel from "../components/menu/BannerCarousel";
import UserProfileSheet from "../components/menu/UserProfileSheet";
import StoreInfoSheet from "../components/menu/StoreInfoSheet";
import ProductDetailModal from "../components/menu/ProductDetailModal";
import { 
  XCircle, 
  ShoppingBag, 
  Bike, 
  ChevronRight, 
  Search, 
  MapPin, 
  Phone, 
  ArrowRight,
  Instagram
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { isStoreOpen } from "@/utils/storeStatus";
import { useTenant } from "@/lib/TenantContext";

export default function MenuPage() {
  const navigate = useNavigate();
  const { tenant, tenantId } = useTenant();
  const [searchParams] = useSearchParams();
  const urlMesa = searchParams.get("mesa");

  const [products, setProducts] = useState([]);
  const [additionals, setAdditionals] = useState([]);
  const [settings, setSettings] = useState(null);
  const [banners, setBanners] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState([]);
  const [isCartVisible, setIsCartVisible] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [pixOnlineOrder, setPixOnlineOrder] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [storeIsOpen, setStoreIsOpen] = useState(true);
  const [activeGuestOrder, setActiveGuestOrder] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [complementGroups, setComplementGroups] = useState([]);
  const [complementItems, setComplementItems] = useState([]);
  const [productComplementGroups, setProductComplementGroups] = useState([]);

  useEffect(() => {
    if (urlMesa) {
      try {
        localStorage.setItem("vrumburguer_table_number", urlMesa);
      } catch {}
    }
  }, [urlMesa]);

  useEffect(() => {
    loadData();
    checkActiveOrders();
    loadRecentOrders();
    requestNotificationPermission();

    const unsubSettings = Settings.subscribe(() => loadData());
    const unsubBanners = BannerImage.subscribe(() => loadData());
    const unsubProducts = Product.subscribe(() => loadData());
    const unsubCategories = Category.subscribe(() => loadData());

    return () => {
      if (typeof unsubSettings === "function") unsubSettings();
      if (typeof unsubBanners === "function") unsubBanners();
      if (typeof unsubProducts === "function") unsubProducts();
      if (typeof unsubCategories === "function") unsubCategories();
    };
  }, [tenantId, tenant]);

  const requestNotificationPermission = async () => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  };

  const loadRecentOrders = async () => {
    try {
      let loggedUser = null;
      try {
        loggedUser = await base44.auth.me();
      } catch {}

      const allOrders = await Order.list("-created_date", 25);
      if (!Array.isArray(allOrders) || allOrders.length === 0) {
        setRecentOrders([]);
        return;
      }

      const recentIds = JSON.parse(localStorage.getItem("vrumburguer_recent_orders") || "[]");
      const savedPhone = (localStorage.getItem("vrumburguer_customer_phone") || "").replace(/\D/g, "");

      let filtered = [];

      if (loggedUser?.email) {
        filtered = allOrders.filter(o => o.user_email === loggedUser.email);
      }

      if (recentIds.length > 0) {
        const localMatched = allOrders.filter(o => recentIds.includes(o.id));
        filtered = [...filtered, ...localMatched];
      }

      if (savedPhone && savedPhone.length >= 8) {
        const phoneOrders = allOrders.filter(o => {
          const op = (o.customer_phone || "").replace(/\D/g, "");
          return op === savedPhone || (op.length >= 8 && op.endsWith(savedPhone.slice(-8)));
        });
        filtered = [...filtered, ...phoneOrders];
      }

      // Se não houver pedidos específicos salvos no navegador, utiliza os últimos pedidos da loja (até 10)
      if (filtered.length === 0) {
        filtered = allOrders.slice(0, 10);
      }

      // Deduplica por ID
      const uniqueOrders = [];
      const seenIds = new Set();
      for (const order of filtered) {
        if (!seenIds.has(order.id)) {
          seenIds.add(order.id);
          uniqueOrders.push(order);
        }
      }

      setRecentOrders(uniqueOrders.slice(0, 10));
    } catch (_err) {
      console.log("Erro ao carregar últimos pedidos:", _err);
    }
  };

  const checkActiveOrders = async () => {
    try {
      const user = await base44.auth.me();

      if (user?.email) {
        const allOrders = await Order.list("-created_date", 10);
        const active = allOrders.find(o => o.user_email === user.email && ['pendente', 'confirmado', 'preparando', 'enviado'].includes(o.status));
        setActiveGuestOrder(active || null);
        return;
      }

      const recentIds = JSON.parse(localStorage.getItem("vrumburguer_recent_orders") || "[]");
      if (!Array.isArray(recentIds) || recentIds.length === 0) {
        setActiveGuestOrder(null);
        return;
      }

      const allOrders = await Order.list("-created_date", 10);
      const active = allOrders.find(o => recentIds.includes(o.id) && !o.user_email && ['pendente', 'confirmado', 'preparando', 'enviado'].includes(o.status));
      setActiveGuestOrder(active || null);
    } catch (_err) {
      console.log("Erro ao verificar pedidos ativos:", _err);
      setActiveGuestOrder(null);
    }
  };

  const loadData = async () => {
    try {
      const activeTenantId = tenantId || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";

      const [productsData, additionalsData, settingsData, bannerData, categoryData, groupsData, itemsData, pcgData] = await Promise.all([
        Product.filter({ tenant_id: activeTenantId, available: true }, "-created_date"),
        ProductAdditional.filter({ tenant_id: activeTenantId }),
        Settings.list(),
        BannerImage.filter({ tenant_id: activeTenantId, active: true }, "order_index"),
        Category.filter({ tenant_id: activeTenantId }, "order_index"),
        ComplementGroup.filter({ tenant_id: activeTenantId }, "order_index"),
        ComplementItem.filter({ tenant_id: activeTenantId }, "order_index"),
        ProductComplementGroup.filter({ tenant_id: activeTenantId }, "-created_date"),
      ]);

      setProducts(productsData || []);
      setAdditionals(additionalsData || []);
      setComplementGroups(groupsData || []);
      setComplementItems(itemsData || []);
      setProductComplementGroups(pcgData || []);

      const segments = window.location.pathname.split("/").filter(Boolean);
      const RESERVED = ["menu", "dashboard", "orders", "pdv", "adminlogin", "superadmin"];
      const pathSlug = segments.length > 0 && !RESERVED.includes(segments[0].toLowerCase()) ? segments[0].toLowerCase() : null;
      const effectiveSlug = pathSlug || tenant?.slug || localStorage.getItem("current_tenant_slug");
      const isVruum = effectiveSlug === "vrumm" || effectiveSlug === "vruum-burguer";

      const resolvedSettings = {
        restaurant_name: tenant?.name || (isVruum ? "Vruum Burguer" : "Novo Restaurante"),
        restaurant_logo: tenant?.logo_url || (isVruum ? settingsData[0]?.restaurant_logo : null),
        banner_url: tenant?.banner_url || (isVruum ? settingsData[0]?.banner_url : null),
        delivery_fee: tenant?.delivery_fee ?? (isVruum ? 6.50 : 0),
        min_order_value: tenant?.min_order_value ?? (isVruum ? 20.00 : 0),
        delivery_time: tenant?.delivery_time || "40-50 min",
        delivery_fee_type: tenant?.delivery_fee_type || "fixed",
        delivery_neighborhoods: Array.isArray(tenant?.delivery_neighborhoods) ? tenant.delivery_neighborhoods : [],
        delivery_unlisted_policy: tenant?.delivery_unlisted_policy || "block",
        delivery_fallback_fee: tenant?.delivery_fallback_fee ?? 10.00,
        free_delivery_threshold: tenant?.free_delivery_threshold ?? null,
        phone: tenant?.phone || (isVruum ? settingsData[0]?.phone : ""),
        whatsapp: tenant?.whatsapp || (isVruum ? settingsData[0]?.whatsapp : ""),
        address: tenant?.address || (isVruum ? settingsData[0]?.address : ""),
        address_city: tenant?.address_city || "",
        address_state: tenant?.address_state || "",
        instagram: tenant?.instagram || (isVruum ? settingsData[0]?.instagram : ""),
        opening_time: tenant?.opening_time || "18:00",
        closing_time: tenant?.closing_time || "23:59",
        open_days: tenant?.open_days || [],
        payment_methods: tenant?.payment_methods || null,
      };

      setSettings(resolvedSettings);
      setStoreIsOpen(isStoreOpen(resolvedSettings));
      setBanners(bannerData || []);
      setCategories(categoryData || []);
      
      if (categoryData && categoryData.length > 0 && !activeCategory) {
        setActiveCategory(categoryData[0].id);
      }
    } catch (_error) {
      console.error("Erro ao carregar dados:", _error);
    }
  };

  const popularRankedProducts = React.useMemo(() => {
    if (!products || products.length === 0) return [];

    return [...products]
      .filter(p => p.available !== false)
      .sort((a, b) => {
        if (b.popular && !a.popular) return 1;
        if (a.popular && !b.popular) return -1;
        return (Number(b.price) || 0) - (Number(a.price) || 0);
      })
      .slice(0, 7);
  }, [products]);

  const addToCart = (product, selectedAdditionals = [], quantity = 1, notes = "") => {
    setCart((prevCart) => {
      const existingItemIndex = prevCart.findIndex(
        (item) =>
          item.id === product.id &&
          JSON.stringify(item.additionals) === JSON.stringify(selectedAdditionals) &&
          item.notes === notes
      );

      if (existingItemIndex > -1) {
        const newCart = [...prevCart];
        newCart[existingItemIndex].quantity += quantity;
        return newCart;
      }

      return [
        ...prevCart,
        {
          ...product,
          cartItemId: `${product.id || 'item'}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          additionals: selectedAdditionals,
          quantity,
          notes,
        },
      ];
    });

    setIsCartVisible(true);
  };

  const updateCartQuantity = (index, newQuantity) => {
    if (newQuantity <= 0) {
      setCart((prevCart) => prevCart.filter((_, i) => i !== index));
    } else {
      setCart((prevCart) =>
        prevCart.map((item, i) =>
          i === index ? { ...item, quantity: newQuantity } : item
        )
      );
    }
  };

  const handleProductClick = (product) => {
    setSelectedProduct(product);
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => {
      const additionalsTotal = (item.additionals || []).reduce((sum, ad) => sum + ad.price, 0);
      return total + (item.price + additionalsTotal) * item.quantity;
    }, 0);
  };

  const isSearching = Boolean(searchQuery.trim());
  const filteredProducts = products.filter(product => {
    const matchesCategory = isSearching || !activeCategory || product.category === activeCategory;
    const matchesSearch = !isSearching || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (product.description && product.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const activeCategoryObj = categories.find(c => c.id === activeCategory);
  const comboCategory = categories.find(c => c.is_combo);

  const handleCartToggle = () => {
    setIsCartVisible(!isCartVisible);
  };

  const handleCheckout = () => {
    if (!storeIsOpen) {
      alert("Desculpe, o restaurante está fechado no momento para novos pedidos.");
      return;
    }
    setShowOrderModal(true);
  };

  const submitOrder = async (orderData) => {
    setIsSubmitting(true);
    try {
      const activeTenantId = tenantId || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";
      const orderPayload = {
        ...orderData,
        tenant_id: activeTenantId,
      };
      const createdOrder = await Order.create(orderPayload);

      try {
        const recentOrders = JSON.parse(localStorage.getItem("vrumburguer_recent_orders") || "[]");
        if (!recentOrders.includes(createdOrder.id)) {
          recentOrders.unshift(createdOrder.id);
          localStorage.setItem("vrumburguer_recent_orders", JSON.stringify(recentOrders.slice(0, 10)));
        }
        if (orderData.customer_phone) {
          localStorage.setItem("vrumburguer_customer_phone", orderData.customer_phone);
          if (orderData.customer_name && orderData.customer_name.trim() !== "Cliente") {
            await User.loginWithPhone(orderData.customer_phone, orderData.customer_name.trim());
          }
        }
      } catch {}

      if (orderData.coupon_code) {
        try {
          const cleanPhone = (orderData.customer_phone || "").replace(/\D/g, "");
          const coupons = await Coupon.filter({ code: orderData.coupon_code.toUpperCase(), active: true });
          const targetCoupon = coupons[0];
          
          if (targetCoupon && (cleanPhone || orderData.customer_email)) {
            const userIdentifier = orderData.customer_email 
              ? `${orderData.customer_email} [phone:${cleanPhone}]` 
              : `phone:${cleanPhone}`;

            await CouponUsage.create({
              coupon_id: targetCoupon.id,
              user_email: userIdentifier,
              order_id: createdOrder.id
            });
          }
        } catch (error) {
          console.log("Erro ao registrar uso do cupom:", error);
        }
      }
      
      setCart([]);
      setShowOrderModal(false);
      setIsCartVisible(false);
      
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Pedido Enviado! 🎉", {
          body: "Acompanhe o preparo e a entrega em tempo real!",
          icon: "/favicon.ico",
        });
      }

      // Se for PIX Online Mercado Pago e a loja tiver o Access Token configurado, abre o modal do QR Code!
      const mpToken = tenant?.payment_methods?.mp_access_token;
      if (orderData.payment_method === 'pix_online' && mpToken) {
        setPixOnlineOrder(createdOrder);
        setIsSubmitting(false);
        return;
      }
      
      navigate(`${createPageUrl("MyOrders")}?id=${createdOrder.id}`);
    } catch (_error) {
      alert("Erro ao enviar pedido. Tente novamente.");
    }
    setIsSubmitting(false);
  };

  // Se a loja foi pausada pelo SuperAdmin ou por inadimplência, o cardápio sai do ar!
  if (tenant && tenant.is_active === false) {
    return (
      <div className="min-h-screen bg-[#0d0a09] text-stone-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#171210] border border-stone-800 rounded-3xl p-8 text-center shadow-2xl space-y-5">
          {tenant.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name} className="w-20 h-20 mx-auto rounded-2xl object-cover border border-stone-700" />
          ) : (
            <div className="w-20 h-20 mx-auto rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center text-2xl font-black text-rose-500">
              {(tenant.name || "D").substring(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">{tenant.name || "Restaurante"}</h2>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold mt-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Cardápio Temporariamente Indisponível
            </div>
          </div>
          <p className="text-sm text-stone-400 leading-relaxed">
            Este estabelecimento está com o atendimento online pausado no momento. Por favor, volte mais tarde ou tente novamente em breve!
          </p>
          {tenant.phone && (
            <div className="pt-2 border-t border-stone-800/80">
              <p className="text-xs text-stone-500">Dúvidas? Entre em contato diretamente com a loja:</p>
              <p className="text-sm font-semibold text-stone-300 mt-0.5">{tenant.phone}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0a09] text-stone-100 selection:bg-red-600 selection:text-white">
      {/* Header Dark Glass Moderno */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#120e0d]/90 backdrop-blur-xl border-b border-stone-800/80 transition-all">
        <div className="container mx-auto px-4 sm:px-6 py-2.5 max-w-6xl">
          <div className="flex items-center justify-between">
            {/* Logo e Nome */}
            <div className="flex items-center gap-3">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="w-10 h-10 sm:w-11 sm:h-11 flex-shrink-0 flex items-center justify-center"
              >
                {settings?.restaurant_logo ? (
                  <img src={settings.restaurant_logo} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-center font-black text-sm text-white">
                    {(settings?.restaurant_name || "D").substring(0, 2).toUpperCase()}
                  </div>
                )}
              </motion.div>
              <div>
                <h1 className="text-base sm:text-lg font-black leading-tight text-white tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {settings?.restaurant_name || "Delivery 1.0"}
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${storeIsOpen ? 'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50' : 'bg-red-500'}`}></div>
                    <span className={`text-[11px] font-extrabold tracking-wide ${storeIsOpen ? 'text-emerald-400' : 'text-red-400'}`}>
                      {storeIsOpen ? 'Aberto agora' : 'Fechado'}
                    </span>
                  </div>
                  <span className="text-stone-600 text-xs">•</span>
                  <span className="text-stone-400 text-[11px] font-medium">
                    {settings?.opening_time && settings?.closing_time ? `${settings.opening_time} - ${settings.closing_time}` : '18:00 - 23:59'}
                  </span>
                </div>
              </div>
            </div>

            {/* Ações Topo */}
            <div className="flex items-center gap-1.5">
              <motion.div whileTap={{ scale: 0.9 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCartToggle}
                  title="Carrinho"
                  className="relative text-stone-300 hover:text-white hover:bg-stone-800/80 rounded-full h-9 w-9 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4 text-red-400" />
                  {cart.reduce((total, item) => total + item.quantity, 0) > 0 && (
                    <motion.span 
                      key={cart.reduce((total, item) => total + item.quantity, 0)}
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full w-4 h-4 min-w-4 min-h-4 flex items-center justify-center shadow-sm border border-[#120e0d] leading-none"
                    >
                      {cart.reduce((total, item) => total + item.quantity, 0)}
                    </motion.span>
                  )}
                </Button>
              </motion.div>
              <StoreInfoSheet settings={settings} />
              <UserProfileSheet />
            </div>
          </div>
        </div>
      </header>

      {/* Banner de Mesa Conectada via QR Code */}
      {urlMesa && (
        <div className="pt-20 container mx-auto px-4 max-w-6xl">
          <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 rounded-2xl p-3.5 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🍽️</span>
              <div>
                <p className="text-[11px] font-black uppercase text-emerald-300">Atendimento no Salão</p>
                <p className="text-sm font-bold text-white">Você está na Mesa {urlMesa}</p>
              </div>
            </div>
            <span className="text-[11px] bg-emerald-900/80 border border-emerald-400/40 text-emerald-200 px-3 py-1 rounded-xl font-bold">
              QR Code Ativo
            </span>
          </div>
        </div>
      )}

      {/* Banner de Pedido em Andamento */}
      {activeGuestOrder && (
        <div className={`${urlMesa ? 'pt-3' : 'pt-20'} container mx-auto px-4 max-w-6xl`}>
          <div className="relative">
            <Link to={`${createPageUrl("MyOrders")}?id=${activeGuestOrder.id}`}>
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-red-700 via-red-600 to-amber-600 text-white rounded-2xl p-3.5 shadow-xl flex items-center justify-between cursor-pointer hover:opacity-95 transition-opacity border border-red-400/30 pr-12"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shadow-inner">
                    <Bike className="w-5 h-5 animate-pulse text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-red-200">Pedido em Andamento</p>
                    <p className="text-sm font-bold">
                      #{activeGuestOrder.id.slice(-6).toUpperCase()} • {
                        activeGuestOrder.status === 'preparando' || activeGuestOrder.status === 'confirmado'
                          ? 'CONFIRMADO' 
                          : (activeGuestOrder.status === 'enviado' 
                              ? (activeGuestOrder.order_type === 'delivery' ? 'A CAMINHO' : (activeGuestOrder.order_type === 'dine_in' || activeGuestOrder.table_number ? 'SENDO SERVIDO' : 'PRONTO P/ RETIRADA')) 
                              : activeGuestOrder.status.toUpperCase())
                      }
                    </p>
                  </div>
                </div>
                <div className="flex items-center text-xs font-bold gap-1 bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                  <span>Rastrear</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </motion.div>
            </Link>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveGuestOrder(null);
                try {
                  localStorage.removeItem("vrumburguer_recent_orders");
                } catch {}
              }}
              title="Dispensar aviso"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 hover:bg-black/70 text-white/80 hover:text-white flex items-center justify-center text-xs font-bold transition-all z-10"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {!storeIsOpen && (
        <div className={`${activeGuestOrder ? 'pt-3' : 'pt-20'} container mx-auto px-4 max-w-6xl`}>
          <div className="rounded-2xl border p-4 bg-red-950/40 border-red-500/30 text-red-200 flex items-start gap-3 shadow-lg">
            <XCircle className="h-5 w-5 mt-0.5 text-red-400 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm text-white">Restaurante Fechado no Momento</p>
              <p className="text-xs mt-0.5 text-stone-300">
                Horário de funcionamento: {settings?.opening_time || '18:00'} às {settings?.closing_time || '23:59'}. Você pode explorar o cardápio e montar seu pedido à vontade!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Banners Carrossel */}
      {banners && banners.length > 0 ? (
        <div className={!activeGuestOrder && storeIsOpen ? "pt-[60px]" : "pt-2"}>
          <BannerCarousel banners={banners} />
        </div>
      ) : (
        !activeGuestOrder && storeIsOpen && <div className="h-[60px]" />
      )}

      {/* Barra de Categorias Pills com layoutId Framer Motion */}
      <div className="sticky top-[58px] z-30 bg-[#0d0a09]/95 backdrop-blur-xl border-b border-stone-800/80 py-3">
        <div className="container mx-auto px-4 sm:px-6 max-w-6xl">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">
            {categories.map(category => {
              const isActive = activeCategory === category.id;

              return (
                <button
                  key={category.id}
                  onClick={() => {
                    setActiveCategory(category.id);
                    setSearchQuery("");
                  }}
                  className={`relative whitespace-nowrap flex-shrink-0 px-4 py-2 rounded-2xl text-xs sm:text-sm font-extrabold transition-colors duration-200 cursor-pointer ${
                    isActive ? 'text-white' : 'text-stone-400 hover:text-stone-200 bg-stone-900/80 border border-stone-800/80'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeCategoryPill"
                      className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-700 rounded-2xl shadow-lg shadow-red-950/60 border border-red-500/40"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{category.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Seção Principal do Cardápio */}
      <main className="container mx-auto px-4 sm:px-6 pb-36 pt-6 max-w-6xl space-y-9">
        {/* Carrossel dos Mais Pedidos */}
        {!searchQuery.trim() && (
          <PopularProductsRow
            products={popularRankedProducts}
            onProductClick={handleProductClick}
            isStoreOpen={storeIsOpen}
          />
        )}

        {/* Carrossel dos Últimos Pedidos (com suporte a múltiplos itens e repetição de pedidos) */}
        {!searchQuery.trim() && recentOrders.length > 0 && (
          <RecentOrdersRow
            orders={recentOrders}
            products={products}
            onAddToCart={addToCart}
            isStoreOpen={storeIsOpen}
          />
        )}

        {/* Cabeçalho da Categoria com Barra de Busca Global */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-3 border-b border-stone-800/80 pt-1">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-black tracking-widest text-red-500 uppercase">
              <span>{isSearching ? "BUSCA NO CARDÁPIO" : "NOSSO CARDÁPIO"}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mt-1 tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {isSearching ? `Resultados para "${searchQuery}"` : (activeCategoryObj?.name || "Todos os Produtos")}
            </h2>
            <p className="text-xs sm:text-sm text-stone-400 mt-0.5">
              {isSearching 
                ? `${filteredProducts.length} ${filteredProducts.length === 1 ? 'produto encontrado' : 'produtos encontrados'}`
                : (activeCategoryObj?.description || "Feitos artesanalmente com ingredientes nobres e muito sabor.")
              }
            </p>
          </div>

          {/* Campo de Busca */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar burgers, bebidas, combos..."
              className="w-full bg-stone-900/90 border border-stone-800 focus:border-red-500/70 focus:bg-stone-900 rounded-2xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 outline-none transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white p-1 rounded-full text-xs font-bold cursor-pointer"
                aria-label="Limpar busca"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Grid de Produtos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
          <AnimatePresence>
            {filteredProducts.map((product, idx) => (
              <ProductCard
                key={product.id}
                product={product}
                onProductClick={handleProductClick}
                isStoreOpen={storeIsOpen}
                isPopular={idx === 0}
              />
            ))}
          </AnimatePresence>
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-16 bg-stone-900/40 rounded-3xl border border-stone-800/60 p-8 space-y-3">
            <div className="text-5xl">🍽️</div>
            <h3 className="text-lg font-bold text-white">Nenhum produto encontrado</h3>
            <p className="text-xs text-stone-400 max-w-sm mx-auto">
              {searchQuery ? `Não encontramos itens para "${searchQuery}". Tente outro termo.` : "Não há produtos disponíveis nesta categoria no momento."}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400 hover:text-red-300 bg-red-950/40 border border-red-500/30 px-4 py-2 rounded-full transition-colors cursor-pointer"
              >
                Limpar busca
              </button>
            )}
          </div>
        )}

        {/* Banner Promocional de Combos - Visual Dark Clean */}
        {comboCategory && (
          <motion.div 
            whileHover={{ y: -2 }}
            className="rounded-3xl overflow-hidden relative border border-stone-800 bg-[#14100e] p-6 sm:p-8 shadow-xl"
          >
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2.5 text-left flex-1">
                <div className="inline-flex items-center gap-1.5 text-red-400 text-xs font-black uppercase tracking-widest">
                  <span>SELEÇÃO ESPECIAL</span>
                </div>
                
                <h3 
                  className="text-xl sm:text-2xl font-black text-white leading-tight tracking-tight" 
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Conheça nossos <span className="text-red-500">{comboCategory.name}</span>
                </h3>
                
                <p className="text-xs sm:text-sm text-stone-400 max-w-lg leading-relaxed font-normal">
                  Burgers artesanais acompanhados de batata crocante e bebida gelada com o melhor custo-benefício.
                </p>
              </div>

              <div className="flex-shrink-0 w-full sm:w-auto">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    setActiveCategory(comboCategory.id);
                    setSearchQuery("");
                    window.scrollTo({ top: 180, behavior: 'smooth' });
                  }}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs sm:text-sm px-6 py-3.5 rounded-2xl shadow-lg transition-all duration-200 cursor-pointer whitespace-nowrap"
                >
                  <span>Explorar Combos</span>
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

      </main>

      {/* Rodapé Institucional Dark */}
      <footer className="bg-[#090706] border-t border-stone-800/80 py-10 px-4">
        <div className="container mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                {settings?.restaurant_logo ? (
                  <img src={settings.restaurant_logo} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-center font-black text-sm text-white">
                    {(settings?.restaurant_name || "D").substring(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <h4 className="font-black text-base text-white tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {settings?.restaurant_name || "Delivery 1.0"}
              </h4>
            </div>
            <p className="text-xs text-stone-400 leading-relaxed max-w-xs font-normal">
              Os melhores produtos preparados com ingredientes selecionados e entrega rápida para você.
            </p>
          </div>

          <div className="md:col-span-4 space-y-2.5 text-xs text-stone-300">
            <p className="font-black uppercase tracking-wider text-stone-500 text-[11px]">Localização & Contato</p>
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              <span>{settings?.address || "Endereço não informado"}</span>
            </div>
            {settings?.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <span>{settings.phone}</span>
              </div>
            )}
            {settings?.whatsapp && (
              <a
                href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-stone-300 hover:text-white transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span>{settings.whatsapp}</span>
              </a>
            )}
            {settings?.instagram && (
              <a
                href={`https://instagram.com/${settings.instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-stone-300 hover:text-white transition-colors"
              >
                <Instagram className="w-3.5 h-3.5 text-pink-500 flex-shrink-0" />
                <span>{settings.instagram}</span>
              </a>
            )}
          </div>

          <div className="md:col-span-4 space-y-2.5 text-xs text-stone-300">
            <p className="font-black uppercase tracking-wider text-stone-500 text-[11px]">Horário de Funcionamento</p>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${storeIsOpen ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className={storeIsOpen ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                {storeIsOpen ? 'Aberto Agora' : 'Fechado'}
              </span>
            </div>
            <p className="text-stone-400">
              {settings?.opening_time && settings?.closing_time ? `${settings.opening_time} às ${settings.closing_time}` : 'Consulte nosso horário'}
            </p>
          </div>
        </div>

        <div className="container mx-auto max-w-6xl pt-8 mt-8 border-t border-stone-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-400">
          <p>© {new Date().getFullYear()} {settings?.restaurant_name || "Delivery 1.0"}. Todos os direitos reservados.</p>
          <p>
            Desenvolvido por{" "}
            <a
              href="https://instagram.com/davialeixo_nogueira"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-400 hover:text-red-300 font-medium transition-colors"
            >
              Davi Aleixo
            </a>
            {" | "}
            <a
              href="https://wa.me/5531982607426"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-400 hover:text-red-300 font-medium transition-colors"
            >
              31982607426
            </a>
          </p>
        </div>
      </footer>

      {/* Carrinho flutuante */}
      <AnimatePresence>
        <Cart
          cart={cart}
          updateQuantity={updateCartQuantity}
          onCheckout={handleCheckout}
          deliveryFee={settings?.delivery_fee || 0}
          isVisible={isCartVisible}
          onToggle={handleCartToggle}
        />
      </AnimatePresence>

      <OrderModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        cart={cart}
        total={getCartTotal()}
        deliveryFee={settings?.delivery_fee || 0}
        minOrderValue={settings?.min_order_value || 0}
        deliveryTime={settings?.delivery_time || "40-50 min"}
        deliveryRules={settings}
        initialTableNumber={urlMesa || ""}
        onSubmit={submitOrder}
        isSubmitting={isSubmitting}
      />

      {pixOnlineOrder && (
        <PixOnlineModal
          isOpen={Boolean(pixOnlineOrder)}
          onClose={() => {
            const orderId = pixOnlineOrder.id;
            setPixOnlineOrder(null);
            navigate(`${createPageUrl("MyOrders")}?id=${orderId}`);
          }}
          order={pixOnlineOrder}
          accessToken={tenant?.payment_methods?.mp_access_token}
          onPaymentApproved={(paidOrder) => {
            setPixOnlineOrder(null);
            navigate(`${createPageUrl("MyOrders")}?id=${paidOrder.id}`);
          }}
        />
      )}
      
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          complementGroups={(() => {
            const linkedGroupIds = productComplementGroups
              .filter(pcg => pcg.product_id === selectedProduct.id)
              .map(pcg => pcg.group_id);

            return complementGroups
              .filter(g => g.active && linkedGroupIds.includes(g.id))
              .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
              .map(g => ({
                ...g,
                items: complementItems
                  .filter(i => i.group_id === g.id && i.active)
                  .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
              }));
          })()}
          additionals={additionals.filter(a => a.product_id === selectedProduct.id)}
          isOpen={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={addToCart}
        />
      )}
    </div>
  );
}
import React, { useState, useEffect, useRef } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
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
import { RestaurantTable, TableSession } from "@/entities/RestaurantTable";
import { base44 } from "@/api/base44Client";
import { AnimatePresence, motion } from "framer-motion";
import ProductCard from "../components/menu/ProductCard";
import PopularProductsRow from "../components/menu/PopularProductsRow";
import RecentOrdersRow from "../components/menu/RecentOrdersRow";
import Cart from "../components/menu/Cart";
import OrderModal, { fetchCustomerAddresses } from "../components/menu/OrderModal";
import PixOnlineModal from "../components/menu/PixOnlineModal";
import BannerCarousel from "../components/menu/BannerCarousel";
import UserProfileSheet from "../components/menu/UserProfileSheet";
import { User } from "@/entities/User";
import { UserAddress } from "@/entities/UserAddress";
import { matchNeighborhood } from "@/utils/neighborhoodMatcher";
import StoreInfoSheet from "../components/menu/StoreInfoSheet";
import ProductDetailModal from "../components/menu/ProductDetailModal";
import PizzaBuilderModal from "../components/menu/PizzaBuilderModal";
import { 
  ShoppingBag, 
  Bike, 
  ChevronRight, 
  Search, 
  MapPin, 
  Phone, 
  ArrowRight, 
  Instagram, 
  Store,
  CheckCircle2,
  Menu as MenuIcon,
  Info
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { isStoreOpen } from "@/utils/storeStatus";
import { useTenant } from "@/lib/TenantContext";
import { getCustomMenuTemplate } from "@/custom-menus/registry";

export default function MenuPage() {
  const navigate = useNavigate();
  const { tenant, tenantId } = useTenant();
  const [searchParams] = useSearchParams();
  const urlMesa = searchParams.get("mesa");

  const salonMode = tenant?.salon_mode || (tenant?.plan === 'showcase' ? 'showcase' : (tenant?.plan === 'table' ? 'table_only' : 'full'));
  const isVisualOnly = salonMode === 'showcase';
  const isTableOnly = salonMode === 'table_only';
  const hasTopNotice = Boolean(urlMesa || (isTableOnly && !urlMesa));

  const segments = typeof window !== "undefined" ? window.location.pathname.split("/").filter(Boolean) : [];
  const RESERVED_SEGMENTS = ["menu", "dashboard", "orders", "pdv", "adminlogin", "superadmin"];
  const routeSlug = segments.length > 0 && !RESERVED_SEGMENTS.includes(segments[0].toLowerCase()) ? segments[0].toLowerCase() : null;
  const isVruumRoute = !routeSlug || routeSlug === "vrumm" || routeSlug === "vruum-burguer";

  const resolvedInitialStoreName = tenant?.name
    || (typeof window !== "undefined" ? localStorage.getItem("current_tenant_name") : null)
    || (isVruumRoute ? "Vruum Burguer" : (routeSlug ? routeSlug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "Restaurante"));

  const [products, setProducts] = useState([]);
  const [additionals, setAdditionals] = useState([]);
  const [settings, setSettings] = useState(() => ({
    restaurant_name: resolvedInitialStoreName,
    restaurant_logo: tenant?.logo_url || "",
    opening_time: tenant?.opening_time || "18:00",
    closing_time: tenant?.closing_time || "23:59",
    open_days: tenant?.open_days || [],
    delivery_fee: tenant?.delivery_fee ?? 6.50,
    min_order_value: tenant?.min_order_value ?? 20.00,
    delivery_time: tenant?.delivery_time || "40-50 min",
    payment_methods: tenant?.payment_methods || null,
    cashback_enabled: tenant?.cashback_enabled ?? false,
    cashback_rate: Number(tenant?.cashback_rate ?? 5),
    cashback_validity_days: tenant?.cashback_validity_days ?? 15,
    cashback_max_discount_percentage: Number(tenant?.cashback_max_discount_percentage ?? 50),
  }));
  const [banners, setBanners] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState([]);
  const [isCartVisible, setIsCartVisible] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [pixOnlineOrder, setPixOnlineOrder] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedPizzaProduct, setSelectedPizzaProduct] = useState(null);
  const [tableOrderConfirmed, setTableOrderConfirmed] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [storeIsOpen, setStoreIsOpen] = useState(true);
  const [activeGuestOrder, setActiveGuestOrder] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [complementGroups, setComplementGroups] = useState([]);
  const [complementItems, setComplementItems] = useState([]);
  const [productComplementGroups, setProductComplementGroups] = useState([]);
  const [headerHeight, setHeaderHeight] = useState(88);
  const headerRef = useRef(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [customerSavedAddress, setCustomerSavedAddress] = useState(null);

  const loadCustomerAddress = async () => {
    try {
      let u = currentUser;
      if (!u) {
        try {
          u = await User.me();
          if (u && u.id) setCurrentUser(u);
        } catch {}
      }

      let phone = u?.phone || "";
      let email = u?.email || "";

      if (!phone && !email) {
        try {
          const guestInfo = JSON.parse(localStorage.getItem("vrumburguer_guest_info") || "{}");
          if (guestInfo.customer_phone) phone = guestInfo.customer_phone;
          if (guestInfo.customer_email) email = guestInfo.customer_email;
        } catch {}
      }

      if (phone || email) {
        const addrs = await fetchCustomerAddresses(phone, email);
        if (addrs && addrs.length > 0) {
          const def = addrs.find(a => a.is_default) || addrs[0];
          setCustomerSavedAddress(def);
          return;
        }
      }

      try {
        const localAddr = JSON.parse(localStorage.getItem("vrumburguer_last_address") || "null");
        if (localAddr && (localAddr.neighborhood || localAddr.street)) {
          setCustomerSavedAddress(localAddr);
          return;
        }
      } catch {}

      setCustomerSavedAddress(null);
    } catch (_err) {
      console.warn("Erro ao buscar endereço do cliente:", _err);
    }
  };

  useEffect(() => {
    loadCustomerAddress();

    const handleAddrChange = (e) => {
      if (e?.detail) setCustomerSavedAddress(e.detail);
      else loadCustomerAddress();
    };

    const handleAuthChange = (e) => {
      if (e?.detail) setCurrentUser(e.detail);
      else setCurrentUser(null);
      loadCustomerAddress();
    };

    window.addEventListener("customer_address_changed", handleAddrChange);
    window.addEventListener("customer_auth_changed", handleAuthChange);

    return () => {
      window.removeEventListener("customer_address_changed", handleAddrChange);
      window.removeEventListener("customer_auth_changed", handleAuthChange);
    };
  }, [isUserProfileOpen]);

  useEffect(() => {
    User.me().then(u => {
      if (u && u.id) {
        setCurrentUser(u);
        loadCustomerAddress();
      } else {
        setCurrentUser(null);
      }
    }).catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    if (!headerRef.current) return;
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };
    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(headerRef.current);
    window.addEventListener("resize", updateHeaderHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeaderHeight);
    };
  }, []);

  useEffect(() => {
    if (urlMesa) {
      try {
        localStorage.setItem("vrumburguer_table_number", urlMesa);
      } catch {}
    }
  }, [urlMesa]);

  const requestNotificationPermission = async () => {
    try {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch {}
  };

  useEffect(() => {
    if (!isVruumRoute && !tenantId) {
      setProducts([]);
      setCategories([]);
      setAdditionals([]);
      setComplementGroups([]);
      setComplementItems([]);
      setBanners([]);
      return;
    }

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
  }, [tenantId, tenant, routeSlug]);

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
      // Pedidos na mesa / QR Code NÃO têm componente de rastreamento
      if (urlMesa) {
        setActiveGuestOrder(null);
        return;
      }

      const user = await base44.auth.me();

      if (user?.email) {
        const allOrders = await Order.list("-created_date", 10);
        const active = allOrders.find(o => 
          o.user_email === user.email && 
          o.order_type !== 'dine_in' && 
          !o.table_number &&
          ['pendente', 'confirmado', 'preparando', 'enviado'].includes(o.status)
        );
        setActiveGuestOrder(active || null);
        return;
      }

      const recentIds = JSON.parse(localStorage.getItem("vrumburguer_recent_orders") || "[]");
      if (!Array.isArray(recentIds) || recentIds.length === 0) {
        setActiveGuestOrder(null);
        return;
      }

      const allOrders = await Order.list("-created_date", 10);
      const active = allOrders.find(o => 
        recentIds.includes(o.id) && 
        !o.user_email && 
        o.order_type !== 'dine_in' && 
        !o.table_number &&
        ['pendente', 'confirmado', 'preparando', 'enviado'].includes(o.status)
      );
      setActiveGuestOrder(active || null);
    } catch (_err) {
      console.log("Erro ao verificar pedidos ativos:", _err);
      setActiveGuestOrder(null);
    }
  };

  const loadData = async () => {
    try {
      const activeTenantId = tenantId 
        || (isVruumRoute ? "a0000000-0000-0000-0000-000000000001" : (routeSlug ? localStorage.getItem(`tenant_id_by_slug_${routeSlug}`) : null));

      if (!activeTenantId) {
        setProducts([]);
        setCategories([]);
        return;
      }

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

      let currentTenant = tenant;
      if (isSupabaseConfigured() && supabase) {
        try {
          let tenantQuery = supabase.from("tenants").select("*");
          if (pathSlug === "vrumm" || pathSlug === "vruum-burguer") {
            tenantQuery = tenantQuery.or("slug.eq.vruum-burguer,slug.eq.vrumm,id.eq.a0000000-0000-0000-0000-000000000001");
          } else if (pathSlug) {
            tenantQuery = tenantQuery.eq("slug", pathSlug);
          } else if (activeTenantId) {
            tenantQuery = tenantQuery.eq("id", activeTenantId);
          } else {
            tenantQuery = tenantQuery.eq("id", "a0000000-0000-0000-0000-000000000001");
          }

          const { data: dbTenant } = await tenantQuery.maybeSingle();
          if (dbTenant) {
            currentTenant = dbTenant;
            localStorage.setItem("current_tenant_id", dbTenant.id);
            localStorage.setItem("current_tenant_slug", dbTenant.slug);
            localStorage.setItem("current_tenant_name", dbTenant.name);
          }
        } catch (_err) {
          console.warn("Sync tenant in Menu:", _err);
        }
      }

      const effectiveSlug = pathSlug || currentTenant?.slug || localStorage.getItem("current_tenant_slug");
      const isVruum = effectiveSlug === "vrumm" || effectiveSlug === "vruum-burguer";

      const resolvedSettings = {
        restaurant_name: currentTenant?.name || (isVruum ? "Vruum Burguer" : "Novo Restaurante"),
        restaurant_logo: currentTenant?.logo_url || (isVruum ? settingsData[0]?.restaurant_logo : null),
        banner_url: currentTenant?.banner_url || (isVruum ? settingsData[0]?.banner_url : null),
        delivery_fee: currentTenant?.delivery_fee ?? (isVruum ? 6.50 : 0),
        min_order_value: currentTenant?.min_order_value ?? (isVruum ? 20.00 : 0),
        delivery_time: currentTenant?.delivery_time || "40-50 min",
        delivery_fee_type: currentTenant?.delivery_fee_type || "fixed",
        delivery_neighborhoods: Array.isArray(currentTenant?.delivery_neighborhoods) ? currentTenant.delivery_neighborhoods : [],
        delivery_unlisted_policy: currentTenant?.delivery_unlisted_policy || "block",
        delivery_fallback_fee: currentTenant?.delivery_fallback_fee ?? 10.00,
        free_delivery_threshold: currentTenant?.free_delivery_threshold ?? null,
        phone: currentTenant?.phone || (isVruum ? settingsData[0]?.phone : ""),
        whatsapp: currentTenant?.whatsapp || (isVruum ? settingsData[0]?.whatsapp : ""),
        address: currentTenant?.address || settingsData[0]?.address || "Rua das Flores, 123 - Centro",
        address_street: currentTenant?.address_street || settingsData[0]?.address_street || "",
        address_number: currentTenant?.address_number || settingsData[0]?.address_number || "",
        address_neighborhood: currentTenant?.address_neighborhood || settingsData[0]?.address_neighborhood || "",
        address_city: currentTenant?.address_city || settingsData[0]?.address_city || "",
        address_state: currentTenant?.address_state || settingsData[0]?.address_state || "",
        instagram: currentTenant?.instagram || (isVruum ? settingsData[0]?.instagram : ""),
        opening_time: currentTenant?.opening_time || "18:00",
        closing_time: currentTenant?.closing_time || "23:59",
        open_days: currentTenant?.open_days || [],
        payment_methods: currentTenant?.payment_methods || null,
        manual_store_open: currentTenant?.manual_store_open ?? null,
        manual_override_date: currentTenant?.manual_override_date ?? null,
        salon_mode: currentTenant?.salon_mode || "full",
        accepts_delivery: currentTenant?.accepts_delivery !== false,
        accepts_takeaway: currentTenant?.accepts_takeaway !== false,
        cashback_enabled: currentTenant?.cashback_enabled ?? tenant?.cashback_enabled ?? false,
        cashback_rate: Number(currentTenant?.cashback_rate ?? tenant?.cashback_rate ?? 5),
        cashback_validity_days: currentTenant?.cashback_validity_days ?? tenant?.cashback_validity_days ?? 15,
        cashback_max_discount_percentage: Number(currentTenant?.cashback_max_discount_percentage ?? tenant?.cashback_max_discount_percentage ?? 50),
      };

      setSettings(resolvedSettings);
      setStoreIsOpen(isStoreOpen(resolvedSettings));
      setBanners(bannerData || []);
      setCategories(categoryData || []);
      
      if (!activeCategory) {
        setActiveCategory("all");
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
    const matchedCategory = categories.find(
      (c) => c.id === product.category_id || c.id === product.category
    );
    const resolvedCatName =
      matchedCategory?.name ||
      (typeof product.category === "string" && product.category ? product.category : "Geral");

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
          category_name: resolvedCatName,
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
    const matchedCat = categories.find(
      c => c.id === product.category_id || 
           c.id === product.category ||
           (product.category && typeof product.category === 'string' && c.name?.toLowerCase() === product.category.toLowerCase()) ||
           (product.category_id && typeof product.category_id === 'string' && c.name?.toLowerCase() === product.category_id.toLowerCase())
    );

    if (matchedCat?.type === 'pizza') {
      setSelectedPizzaProduct(product);
    } else {
      setSelectedProduct(product);
    }
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => {
      const additionalsTotal = (item.additionals || []).reduce((sum, ad) => sum + ad.price, 0);
      return total + (item.price + additionalsTotal) * item.quantity;
    }, 0);
  };

  const isSearching = Boolean(searchQuery.trim());
  const filteredProducts = products.filter(product => {
    const matchesCategory = isSearching || !activeCategory || activeCategory === "all" || product.category === activeCategory || product.category_id === activeCategory;
    const matchesSearch = !isSearching || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (product.description && product.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const displayCategories = React.useMemo(() => {
    if (!categories || categories.length === 0) return [{ id: "all", name: "Todos" }];
    const hasAll = categories.some(c => c.id === "all" || c.name?.toLowerCase() === "todos");
    if (hasAll) return categories;
    return [{ id: "all", name: "Todos" }, ...categories];
  }, [categories]);

  const activeCategoryObj = activeCategory === "all"
    ? { id: "all", name: "Todos", description: "Todos os produtos disponíveis no cardápio" }
    : categories.find(c => c.id === activeCategory);
  const comboCategory = categories.find(c => c.is_combo);

  // Agrupamento por categorias para renderização em componentes grandes (Inspirado na Foto 1)
  const categorizedSections = React.useMemo(() => {
    if (isSearching || (activeCategory && activeCategory !== "all")) {
      return [
        {
          id: activeCategory || "filtered",
          name: isSearching ? `Resultados da Busca` : (activeCategoryObj?.name || "Cardápio"),
          description: isSearching ? `${filteredProducts.length} itens encontrados` : (activeCategoryObj?.description || ""),
          products: filteredProducts,
        }
      ];
    }

    const realCategories = (categories || []).filter(c => c.id !== "all");
    const sections = [];
    const usedProductIds = new Set();

    realCategories.forEach(cat => {
      const catProducts = products.filter(p => 
        p.available !== false && (p.category === cat.id || p.category_id === cat.id)
      );
      if (catProducts.length > 0) {
        catProducts.forEach(p => usedProductIds.add(p.id));
        sections.push({
          id: cat.id,
          name: cat.name,
          description: cat.description,
          products: catProducts,
        });
      }
    });

    const uncategorized = products.filter(p => p.available !== false && !usedProductIds.has(p.id));
    if (uncategorized.length > 0) {
      sections.push({
        id: "uncategorized",
        name: "Outros Produtos",
        description: "",
        products: uncategorized,
      });
    }

    if (sections.length === 0 && filteredProducts.length > 0) {
      sections.push({
        id: "all",
        name: "Nosso Cardápio",
        description: "",
        products: filteredProducts,
      });
    }

    return sections;
  }, [isSearching, activeCategory, activeCategoryObj, filteredProducts, categories, products]);

  const handleCartToggle = () => {
    setIsCartVisible(!isCartVisible);
  };

  const handleCheckout = () => {
    if (!storeIsOpen) {
      alert("Desculpe, o restaurante está fechado no momento para novos pedidos.");
      return;
    }
    loadData();
    setShowOrderModal(true);
  };

  const isSubmittingRef = useRef(false);

  const submitOrder = async (orderData) => {
    if (isSubmittingRef.current || isSubmitting) {
      console.warn("[Menu] Tentativa de submissão duplicada bloqueada por idempotência.");
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const activeTenantId = tenantId || tenant?.id || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";
      const isPixOnline = orderData.payment_method === 'pix_online';
      
      // Gera ID determinístico único por tentativa de checkout se não fornecido
      const deterministicOrderId = orderData.id || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" 
        ? crypto.randomUUID() 
        : undefined);

      const isTableOrder = orderData.order_type === 'dine_in' || Boolean(urlMesa) || Boolean(orderData.table_number);
      const effectiveTableNumber = orderData.table_number || urlMesa || null;
      let tableSessionId = orderData.table_session_id || null;

      if (isTableOrder && effectiveTableNumber) {
        try {
          const sessions = await TableSession.list("-opened_at", 50);
          const activeSession = sessions.find(s => 
            String(s.table_number) === String(effectiveTableNumber) &&
            (s.status === 'open' || s.status === 'bill_requested')
          );
          if (activeSession) {
            tableSessionId = activeSession.id;
          } else {
            const tables = await RestaurantTable.list();
            const table = tables.find(t => String(t.table_number) === String(effectiveTableNumber));
            const newSession = await TableSession.create({
              tenant_id: activeTenantId,
              table_id: table?.id || null,
              table_number: String(effectiveTableNumber),
              customer_name: orderData.customer_name || `Mesa ${effectiveTableNumber}`,
              customer_phone: orderData.customer_phone || "",
              people_count: 2,
              opened_at: new Date().toISOString(),
              status: "open",
            });
            tableSessionId = newSession.id;
            if (table?.id) {
              await RestaurantTable.update(table.id, { status: "occupied" }).catch(() => {});
            }
          }
        } catch (_sessErr) {
          console.warn("Erro ao vincular sessão da mesa no Menu:", _sessErr);
        }
      }

      const orderPayload = {
        ...orderData,
        ...(deterministicOrderId ? { id: deterministicOrderId } : {}),
        status: isPixOnline ? "aguardando_pagamento" : "pendente",
        payment_status: isPixOnline ? "pending" : "pending_delivery",
        tenant_id: activeTenantId,
        order_type: isTableOrder ? "dine_in" : (orderData.order_type || "delivery"),
        table_number: effectiveTableNumber,
        table_session_id: tableSessionId,
      };
      const createdOrder = await Order.create(orderPayload);

      if (!isTableOrder) {
        try {
          const recentOrders = JSON.parse(localStorage.getItem("vrumburguer_recent_orders") || "[]");
          if (!recentOrders.includes(createdOrder.id)) {
            recentOrders.unshift(createdOrder.id);
            localStorage.setItem("vrumburguer_recent_orders", JSON.stringify(recentOrders.slice(0, 10)));
          }
        } catch {}
      } else {
        setActiveGuestOrder(null);
      }

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

      // Processamento atômico de Cashback da Loja
      if (orderData.cashback_discount > 0 || orderData.cashback_earned > 0) {
        try {
          if (isSupabaseConfigured() && supabase) {
            await supabase.rpc("process_order_cashback", {
              p_order_id: String(createdOrder.id)
            });
          }
        } catch (cbErr) {
          console.warn("Erro ao processar cashback do pedido:", cbErr);
        }
      }
      
      if (!isPixOnline) {
        setCart([]);
      }
      setShowOrderModal(false);
      setIsCartVisible(false);

      // Se for pedido de mesa / salão, confirma diretamente na tela sem redirecionar para MyOrders e sem rastreamento
      if (isTableOrder) {
        setActiveGuestOrder(null);
        setTableOrderConfirmed(createdOrder);
        return;
      }
      
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Pedido Enviado! 🎉", {
          body: "Acompanhe o preparo e a entrega em tempo real!",
          icon: "/favicon.ico",
        });
      }

      // Se for PIX Online Mercado Pago e a loja tiver o Access Token configurado, abre o modal do QR Code!
      const mpToken = tenant?.payment_methods?.mp_access_token;
      if (isPixOnline && mpToken) {
        setPixOnlineOrder(createdOrder);
        return;
      }
      
      navigate(`${createPageUrl("MyOrders")}?id=${createdOrder.id}`);
    } catch (_error) {
      console.error("[Menu submitOrder error]:", _error);
      alert("Erro ao enviar pedido. Tente novamente.");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
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

  // Modal de Confirmação Direta do Pedido na Mesa (Sem WhatsApp, Sem Stepper de Rastreio)
  const renderTableOrderConfirmedModal = () => (
    <Dialog 
      open={Boolean(tableOrderConfirmed)} 
      onOpenChange={(open) => {
        if (!open) setTableOrderConfirmed(null);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] sm:w-full max-w-md rounded-3xl p-6 text-center border-stone-200 shadow-2xl bg-white focus:outline-none">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3.5 shadow-xs">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <span className="text-xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200/90 px-3.5 py-1 rounded-full mb-2">
            Mesa {tableOrderConfirmed?.table_number || urlMesa || "Salão"}
          </span>

          <h3 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
            Pedido Confirmado!
          </h3>
          <p className="text-xs sm:text-sm text-stone-600 mt-1 max-w-xs leading-relaxed">
            Seu pedido foi enviado para a cozinha e já está sendo preparado pela equipe.
          </p>

          {/* Resumo rápido dos itens do pedido */}
          {tableOrderConfirmed && (() => {
            const itemsList = Array.isArray(tableOrderConfirmed.items) 
              ? tableOrderConfirmed.items 
              : (typeof tableOrderConfirmed.items === 'string' ? (() => { try { return JSON.parse(tableOrderConfirmed.items); } catch { return []; } })() : []);
            
            const totalFormatted = Number(tableOrderConfirmed.total_amount || tableOrderConfirmed.total || 0).toFixed(2).replace('.', ',');
            
            return (
              <div className="w-full mt-4 p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80 text-left max-h-48 overflow-y-auto space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 flex justify-between">
                  <span>Itens Enviados</span>
                  <span className="text-stone-900 font-extrabold">Total: R$ {totalFormatted}</span>
                </div>
                <div className="divide-y divide-stone-200/70 pt-1">
                  {itemsList.map((item, idx) => (
                    <div key={idx} className="py-1.5 flex justify-between items-center text-xs">
                      <span className="font-semibold text-stone-800 truncate pr-2">
                        {item.quantity}x {item.product_name || item.name}
                      </span>
                      <span className="font-bold text-stone-700 shrink-0">
                        R$ {Number((item.total_price || (item.price * item.quantity)) || 0).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="mt-4 p-3 bg-stone-100 border border-stone-200 rounded-xl text-left w-full">
            <p className="text-xs text-stone-700 font-medium leading-relaxed">
              O pagamento é realizado diretamente no caixa ou com o garçom ao encerrar sua conta.
            </p>
          </div>

          <Button
            onClick={() => setTableOrderConfirmed(null)}
            className="w-full mt-5 h-12 rounded-2xl bg-[#047857] hover:bg-[#036348] text-white font-black text-sm shadow-md active:scale-[0.98] transition-all cursor-pointer"
          >
            Continuar no Cardápio
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // Despacho de Template VIP Personalizado (Modo A)
  const isVrummStore = isVruumRoute || tenant?.slug === "vrumm" || tenant?.slug === "vruum-burguer";
  const effectiveTemplateKey = tenant?.custom_template || (isVrummStore ? "vrumm" : null);
  const CustomMenuTemplate = getCustomMenuTemplate(effectiveTemplateKey);

  const getDeliveryFeeDisplay = () => {
    const acceptsDelivery = (settings?.accepts_delivery !== false) && (tenant?.accepts_delivery !== false);
    const isSalonOnly = salonMode === 'table_only';
    if (!acceptsDelivery || isSalonOnly || urlMesa || isVisualOnly) {
      return null;
    }

    const feeType = settings?.delivery_fee_type || tenant?.delivery_fee_type || 'fixed';
    const registeredNeighborhoods = (Array.isArray(settings?.delivery_neighborhoods) && settings.delivery_neighborhoods.length > 0)
      ? settings.delivery_neighborhoods
      : (Array.isArray(tenant?.delivery_neighborhoods) ? tenant.delivery_neighborhoods : []);
    const activeNeighborhoods = registeredNeighborhoods.filter(n => n && n.active !== false && n.fee !== undefined && n.fee !== null);

    // Caso 1: Loja configurada para taxa por bairro
    if (feeType === 'neighborhood' && activeNeighborhoods.length > 0) {
      // Se o cliente tem endereço e bairro identificados:
      if (customerSavedAddress && customerSavedAddress.neighborhood) {
        const match = matchNeighborhood(customerSavedAddress.neighborhood, registeredNeighborhoods);
        if (match && match.matched) {
          const fee = Number(match.fee || 0);
          const neighborhoodName = match.neighborhood?.name || customerSavedAddress.neighborhood;
          return {
            title: fee === 0 ? `Entrega Grátis • ${neighborhoodName}` : `Entrega: R$ ${fee.toFixed(2).replace('.', ',')} • ${neighborhoodName}`,
            subtitle: "Valor calculado para seu endereço cadastrado"
          };
        }

        // Se não encontrou o bairro no cadastro:
        const unlistedPolicy = settings?.delivery_unlisted_policy || tenant?.delivery_unlisted_policy || 'block';
        const fallbackFee = Number(settings?.delivery_fallback_fee ?? tenant?.delivery_fallback_fee ?? 10);
        if (unlistedPolicy === 'block') {
          return {
            title: "Entrega indisponível para seu bairro",
            subtitle: `Toque para conferir seu endereço (${customerSavedAddress.neighborhood})`
          };
        } else {
          return {
            title: fallbackFee === 0 ? `Entrega Grátis • ${customerSavedAddress.neighborhood}` : `Entrega: R$ ${fallbackFee.toFixed(2).replace('.', ',')} • ${customerSavedAddress.neighborhood}`,
            subtitle: "Taxa padrão para localidades fora da rota principal"
          };
        }
      }

      // Cliente sem endereço identificado (visitante ou sem endereço cadastrado):
      const fees = activeNeighborhoods.map(n => Number(n.fee || 0));
      const minFee = Math.min(...fees);
      return {
        title: minFee === 0 ? "Entrega a partir de Grátis" : `Entrega a partir de R$ ${minFee.toFixed(2).replace('.', ',')}`,
        subtitle: "Valor calculado conforme seu endereço"
      };
    }

    // Caso 2: Taxa fixa (ou sem bairros cadastrados)
    const fixedFee = Number(settings?.delivery_fee ?? tenant?.delivery_fee ?? 0);
    if (customerSavedAddress && customerSavedAddress.neighborhood) {
      return {
        title: fixedFee === 0 ? "Entrega Grátis" : `Entrega: R$ ${fixedFee.toFixed(2).replace('.', ',')}`,
        subtitle: `Entregamos no seu endereço (${customerSavedAddress.neighborhood})`
      };
    }

    return {
      title: fixedFee === 0 ? "Entrega Grátis" : `Entrega: R$ ${fixedFee.toFixed(2).replace('.', ',')}`,
      subtitle: "Valor calculado conforme seu endereço"
    };
  };

  const deliveryFeeDisplay = getDeliveryFeeDisplay();

  if (CustomMenuTemplate) {
    return (
      <>
        <CustomMenuTemplate
          tenant={tenant}
          tenantId={tenantId}
          settings={settings}
          resolvedInitialStoreName={resolvedInitialStoreName}
          deliveryFeeDisplay={deliveryFeeDisplay}
          customerSavedAddress={customerSavedAddress}
          products={products}
          categories={categories}
          banners={banners}
          cart={cart}
          storeIsOpen={storeIsOpen}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          handleAddToCart={addToCart}
          handleCartToggle={handleCartToggle}
          setIsCartVisible={setIsCartVisible}
          setShowOrderModal={setShowOrderModal}
          setSelectedProduct={setSelectedProduct}
          urlMesa={urlMesa}
          salonMode={salonMode}
          isVisualOnly={isVisualOnly}
          isTableOnly={isTableOnly}
          hasTopNotice={hasTopNotice}
          activeGuestOrder={activeGuestOrder}
          setActiveGuestOrder={setActiveGuestOrder}
          popularRankedProducts={popularRankedProducts}
          handleProductClick={handleProductClick}
          recentOrders={recentOrders}
          addToCart={addToCart}
          isSearching={isSearching}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          activeCategoryObj={activeCategoryObj}
          filteredProducts={filteredProducts}
          comboCategory={comboCategory}
          updateCartQuantity={updateCartQuantity}
          handleCheckout={handleCheckout}
          complementGroups={complementGroups}
          productComplementGroups={productComplementGroups}
          complementItems={complementItems}
          additionals={additionals}
          showOrderModal={showOrderModal}
          getCartTotal={getCartTotal}
          submitOrder={submitOrder}
          isSubmitting={isSubmitting}
          pixOnlineOrder={pixOnlineOrder}
          setPixOnlineOrder={setPixOnlineOrder}
          selectedProduct={selectedProduct}
          isCartVisible={isCartVisible}
          navigate={navigate}
          tableOrderConfirmed={tableOrderConfirmed}
          setTableOrderConfirmed={setTableOrderConfirmed}
        />
        {renderTableOrderConfirmedModal()}
      </>
    );
  }

  const formattedStoreAddress = (() => {
    if (!settings) return "Rua das Flores, 123 - Centro";
    if (settings.address_street) {
      return [
        settings.address_street,
        settings.address_number ? `, ${settings.address_number}` : "",
        settings.address_neighborhood ? ` - ${settings.address_neighborhood}` : ""
      ].join("");
    }
    return settings.address || "Rua das Flores, 123 - Centro";
  })();

  const hasBanners = Boolean(banners && banners.length > 0);

  return (
    <div className="min-h-screen bg-white text-[#171717] selection:bg-[#047857] selection:text-white">
      {/* Header Clean Retail com Barra Superior e Navbar com base reta */}
      <header ref={headerRef} className="sticky top-0 z-40 bg-white transition-all">
        {/* Barra Superior Dinâmica (Verde escuro #044e3a quando Aberto) - Oculta quando acessado via QR Code de Mesa */}
        {!urlMesa && (
          <div className={`w-full py-1.5 px-3 sm:px-4 transition-colors duration-200 ${
            storeIsOpen 
              ? 'bg-[#044e3a] text-white' 
              : 'bg-[#991b1b] text-white'
          }`}>
            <div className="container mx-auto max-w-6xl flex items-center justify-center md:justify-between text-[11px] sm:text-xs font-semibold gap-2">
              <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
                <span className="flex items-center gap-1.5 font-bold shrink-0">
                  <Bike className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span>Entrega em até {settings?.delivery_time || "60–80 min"}</span>
                </span>

                <span className="opacity-40 shrink-0">|</span>

                <span className="flex items-center gap-1.5 font-medium opacity-90 shrink-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${storeIsOpen ? 'bg-emerald-400' : 'bg-white'}`} />
                  <span>
                    {storeIsOpen ? (
                      settings?.opening_time && settings?.closing_time 
                        ? `${settings.opening_time} – ${settings.closing_time}` 
                        : '01:00 – 00:00'
                    ) : (
                      settings?.opening_time ? `Abre às ${settings.opening_time}` : 'Fechado'
                    )}
                  </span>
                </span>
              </div>

              {/* Endereço da loja: Visível no Desktop */}
              {formattedStoreAddress && (
                <div className="hidden md:flex items-center gap-1 text-[11px] opacity-90 truncate max-w-md">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-emerald-300" />
                  <span className="truncate">{formattedStoreAddress}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Barra Principal da Loja com base reta */}
        <div className="container mx-auto px-4 sm:px-6 py-2.5 max-w-6xl">
            <div className="flex items-center justify-between">
              {/* Avatar Circular e Nome da Loja Centralizado Verticalmente */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-200 bg-gray-50 shadow-2xs">
                  {settings?.restaurant_logo ? (
                    <img src={settings.restaurant_logo} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-bold text-xs text-gray-800">
                      {(settings?.restaurant_name || resolvedInitialStoreName).substring(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <h1 className="text-base sm:text-lg font-black text-gray-950 tracking-tight leading-none" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {settings?.restaurant_name || resolvedInitialStoreName}
                </h1>
              </div>

              {/* Ações Topo: Sacola com Contador Verde e Botão de Meu Perfil */}
              <div className="flex items-center gap-1 sm:gap-1.5">
                {!isVisualOnly && (
                  <button
                    type="button"
                    onClick={handleCartToggle}
                    title="Carrinho"
                    className="relative w-9 h-9 rounded-full flex items-center justify-center text-gray-700 hover:text-gray-950 hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <ShoppingBag className="w-5 h-5 text-gray-800" />
                    {cart.reduce((total, item) => total + item.quantity, 0) > 0 && (
                      <span 
                        className="absolute -top-0.5 -right-0.5 bg-[#046c4e] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center border-2 border-white leading-none shadow-2xs"
                      >
                        {cart.reduce((total, item) => total + item.quantity, 0)}
                      </span>
                    )}
                  </button>
                )}

                <StoreInfoSheet 
                  settings={settings}
                  trigger={
                    <button 
                      type="button"
                      className="w-9 h-9 rounded-full flex items-center justify-center text-gray-700 hover:text-gray-950 hover:bg-gray-100 transition-colors cursor-pointer"
                      title="Informações da Loja"
                    >
                      <Info className="w-5 h-5" />
                    </button>
                  }
                />

                <UserProfileSheet open={isUserProfileOpen} onOpenChange={setIsUserProfileOpen} />
              </div>
            </div>
          </div>
      </header>

      {/* Banner de Mesa Conectada via QR Code */}
      {!isVisualOnly && urlMesa && (
        <div className="mt-3 container mx-auto px-4 max-w-6xl">
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🍽️</span>
              <div>
                <p className="text-[11px] font-black uppercase text-emerald-700">Atendimento no Salão</p>
                <p className="text-sm font-bold text-stone-900">Você está na Mesa {urlMesa}</p>
              </div>
            </div>
            <span className="text-[11px] bg-emerald-100 border border-emerald-200 text-emerald-800 px-3 py-1 rounded-xl font-bold">
              QR Code Ativo
            </span>
          </div>
        </div>
      )}

      {/* Banner de Salão quando loja é mesa-only mas cliente abriu sem QR Code da mesa */}
      {!isVisualOnly && isTableOnly && !urlMesa && (
        <div className="mt-3 container mx-auto px-4 max-w-6xl">
          <div className="bg-stone-100 border border-stone-200 text-stone-900 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🍽️</span>
              <div>
                <p className="text-[11px] font-black uppercase text-stone-600">Autoatendimento nas Mesas</p>
                <p className="text-xs sm:text-sm font-medium text-stone-700">Aponte a câmera para o QR Code da sua mesa para enviar seu pedido direto para a cozinha</p>
              </div>
            </div>
            <span className="text-[11px] bg-white border border-stone-200 text-stone-800 px-3 py-1 rounded-xl font-bold whitespace-nowrap shadow-xs">
              Salão & Mesas
            </span>
          </div>
        </div>
      )}

      {/* Banner de Pedido em Andamento (Oculto em pedidos na mesa / QR Code) */}
      {!isVisualOnly && !urlMesa && activeGuestOrder && activeGuestOrder.order_type !== 'dine_in' && !activeGuestOrder.table_number && (
        <div className="mt-3 container mx-auto px-4 max-w-6xl">
          <div className="relative">
            <Link to={`${createPageUrl("MyOrders")}?id=${activeGuestOrder.id}`}>
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }}
                className="bg-stone-900 text-white rounded-2xl p-3.5 shadow-md flex items-center justify-between cursor-pointer hover:bg-stone-850 transition-colors pr-12"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
                    <Bike className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400">Pedido em Andamento</p>
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
                <div className="flex items-center text-xs font-bold gap-1 bg-white/10 px-3 py-1.5 rounded-xl">
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
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xs font-bold transition-all z-10"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Banner Superior de Cashback (Conforme Modelo Solicitado) */}
      {!isVisualOnly && Boolean(settings?.cashback_enabled ?? tenant?.cashback_enabled) && Number(settings?.cashback_rate ?? tenant?.cashback_rate ?? 5) > 0 && (
        <div className="mt-3 container mx-auto px-4 max-w-6xl">
          <div 
            onClick={() => setIsUserProfileOpen(true)}
            className="bg-[#F0FDF4] border border-[#D1E9DF] hover:bg-[#E6F8EE] rounded-2xl p-3.5 sm:p-4 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-2xs"
          >
            <div className="flex-1 min-w-0 pr-1">
              <h3 
                className="font-bold text-sm sm:text-base text-[#046c4e] tracking-tight leading-tight"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {currentUser 
                  ? `Cashback de ${Number(settings?.cashback_rate ?? tenant?.cashback_rate ?? 5)}% ativado` 
                  : `Cashback de ${Number(settings?.cashback_rate ?? tenant?.cashback_rate ?? 5)}% disponível`}
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 mt-1 leading-snug font-normal">
                {currentUser 
                  ? `Faça um pedido e ganhe ${Number(settings?.cashback_rate ?? tenant?.cashback_rate ?? 5)}% do valor de volta para usar nas próximas compras.` 
                  : `Crie sua conta para ganhar ${Number(settings?.cashback_rate ?? tenant?.cashback_rate ?? 5)}% do valor de volta e usar nas próximas compras.`}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-[#046c4e] shrink-0" />
          </div>
        </div>
      )}

      {/* Banners Carrossel (Full Width, com cantos superiores arredondados logo abaixo da navbar reta) */}
      {hasBanners && (
        <div className="w-full">
          <BannerCarousel banners={banners} />
        </div>
      )}

      {/* Camada Branca Sobreposta com Cantos Superiores Arredondados */}
      <div 
        className={`w-full bg-white relative z-10 transition-all ${
          hasBanners 
            ? "-mt-6 rounded-t-[24px] sm:rounded-t-[28px]" 
            : ""
        }`}
      >
        <main className="container mx-auto px-4 sm:px-6 pt-5 pb-36 max-w-6xl space-y-5">
          {/* Barra de Categorias em Pílulas */}
          <div 
            id="menu-categories-row" 
            className="sticky z-20 bg-white/95 backdrop-blur-md py-1.5 -mx-4 px-4 sm:-mx-6 sm:px-6"
            style={{ top: `${headerHeight}px` }}
          >
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
              {displayCategories.map((category) => {
                const isActive = activeCategory === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(category.id);
                      setSearchQuery("");
                    }}
                    className={`flex-shrink-0 px-4 sm:px-5 py-2 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap select-none ${
                      isActive
                        ? "bg-[#046c4e] text-white shadow-xs"
                        : "bg-gray-100/90 text-gray-700 hover:bg-gray-200/80"
                    }`}
                  >
                    {category.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Barra de Busca */}
          <div className="relative w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="menu-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar no cardápio..."
              className="w-full bg-gray-50/90 border border-gray-200/80 rounded-2xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-[#046c4e] focus:ring-1 focus:ring-[#046c4e]/30 outline-none shadow-2xs transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs font-bold p-1 cursor-pointer"
                aria-label="Limpar busca"
              >
                ✕
              </button>
            )}
          </div>

          {/* Card de Frete Dinâmico (Conforme Modelo da Foto de Referência) */}
          {!isVisualOnly && !urlMesa && !searchQuery.trim() && deliveryFeeDisplay && (
            <div 
              onClick={() => setIsUserProfileOpen(true)}
              className="bg-[#F0FDF4] border border-[#D1E9DF] hover:bg-[#E6F8EE] rounded-2xl p-3.5 sm:p-4 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-2xs"
            >
              <div className="flex-1 min-w-0 pr-1">
                <h3 
                  className="font-bold text-sm sm:text-base text-[#046c4e] tracking-tight leading-tight"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  {deliveryFeeDisplay.title}
                </h3>
                <p className="text-xs sm:text-sm text-stone-600 mt-0.5 leading-snug font-normal">
                  {deliveryFeeDisplay.subtitle}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#046c4e] shrink-0" />
            </div>
          )}

        {isSearching && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-black tracking-widest text-[#046c4e] uppercase">
              <span>BUSCA NO CARDÁPIO</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-gray-950 mt-0.5 tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Resultados para "{searchQuery}"
            </h2>
          </div>
        )}

        {/* Carrossel dos Mais Pedidos (Inspirado na Foto 1) */}
        {!searchQuery.trim() && (
          <PopularProductsRow
            products={popularRankedProducts}
            onProductClick={handleProductClick}
            isStoreOpen={storeIsOpen}
            isVisualOnly={isVisualOnly}
          />
        )}

        {/* Carrossel dos Últimos Pedidos (Inspirado na Foto 1) */}
        {!isVisualOnly && !searchQuery.trim() && recentOrders.length > 0 && (
          <RecentOrdersRow
            orders={recentOrders}
            products={products}
            onAddToCart={addToCart}
            isStoreOpen={storeIsOpen}
          />
        )}

        {/* Lista de Produtos Organizada em Componentes Grandes (Inspirado na Foto 1) */}
        {categorizedSections.map((section) => (
          <div key={section.id} className="space-y-3">
            {/* Título da Categoria Estilo Foto 1 */}
            <div className="flex items-center justify-between px-1">
              <h3 
                className="text-sm sm:text-base font-black text-[#171717] uppercase tracking-wider"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {section.name}
              </h3>
              {section.description && (
                <p className="text-xs text-stone-400 hidden sm:block">
                  {section.description}
                </p>
              )}
            </div>

            {/* Componente Grande Card Branco Englobando os Produtos */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#E5EAE7] shadow-xs overflow-hidden divide-y divide-[#E5EAE7]">
              <AnimatePresence>
                {section.products.map((product, idx) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onProductClick={handleProductClick}
                    isStoreOpen={storeIsOpen}
                    isPopular={idx === 0 && section.id === "all"}
                    isVisualOnly={isVisualOnly}
                    cashbackRate={settings?.cashback_enabled ? Number(settings?.cashback_rate || 0) : 0}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))}

        {filteredProducts.length === 0 && (
          <div className="text-center py-16 bg-white rounded-3xl border border-[#E5EAE7] p-8 space-y-3 shadow-xs">
            <div className="text-5xl">🍽️</div>
            <h3 className="text-lg font-bold text-[#171717]">Nenhum produto encontrado</h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              {searchQuery ? `Não encontramos itens para "${searchQuery}". Tente outro termo.` : "Não há produtos disponíveis nesta categoria no momento."}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#047857] hover:text-[#036348] bg-[#D1E9DF]/40 hover:bg-[#D1E9DF] border border-[#D1E9DF] px-4 py-2 rounded-full transition-colors cursor-pointer"
              >
                Limpar busca
              </button>
            )}
          </div>
        )}

        {/* Banner Promocional de Combos */}
        {comboCategory && (
          <motion.div 
            whileHover={{ y: -2 }}
            className="rounded-3xl overflow-hidden relative border border-[#E5EAE7] bg-white p-6 sm:p-8 shadow-xs"
          >
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2 text-left flex-1">
                <div className="inline-flex items-center gap-1.5 text-[#047857] text-xs font-black uppercase tracking-widest">
                  <span>SELEÇÃO ESPECIAL</span>
                </div>
                
                <h3 
                  className="text-xl sm:text-2xl font-black text-[#171717] leading-tight tracking-tight" 
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Conheça nossos <span className="text-[#047857]">{comboCategory.name}</span>
                </h3>
                
                <p className="text-xs sm:text-sm text-stone-500 max-w-lg leading-relaxed font-normal">
                  Combos especiais e produtos selecionados com o melhor custo-benefício para sua refeição.
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
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#047857] hover:bg-[#036348] text-white font-extrabold text-xs sm:text-sm px-6 py-3.5 rounded-2xl shadow-md shadow-[#047857]/20 transition-all duration-200 cursor-pointer whitespace-nowrap"
                >
                  <span>Explorar Combos</span>
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>

      {/* Rodapé Institucional Clean */}
      <footer className="bg-white border-t border-[#E5EAE7] py-10 px-4">
        <div className="container mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                {settings?.restaurant_logo ? (
                  <img src={settings.restaurant_logo} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center font-black text-sm text-stone-900">
                    {(settings?.restaurant_name || resolvedInitialStoreName).substring(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <h4 className="font-black text-base text-stone-900 tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {settings?.restaurant_name || resolvedInitialStoreName}
              </h4>
            </div>
            <p className="text-xs text-stone-500 leading-relaxed max-w-xs font-normal">
              Os melhores produtos preparados com ingredientes selecionados e entrega rápida para você.
            </p>
          </div>

          <div className="md:col-span-4 space-y-2.5 text-xs text-stone-600">
            <p className="font-black uppercase tracking-wider text-stone-400 text-[11px]">Localização & Contato</p>
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
              <span>{settings?.address || "Endereço não informado"}</span>
            </div>
            {settings?.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
                <span>{settings.phone}</span>
              </div>
            )}
            {settings?.whatsapp && (
              <a
                href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-stone-700 hover:text-stone-900 transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <span>{settings.whatsapp}</span>
              </a>
            )}
            {settings?.instagram && (
              <a
                href={`https://instagram.com/${settings.instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-stone-700 hover:text-stone-900 transition-colors"
              >
                <Instagram className="w-3.5 h-3.5 text-stone-600 flex-shrink-0" />
                <span>{settings.instagram}</span>
              </a>
            )}
          </div>

          <div className="md:col-span-4 space-y-2.5 text-xs text-stone-600">
            <p className="font-black uppercase tracking-wider text-stone-400 text-[11px]">Horário de Funcionamento</p>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${storeIsOpen ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className={storeIsOpen ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>
                {storeIsOpen ? 'Aberto Agora' : 'Fechado'}
              </span>
            </div>
            <p className="text-stone-500">
              {settings?.opening_time && settings?.closing_time ? `${settings.opening_time} às ${settings.closing_time}` : 'Consulte nosso horário'}
            </p>
          </div>
        </div>

        <div className="container mx-auto max-w-6xl pt-8 mt-8 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
          <p>© {new Date().getFullYear()} {settings?.restaurant_name || resolvedInitialStoreName}. Todos os direitos reservados.</p>
          <p>
            Desenvolvido por{" "}
            <a
              href="https://instagram.com/davialeixo_nogueira"
              target="_blank"
              rel="noopener noreferrer"
              className="text-stone-800 hover:text-stone-950 font-semibold transition-colors"
            >
              Davi Aleixo
            </a>
            {" | "}
            <a
              href="https://wa.me/5531982607426"
              target="_blank"
              rel="noopener noreferrer"
              className="text-stone-800 hover:text-stone-950 font-semibold transition-colors"
            >
              31982607426
            </a>
          </p>
        </div>
      </footer>

      {/* Carrinho flutuante */}
      {!isVisualOnly && (
        <AnimatePresence>
          <Cart
            cart={cart}
            updateQuantity={updateCartQuantity}
            onCheckout={handleCheckout}
            deliveryFee={settings?.delivery_fee || 0}
            isVisible={isCartVisible}
            onToggle={handleCartToggle}
            products={products}
            categories={categories}
            onAddToCart={addToCart}
            onSelectProduct={handleProductClick}
            complementGroups={complementGroups}
            productComplementGroups={productComplementGroups}
          />
        </AnimatePresence>
      )}

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
          onClose={async () => {
            // Se o usuário fechar ou clicar em "Escolher outra forma de pagamento" sem pagar:
            try {
              if (pixOnlineOrder?.id) {
                await Order.delete(pixOnlineOrder.id);
              }
            } catch (_e) {}
            setPixOnlineOrder(null);
            setShowOrderModal(true);
          }}
          order={pixOnlineOrder}
          accessToken={tenant?.payment_methods?.mp_access_token}
          tenant={tenant}
          onPaymentApproved={(paidOrder) => {
            setPixOnlineOrder(null);
            setCart([]);
            navigate(`${createPageUrl("MyOrders")}?id=${paidOrder.id}`);
          }}
          onPaymentConvertedToDelivery={(convertedOrder) => {
            setPixOnlineOrder(null);
            setCart([]);
            navigate(`${createPageUrl("MyOrders")}?id=${convertedOrder.id}`);
          }}
        />
      )}

      {/* Modal de Confirmação Direta do Pedido na Mesa (Sem WhatsApp, Sem Stepper de Rastreio) */}
      {renderTableOrderConfirmedModal()}
      
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
          isVisualOnly={isVisualOnly}
        />
      )}

      {selectedPizzaProduct && (() => {
        const matchedPizzaCategory = categories.find(c => 
          c.id === selectedPizzaProduct.category_id || 
          c.id === selectedPizzaProduct.category ||
          (selectedPizzaProduct.category && typeof selectedPizzaProduct.category === 'string' && c.name?.toLowerCase() === selectedPizzaProduct.category.toLowerCase()) ||
          (selectedPizzaProduct.category_id && typeof selectedPizzaProduct.category_id === 'string' && c.name?.toLowerCase() === selectedPizzaProduct.category_id.toLowerCase())
        );

        const categoryFlavors = products.filter(p => {
          if (!matchedPizzaCategory) {
            return p.category === selectedPizzaProduct.category || p.category_id === selectedPizzaProduct.category_id;
          }
          return p.category === matchedPizzaCategory.id || 
                 p.category_id === matchedPizzaCategory.id || 
                 (p.category && typeof p.category === 'string' && p.category.toLowerCase() === matchedPizzaCategory.name?.toLowerCase());
        });

        return (
          <PizzaBuilderModal
            isOpen={Boolean(selectedPizzaProduct)}
            onClose={() => setSelectedPizzaProduct(null)}
            initialProduct={selectedPizzaProduct}
            category={matchedPizzaCategory}
            allCategoryProducts={categoryFlavors}
            allComplementGroups={complementGroups}
            allComplementItems={complementItems}
            productComplementGroups={productComplementGroups}
            pricingRule={tenant?.pizza_pricing_rule || 'highest_price'}
            onAddToCart={addToCart}
            isVisualOnly={isVisualOnly}
          />
        );
      })()}
    </div>
  );
}
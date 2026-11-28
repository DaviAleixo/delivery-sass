import React, { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber, formatToBRL } from "@/utils/moneyMask";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, MapPin, Truck, Store, Plus, ArrowLeft, Loader2, CreditCard, Banknote, Home, Building2, AlertTriangle, CheckCircle2, Zap, UtensilsCrossed, PhoneCall, Gift, MessageSquare, Tag, Receipt, User as UserIcon } from "lucide-react";
import { matchNeighborhood, isCityAllowed } from "@/utils/neighborhoodMatcher";
import { User, getStoredCustomerToken } from "@/entities/User";
import { UserAddress } from "@/entities/UserAddress";
import { Coupon } from "@/entities/Coupon";
import { CouponUsage } from "@/entities/CouponUsage";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { base44 } from "@/api/base44Client";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { validateSchema, orderSchema } from "@/schemas";
import { getActiveTenantId } from "@/entities/storage";
import { getOrCreateCheckoutOrderId } from "@/utils/checkoutIdempotency";
import WhatsAppAuthModal from "./WhatsAppAuthModal";
import { CARD_BRANDS, MEAL_VOUCHER_BRANDS } from "@/constants/paymentBrands";

export const parseAddressString = (addrStr) => {
  if (!addrStr || typeof addrStr !== 'string') return null;
  try {
    let street = "";
    let number = "";
    let complement = "";
    let neighborhood = "";
    let city = "";
    let state = "MG";
    let cep = "";

    const cepMatch = addrStr.match(/\b\d{5}-?\d{3}\b/);
    if (cepMatch) {
      cep = cepMatch[0];
      if (cep.length === 8 && !cep.includes("-")) {
        cep = `${cep.slice(0, 5)}-${cep.slice(5)}`;
      }
    }

    if (addrStr.includes(" - ")) {
      const parts = addrStr.split(" - ");
      const streetPart = parts[0] || "";
      const remaining = parts.slice(1).join(" - ");

      const match = streetPart.match(/^(.+?),\s*([0-9A-Za-z\s/ºª-]+?)(?:\s*\((.*?)\))?$/);
      if (match) {
        street = match[1].trim();
        number = match[2].trim();
        complement = match[3] ? match[3].trim() : "";
      } else {
        street = streetPart.trim();
      }

      if (remaining) {
        const cityParts = remaining.split(",");
        neighborhood = cityParts[0]?.trim() || "";
        if (cityParts[1]) {
          const cs = cityParts[1].split("/");
          city = cs[0]?.trim() || "";
          state = cs[1]?.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "MG";
        }
      }
    } else if (addrStr.includes(",")) {
      const commaParts = addrStr.split(",").map(p => p.trim());
      street = commaParts[0] || "";
      number = commaParts[1] || "";
      neighborhood = commaParts[2] || "";
      city = commaParts[3] || "";
    } else {
      street = addrStr.trim();
    }

    return { street, number, complement, neighborhood, city: city || "", state: state || "MG", cep };
  } catch {
    return null;
  }
};

export const fetchCustomerAddresses = async (phone, email) => {
  const cleanPhone = (phone || "").replace(/\D/g, "");
  const cleanEmail = (email || "").trim().toLowerCase();
  const addressList = [];
  const seenKeys = new Set();

  const addUnique = (addr) => {
    if (!addr) return;
    const streetClean = (addr.street || '').trim();
    const numClean = (addr.number || '').trim();
    if (!streetClean) return;
    const key = `${streetClean.toLowerCase()}_${numClean.toLowerCase()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      addressList.push({
        id: String(addr.id || `addr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
        name: addr.name || (addressList.length === 0 ? "Casa" : `Endereço ${addressList.length + 1}`),
        street: streetClean,
        number: numClean || "S/N",
        complement: (addr.complement || '').trim(),
        neighborhood: (addr.neighborhood || '').trim(),
        city: (addr.city || '').trim(),
        state: (addr.state || 'MG').trim().toUpperCase(),
        cep: (addr.cep || addr.zip_code || '').trim(),
        is_default: addr.is_default !== undefined ? addr.is_default : addressList.length === 0,
        user_phone: addr.user_phone || phone || "",
        user_email: addr.user_email || email || ""
      });
    }
  };

  // 1. Buscar endereços salvos do cliente via RPC segura (get_customer_addresses)
  if (isSupabaseConfigured() && supabase && cleanPhone) {
    try {
      const tenantId = getActiveTenantId();
      const customerToken = getStoredCustomerToken();
      if (tenantId && customerToken) {
        const { data: rpcAddrs } = await supabase.rpc("get_customer_addresses", {
          p_tenant_id: tenantId,
          p_phone: cleanPhone,
          p_customer_token: customerToken,
        });
        if (Array.isArray(rpcAddrs) && rpcAddrs.length > 0) {
          rpcAddrs.forEach(addUnique);
        }
      }
    } catch {}
  }

  // 2. Fallback local (para modo offline)
  if (addressList.length === 0) {
    try {
      const allAddrs = await UserAddress.list();
      (allAddrs || []).forEach(a => {
        const cleanAddrPhone = (a.user_phone || "").replace(/\D/g, "");
        if (
          (cleanEmail && a.user_email && a.user_email.toLowerCase() === cleanEmail) ||
          (cleanPhone && cleanAddrPhone && cleanAddrPhone.slice(-8) === cleanPhone.slice(-8))
        ) {
          addUnique(a);
        }
      });
    } catch {}
  }

  return addressList;
};

export default function OrderModal({ 
  isOpen, 
  onClose, 
  cart = [], 
  total: _total = 0,
  deliveryFee = 0, 
  minOrderValue = 0, 
  deliveryTime = "40-50 min",
  deliveryRules = {},
  tenantId: propTenantId = null,
  initialTableNumber = "",
  onSubmit,
  isSubmitting = false,
  isVrumm = false
}) {
  const storeCity = deliveryRules?.address_city || "";
  const storeState = deliveryRules?.address_state || "MG";

  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [isCreatingNewAddress, setIsCreatingNewAddress] = useState(false);
  const [newAddressForm, setNewAddressForm] = useState({
    name: "",
    cep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: storeCity,
    state: storeState,
    save_address: true,
  });
  const [isFetchingCep, setIsFetchingCep] = useState(false);
  const nameInputRef = useRef(null);
  
  const isTableOnlyStore = deliveryRules?.salon_mode === 'table_only';
  const savedMesa = initialTableNumber || (typeof window !== "undefined" ? localStorage.getItem("vrumburguer_table_number") || "" : "");
  
  // Regras de canais de atendimento e restrição de mesa via QR Code
  const acceptsDineIn = deliveryRules?.accepts_dine_in !== false;
  const acceptsDelivery = deliveryRules?.accepts_delivery !== false && !isTableOnlyStore;
  const acceptsTakeaway = deliveryRules?.accepts_takeaway !== false;
  // "Na Mesa" somente deve aparecer se o cliente escaneou o QR Code da mesa (savedMesa) ou em loja exclusiva de mesas, desde que accepts_dine_in esteja ativo
  const showDineInTab = Boolean((savedMesa || isTableOnlyStore) && acceptsDineIn);
  const showDeliveryTab = Boolean(acceptsDelivery && !isTableOnlyStore);
  const showTakeawayTab = Boolean(acceptsTakeaway);

  const getInitialOrderType = () => {
    if (showDineInTab) return "dine_in";
    if (showDeliveryTab) return "delivery";
    if (showTakeawayTab) return "takeaway";
    return "delivery";
  };

  const [orderType, setOrderType] = useState(getInitialOrderType);
  const [tableNumber, setTableNumber] = useState(savedMesa);
  const [customerData, setCustomerData] = useState({
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    payment_method: "",
    card_brand: "",
    notes: ""
  });
  const [changeFor, setChangeFor] = useState("");
  const [isSearchingPhone, setIsSearchingPhone] = useState(false);
  const [phoneLookupFeedback, setPhoneLookupFeedback] = useState("");
  const [errors, setErrors] = useState({});
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalTitle, setAuthModalTitle] = useState("Acessar Conta por SMS");
  const [pendingCoupon, setPendingCoupon] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [collapsedAccordions, setCollapsedAccordions] = useState({});

  // Cashback do Lojista
  const cashbackEnabled = Boolean(deliveryRules?.cashback_enabled);
  const cashbackRate = Number(deliveryRules?.cashback_rate || 0);
  const _cashbackValidityDays = Number(deliveryRules?.cashback_validity_days || 15);
  const _cashbackMaxDiscountPct = Number(deliveryRules?.cashback_max_discount_percentage || 50);
  const isCashbackActive = cashbackEnabled && cashbackRate > 0;

  const [cashbackWallet, setCashbackWallet] = useState(null);
  const [useCashback, _setUseCashback] = useState(false);
  const [_isLoadingCashback, _setIsLoadingCashback] = useState(false);

  const _loadCashbackWallet = async (phone) => {
    if (!isCashbackActive || !phone) {
      setCashbackWallet(null);
      return;
    }
    const cleanPhone = String(phone).replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 8) {
      setCashbackWallet(null);
      return;
    }
    const tenantIdToUse = deliveryRules?.id || deliveryRules?.tenant_id || (typeof window !== "undefined" ? localStorage.getItem("current_tenant_id") : null);
    if (!tenantIdToUse) return;

    try {
      _setIsLoadingCashback(true);
      if (isSupabaseConfigured() && supabase) {
        const { data, error } = await supabase.rpc("get_customer_cashback_balance", {
          p_tenant_id: tenantIdToUse,
          p_phone: cleanPhone
        });
        if (!error && data) {
          setCashbackWallet(data);
        }
      }
    } catch (err) {
      console.warn("Erro ao carregar saldo de cashback:", err);
    } finally {
      _setIsLoadingCashback(false);
    }
  };
  const [couponError, setCouponError] = useState("");

  useEffect(() => {
    if (savedMesa || isTableOnlyStore) {
      setOrderType("dine_in");
      if (savedMesa) setTableNumber(savedMesa);
    } else if (!showDeliveryTab && showTakeawayTab) {
      setOrderType("takeaway");
    } else if (showDeliveryTab && !showTakeawayTab) {
      setOrderType("delivery");
    }
  }, [savedMesa, isTableOnlyStore, showDeliveryTab, showTakeawayTab]);

  // Sincroniza cidade base do restaurante quando carregada
  useEffect(() => {
    if (deliveryRules?.address_city) {
      setNewAddressForm(prev => {
        if (!prev.city || prev.city === "Contagem") {
          return {
            ...prev,
            city: deliveryRules.address_city,
            state: deliveryRules.address_state || prev.state || "MG"
          };
        }
        return prev;
      });
    }
  }, [deliveryRules?.address_city, deliveryRules?.address_state]);

  // Sincronização em tempo real das Formas de Pagamento
  const [activePaymentMethods, setActivePaymentMethods] = useState(deliveryRules?.payment_methods || null);

  useEffect(() => {
    if (deliveryRules?.payment_methods) {
      setActivePaymentMethods(deliveryRules.payment_methods);
    }
  }, [deliveryRules?.payment_methods]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchLatestPaymentMethods = async () => {
      const activeTenantId = getActiveTenantId() || "a0000000-0000-0000-0000-000000000001";
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data } = await supabase
            .from("tenants_public")
            .select("payment_methods")
            .eq("id", activeTenantId)
            .maybeSingle();

          if (data?.payment_methods && isMounted) {
            setActivePaymentMethods(data.payment_methods);
          }
        } catch (_err) {
          console.warn("Erro ao sincronizar formas de pagamento no modal:", _err);
        }
      }
    };

    fetchLatestPaymentMethods();
    return () => { isMounted = false; };
  }, [isOpen]);

  const availablePaymentMethods = useMemo(() => {
    const pm = activePaymentMethods || deliveryRules?.payment_methods || {};
    const showOnlineMp = Boolean(pm.accept_online_mp && (pm.has_online_mp || pm.mp_access_token));
    const showCredit = pm.accept_card_credit !== undefined ? Boolean(pm.accept_card_credit === true || pm.accept_card_credit === "true") : (pm.accept_card_delivery !== false);
    const showDebit = pm.accept_card_debit !== undefined ? Boolean(pm.accept_card_debit === true || pm.accept_card_debit === "true") : (pm.accept_card_delivery !== false);
    const showMeal = Boolean(pm.accept_card_meal === true || pm.accept_card_meal === "true");
    const showCash = pm.accept_cash !== false && pm.accept_cash !== "false";

    return [
      showOnlineMp && {
        id: 'pix_online',
        label: 'PIX Online',
        sub: 'Aprovação automática em 2s pelo app do seu banco',
        image: '/bandeiras/pix.webp',
        icon: Zap,
        theme: {
          bg: 'bg-emerald-50/70',
          border: 'border-emerald-200/80',
          text: 'text-emerald-700',
        },
      },
      showCredit && {
        id: 'cartao_credito',
        label: 'Cartão de Crédito',
        sub: 'Pague na maquininha com o entregador',
        icon: CreditCard,
        theme: {
          bg: 'bg-blue-50/70',
          border: 'border-blue-200/80',
          text: 'text-blue-700',
        },
      },
      showDebit && {
        id: 'cartao_debito',
        label: 'Cartão de Débito',
        sub: 'Pague na maquininha com o entregador',
        icon: CreditCard,
        theme: {
          bg: 'bg-indigo-50/70',
          border: 'border-indigo-200/80',
          text: 'text-indigo-700',
        },
      },
      showMeal && {
        id: 'alimentacao',
        label: 'Vale Refeição / Alimentação',
        sub: 'Pague na maquininha com o entregador',
        icon: UtensilsCrossed,
        theme: {
          bg: 'bg-stone-100',
          border: 'border-stone-200',
          text: 'text-stone-700',
        },
      },
      showCash && {
        id: 'dinheiro',
        label: 'Dinheiro em Espécie',
        sub: 'Pagamento na entrega (com opção de troco)',
        icon: Banknote,
        theme: {
          bg: 'bg-emerald-50/70',
          border: 'border-emerald-200/80',
          text: 'text-emerald-700',
        },
      },
    ].filter(Boolean);
  }, [activePaymentMethods, deliveryRules?.payment_methods]);

  useEffect(() => {
    if (!isOpen) return;
    if (availablePaymentMethods.length > 0) {
      if (!customerData.payment_method || !availablePaymentMethods.some(m => m.id === customerData.payment_method)) {
        setCustomerData(prev => ({ ...prev, payment_method: availablePaymentMethods[0].id }));
      }
    }
  }, [isOpen, availablePaymentMethods, customerData.payment_method]);

  const subtotal = cart.reduce((sum, item) => {
    const additionalsTotal = item.additionals.reduce((s, ad) => s + ad.price, 0);
    return sum + (item.price + additionalsTotal) * item.quantity;
  }, 0);

  // Bairro e Cidade do cliente atual
  const getCustomerNeighborhood = () => {
    if (addresses.length > 0 && selectedAddress && selectedAddress !== "new_address" && !isCreatingNewAddress) {
      const addr = addresses.find(a => a.id === selectedAddress);
      return addr?.neighborhood || "";
    }
    return newAddressForm.neighborhood || "";
  };

  const getCustomerCity = () => {
    if (addresses.length > 0 && selectedAddress && selectedAddress !== "new_address" && !isCreatingNewAddress) {
      const addr = addresses.find(a => a.id === selectedAddress);
      return addr?.city || "";
    }
    return newAddressForm.city || "";
  };

  const customerNeighborhood = getCustomerNeighborhood();
  const customerCity = getCustomerCity();

  // Validação de Cidade Base do Restaurante
  const isCityValid = isCityAllowed(customerCity, storeCity, deliveryRules?.delivery_allowed_cities || []);
  const isCityBlocked = orderType === 'delivery' && storeCity && customerCity && !isCityValid;

  // Cálculo inteligente da taxa de entrega
  const isNeighborhoodMode = deliveryRules?.delivery_fee_type === 'neighborhood';
  const registeredNeighborhoods = deliveryRules?.delivery_neighborhoods || [];

  let effectiveDeliveryFee = Number(deliveryFee || 0);
  let neighborhoodMatchResult = null;
  let isDeliveryBlocked = false;
  let deliveryBlockReason = "";

  if (orderType === 'delivery') {
    if (isCityBlocked) {
      isDeliveryBlocked = true;
      effectiveDeliveryFee = 0;
      deliveryBlockReason = `Nosso delivery entrega somente em ${storeCity}${storeState ? ' - ' + storeState : ''}. O endereço informado pertence a ${customerCity}. Escolha "Retirada no Balcão" para fazer seu pedido!`;
    } else if (isNeighborhoodMode && registeredNeighborhoods.length > 0) {
      if (customerNeighborhood?.trim()) {
        neighborhoodMatchResult = matchNeighborhood(customerNeighborhood, registeredNeighborhoods);
        if (neighborhoodMatchResult) {
          effectiveDeliveryFee = Number(neighborhoodMatchResult.fee || 0);
          isDeliveryBlocked = false;
        } else {
          if (deliveryRules?.delivery_unlisted_policy === 'fallback') {
            effectiveDeliveryFee = Number(deliveryRules?.delivery_fallback_fee || 10);
            isDeliveryBlocked = false;
          } else {
            isDeliveryBlocked = true;
            effectiveDeliveryFee = 0;
            deliveryBlockReason = `Infelizmente nosso restaurante ainda não realiza entregas no bairro "${customerNeighborhood}". Você pode escolher "Retirada no Balcão" para fazer seu pedido!`;
          }
        }
      } else {
        effectiveDeliveryFee = 0;
      }
    }

    // Regra de Frete Grátis acima de valor X
    const freeThreshold = deliveryRules?.free_delivery_threshold ? Number(deliveryRules.free_delivery_threshold) : null;
    if (freeThreshold && subtotal >= freeThreshold && !isDeliveryBlocked) {
      effectiveDeliveryFee = 0;
    }
  }

  const freeThreshold = deliveryRules?.free_delivery_threshold ? Number(deliveryRules.free_delivery_threshold) : null;
  const isFreeDeliveryEligible = freeThreshold && subtotal >= freeThreshold && !isDeliveryBlocked;

  const discountAmount = appliedCoupon ? calculateDiscount(appliedCoupon, subtotal, cart) : 0;
  const totalAfterDiscount = subtotal - discountAmount;
  const finalTotal = orderType === 'delivery' ? totalAfterDiscount + effectiveDeliveryFee : totalAfterDiscount;

  const isDineIn = orderType === 'dine_in';

  useEffect(() => {
    const loadUser = async () => {
      let userData = null;
      try {
        userData = await User.me();
        if (!userData) {
          try {
            userData = await base44.auth.me();
          } catch {}
        }
      } catch {
        userData = null;
      }

      if (userData && userData.id) {
        setUser(userData);
        setCustomerData(prev => ({
          ...prev,
          customer_name: (userData.full_name && userData.full_name !== "Cliente") ? userData.full_name : prev.customer_name || "",
          customer_phone: userData.phone ? formatPhone(userData.phone) : prev.customer_phone || "",
          customer_email: userData.email || prev.customer_email || ""
        }));

        const userAddrs = await fetchCustomerAddresses(userData.phone, userData.email);
        if (userAddrs && userAddrs.length > 0) {
          setAddresses(userAddrs);
          const defaultAddress = userAddrs.find(addr => addr.is_default) || userAddrs[0];
          setSelectedAddress(defaultAddress.id);
          setIsCreatingNewAddress(false);
          setNewAddressForm(prev => ({
            ...prev,
            name: "",
            city: defaultAddress.city || prev.city || deliveryRules?.address_city || "",
            state: defaultAddress.state || prev.state || deliveryRules?.address_state || "MG"
          }));
        } else {
          setAddresses([]);
          setIsCreatingNewAddress(true);
        }
      } else {
        // Visitante (Guest Checkout): sem cadastro prévio, sem login e sem endereços salvos
        setUser(null);
        setAddresses([]);
        setIsCreatingNewAddress(true);
      }
    };

    if (isOpen) {
      loadUser();
      setCouponCode("");
      setAppliedCoupon(null);
      setCouponError("");
    }
  }, [isOpen]);

  const handleCepChange = async (e) => {
    const raw = e.target.value;
    const clean = raw.replace(/\D/g, '').slice(0, 8);
    const formatted = clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5, 8)}` : clean;
    setNewAddressForm(prev => ({ ...prev, cep: formatted }));

    if (clean.length === 8) {
      setIsFetchingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setNewAddressForm(prev => ({
            ...prev,
            street: data.logradouro || prev.street,
            neighborhood: data.bairro || prev.neighborhood,
            city: data.localidade || prev.city,
            state: data.uf || prev.state || "MG",
          }));
          if (errors.address) setErrors(p => ({ ...p, address: "" }));
          setTimeout(() => {
            document.getElementById("addr-num")?.focus();
          }, 100);
        }
      } catch (_err) {
        console.error("Erro ao buscar CEP:", _err);
      } finally {
        setIsFetchingCep(false);
      }
    }
  };

  function calculateDiscount(coupon, subtotal, cart) {
    if (coupon.apply_to === 'specific_products') {
      const applicableItemsTotal = cart.reduce((sum, item) => {
        if (coupon.applicable_products.includes(item.id)) {
          const additionalsTotal = item.additionals.reduce((s, ad) => s + ad.price, 0);
          return sum + (item.price + additionalsTotal) * item.quantity;
        }
        return sum;
      }, 0);
      if (coupon.discount_type === 'percentage') return (applicableItemsTotal * coupon.discount_value) / 100;
      return Math.min(coupon.discount_value, applicableItemsTotal);
    } else {
      if (coupon.discount_type === 'percentage') return (subtotal * coupon.discount_value) / 100;
      return Math.min(coupon.discount_value, subtotal);
    }
  }

  const handleApplyCoupon = async (codeOverride = null, userOverride = null) => {
    const codeToUse = typeof codeOverride === 'string' ? codeOverride : couponCode;
    if (!codeToUse) return;
    setCouponError("");
    setAppliedCoupon(null);

    const activeUser = userOverride || user;
    if (!activeUser || !activeUser.id) {
      setCouponError("Cupons de desconto são exclusivos para clientes cadastrados.");
      return;
    }

    const coupons = await Coupon.filter({ code: codeToUse.toUpperCase(), active: true });
    const coupon = coupons[0];

    if (!coupon) { setCouponError("Cupom inválido ou inativo."); return; }
    if (coupon.end_date && new Date(coupon.end_date) < new Date()) { setCouponError("Este cupom expirou."); return; }

    const cleanPhone = (activeUser.phone || customerData.customer_phone || "").replace(/\D/g, "");
    if (coupon.usage_limit && (cleanPhone || user?.email)) {
      let usageCount = 0;
      if (isSupabaseConfigured() && supabase) {
        try {
          const tenantId = getActiveTenantId();
          if (tenantId) {
            const { data: cnt } = await supabase.rpc("get_coupon_usage_count", {
              p_tenant_id: tenantId,
              p_coupon_id: String(coupon.id),
              p_phone: cleanPhone || null,
            });
            usageCount = Number(cnt || 0);
          }
        } catch {}
      } else {
        const allUsages = await CouponUsage.list();
        usageCount = (allUsages || []).filter(u => u.coupon_id === coupon.id).length;
      }
      if (usageCount >= coupon.usage_limit) {
        setCouponError("Este cupom atingiu o limite máximo de utilizações.");
        return;
      }
    }

    const totalWithDelivery = orderType === 'delivery' ? subtotal + deliveryFee : subtotal;
    if (coupon.min_order_value > totalWithDelivery) {
      setCouponError(`Pedido mínimo de R$ ${coupon.min_order_value.toFixed(2)} necessário.`);
      return;
    }

    setAppliedCoupon(coupon);
  };

  const validateForm = () => {
    const newErrors = {};

    if (orderType === 'dine_in') {
      if (!tableNumber || !String(tableNumber).trim()) {
        newErrors.table_number = "Informe o número da sua mesa.";
      }
      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }

    if (!customerData.customer_name || !customerData.customer_name.trim()) {
      newErrors.customer_name = "Nome completo é obrigatório para fazer o pedido.";
    }

    const cleanDigits = (customerData.customer_phone || "").replace(/\D/g, "");
    if (!cleanDigits || cleanDigits.length < 10) {
      newErrors.customer_phone = "Telefone / WhatsApp com DDD é obrigatório (mínimo 10 dígitos).";
    }

    if (orderType === 'delivery') {
      if (isDeliveryBlocked) {
        newErrors.address = deliveryBlockReason || "Infelizmente ainda não realizamos entregas no seu bairro.";
      }
      if (addresses.length > 0 && selectedAddress && selectedAddress !== "new_address" && !isCreatingNewAddress) {
        // Endereço selecionado da lista de salvos
      } else {
        // Formulário de endereço digitado
        if (!newAddressForm.street?.trim()) {
          newErrors.address = "Informe a rua / logradouro de entrega.";
        } else if (!newAddressForm.number?.trim()) {
          newErrors.address = "Informe o número do endereço de entrega.";
        } else if (!newAddressForm.neighborhood?.trim()) {
          newErrors.address = "Informe o bairro.";
        } else if (!newAddressForm.city?.trim()) {
          newErrors.address = "Informe a cidade.";
        }
      }
      if (minOrderValue > 0 && finalTotal < minOrderValue) {
        newErrors.total = `O valor mínimo para entrega é de R$ ${minOrderValue.toFixed(2).replace('.', ',')}.`;
      }
    }

    if (!customerData.payment_method) {
      newErrors.payment_method = "Selecione a forma de pagamento.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!validateForm()) return;

    const isDineIn = orderType === 'dine_in';
    const isTakeaway = orderType === 'takeaway';
    const formattedTable = tableNumber
      ? (String(tableNumber).toLowerCase().includes('mesa') ? tableNumber : `Mesa ${tableNumber}`)
      : "Mesa Salão";

    const resolvedCustomerName = isDineIn
      ? (customerData.customer_name?.trim() || formattedTable)
      : (customerData.customer_name?.trim() || "Cliente");

    const resolvedPaymentMethod = isDineIn ? "caixa" : (customerData.payment_method || "dinheiro");

    let deliveryAddress = "";
    if (orderType === 'delivery') {
      if (addresses.length > 0 && selectedAddress && selectedAddress !== "new_address" && !isCreatingNewAddress) {
        const addr = addresses.find(a => a.id === selectedAddress);
        if (addr) {
          deliveryAddress = `${addr.street}, ${addr.number}${addr.complement ? ` (${addr.complement})` : ''} - ${addr.neighborhood}, ${addr.city}/${addr.state || 'MG'}`;
        }
      } 
      
      if (!deliveryAddress) {
        if (newAddressForm.street?.trim()) {
          deliveryAddress = `${newAddressForm.street.trim()}, ${newAddressForm.number?.trim() || 'S/N'}${newAddressForm.complement?.trim() ? ` (${newAddressForm.complement.trim()})` : ''} - ${newAddressForm.neighborhood?.trim() || ''}, ${newAddressForm.city?.trim() || ''}${newAddressForm.state ? `/${newAddressForm.state.trim()}` : ''}`;
        }
      }

      if (!deliveryAddress) {
        setErrors(prev => ({ ...prev, address: "Informe a rua e o número de entrega." }));
        return;
      }

      // Salvar endereço no perfil via RPC segura se o usuário estiver logado e marcou para salvar
      if (user?.email && newAddressForm.save_address && newAddressForm.street) {
        try {
          const tenantId = getActiveTenantId();
          const customerToken = user?.customer_token || getStoredCustomerToken();
          if (isSupabaseConfigured() && supabase && tenantId && customerData.customer_phone && customerToken) {
            await supabase.rpc("save_customer_address", {
              p_tenant_id: tenantId,
              p_phone: customerData.customer_phone,
              p_data: {
                user_email: user.email,
                name: newAddressForm.name || "Outro Endereço",
                cep: newAddressForm.cep,
                street: newAddressForm.street.trim(),
                number: newAddressForm.number?.trim() || "S/N",
                complement: newAddressForm.complement,
                neighborhood: newAddressForm.neighborhood?.trim() || "",
                city: newAddressForm.city?.trim() || "",
                state: newAddressForm.state || "MG",
                is_default: addresses.length === 0,
              },
              p_customer_token: customerToken,
            });
          } else {
            await UserAddress.create({
              user_email: user.email,
              user_phone: customerData.customer_phone,
              name: newAddressForm.name || "Outro Endereço",
              cep: newAddressForm.cep,
              street: newAddressForm.street.trim(),
              number: newAddressForm.number?.trim() || "S/N",
              complement: newAddressForm.complement,
              neighborhood: newAddressForm.neighborhood?.trim() || "",
              city: newAddressForm.city?.trim() || "",
              state: newAddressForm.state || "MG",
              is_default: addresses.length === 0,
            });
          }
        } catch (err) {
          console.error("Erro ao salvar endereço:", err);
        }
      }
    } else if (isDineIn) {
      deliveryAddress = `Consumo no Salão - ${formattedTable}`;
    } else {
      deliveryAddress = "Retirada no Balcão";
    }

    const finalNotes = customerData.notes 
      ? (customerData.payment_method === 'dinheiro' && changeFor.trim() ? `${customerData.notes} | Troco para: ${changeFor.trim()}` : customerData.notes)
      : (customerData.payment_method === 'dinheiro' && changeFor.trim() ? `Troco para: ${changeFor.trim()}` : "");

    const activeTenantId = 
      cart?.[0]?.tenant_id || 
      propTenantId || 
      deliveryRules?.tenant_id || 
      deliveryRules?.id || 
      getActiveTenantId() || 
      "5489690b-a8dd-4f5e-bd75-de339521ac47";
    const persistentCheckoutOrderId = getOrCreateCheckoutOrderId(activeTenantId, cart);
    const isCardOrMeal = !isDineIn && ["cartao_credito", "cartao_debito", "alimentacao", "cartao"].includes(resolvedPaymentMethod);

    const orderData = {
      id: persistentCheckoutOrderId,
      ...customerData,
      customer_name: resolvedCustomerName,
      customer_phone: customerData.customer_phone || (isDineIn ? "" : ""),
      payment_method: resolvedPaymentMethod,
      card_brand: isCardOrMeal ? (customerData.card_brand || null) : null,
      notes: finalNotes,
      change_for: (!isDineIn && customerData.payment_method === 'dinheiro' && changeFor.trim()) ? changeFor.trim() : null,
      user_email: user?.email,
      customer_address: deliveryAddress,
      delivery_fee: orderType === 'delivery' ? effectiveDeliveryFee : 0,
      total_amount: isDineIn ? subtotal : finalTotal,
      items: cart.map(item => {
        // Para pizzas customizadas do montador, garante que product_id aponte para um ID real de produto do catálogo
        const resolvedProductId = (item.is_pizza || (Array.isArray(item.pizza_flavors) && item.pizza_flavors.length > 0))
          ? (item.pizza_flavors?.[0]?.product_id || item.pizza_flavors?.[0]?.id || item.id)
          : item.id;

        return {
          product_id: resolvedProductId,
          tenant_id: item.tenant_id || activeTenantId,
          product_name: item.name,
          product_price: item.price,
          size_id: item.size_id || item.pizza_size_id || null,
          pizza_size_id: item.pizza_size_id || item.size_id || null,
          pizza_flavors: Array.isArray(item.pizza_flavors) ? item.pizza_flavors.map(f => ({
            ...f,
            id: f.id || f.product_id || resolvedProductId,
            product_id: f.product_id || f.id || resolvedProductId,
          })) : [],
          category_name: item.category_name || item.category || 'Geral',
          quantity: item.quantity,
          subtotal: (item.price + (item.additionals || []).reduce((s, a) => s + (a.price || 0), 0)) * item.quantity,
          additionals: item.additionals || [],
          notes: item.notes || "",
        };
      }),
      status: "pendente",
      payment_status: isDineIn ? "pending_cashier" : (customerData.payment_method === 'pix_online' ? "pending" : "pending_delivery"),
      coupon_code: !isDineIn ? appliedCoupon?.code : null,
      discount_amount: !isDineIn ? discountAmount : 0,
      order_type: isTakeaway ? 'pickup' : (isDineIn ? 'dine_in' : 'delivery'),
      table_number: isTakeaway ? 'Balcão' : (isDineIn ? formattedTable : null),
      delivery_neighborhood: orderType === 'delivery' ? getCustomerNeighborhood() : null,
      use_cashback: !isDineIn && useCashback,
      cashback_discount: !isDineIn && useCashback ? Number(cashbackWallet?.balance || 0) : 0,
    };

    // Validação com Schema Zod
    const zodValidation = validateSchema(orderSchema, {
      ...orderData,
      order_type: isTakeaway ? 'balcao' : (isDineIn ? 'mesa' : 'delivery'),
      items: cart.map(item => ({
        product_id: item.id,
        name: item.name,
        price: item.price,
        category_name: item.category_name || item.category || 'Geral',
        quantity: item.quantity,
        additionals: item.additionals || [],
        notes: item.notes || ""
      }))
    });

    if (!zodValidation.success) {
      console.warn("Zod validation warnings:", zodValidation.errors);
      if (!isDineIn) {
        setErrors(prev => ({ ...prev, ...zodValidation.errors }));
        return;
      }
    }

    await onSubmit(orderData);

    try {
      // Salva endereço para futuras compras EXCLUSIVAMENTE via RPC segura se for cliente autenticado
      if (user && user.id && orderType === 'delivery' && newAddressForm.street && customerData.customer_phone) {
        const cleanPhone = customerData.customer_phone.replace(/\D/g, "");
        const tenantId = getActiveTenantId();
        const existingAddrs = await fetchCustomerAddresses(cleanPhone, customerData.customer_email || user.email);
        const existing = (existingAddrs || []).find(a =>
          a.street?.toLowerCase() === newAddressForm.street?.toLowerCase() &&
          a.number === newAddressForm.number
        );
        if (!existing) {
          const customerToken = user?.customer_token || getStoredCustomerToken();
          if (isSupabaseConfigured() && supabase && tenantId && customerToken) {
            await supabase.rpc("save_customer_address", {
              p_tenant_id: tenantId,
              p_phone: cleanPhone,
              p_data: {
                user_email: customerData.customer_email || user.email || "",
                name: newAddressForm.name || "Endereço de Entrega",
                street: newAddressForm.street,
                number: newAddressForm.number,
                neighborhood: newAddressForm.neighborhood,
                city: newAddressForm.city || deliveryRules?.address_city || "",
                state: newAddressForm.state || deliveryRules?.address_state || "MG",
                complement: newAddressForm.complement || "",
                reference: newAddressForm.reference || "",
                cep: newAddressForm.cep || "",
                is_default: addresses.length === 0,
              },
              p_customer_token: customerToken,
            });
          } else {
            await UserAddress.create({
              user_phone: customerData.customer_phone,
              user_email: customerData.customer_email || user.email || "",
              name: newAddressForm.name || "Endereço de Entrega",
              street: newAddressForm.street,
              number: newAddressForm.number,
              neighborhood: newAddressForm.neighborhood,
              city: newAddressForm.city || deliveryRules?.address_city || "",
              state: newAddressForm.state || deliveryRules?.address_state || "MG",
              complement: newAddressForm.complement || "",
              reference: newAddressForm.reference || "",
              cep: newAddressForm.cep || "",
              is_default: addresses.length === 0,
            });
          }
        }
      }
    } catch (saveErr) {
      console.warn("Erro ao salvar endereço do cliente autenticado:", saveErr);
    }

    if (user && !user.phone && customerData.customer_phone) {
      try { await base44.auth.updateMe({ phone: customerData.customer_phone }); } catch {}
    }
  };

  const formatPhone = (value) => {
    if (!value) return "";
    const raw = value.replace(/\D/g, "").slice(0, 11);
    if (raw.length <= 2) return raw.length > 0 ? `(${raw}` : "";
    if (raw.length <= 7) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
    return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
  };

  const handleInputChange = (field, value) => {
    const finalValue = field === 'customer_phone' ? formatPhone(value) : value;
    setCustomerData(prev => ({ ...prev, [field]: finalValue }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: "" }));

    if (field === 'customer_phone') {
      const cleanDigits = finalValue.replace(/\D/g, "");
      if (cleanDigits.length >= 10) {
        setIsSearchingPhone(true);
        (async () => {
          try {
            let foundName = "";
            let foundEmail = "";

            const customerToken = getStoredCustomerToken();
            if (isSupabaseConfigured() && supabase && customerToken) {
              try {
                const activeTenantId = getActiveTenantId();
                const { data } = await supabase.rpc("lookup_customer_by_phone", {
                  p_phone: finalValue,
                  p_tenant_id: activeTenantId || undefined,
                  p_customer_token: customerToken,
                });
                if (data && data.length > 0) {
                  foundName = data[0].customer_name || "";
                  foundEmail = data[0].customer_email || "";
                }
              } catch {}
            }

            if (foundName) {
              setCustomerData(prev => ({
                ...prev,
                customer_name: prev.customer_name || foundName,
                customer_email: prev.customer_email || foundEmail
              }));
              setPhoneLookupFeedback(`✓ ${foundName} localizado!`);
            } else {
              setPhoneLookupFeedback("");
            }
          } catch (err) {
            console.warn("Erro ao buscar dados do cliente por telefone:", err);
          } finally {
            setIsSearchingPhone(false);
          }
        })();
      } else {
        setPhoneLookupFeedback("");
      }
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-lg max-h-[90dvh] h-auto flex flex-col p-0 rounded-3xl overflow-hidden border-stone-200 shadow-2xl bg-white focus:outline-none">
        {/* Topo fixo com título */}
        <div className="px-5 py-3.5 sm:py-4 border-b border-stone-100 flex items-center justify-between shrink-0 bg-white">
          <DialogHeader className="p-0 text-left">
            <DialogTitle className="text-lg sm:text-xl font-black text-gray-900 tracking-tight">
              {isDineIn ? "Fazer Pedido na Mesa" : "Finalizar Pedido"}
            </DialogTitle>
            <p className="text-xs text-stone-500 font-medium mt-0.5">
              {isDineIn 
                ? (tableNumber ? `Pedido para a ${tableNumber.toLowerCase().includes('mesa') ? tableNumber : `Mesa ${tableNumber}`}` : "Informe sua mesa para preparar seu pedido") 
                : "Preencha seus dados para entrega ou retirada"}
            </p>
          </DialogHeader>
        </div>

        {errors.total && (
          <div className="px-5 pt-3">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errors.total}</AlertDescription>
            </Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 overscroll-contain">
            {/* SELETOR DE CANAL: Oculto para mesas (mesa é a única opção). Exibido apenas entre Delivery e Retirada se ambos existirem */}
            {(() => {
              if (isDineIn) return null;
              const availableCount = (showDeliveryTab ? 1 : 0) + (showTakeawayTab ? 1 : 0);
              if (availableCount <= 1) return null;
              return (
                <Tabs value={orderType} onValueChange={(val) => {
                  setOrderType(val);
                }} className="w-full">
                  <TabsList className={`grid w-full ${availableCount === 2 ? 'grid-cols-2' : 'grid-cols-1'} rounded-2xl p-1 bg-stone-100/90 border border-stone-200/80 h-auto gap-1`}>
                    {showDeliveryTab && (
                      <TabsTrigger 
                        value="delivery" 
                        className="rounded-xl font-bold text-xs sm:text-sm py-2.5 transition-all data-[state=active]:bg-white data-[state=active]:shadow-xs data-[state=active]:text-stone-900 text-stone-500 cursor-pointer"
                      >
                        <Truck className="w-4 h-4 mr-1.5 text-stone-700 shrink-0"/>
                        <span>Receber via Delivery</span>
                      </TabsTrigger>
                    )}
                    {showTakeawayTab && (
                      <TabsTrigger 
                        value="takeaway" 
                        className="rounded-xl font-bold text-xs sm:text-sm py-2.5 transition-all data-[state=active]:bg-white data-[state=active]:shadow-xs data-[state=active]:text-stone-900 text-stone-500 cursor-pointer"
                      >
                        <Store className="w-4 h-4 mr-1.5 text-stone-700 shrink-0"/>
                        <span>Retirar no Balcão</span>
                      </TabsTrigger>
                    )}
                  </TabsList>
                </Tabs>
              );
            })()}

            {isDineIn ? (
              /* ========================================================================= */
              /* FLUXO MESA (DINE-IN): DIRETO, ULTRA RESPONSIVO, SEM TELEFONE, SEM PAGAMENTO */
              /* ========================================================================= */
              <div className="space-y-3.5">
                {/* 1. Identificação da Mesa */}
                {tableNumber ? (
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50/80 border border-emerald-200/90 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
                        <UtensilsCrossed className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">Sua Mesa</span>
                        <span className="text-base sm:text-lg font-black text-emerald-950">
                          {tableNumber.toLowerCase().includes('mesa') ? tableNumber : `Mesa ${tableNumber}`}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newM = prompt("Digite o número da sua mesa:", tableNumber);
                        if (newM !== null && newM.trim()) {
                          setTableNumber(newM.trim());
                          try { localStorage.setItem("vrumburguer_table_number", newM.trim()); } catch {}
                        }
                      }}
                      className="text-xs font-bold text-emerald-700 bg-white hover:bg-emerald-100/70 border border-emerald-200 px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow-2xs"
                    >
                      Trocar Mesa
                    </button>
                  </div>
                ) : (
                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
                    <Label className="text-xs font-bold uppercase text-stone-700 flex items-center gap-1.5">
                      <UtensilsCrossed className="w-4 h-4 text-stone-600" />
                      <span>Número da sua Mesa *</span>
                    </Label>
                    <Input
                      value={tableNumber}
                      onChange={(e) => {
                        setTableNumber(e.target.value);
                        if (errors.table_number) setErrors(prev => ({ ...prev, table_number: "" }));
                      }}
                      placeholder="Ex: 04 ou Mesa 12"
                      autoFocus
                      className={`rounded-xl h-12 text-base font-bold bg-white ${errors.table_number ? "border-red-500 ring-1 ring-red-400" : "border-stone-300"}`}
                    />
                    {errors.table_number && <p className="text-red-500 text-xs font-semibold">{errors.table_number}</p>}
                  </div>
                )}

                {/* 2. Nome ou Apelido (Opcional) */}
                <div className="bg-stone-50/80 p-3.5 rounded-2xl border border-stone-200/90 space-y-1.5">
                  <Label className="text-xs font-bold uppercase text-stone-700 flex items-center justify-between">
                    <span>Seu Nome ou Apelido <span className="text-stone-400 font-normal lowercase">(opcional)</span></span>
                  </Label>
                  <Input
                    value={customerData.customer_name}
                    onChange={(e) => handleInputChange('customer_name', e.target.value)}
                    placeholder={`Ex: Davi (ou deixaremos como ${tableNumber ? (tableNumber.toLowerCase().includes('mesa') ? tableNumber : `Mesa ${tableNumber}`) : "Mesa"})`}
                    className="rounded-xl h-11 text-base sm:text-sm bg-white border-stone-300"
                  />
                  <p className="text-[11px] text-stone-500 leading-tight">
                    Usado apenas para a equipe te identificar ao entregar os pedidos na mesa.
                  </p>
                </div>

                {/* 3. Observações para a Cozinha (Opcional) */}
                <div className="bg-stone-50/80 p-3.5 rounded-2xl border border-stone-200/90 space-y-1.5">
                  <Label className="text-xs font-bold uppercase text-stone-700">
                    Observações para a Cozinha <span className="text-stone-400 font-normal lowercase">(opcional)</span>
                  </Label>
                  <Textarea
                    value={customerData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder="Ex: Sem cebola, carne bem passada, copos descartáveis..."
                    rows={2}
                    className="rounded-xl text-base sm:text-sm bg-white border-stone-300"
                  />
                </div>

                {/* 4. Aviso de Pagamento no Caixa */}
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/90 rounded-2xl p-3.5 flex items-start gap-3 shadow-2xs">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="font-bold text-xs sm:text-sm text-emerald-950 block">
                      Pagamento no Caixa ao Encerrar
                    </span>
                    <p className="text-[11px] sm:text-xs text-emerald-800 leading-relaxed">
                      Seu pedido irá direto para a cozinha ser preparado. Você acertará o consumo no caixa ou com o garçom ao finalizar sua conta.
                    </p>
                  </div>
                </div>

                {/* 5. Resumo do Pedido na Mesa */}
                <div className="space-y-2 bg-stone-50/80 p-3.5 rounded-2xl border border-stone-200/80">
                  <div className="flex items-center justify-between pb-1.5 border-b border-stone-200 text-xs">
                    <span className="font-bold uppercase text-stone-700 tracking-wider">Itens do Pedido</span>
                    <span className="font-bold text-stone-500">
                      {cart.reduce((s, i) => s + i.quantity, 0)} {cart.reduce((s, i) => s + i.quantity, 0) === 1 ? 'item' : 'itens'}
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {cart.map((item, idx) => {
                      const itemTotal = (item.price + (item.additionals || []).reduce((s, a) => s + (a.price || 0), 0)) * item.quantity;
                      return (
                        <div key={idx} className="flex justify-between items-start text-xs text-stone-700 py-0.5">
                          <span className="truncate pr-2">
                            <strong className="text-stone-900 mr-1.5">{item.quantity}x</strong>
                            <span>{item.name}</span>
                            {item.additionals?.length > 0 && (
                              <span className="text-[10px] text-stone-500 block pl-4">
                                + {item.additionals.map(a => a.name).join(", ")}
                              </span>
                            )}
                          </span>
                          <span className="font-bold text-stone-900 shrink-0">
                            R$ {itemTotal.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="pt-2 border-t border-stone-300 flex justify-between items-center">
                    <div>
                      <span className="text-xs uppercase font-extrabold text-stone-600 block">Total do Pedido</span>
                      <span className="text-[10px] text-stone-400 font-medium">Sem taxas adicionais</span>
                    </div>
                    <span className="text-xl font-black text-emerald-700">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                  </div>
                </div>
              </div>
            ) : (
              /* ========================================================================= */
              /* FLUXO DELIVERY & BALCÃO: COM IDENTIFICAÇÃO, ENDEREÇO, FORMAS DE PAGAMENTO */
              /* ========================================================================= */
              <div className="space-y-4">
                {/* 1. IDENTIFICAÇÃO DO CLIENTE (NOME & WHATSAPP) - CARD EXECUTIVO */}
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/90 shadow-2xs space-y-3.5">
                  <div className="flex items-center justify-between pb-2.5 border-b border-stone-150">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700 shrink-0">
                        <UserIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-stone-900 block">
                          Seus Dados
                        </span>
                        <span className="text-[11px] text-stone-500 block">
                          {user ? `Conectado como ${user.full_name || "Cliente"}` : "Identificação para o pedido"}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAuthModalTitle(user ? "Trocar de Conta" : "Acessar Conta por SMS");
                        setShowAuthModal(true);
                      }}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>{user ? "Trocar conta" : "Já tem conta? Entrar"}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* WhatsApp / Celular */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-semibold text-stone-700">WhatsApp / Celular *</Label>
                        {isSearchingPhone && (
                          <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 animate-pulse">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" /> Buscando...
                          </span>
                        )}
                        {phoneLookupFeedback && (
                          <span className="text-[10px] text-emerald-700 font-bold animate-fade-in">
                            {phoneLookupFeedback}
                          </span>
                        )}
                      </div>
                      <Input
                        value={customerData.customer_phone}
                        onChange={(e) => handleInputChange('customer_phone', e.target.value)}
                        placeholder="(11) 99999-9999"
                        className={`rounded-xl h-11 text-base sm:text-sm bg-stone-50/50 border-stone-200 focus:bg-white ${errors.customer_phone ? "border-red-500" : (phoneLookupFeedback ? "border-emerald-500 ring-1 ring-emerald-400/30" : "")}`}
                      />
                      {errors.customer_phone && <p className="text-red-500 text-xs mt-1 font-medium">{errors.customer_phone}</p>}
                    </div>

                    {/* Nome Completo */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-semibold text-stone-700">Nome completo *</Label>
                      </div>
                      <Input
                        ref={nameInputRef}
                        value={customerData.customer_name}
                        onChange={(e) => handleInputChange('customer_name', e.target.value)}
                        placeholder="Como devemos te chamar?"
                        className={`rounded-xl h-11 text-base sm:text-sm bg-stone-50/50 border-stone-200 focus:bg-white ${errors.customer_name ? "border-red-500" : ""}`}
                      />
                      {errors.customer_name && <p className="text-red-500 text-xs mt-1 font-medium">{errors.customer_name}</p>}
                    </div>
                  </div>
                </div>

                {/* 2. ENDEREÇO PARA DELIVERY - CARD EXECUTIVO */}
                {orderType === 'delivery' && (
                  <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/90 shadow-2xs space-y-3.5">
                    <div className="flex items-center justify-between pb-2.5 border-b border-stone-150">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700 shrink-0">
                          <MapPin className="w-4 h-4 text-emerald-700" />
                        </div>
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-stone-900 block">
                            Endereço de Entrega
                          </span>
                          <span className="text-[11px] text-stone-500 block">
                            Previsão estimada: <strong>{deliveryTime}</strong>
                          </span>
                        </div>
                      </div>

                      {addresses.length > 0 && !isCreatingNewAddress && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingNewAddress(true);
                            setNewAddressForm({
                              name: "",
                              cep: "",
                              street: "",
                              number: "",
                              complement: "",
                              neighborhood: "",
                              city: addresses[0]?.city || deliveryRules?.address_city || "",
                              state: addresses[0]?.state || deliveryRules?.address_state || "MG",
                              save_address: true,
                            });
                          }}
                          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Outro Endereço</span>
                        </button>
                      )}
                    </div>

                    {addresses.length > 0 && !isCreatingNewAddress ? (
                      <div className="space-y-3">
                        <Select 
                          value={selectedAddress} 
                          onValueChange={(val) => {
                            if (val === "new_address") {
                              setIsCreatingNewAddress(true);
                              setNewAddressForm({
                                name: "",
                                cep: "",
                                street: "",
                                number: "",
                                complement: "",
                                neighborhood: "",
                                city: addresses[0]?.city || deliveryRules?.address_city || "",
                                state: addresses[0]?.state || deliveryRules?.address_state || "MG",
                                save_address: true,
                              });
                            } else {
                              setSelectedAddress(val);
                            }
                          }}
                        >
                          <SelectTrigger className={`rounded-xl h-auto py-3 px-3.5 bg-stone-50/50 border text-left shadow-2xs ${errors.address ? "border-red-500" : "border-stone-200 hover:border-stone-300"}`}>
                            <SelectValue placeholder="Selecione o endereço" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl shadow-xl">
                            {addresses.map((address) => (
                              <SelectItem key={address.id} value={address.id} className="py-2.5 px-3 cursor-pointer rounded-xl">
                                <div className="flex items-start gap-2.5 text-left">
                                  <div className="p-1.5 rounded-lg bg-stone-100 text-stone-700 shrink-0 mt-0.5">
                                    {address.name?.toLowerCase().includes("trabalho") ? (
                                      <Building2 className="w-4 h-4" />
                                    ) : (
                                      <Home className="w-4 h-4" />
                                    )}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-sm text-gray-900">{address.name || "Casa"}</span>
                                      {address.is_default && (
                                        <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-1.5 py-0.2 rounded-full">Padrão</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-600 font-medium">
                                      {address.street}, {address.number}{address.complement ? ` (${address.complement})` : ''} - {address.neighborhood}
                                    </p>
                                    <p className="text-[11px] text-gray-400">
                                      {address.city}/{address.state || 'MG'} {address.cep ? `• CEP ${address.cep}` : ''}
                                    </p>
                                  </div>
                                </div>
                              </SelectItem>
                            ))}

                            <SelectItem value="new_address" className="border-t mt-1 font-bold text-emerald-700 bg-emerald-50/40 focus:bg-emerald-50 py-2.5 cursor-pointer rounded-xl">
                              <div className="flex items-center gap-2">
                                <Plus className="w-4 h-4 text-emerald-700" />
                                <span>+ Cadastrar outro endereço</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        {isCityBlocked && (
                          <div className="mt-1">
                            <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              <span>Entrega indisponível para <strong>{customerCity}</strong>. Atendemos apenas em <strong>{storeCity}{storeState ? ` - ${storeState}` : ''}</strong>.</span>
                            </span>
                          </div>
                        )}

                        {errors.address && <p className="text-red-500 text-xs mt-1 font-medium">{errors.address}</p>}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {addresses.length > 0 && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setIsCreatingNewAddress(false);
                                if (addresses.length > 0 && !selectedAddress) setSelectedAddress(addresses[0].id);
                              }}
                              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                            >
                              <ArrowLeft className="w-3.5 h-3.5" />
                              <span>Voltar para endereço salvo</span>
                            </button>
                          </div>
                        )}

                        {/* Formulário de Endereço em Grid Uniforme */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          {/* CEP */}
                          <div className="sm:col-span-4">
                            <div className="flex items-center justify-between mb-1">
                              <Label htmlFor="addr-cep" className="text-xs font-semibold text-stone-700">CEP</Label>
                              {isFetchingCep && (
                                <span className="text-[10px] text-emerald-700 flex items-center gap-0.5 animate-pulse font-semibold">
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" /> Buscando...
                                </span>
                              )}
                            </div>
                            <Input
                              id="addr-cep"
                              value={newAddressForm.cep}
                              onChange={handleCepChange}
                              placeholder="00000-000"
                              maxLength={9}
                              className="bg-stone-50/50 border-stone-200 focus:bg-white rounded-xl text-base sm:text-xs h-10"
                            />
                          </div>

                          {/* Apelido do local */}
                          <div className="sm:col-span-8">
                            <Label htmlFor="addr-name" className="text-xs font-semibold text-stone-700 block mb-1">Identificação (Opcional)</Label>
                            <Input
                              id="addr-name"
                              value={newAddressForm.name}
                              onChange={e => setNewAddressForm({ ...newAddressForm, name: e.target.value })}
                              placeholder="Ex: Minha Casa, Trabalho"
                              className="bg-stone-50/50 border-stone-200 focus:bg-white rounded-xl text-base sm:text-xs h-10"
                            />
                          </div>

                          {/* Rua */}
                          <div className="sm:col-span-9">
                            <Label htmlFor="addr-street" className="text-xs font-semibold text-stone-700 block mb-1">Rua / Logradouro *</Label>
                            <Input
                              id="addr-street"
                              value={newAddressForm.street}
                              onChange={e => {
                                setNewAddressForm({ ...newAddressForm, street: e.target.value });
                                if (errors.address) setErrors(p => ({ ...p, address: "" }));
                              }}
                              placeholder="Nome da rua ou avenida"
                              required
                              className="bg-stone-50/50 border-stone-200 focus:bg-white rounded-xl text-base sm:text-xs h-10"
                            />
                          </div>

                          {/* Número */}
                          <div className="sm:col-span-3">
                            <Label htmlFor="addr-num" className="text-xs font-semibold text-stone-700 block mb-1">Número *</Label>
                            <Input
                              id="addr-num"
                              value={newAddressForm.number}
                              onChange={e => {
                                setNewAddressForm({ ...newAddressForm, number: e.target.value });
                                if (errors.address) setErrors(p => ({ ...p, address: "" }));
                              }}
                              placeholder="123"
                              required
                              className="bg-stone-50/50 border-stone-200 focus:bg-white rounded-xl text-base sm:text-xs h-10"
                            />
                          </div>

                          {/* Complemento */}
                          <div className="sm:col-span-6">
                            <Label htmlFor="addr-comp" className="text-xs font-semibold text-stone-700 block mb-1">Complemento (Opcional)</Label>
                            <Input
                              id="addr-comp"
                              value={newAddressForm.complement}
                              onChange={e => setNewAddressForm({ ...newAddressForm, complement: e.target.value })}
                              placeholder="Apto, Bloco, Casa 2..."
                              className="bg-stone-50/50 border-stone-200 focus:bg-white rounded-xl text-base sm:text-xs h-10"
                            />
                          </div>

                          {/* Bairro */}
                          <div className="sm:col-span-6">
                            <Label htmlFor="addr-neigh" className="text-xs font-semibold text-stone-700 block mb-1">Bairro *</Label>
                            <Input
                              id="addr-neigh"
                              value={newAddressForm.neighborhood}
                              onChange={e => {
                                setNewAddressForm({ ...newAddressForm, neighborhood: e.target.value });
                                if (errors.address) setErrors(p => ({ ...p, address: "" }));
                              }}
                              placeholder="Bairro"
                              required
                              className="bg-stone-50/50 border-stone-200 focus:bg-white rounded-xl text-base sm:text-xs h-10"
                            />
                          </div>

                          {/* Cidade */}
                          <div className="sm:col-span-9">
                            <Label htmlFor="addr-city" className="text-xs font-semibold text-stone-700 block mb-1">Cidade *</Label>
                            <Input
                              id="addr-city"
                              value={newAddressForm.city}
                              onChange={e => {
                                setNewAddressForm(p => ({ ...p, city: e.target.value }));
                                if (errors.address) setErrors(p => ({ ...p, address: "" }));
                              }}
                              placeholder="Cidade"
                              required
                              className="bg-stone-50/50 border-stone-200 focus:bg-white rounded-xl text-base sm:text-xs h-10"
                            />
                          </div>

                          {/* UF */}
                          <div className="sm:col-span-3">
                            <Label htmlFor="addr-state" className="text-xs font-semibold text-stone-700 block mb-1">UF *</Label>
                            <Input
                              id="addr-state"
                              value={newAddressForm.state}
                              onChange={e => {
                                setNewAddressForm(p => ({ ...p, state: e.target.value.toUpperCase().slice(0, 2) }));
                                if (errors.address) setErrors(p => ({ ...p, address: "" }));
                              }}
                              placeholder="MG"
                              maxLength={2}
                              required
                              className="bg-stone-50/50 border-stone-200 focus:bg-white rounded-xl text-base sm:text-xs h-10 uppercase text-center font-bold"
                            />
                          </div>
                        </div>

                        {/* Feedback de Bairro e Validação de Rota */}
                        {isNeighborhoodMode && newAddressForm.neighborhood?.trim() && (
                          <div className="pt-1">
                            {neighborhoodMatchResult ? (
                              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-lg flex items-center gap-1.5 w-fit shadow-2xs">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>Bairro atendido! Taxa de entrega: <strong>{effectiveDeliveryFee === 0 ? "Grátis" : `R$ ${effectiveDeliveryFee.toFixed(2).replace('.', ',')}`}</strong></span>
                              </span>
                            ) : isDeliveryBlocked ? (
                              <div className="space-y-2 mt-1">
                                <span className="text-[11px] font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 w-fit">
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                  <span>Bairro fora da área de entrega do restaurante</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOrderType('takeaway');
                                    if (errors.address) setErrors(p => ({ ...p, address: "" }));
                                  }}
                                  className="text-[11px] font-bold text-stone-900 bg-stone-100 hover:bg-stone-200 border border-stone-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <Store className="w-3.5 h-3.5 text-stone-700" />
                                  <span>Mudar para Retirada no Balcão (Economize o frete)</span>
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )}

                        {isCityBlocked && (
                          <div className="pt-1">
                            <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              <span>Entrega indisponível para <strong>{customerCity}</strong>. Atendemos apenas em <strong>{storeCity}{storeState ? ` - ${storeState}` : ''}</strong>.</span>
                            </span>
                          </div>
                        )}

                        {errors.address && <p className="text-red-500 text-xs font-semibold">{errors.address}</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. INFORMATIVO RETIRADA NO BALCÃO - CARD EXECUTIVO */}
                {orderType === 'takeaway' && (
                  <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/90 shadow-2xs flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-700 shrink-0 shadow-2xs">
                      <Store className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-stone-900">Retirada no Balcão</span>
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          Sem taxa de entrega
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 leading-relaxed">
                        Faça seu pedido agora e retire quando estiver pronto! Nós avisaremos no seu WhatsApp assim que sair da cozinha.
                      </p>
                    </div>
                  </div>
                )}

                {/* FORMAS DE PAGAMENTO */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-wider text-stone-700 block">
                      Forma de Pagamento *
                    </Label>
                    <span className="text-[11px] text-stone-500 font-medium">
                      Pague online ou na entrega
                    </span>
                  </div>

                  {/* Card Único Unificado com Divisórias Finas (Padrão iFood / Apple / Stripe) */}
                  <div className="rounded-2xl border border-stone-200/90 bg-white shadow-2xs divide-y divide-stone-150 overflow-hidden">
                    {availablePaymentMethods.map((method) => {
                      const Icon = method.icon;
                      const isSelected = customerData.payment_method === method.id;
                      const isCardMethod = method.id === 'cartao_credito' || method.id === 'cartao_debito';
                      const isMealMethod = method.id === 'alimentacao';

                      // Lista de bandeiras para este método
                      const pm = activePaymentMethods || deliveryRules?.payment_methods || {};
                      const acceptedCardIds = Array.isArray(pm.accepted_card_brands) && pm.accepted_card_brands.length > 0
                        ? pm.accepted_card_brands
                        : CARD_BRANDS.map(b => b.id);
                      const availableCardBrands = CARD_BRANDS.filter(b => acceptedCardIds.includes(b.id));

                      const acceptedMealIds = Array.isArray(pm.accepted_meal_brands) && pm.accepted_meal_brands.length > 0
                        ? pm.accepted_meal_brands
                        : MEAL_VOUCHER_BRANDS.map(b => b.id);
                      const availableMealBrands = MEAL_VOUCHER_BRANDS.filter(b => acceptedMealIds.includes(b.id));

                      const subBrands = isCardMethod ? availableCardBrands : (isMealMethod ? availableMealBrands : []);
                      const theme = method.theme || { bg: 'bg-stone-50', border: 'border-stone-200', text: 'text-stone-700' };
                      const isAccordionOpen = isSelected && !collapsedAccordions[method.id];

                      const handleMethodClick = () => {
                        if (isSelected) {
                          // Se já está selecionado e tem acordeão, clica de novo para abrir/fechar (toggle retrátil)
                          if (isCardMethod || isMealMethod) {
                            setCollapsedAccordions(prev => ({
                              ...prev,
                              [method.id]: !prev[method.id]
                            }));
                          }
                        } else {
                          // Seleciona o novo método e garante que ele abre expandido
                          handleInputChange('payment_method', method.id);
                          setCollapsedAccordions(prev => ({
                            ...prev,
                            [method.id]: false
                          }));
                        }
                      };

                      return (
                        <div
                          key={method.id}
                          className={`transition-all ${
                            isSelected ? 'bg-emerald-50/30' : 'hover:bg-stone-50/40'
                          }`}
                        >
                          {/* Linha Principal da Opção */}
                          <div
                            onClick={handleMethodClick}
                            className={`p-3.5 sm:p-4 cursor-pointer flex items-center justify-between gap-3 select-none active:bg-stone-100/60 transition-all ${
                              isSelected ? 'border-l-4 border-l-[#047857]' : 'border-l-4 border-l-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              {/* Squircle com Textura Suave */}
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs transition-transform ${theme.bg} ${theme.border}`}>
                                {method.image ? (
                                  <img src={method.image} alt={method.label} className="w-6 h-6 object-contain" />
                                ) : (
                                  <Icon className={`w-5 h-5 ${theme.text}`} />
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-sm tracking-tight font-bold ${isSelected ? 'text-stone-950 font-black' : 'text-stone-800'}`}>
                                    {method.label}
                                  </span>
                                  {method.badge && (
                                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                                      {method.badge}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-stone-500 font-medium truncate sm:whitespace-normal mt-0.5">
                                  {method.sub}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                                isSelected
                                  ? 'border-[#047857] bg-[#047857] text-white shadow-2xs'
                                  : 'border-stone-300 bg-white'
                              }`}>
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                            </div>
                          </div>

                          {/* Acordeão Integrado Estilo iFood: Sub-Bandeiras em Linhas Limpas com Cores Originais */}
                          {isAccordionOpen && (isCardMethod || isMealMethod) && (
                            <div className="border-t border-stone-150 bg-stone-100/60 p-3 sm:p-4 space-y-2 animate-in fade-in duration-150">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                                  {isCardMethod ? "Selecione a bandeira (opcional):" : "Selecione seu vale (opcional):"}
                                </span>
                                <div className="flex items-center gap-2">
                                  {customerData.card_brand && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleInputChange('card_brand', '')}
                                        className="text-[11px] text-stone-500 hover:text-stone-900 underline font-medium cursor-pointer"
                                      >
                                        Limpar
                                      </button>
                                      <span className="text-stone-300">•</span>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setCollapsedAccordions(prev => ({ ...prev, [method.id]: true }))}
                                    className="text-[11px] text-stone-500 hover:text-stone-900 font-medium cursor-pointer"
                                  >
                                    Recolher
                                  </button>
                                </div>
                              </div>

                              <div className="divide-y divide-stone-150 rounded-xl border border-stone-200 bg-white overflow-hidden shadow-2xs">
                                {subBrands.map((brand) => {
                                  const brandKey = brand.shortName || brand.name;
                                  const isBrandChosen = customerData.card_brand === brandKey;
                                  return (
                                    <div
                                      key={brand.id}
                                      onClick={() => handleInputChange('card_brand', isBrandChosen ? '' : brandKey)}
                                      className={`px-3 py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                                        isBrandChosen ? 'bg-emerald-50/60' : 'hover:bg-stone-50/80'
                                      }`}
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-9 h-6 flex items-center justify-center bg-white rounded border border-stone-200 p-0.5 shrink-0 shadow-2xs">
                                          {brand.image ? (
                                            <img
                                              src={brand.image}
                                              alt={brand.name}
                                              className="max-h-5 max-w-full object-contain"
                                              loading="lazy"
                                            />
                                          ) : (
                                            <span className="text-[9px] font-black text-stone-700">{brand.tag}</span>
                                          )}
                                        </div>
                                        <span className={`text-xs font-semibold ${isBrandChosen ? 'text-stone-950 font-bold' : 'text-stone-700'}`}>
                                          {brand.fullName || brand.name}
                                        </span>
                                      </div>

                                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                                        isBrandChosen
                                          ? 'border-emerald-600 bg-emerald-600 text-white'
                                          : 'border-stone-300 bg-white'
                                      }`}>
                                        {isBrandChosen && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                      </div>
                                    </div>
                                  );
                                })}

                                {/* Opção Outro / Outra */}
                                <div
                                  onClick={() => {
                                    const otherLabel = isCardMethod ? 'Outra' : 'Outro';
                                    handleInputChange('card_brand', customerData.card_brand === otherLabel ? '' : otherLabel);
                                  }}
                                  className={`px-3 py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                                    customerData.card_brand === 'Outra' || customerData.card_brand === 'Outro'
                                      ? 'bg-emerald-50/60'
                                      : 'hover:bg-stone-50/80'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-6 flex items-center justify-center bg-stone-100 rounded border border-stone-200 text-[9px] font-black text-stone-600 shrink-0">
                                      OUTRO
                                    </div>
                                    <span className={`text-xs font-semibold ${
                                      customerData.card_brand === 'Outra' || customerData.card_brand === 'Outro' ? 'text-stone-950 font-bold' : 'text-stone-700'
                                    }`}>
                                      {isCardMethod ? 'Outra bandeira' : 'Outro cartão benefício'}
                                    </span>
                                  </div>

                                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                                    customerData.card_brand === 'Outra' || customerData.card_brand === 'Outro'
                                      ? 'border-emerald-600 bg-emerald-600 text-white'
                                      : 'border-stone-300 bg-white'
                                  }`}>
                                    {(customerData.card_brand === 'Outra' || customerData.card_brand === 'Outro') && (
                                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Campo de troco quando seleciona Dinheiro */}
                  {customerData.payment_method === 'dinheiro' && (
                    <div className="mt-2.5 p-3.5 sm:p-4 bg-white border border-stone-200/90 rounded-2xl shadow-2xs space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="change-for" className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                          <Banknote className="w-4 h-4 text-stone-600" />
                          <span>Precisa de troco? Para quanto?</span>
                        </Label>
                        {changeFor && (
                          <button
                            type="button"
                            onClick={() => setChangeFor("")}
                            className="text-xs text-stone-500 hover:text-stone-900 underline font-medium cursor-pointer"
                          >
                            Limpar
                          </button>
                        )}
                      </div>

                      <CurrencyInput
                        id="change-for"
                        value={changeFor === "Não preciso de troco" ? "" : changeFor}
                        onChange={(e) => setChangeFor(e.target.value)}
                        placeholder="R$ 0,00 (ou selecione uma sugestão)"
                        className="bg-stone-50/50 border-stone-200 focus:bg-white text-base sm:text-sm h-10 font-bold rounded-xl shadow-2xs"
                      />

                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setChangeFor("Não preciso de troco")}
                          className={`px-3 py-1.5 text-xs rounded-xl font-semibold border transition-all cursor-pointer ${
                            changeFor === "Não preciso de troco"
                              ? "bg-stone-900 text-white border-stone-900 shadow-2xs"
                              : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                          }`}
                        >
                          Não preciso de troco
                        </button>
                        {[20, 50, 100, 200]
                          .filter(val => val > finalTotal)
                          .slice(0, 3)
                          .map(val => {
                            const formatted = formatToBRL(val);
                            const isSelected = changeFor === formatted;
                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setChangeFor(formatted)}
                                className={`px-3 py-1.5 text-xs rounded-xl font-semibold border transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-stone-900 text-white border-stone-900 shadow-2xs"
                                    : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                                }`}
                              >
                                Troco para {formatted}
                              </button>
                            );
                          })}
                      </div>

                      {(() => {
                        if (changeFor === "Não preciso de troco") {
                          return (
                            <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 rounded-xl p-2.5 text-center flex items-center justify-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>Pagamento no valor exato ({formatToBRL(finalTotal)})</span>
                            </p>
                          );
                        }
                        const parsedChange = parseBRLToNumber(changeFor);
                        if (parsedChange > 0) {
                          const trocoDevolver = parsedChange - finalTotal;
                          if (trocoDevolver >= 0) {
                            return (
                              <div className="text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center flex items-center justify-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>Seu troco será de: <strong className="text-emerald-800 text-sm font-black">{formatToBRL(trocoDevolver)}</strong></span>
                              </div>
                            );
                          } else {
                            return (
                              <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-center flex items-center justify-center gap-1.5">
                                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                                <span>O valor precisa ser maior que o total do pedido ({formatToBRL(finalTotal)})</span>
                              </p>
                            );
                          }
                        }
                        return null;
                      })()}
                    </div>
                  )}

                  {errors.payment_method && <p className="text-red-500 text-xs mt-1.5 font-medium">{errors.payment_method}</p>}
                </div>

                {/* Observações Gerais */}
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/90 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-stone-600" />
                    <Label className="text-xs font-bold uppercase tracking-wider text-stone-700">
                      Observações do Pedido <span className="text-stone-400 font-normal lowercase">(opcional)</span>
                    </Label>
                  </div>
                  <Textarea
                    value={customerData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder="Ex: Sem cebola, ponto da carne, retirar molho..."
                    className="rounded-xl text-base sm:text-xs bg-stone-50/50 border-stone-200 focus:bg-white resize-none"
                    rows={2}
                  />
                </div>

                {/* Cupom de Desconto */}
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/90 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-stone-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                        Cupom de Desconto
                      </span>
                    </div>
                    {!user && (
                      <span className="text-[10px] font-semibold text-stone-500 bg-stone-100 border border-stone-200/90 px-2 py-0.5 rounded-full">
                        Clientes Cadastrados
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="CÓDIGO DO CUPOM"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      disabled={!!appliedCoupon}
                      className="bg-stone-50/50 border-stone-200 focus:bg-white uppercase font-bold text-xs h-10 rounded-xl flex-1 tracking-wider"
                    />
                    <Button
                      type="button"
                      onClick={() => handleApplyCoupon()}
                      disabled={!!appliedCoupon}
                      className="h-10 px-5 text-xs font-bold bg-[#047857] hover:bg-[#036348] text-white rounded-xl cursor-pointer shadow-xs"
                    >
                      {appliedCoupon ? "Aplicado" : "Aplicar"}
                    </Button>
                  </div>
                  {couponError && (
                    <div className="space-y-1 pt-1">
                      <p className="text-rose-600 text-xs font-semibold">{couponError}</p>
                      {!user && (
                        <button
                          type="button"
                          onClick={() => {
                            setPendingCoupon(couponCode);
                            setAuthModalTitle("Liberar Cupom de Desconto");
                            setShowAuthModal(true);
                          }}
                          className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 cursor-pointer pt-0.5"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>Entrar por SMS para validar este cupom</span>
                        </button>
                      )}
                    </div>
                  )}
                  {appliedCoupon && (
                    <div className="flex items-center gap-1.5 text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl text-xs font-bold w-fit">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Cupom "{appliedCoupon.name}" aplicado com sucesso!</span>
                    </div>
                  )}
                </div>

                {/* Resumo Financeiro */}
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/90 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-stone-150">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-stone-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                        Resumo dos Valores
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-stone-500">
                      {cart.reduce((s, i) => s + i.quantity, 0)} {cart.reduce((s, i) => s + i.quantity, 0) === 1 ? 'item' : 'itens'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="flex justify-between text-stone-600">
                      <span>Subtotal dos itens</span>
                      <span className="font-semibold text-stone-900">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                    </div>

                    {discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-700 font-semibold">
                        <span className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          <span>Desconto ({appliedCoupon.code})</span>
                        </span>
                        <span>- R$ {discountAmount.toFixed(2).replace('.', ',')}</span>
                      </div>
                    )}

                    {orderType === 'delivery' && (
                      <div className="flex justify-between items-center text-stone-600">
                        <div className="flex items-center gap-1.5">
                          <span>Taxa de entrega</span>
                          {isFreeDeliveryEligible && (
                            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                              <Gift className="w-2.5 h-2.5 text-emerald-700" /> Frete Grátis
                            </span>
                          )}
                        </div>
                        <span className="font-semibold text-stone-900">
                          {effectiveDeliveryFee === 0 ? (
                            <span className="text-emerald-700 font-bold">Grátis</span>
                          ) : (
                            `R$ ${effectiveDeliveryFee.toFixed(2).replace('.', ',')}`
                          )}
                        </span>
                      </div>
                    )}

                    {orderType === 'delivery' && isDeliveryBlocked && (
                      <div className="p-3 bg-rose-50 border border-rose-200/90 rounded-xl text-rose-900 text-xs space-y-2 mt-2 shadow-2xs">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <strong className="block font-bold text-rose-950">
                              {isCityBlocked ? "Cidade fora da rota de entrega" : "Bairro fora da rota do motoboy"}
                            </strong>
                            <span className="text-[11px] text-rose-800 leading-relaxed block mt-0.5">
                              {deliveryBlockReason}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setOrderType('takeaway');
                            if (errors.address) setErrors(p => ({ ...p, address: "" }));
                          }}
                          className="w-full py-2 px-3 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                        >
                          <Store className="w-4 h-4 text-stone-300" />
                          <span>Mudar para Retirada no Balcão (Sem taxa de frete)</span>
                        </button>
                      </div>
                    )}

                    <div className="pt-3 border-t border-stone-200 flex justify-between items-baseline">
                      <div>
                        <span className="text-xs uppercase font-extrabold text-stone-500 block">Total a Pagar</span>
                        <span className="text-[11px] text-stone-400">
                          {orderType === 'delivery' ? 'Itens + Entrega' : 'Apenas itens'}
                        </span>
                      </div>
                      <span className="text-2xl font-black text-stone-950 tracking-tight">
                        R$ {finalTotal.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Fixo: Acessível e Responsivo em todos os celulares */}
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-white/98 backdrop-blur-md border-t border-stone-200 shrink-0 flex gap-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-lg">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose} 
              className="flex-1 h-12 rounded-2xl text-sm font-bold active:scale-[0.98] transition-all cursor-pointer" 
              disabled={isSubmitting}
            >
              Voltar
            </Button>
            <Button
              type="submit"
              className={`flex-2 h-12 rounded-2xl ${
                isDineIn
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30"
                  : (isVrumm
                      ? "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-red-600/30"
                      : "bg-[#047857] hover:bg-[#036348] shadow-[#047857]/30")
              } text-white font-black text-sm sm:text-base shadow-lg active:scale-[0.98] transition-all cursor-pointer`}
              disabled={
                isSubmitting || 
                (!isDineIn && finalTotal < minOrderValue) || 
                (orderType === 'delivery' && isDeliveryBlocked) ||
                (isDineIn && !tableNumber?.trim())
              }
            >
              {isSubmitting 
                ? "Enviando..." 
                : isDineIn
                  ? "Enviar Pedido para a Cozinha"
                  : (orderType === 'delivery' && isDeliveryBlocked ? (isCityBlocked ? "Cidade Não Atendida" : "Bairro Não Atendido") : "Confirmar Pedido")}
            </Button>
          </div>
        </form>
      </DialogContent>
      </Dialog>

      {/* Modal de Autenticação via WhatsApp OTP */}
      <WhatsAppAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title={authModalTitle}
        initialPhone={customerData.customer_phone}
        initialName={customerData.customer_name}
        dark={isVrumm}
        onSuccess={(loggedUser) => {
          setUser(loggedUser);
          setCustomerData(prev => ({
            ...prev,
            customer_phone: loggedUser.phone ? formatPhone(loggedUser.phone) : prev.customer_phone,
            customer_name: (loggedUser.full_name && loggedUser.full_name !== "Cliente") ? loggedUser.full_name : prev.customer_name,
            customer_email: loggedUser.email || prev.customer_email || ""
          }));

          // Carrega os endereços salvos da conta verificada
          fetchCustomerAddresses(loggedUser.phone, loggedUser.email).then(addrs => {
            if (addrs && addrs.length > 0) {
              setAddresses(addrs);
              const defaultAddr = addrs.find(a => a.is_default) || addrs[0];
              setSelectedAddress(defaultAddr.id);
              setIsCreatingNewAddress(false);
              setNewAddressForm(prev => ({
                ...prev,
                name: "",
                city: defaultAddr.city || prev.city || deliveryRules?.address_city || "",
                state: defaultAddr.state || prev.state || deliveryRules?.address_state || "MG"
              }));
            }
          });

          // Se havia tentativa de cupom pendente, aplica automaticamente!
          if (pendingCoupon) {
            setCouponCode(pendingCoupon);
            setTimeout(() => {
              handleApplyCoupon(pendingCoupon, loggedUser);
            }, 100);
            setPendingCoupon("");
          }
        }}
      />
    </>
  );
}
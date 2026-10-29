import React, { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  User as UserIcon, 
  LogOut, 
  MapPin, 
  Trash2, 
  Edit2, 
  Ticket, 
  ShoppingBag, 
  PhoneCall, 
  Pencil, 
  Check, 
  X, 
  Loader2, 
  Copy,
  Plus,
  ChevronRight,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  Coins,
  Sparkles
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { User } from "@/entities/User";
import { UserAddress } from "@/entities/UserAddress";
import { Coupon } from "@/entities/Coupon";
import { CouponUsage } from "@/entities/CouponUsage";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { sendWhatsAppOtp, verifyWhatsAppOtp } from "@/services/whatsappOtpService";

function AddressForm({ address, onSave, onCancel, dark = false }) {
  const [formData, setFormData] = useState(
    address || { name: "", cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" }
  );
  const [isFetchingCep, setIsFetchingCep] = useState(false);

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleCepChange = async (e) => {
    const cep = e.target.value.replace(/\D/g, '');
    setFormData(prev => ({ ...prev, cep }));

    if (cep.length === 8) {
      setIsFetchingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            street: data.logradouro || prev.street,
            neighborhood: data.bairro || prev.neighborhood,
            city: data.localidade || prev.city,
            state: data.uf || prev.state,
          }));
        }
      } catch (error) {
        console.error("Erro ao buscar CEP:", error);
      } finally {
        setIsFetchingCep(false);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 p-4.5 rounded-2xl border transition-all ${
      dark 
        ? "bg-stone-900/90 border-stone-800 text-stone-100" 
        : "bg-[#F7F9F8] border-[#E5EAE7] text-[#171717] shadow-xs"
    }`}>
      <h4 className={`font-black text-base ${dark ? "text-white" : "text-[#171717]"}`}>
        {address ? 'Editar Endereço' : 'Novo Endereço'}
      </h4>
      
      <div className="space-y-3">
        <div>
          <Label htmlFor="name" className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-stone-400" : "text-stone-600"}`}>
            Identificação do endereço
          </Label>
          <Input 
            id="name" 
            value={formData.name} 
            onChange={handleInputChange} 
            placeholder="Ex: Casa, Trabalho"
            required 
            className={`mt-1 rounded-xl text-sm ${
              dark 
                ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-500" 
                : "bg-white border-stone-200 text-[#171717] placeholder:text-stone-400 focus-visible:ring-[#047857]"
            }`}
          />
        </div>
        
        <div>
          <Label htmlFor="cep" className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-stone-400" : "text-stone-600"}`}>
            CEP
          </Label>
          <Input 
            id="cep" 
            value={formData.cep} 
            onChange={handleCepChange} 
            placeholder="00000-000"
            required 
            className={`mt-1 rounded-xl text-sm ${
              dark 
                ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-500" 
                : "bg-white border-stone-200 text-[#171717] placeholder:text-stone-400 focus-visible:ring-[#047857]"
            }`}
          />
        </div>
        
        <div>
          <Label htmlFor="street" className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-stone-400" : "text-stone-600"}`}>
            Rua / Logradouro
          </Label>
          <Input 
            id="street" 
            value={formData.street} 
            onChange={handleInputChange} 
            required 
            disabled={isFetchingCep} 
            className={`mt-1 rounded-xl text-sm ${
              dark 
                ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-500" 
                : "bg-white border-stone-200 text-[#171717] placeholder:text-stone-400 focus-visible:ring-[#047857]"
            }`}
          />
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="number" className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-stone-400" : "text-stone-600"}`}>
              Número
            </Label>
            <Input 
              id="number" 
              value={formData.number} 
              onChange={handleInputChange} 
              placeholder="123"
              required 
              className={`mt-1 rounded-xl text-sm ${
                dark 
                  ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-500" 
                  : "bg-white border-stone-200 text-[#171717] placeholder:text-stone-400 focus-visible:ring-[#047857]"
              }`}
            />
          </div>
          <div>
            <Label htmlFor="complement" className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-stone-400" : "text-stone-600"}`}>
              Complemento
            </Label>
            <Input 
              id="complement" 
              value={formData.complement} 
              onChange={handleInputChange} 
              placeholder="Apto 45"
              className={`mt-1 rounded-xl text-sm ${
                dark 
                  ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-500" 
                  : "bg-white border-stone-200 text-[#171717] placeholder:text-stone-400 focus-visible:ring-[#047857]"
              }`}
            />
          </div>
        </div>
        
        <div>
          <Label htmlFor="neighborhood" className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-stone-400" : "text-stone-600"}`}>
            Bairro
          </Label>
          <Input 
            id="neighborhood" 
            value={formData.neighborhood} 
            onChange={handleInputChange} 
            required 
            disabled={isFetchingCep} 
            className={`mt-1 rounded-xl text-sm ${
              dark 
                ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-500" 
                : "bg-white border-stone-200 text-[#171717] placeholder:text-stone-400 focus-visible:ring-[#047857]"
            }`}
          />
        </div>
        
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Label htmlFor="city" className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-stone-400" : "text-stone-600"}`}>
              Cidade
            </Label>
            <Input 
              id="city" 
              value={formData.city} 
              onChange={handleInputChange} 
              required 
              disabled={isFetchingCep} 
              className={`mt-1 rounded-xl text-sm ${
                dark 
                  ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-500" 
                  : "bg-white border-stone-200 text-[#171717] placeholder:text-stone-400 focus-visible:ring-[#047857]"
              }`}
            />
          </div>
          <div>
            <Label htmlFor="state" className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-stone-400" : "text-stone-600"}`}>
              UF
            </Label>
            <Input 
              id="state" 
              value={formData.state} 
              onChange={handleInputChange} 
              maxLength="2"
              placeholder="MG"
              required 
              disabled={isFetchingCep} 
              className={`mt-1 rounded-xl uppercase text-sm ${
                dark 
                  ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-500" 
                  : "bg-white border-stone-200 text-[#171717] placeholder:text-stone-400 focus-visible:ring-[#047857]"
              }`}
            />
          </div>
        </div>
      </div>
      
      <div className="flex gap-2 justify-end pt-2">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel} 
          className={`rounded-xl text-xs font-bold ${
            dark 
              ? "bg-stone-950 border-stone-800 text-stone-300 hover:bg-stone-800" 
              : "bg-white border-stone-200 text-stone-700 hover:bg-stone-100"
          }`}
        >
          Cancelar
        </Button>
        <Button 
          type="submit" 
          className={`rounded-xl text-xs font-bold ${
            dark 
              ? "bg-red-600 hover:bg-red-500 text-white" 
              : "bg-[#047857] hover:bg-[#065f46] text-white shadow-sm"
          }`}
        >
          Salvar endereço
        </Button>
      </div>
    </form>
  );
}

export default function UserProfileSheet({ dark = false, trigger, open, onOpenChange }) {
  const [user, setUser] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [couponUsages, setCouponUsages] = useState([]);
  const [cashbackData, setCashbackData] = useState(null);
  const [isEditingAddress, setIsEditingAddress] = useState(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  
  const [phoneInput, setPhoneInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [authStep, setAuthStep] = useState("phone"); // 'phone' | 'code'
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isSubmittingPhone, setIsSubmittingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState("");

  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => setResendCooldown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const formatPhone = (value) => {
    const raw = value.replace(/\D/g, "").slice(0, 11);
    if (raw.length <= 2) return raw.length > 0 ? `(${raw}` : "";
    if (raw.length <= 7) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
    return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
  };

  const loadUserData = async () => {
    try {
      let userData = await User.me();
      
      if (!userData) {
        setUser(null);
        setAddresses([]);
        setAvailableCoupons([]);
        return;
      }

      if (!userData.full_name || userData.full_name === "Cliente") {
        const cleanPhone = (userData.phone || "").replace(/\D/g, "");
        let recoveredName = "";

        try {
          const guestInfo = JSON.parse(localStorage.getItem("vrumburguer_guest_info") || "{}");
          if (guestInfo.customer_name && guestInfo.customer_name !== "Cliente") {
            recoveredName = guestInfo.customer_name.trim();
          }
        } catch {}

        if (!recoveredName && cleanPhone) {
          try {
            if (isSupabaseConfigured() && supabase) {
              const { data: orderData } = await supabase
                .from("orders")
                .select("customer_name")
                .ilike("customer_phone", `%${cleanPhone.slice(-8)}%`)
                .neq("customer_name", "Cliente")
                .order("created_date", { ascending: false })
                .limit(1);
              if (orderData && orderData[0]?.customer_name) {
                recoveredName = orderData[0].customer_name.trim();
              }
            }
          } catch {}
        }

        if (recoveredName) {
          userData = { ...userData, full_name: recoveredName };
          try {
            await User.update(userData.id, { full_name: recoveredName });
            if (typeof window !== "undefined") {
              localStorage.setItem("vrumburguer_current_user", JSON.stringify(userData));
            }
          } catch {}
        }
      }

      setUser(userData);
      
      const [allAddresses, allCoupons, usages] = await Promise.all([
        UserAddress.list(),
        Coupon.filter({ active: true }),
        CouponUsage.list()
      ]);

      const cleanPhone = (userData.phone || "").replace(/\D/g, "");
      let userAddresses = (allAddresses || []).filter(a => {
        const cleanAddrPhone = (a.user_phone || "").replace(/\D/g, "");
        return (
          (userData.email && a.user_email === userData.email) || 
          (cleanPhone && cleanAddrPhone && cleanAddrPhone.slice(-8) === cleanPhone.slice(-8))
        );
      });

      if (userAddresses.length === 0 && cleanPhone && isSupabaseConfigured() && supabase) {
        try {
          const { data: dbAddrs } = await supabase
            .from("user_addresses")
            .select("*")
            .ilike("user_phone", `%${cleanPhone.slice(-8)}%`);
          if (dbAddrs && dbAddrs.length > 0) {
            userAddresses = dbAddrs;
          }
        } catch {}
      }
      
      setAddresses(userAddresses);
      setCouponUsages(usages || []);

      const now = new Date();
      const validCoupons = (allCoupons || []).filter(coupon => {
        const isExpired = coupon.end_date && new Date(coupon.end_date) < now;
        const hasStarted = coupon.start_date ? new Date(coupon.start_date) <= now : true;
        return hasStarted && !isExpired;
      });
      setAvailableCoupons(validCoupons);

      // Carrega saldo de cashback do cliente nesta loja
      if (cleanPhone) {
        try {
          const currentTenantId = localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";
          if (isSupabaseConfigured() && supabase) {
            const { data: cbData, error: cbErr } = await supabase.rpc("get_customer_cashback_balance", {
              p_tenant_id: currentTenantId,
              p_phone: cleanPhone
            });
            if (!cbErr && cbData) {
              setCashbackData(cbData);
            }
          }
        } catch (cbErr) {
          console.warn("Erro ao buscar cashback no perfil:", cbErr);
        }
      }

    } catch (_error) {
      setUser(null);
      setAddresses([]);
      setCashbackData(null);
    }
  };

  const handlePhoneInputChange = async (value) => {
    const formatted = formatPhone(value);
    setPhoneInput(formatted);
    setPhoneError("");

    const clean = formatted.replace(/\D/g, "");
    if (clean.length === 11) {
      setIsLookingUpPhone(true);
      try {
        let foundName = "";
        try {
          const guestInfo = JSON.parse(localStorage.getItem("vrumburguer_guest_info") || "{}");
          if (guestInfo.customer_phone?.replace(/\D/g, '') === clean && guestInfo.customer_name) {
            foundName = guestInfo.customer_name;
          }
        } catch {}

        if (!foundName && isSupabaseConfigured() && supabase) {
          const { data: orders } = await supabase
            .from("orders")
            .select("customer_name")
            .ilike("customer_phone", `%${clean.slice(-8)}%`)
            .neq("customer_name", "Cliente")
            .order("created_date", { ascending: false })
            .limit(1);
          if (orders && orders[0]?.customer_name) {
            foundName = orders[0].customer_name;
          }
        }

        if (foundName) {
          setNameInput(foundName);
          setFoundNameMessage(`Encontramos seu cadastro como "${foundName}"!`);
        }
      } catch {}
      setIsLookingUpPhone(false);
    }
  };

  const handleSendOtp = async (e) => {
    e?.preventDefault();
    const clean = phoneInput.replace(/\D/g, "");
    if (clean.length < 10) {
      setPhoneError("Digite um número de WhatsApp válido com DDD.");
      return;
    }
    if (!nameInput.trim()) {
      setPhoneError("Informe seu nome completo para o cadastro.");
      return;
    }
    setPhoneError("");
    setIsSubmittingPhone(true);
    try {
      const res = await sendWhatsAppOtp({ phone: clean, fullName: nameInput.trim() });
      if (res.success) {
        setAuthStep("code");
        setResendCooldown(60);
        toast.success("Código enviado com sucesso pelo WhatsApp!");
      } else {
        setPhoneError(res.error || "Erro ao enviar código.");
      }
    } catch (_err) {
      setPhoneError("Erro ao se conectar ao serviço de envio.");
    } finally {
      setIsSubmittingPhone(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    const cleanCode = otpCode.replace(/\D/g, "").slice(0, 6);
    if (cleanCode.length < 4) {
      setPhoneError("Digite o código de 6 dígitos recebido.");
      return;
    }
    setPhoneError("");
    setIsSubmittingPhone(true);
    try {
      const clean = phoneInput.replace(/\D/g, "");
      const res = await verifyWhatsAppOtp({
        phone: clean,
        code: cleanCode,
        fullName: nameInput.trim()
      });
      if (res.success && res.user) {
        setUser(res.user);
        toast.success(`Bem-vindo, ${res.user.full_name || 'Cliente'}!`);
        setAuthStep("phone");
        setOtpCode("");
        loadUserData();
      } else {
        setPhoneError(res.error || "Código incorreto ou expirado.");
      }
    } catch (_err) {
      setPhoneError("Erro ao validar código.");
    } finally {
      setIsSubmittingPhone(false);
    }
  };

  const handleLogout = async () => {
    await User.logout();
    setUser(null);
    setAddresses([]);
    setAvailableCoupons([]);
    setPhoneInput("");
    setNameInput("");
    window.location.reload();
  };

  const handleSaveName = async (e) => {
    e?.preventDefault();
    const cleanName = newName.trim();
    if (!cleanName) {
      toast.error("O nome não pode ficar vazio.");
      return;
    }

    setIsSavingName(true);
    try {
      const phoneToUse = user?.phone || localStorage.getItem("vrumburguer_customer_phone") || "";

      if (phoneToUse && isSupabaseConfigured() && supabase) {
        await supabase.rpc("update_customer_name_by_phone", {
          p_phone: phoneToUse,
          p_new_name: cleanName
        });
      } else if (user?.id) {
        await User.update(user.id, { full_name: cleanName });
      }

      const updatedUser = { ...user, full_name: cleanName };
      setUser(updatedUser);

      if (typeof window !== "undefined") {
        localStorage.setItem("vrumburguer_current_user", JSON.stringify(updatedUser));
        try {
          const guestInfo = JSON.parse(localStorage.getItem("vrumburguer_guest_info") || "{}");
          localStorage.setItem("vrumburguer_guest_info", JSON.stringify({ ...guestInfo, customer_name: cleanName }));
        } catch {}
      }

      toast.success("Nome atualizado com sucesso!");
      setIsEditingName(false);
    } catch (_err) {
      console.error("Erro ao salvar nome:", _err);
      toast.error("Erro ao atualizar nome.");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSaveAddress = async (addressData) => {
    const phoneToUse = user?.phone || localStorage.getItem("vrumburguer_customer_phone") || "";
    if (isEditingAddress && isEditingAddress.id) {
      await UserAddress.update(isEditingAddress.id, { ...addressData, user_phone: phoneToUse });
    } else {
      await UserAddress.create({ 
        ...addressData, 
        user_email: user?.email,
        user_phone: phoneToUse
      });
    }
    setShowAddressForm(false);
    setIsEditingAddress(null);
    loadUserData();
  };

  const handleDeleteAddress = async (addressId) => {
    if (confirm("Tem certeza que deseja excluir este endereço?")) {
      await UserAddress.delete(addressId);
      loadUserData();
    }
  };

  return (
    <Sheet 
      {...(open !== undefined ? { open } : {})}
      onOpenChange={(isOpen) => {
        if (onOpenChange) onOpenChange(isOpen);
        if (isOpen) loadUserData();
      }}
    >
      <SheetTrigger asChild>
        {trigger || (
          <button 
            type="button"
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              dark 
                ? "text-stone-300 hover:text-white hover:bg-stone-800/80" 
                : "text-gray-700 hover:text-gray-950 hover:bg-gray-100"
            }`}
            title="Meu Perfil"
          >
            <UserIcon className="w-5 h-5" />
          </button>
        )}
      </SheetTrigger>
      <SheetContent className={`overflow-y-auto p-6 scrollbar-hide ${
        dark 
          ? "bg-[#14100e] text-stone-100 border-l border-stone-800" 
          : "bg-white text-[#171717] border-l border-[#E5EAE7]"
      }`}>
        <SheetHeader className={`pb-3.5 border-b ${dark ? "border-stone-800" : "border-[#E5EAE7]"}`}>
          <div>
            <SheetTitle 
              className={`text-xl sm:text-2xl font-black ${dark ? "text-white" : "text-[#171717]"}`}
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {user ? "Meu Perfil" : "Acessar Conta"}
            </SheetTitle>
            {user && (
              <p className={`text-xs mt-0.5 ${dark ? "text-stone-400" : "text-stone-500"}`}>
                Gerencie seus dados, endereços e benefícios
              </p>
            )}
          </div>
        </SheetHeader>

        <div className="py-6">
          {user ? (
            <div className="space-y-6">
              {/* Card do Usuário Logado (Conforme Foto 1) */}
              <div className={`p-4 rounded-3xl border transition-all flex items-center justify-between gap-3 shadow-2xs ${
                dark 
                  ? "bg-stone-900/90 border-stone-800" 
                  : "bg-[#F9FAFB] border-stone-200/80"
              }`}>
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Avatar Circular com botãozinho de edição */}
                  <div className="relative shrink-0">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center font-black text-2xl shadow-sm ${
                      dark 
                        ? "bg-red-900/80 border border-red-500/40 text-red-200" 
                        : "bg-[#0b3827] text-white"
                    }`}>
                      {user.full_name?.charAt(0)?.toUpperCase() || "D"}
                    </div>
                    <button 
                      type="button" 
                      onClick={() => { setNewName(user.full_name || ""); setIsEditingName(true); }}
                      className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white border border-stone-200 text-stone-700 flex items-center justify-center shadow-xs hover:bg-stone-50 cursor-pointer"
                      title="Alterar foto / nome"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                  </div>

                  <div className="min-w-0">
                    {isEditingName ? (
                      <form onSubmit={handleSaveName} className="space-y-1.5 py-0.5">
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Seu nome"
                            autoFocus
                            className="h-8 text-sm rounded-xl px-2.5 bg-white border-stone-200 text-[#171717]"
                          />
                          <Button
                            type="submit"
                            size="sm"
                            disabled={isSavingName}
                            className="h-8 px-2.5 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white cursor-pointer"
                          >
                            {isSavingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsEditingName(false)}
                            className="h-8 px-2 rounded-xl text-stone-400 hover:text-stone-700 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-extrabold text-base truncate ${dark ? "text-white" : "text-stone-900"}`}>
                            {user.full_name || "Cliente"}
                          </span>
                          <button 
                            type="button" 
                            onClick={() => { setNewName(user.full_name || ""); setIsEditingName(true); }}
                            className="text-stone-400 hover:text-stone-700 p-0.5 cursor-pointer"
                            title="Editar nome"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className={`mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          dark 
                            ? "bg-emerald-950/70 border border-emerald-500/30 text-emerald-400" 
                            : "bg-[#EBF3EF] border border-[#D1E9DF] text-[#047857]"
                        }`}>
                          <PhoneCall className="w-3 h-3" />
                          <span>{user.phone || "WhatsApp Conectado"}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    dark 
                      ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-400" 
                      : "bg-[#E6F4EA] border-[#CEEAD6] text-[#137333]"
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#137333]" />
                    Conectado
                  </span>
                  <ChevronRight className="w-4 h-4 text-stone-400" />
                </div>
              </div>

              {/* Card de Cashback da Loja (Idêntico à Foto 1) */}
              <div className={`rounded-3xl p-5 text-white relative overflow-hidden shadow-sm transition-all ${
                dark 
                  ? "bg-gradient-to-br from-[#0c2f21] to-[#082218] border border-emerald-900/50" 
                  : "bg-gradient-to-br from-[#123e2c] via-[#0d3424] to-[#0a2c1e] border border-emerald-900/30"
              }`}>
                {/* Marca d'água decorativa % grande */}
                <span className="absolute -right-3 -top-6 text-9xl font-black text-white/[0.04] pointer-events-none select-none">
                  %
                </span>

                <p className="text-[11px] font-bold tracking-wider text-emerald-300 uppercase">
                  CASHBACK DA LOJA
                </p>

                <div className="flex items-start justify-between gap-3 mt-1 relative z-10">
                  <div className="flex-1 pr-1">
                    <h2 className="text-3xl font-black text-white tracking-tight">
                      {Number(cashbackData?.rate || 5)}% de volta
                    </h2>
                    <p className="text-xs text-emerald-100/75 leading-relaxed mt-1.5 max-w-[210px] font-normal">
                      Faça seus pedidos e ganhe saldo de volta para usar nas próximas compras.
                    </p>
                  </div>

                  <div className="bg-[#072418]/90 border border-emerald-500/20 rounded-2xl py-2.5 px-3.5 text-center min-w-[110px] shrink-0">
                    <span className="text-[10px] font-medium text-emerald-300/90 block">
                      Saldo acumulado
                    </span>
                    <span className="text-xl font-black text-white block mt-0.5">
                      R$ {Number(cashbackData?.balance || 0).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </div>

                <div className="bg-[#092b1d]/90 border border-emerald-500/20 rounded-2xl p-2.5 px-3 flex items-center justify-between mt-4 relative z-10">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-[#051c13] flex items-center justify-center shrink-0 text-amber-400">
                      <Coins className="w-4 h-4" />
                    </div>
                    <span className="text-xs text-emerald-100 font-medium truncate">
                      O valor cai automaticamente na sua conta.
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-emerald-300 shrink-0 ml-1" />
                </div>
              </div>

              <Separator className={dark ? "bg-stone-800" : "bg-stone-100"} />

              {/* Seção de Endereços */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-black text-xs uppercase tracking-wider ${dark ? "text-stone-300" : "text-stone-600"}`}>
                      Meus Endereços
                    </h3>
                    {addresses.length > 0 && (
                      <span className={`text-[11px] font-bold px-2 py-0.2 rounded-full ${
                        dark ? "bg-stone-800 text-stone-300" : "bg-[#D1E9DF]/60 text-[#047857]"
                      }`}>
                        {addresses.length}
                      </span>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => { setIsEditingAddress(null); setShowAddressForm(true); }}
                    className={`rounded-xl text-xs font-bold gap-1 cursor-pointer transition-all ${
                      dark 
                        ? "bg-stone-900 border-stone-800 text-stone-200 hover:bg-stone-800" 
                        : "bg-[#047857] hover:bg-[#065f46] text-white border-transparent shadow-xs"
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar
                  </Button>
                </div>

                {showAddressForm && (
                  <div className="mb-3">
                    <AddressForm 
                      address={isEditingAddress}
                      dark={dark}
                      onSave={handleSaveAddress}
                      onCancel={() => { setShowAddressForm(false); setIsEditingAddress(null); }}
                    />
                  </div>
                )}

                <div className="space-y-2.5">
                  {addresses.length === 0 && !showAddressForm && (
                    <div className={`p-6 border border-dashed rounded-2xl text-center ${
                      dark ? "border-stone-800 bg-stone-900/40 text-stone-400" : "border-stone-200 bg-[#F7F9F8] text-stone-500"
                    }`}>
                      <MapPin className="w-6 h-6 mx-auto mb-1.5 opacity-40 text-stone-400" />
                      <p className="text-xs font-bold">Nenhum endereço cadastrado</p>
                      <p className="text-[11px] text-stone-400 mt-0.5">Toque em Adicionar para salvar seu endereço.</p>
                    </div>
                  )}

                  {addresses.map(addr => (
                    <div 
                      key={addr.id} 
                      className={`p-3.5 rounded-2xl border transition-all flex justify-between items-start gap-3 ${
                        dark 
                          ? "bg-stone-900/80 border-stone-800" 
                          : "bg-white border-stone-200 hover:border-[#D1E9DF] shadow-2xs hover:shadow-xs"
                      }`}
                    >
                      <div className="flex gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          dark ? "bg-stone-800 text-red-400" : "bg-[#D1E9DF]/60 text-[#047857]"
                        }`}>
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className={`font-black text-sm truncate ${dark ? "text-white" : "text-[#171717]"}`}>
                            {addr.name}
                          </p>
                          <p className={`text-xs mt-0.5 leading-relaxed line-clamp-2 ${dark ? "text-stone-400" : "text-stone-500"}`}>
                            {`${addr.street}, ${addr.number}${addr.complement ? ` (${addr.complement})` : ''} - ${addr.neighborhood}, ${addr.city}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className={`w-7 h-7 rounded-lg cursor-pointer transition-colors ${
                            dark 
                              ? "text-stone-400 hover:text-white hover:bg-stone-800" 
                              : "text-stone-400 hover:text-[#047857] hover:bg-[#D1E9DF]/40"
                          }`}
                          onClick={() => { setIsEditingAddress(addr); setShowAddressForm(true); }}
                          title="Editar endereço"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className={`w-7 h-7 rounded-lg cursor-pointer transition-colors ${
                            dark 
                              ? "text-stone-400 hover:text-rose-400 hover:bg-rose-950/30" 
                              : "text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                          }`}
                          onClick={() => handleDeleteAddress(addr.id)}
                          title="Excluir endereço"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <ChevronRight className="w-4 h-4 text-stone-400 ml-0.5" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator className={dark ? "bg-stone-800" : "bg-stone-100"} />

              {/* Card Branco de Histórico de Pedidos (Conforme Foto 1) */}
              <Link to={createPageUrl("MyOrders")} className="block">
                <div className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 shadow-2xs ${
                  dark 
                    ? "bg-stone-900/90 border-stone-800 hover:bg-stone-850" 
                    : "bg-white border-stone-200/90 hover:bg-stone-50/80"
                }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      dark ? "bg-stone-800 text-stone-200" : "bg-stone-100 text-stone-800"
                    }`}>
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                    <div>
                      <p className={`font-bold text-sm leading-tight ${dark ? "text-white" : "text-stone-900"}`}>
                        Ver Histórico de Pedidos
                      </p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Acompanhe todos os seus pedidos
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
                </div>
              </Link>

              <Separator className={dark ? "bg-stone-800" : "bg-stone-100"} />

              {/* Cupons Disponíveis */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className={`font-black text-xs uppercase tracking-wider ${dark ? "text-stone-300" : "text-stone-600"}`}>
                    Cupons Disponíveis
                  </h3>
                  {availableCoupons.length > 0 && (
                    <span className={`text-[11px] font-bold px-2 py-0.2 rounded-full ${
                      dark ? "bg-stone-800 text-stone-300" : "bg-[#D1E9DF]/60 text-[#047857]"
                    }`}>
                      {availableCoupons.length}
                    </span>
                  )}
                </div>

                {availableCoupons.length > 0 ? (
                  <div className="space-y-3">
                    {availableCoupons.map(coupon => {
                      const cleanPhone = (user?.phone || "").replace(/\D/g, "");
                      const userUsageCount = couponUsages.filter(u => {
                        if (u.coupon_id !== coupon.id) return false;
                        const uEmail = String(u.user_email || "");
                        const matchesPhone = cleanPhone && cleanPhone.length >= 8 && uEmail.includes(cleanPhone.slice(-8));
                        const matchesEmail = user?.email && uEmail.toLowerCase().includes(user.email.toLowerCase());
                        return matchesPhone || matchesEmail;
                      }).length;
                      const isUsedUp = coupon.usage_limit && userUsageCount >= coupon.usage_limit;
                      const isExpired = coupon.end_date && new Date(coupon.end_date) < new Date();
                      const canUse = !isUsedUp && !isExpired;
                      
                      return (
                        <div 
                          key={coupon.id} 
                          className={`p-3.5 border-2 border-dashed rounded-2xl transition-all ${
                            dark
                              ? (canUse ? 'border-red-500/50 bg-stone-900/90' : 'border-stone-800 bg-stone-950 opacity-60')
                              : (canUse 
                                  ? 'border-[#D1E9DF] hover:border-[#047857] bg-gradient-to-br from-white to-[#F7F9F8] shadow-2xs hover:shadow-xs' 
                                  : 'border-stone-200 bg-stone-50 opacity-60')
                          }`}
                        >
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                                dark ? "bg-stone-800 text-red-400" : "bg-[#D1E9DF]/60 text-[#047857]"
                              }`}>
                                <Ticket className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`font-black text-sm truncate ${
                                  dark ? (canUse ? 'text-white' : 'text-stone-400') : 'text-[#171717]'
                                }`}>
                                  {coupon.name}
                                </p>
                                {coupon.description && (
                                  <p className={`text-xs mt-0.5 line-clamp-2 ${dark ? "text-stone-400" : "text-stone-500"}`}>
                                    {coupon.description}
                                  </p>
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span className={`inline-flex items-center font-black text-[11px] px-2 py-0.5 rounded-md ${
                                    dark 
                                      ? "bg-red-950/80 border border-red-500/40 text-red-400" 
                                      : "bg-[#D1E9DF]/80 border border-[#047857]/30 text-[#047857]"
                                  }`}>
                                    {coupon.discount_type === 'percentage' 
                                      ? `${coupon.discount_value}% OFF` 
                                      : `R$ ${coupon.discount_value.toFixed(2)} OFF`}
                                  </span>
                                  {coupon.min_order_value > 0 && (
                                    <span className={`text-[11px] ${dark ? "text-stone-400" : "text-stone-500"}`}>
                                      Mínimo: R$ {coupon.min_order_value.toFixed(2).replace('.', ',')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {canUse && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => {
                                  navigator.clipboard.writeText(coupon.code);
                                  toast.success('Cupom ' + coupon.code + ' copiado!');
                                }}
                                className={`flex items-center gap-1.5 shrink-0 rounded-xl text-xs font-black h-8 px-3 cursor-pointer transition-all ${
                                  dark 
                                    ? "bg-stone-950 border-stone-800 text-stone-200 hover:text-white hover:bg-stone-800" 
                                    : "bg-[#047857] hover:bg-[#065f46] text-white border-transparent shadow-xs"
                                }`}
                              >
                                <Copy className="w-3 h-3"/>
                                <span>{coupon.code}</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className={`text-xs text-center py-4 ${dark ? "text-stone-500" : "text-stone-400"}`}>
                    Nenhum cupom disponível no momento.
                  </p>
                )}
              </div>
              
              <Separator className={dark ? "bg-stone-800" : "bg-stone-100"} />

              <Button 
                onClick={handleLogout} 
                variant="outline" 
                className={`w-full font-bold rounded-2xl h-11 text-xs cursor-pointer transition-all flex items-center justify-center gap-2 ${
                  dark 
                    ? "bg-stone-900/80 hover:bg-rose-950/40 hover:text-rose-400 border border-stone-800 text-stone-400" 
                    : "bg-white hover:bg-rose-50 border border-stone-200 hover:border-rose-200 text-stone-600 hover:text-rose-600 shadow-2xs"
                }`}
              >
                <LogOut className="w-4 h-4" />
                <span>Sair da Conta</span>
              </Button>
            </div>
          ) : (
            /* Formulário de Identificação Oficial via WhatsApp OTP */
            <div className="space-y-4">
              <div className="text-center pb-2">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm ${
                  dark 
                    ? "bg-emerald-950/80 border border-emerald-500/40 text-emerald-400" 
                    : "bg-[#D1E9DF]/70 border border-[#D1E9DF] text-[#047857]"
                }`}>
                  {authStep === "phone" ? (
                    <PhoneCall className="w-7 h-7" />
                  ) : (
                    <ShieldCheck className="w-7 h-7" />
                  )}
                </div>
                <h3 
                  className={`font-black text-xl tracking-tight ${dark ? "text-white" : "text-[#171717]"}`}
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  {authStep === "phone" ? "Entrar com WhatsApp" : "Confirmar Código"}
                </h3>
                <p className={`text-xs mt-1 max-w-[280px] mx-auto leading-relaxed ${dark ? "text-stone-400" : "text-stone-500"}`}>
                  {authStep === "phone" 
                    ? "Cadastre-se ou acesse sua conta para salvar endereços e liberar cupons exclusivos." 
                    : `Digite o código de 6 dígitos que enviamos para ${phoneInput}.`}
                </p>
              </div>

              {authStep === "phone" ? (
                <form onSubmit={handleSendOtp} className={`space-y-3.5 p-4.5 rounded-2xl border ${
                  dark 
                    ? "bg-stone-900/90 border-stone-800" 
                    : "bg-[#F7F9F8] border-[#E5EAE7] shadow-2xs"
                }`}>
                  <div>
                    <Label htmlFor="phone" className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-stone-300" : "text-stone-700"}`}>
                      Seu WhatsApp com DDD *
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(11) 99999-9999"
                      value={phoneInput}
                      onChange={(e) => {
                        handlePhoneInputChange(e.target.value);
                        if (phoneError) setPhoneError("");
                      }}
                      className={`mt-1 rounded-xl h-11 text-base sm:text-sm font-medium ${
                        dark 
                          ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-600 focus-visible:ring-emerald-500" 
                          : "bg-white border-stone-200 text-[#171717] placeholder:text-stone-400 focus-visible:ring-[#047857]"
                      } ${phoneError ? 'border-red-500' : ''}`}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="name" className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-stone-300" : "text-stone-700"}`}>
                      Seu Nome Completo *
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Ex: Carlos Silva"
                      value={nameInput}
                      onChange={(e) => {
                        setNameInput(e.target.value);
                        if (phoneError) setPhoneError("");
                      }}
                      required
                      className={`mt-1 rounded-xl h-11 text-base sm:text-sm ${
                        dark 
                          ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-600 focus-visible:ring-emerald-500" 
                          : "bg-white border-stone-200 text-[#171717] placeholder:text-stone-400 focus-visible:ring-[#047857]"
                      }`}
                    />
                  </div>

                  {phoneError && <p className="text-xs text-rose-500 mt-1 font-semibold">{phoneError}</p>}

                  <Button
                    type="submit"
                    disabled={isSubmittingPhone}
                    className={`w-full font-extrabold h-11 rounded-xl shadow-md flex items-center justify-center gap-2 mt-2 cursor-pointer transition-all ${
                      dark 
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white" 
                        : "bg-[#047857] hover:bg-[#065f46] text-white"
                    }`}
                  >
                    {isSubmittingPhone ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Enviando código...</span>
                      </>
                    ) : (
                      <>
                        <PhoneCall className="w-4 h-4" />
                        <span>Enviar Código no WhatsApp</span>
                      </>
                    )}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className={`space-y-3.5 p-4.5 rounded-2xl border ${
                  dark 
                    ? "bg-stone-900/90 border-stone-800" 
                    : "bg-[#F7F9F8] border-[#E5EAE7] shadow-2xs"
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="otp" className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-stone-300" : "text-stone-700"}`}>
                      Código de 6 dígitos
                    </Label>
                    <button
                      type="button"
                      onClick={() => { setAuthStep("phone"); setPhoneError(""); }}
                      className={`text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                        dark ? "text-emerald-400 hover:text-emerald-300" : "text-[#047857] hover:text-[#065f46]"
                      }`}
                    >
                      <ArrowLeft className="w-3 h-3" />
                      Alterar número
                    </button>
                  </div>

                  <Input
                    id="otp"
                    type="text"
                    maxLength={6}
                    placeholder="••••••"
                    value={otpCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setOtpCode(val);
                      if (phoneError) setPhoneError("");
                    }}
                    required
                    className={`rounded-xl h-12 text-center text-xl font-black tracking-[0.4em] font-mono ${
                      dark 
                        ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-700 focus-visible:ring-emerald-500" 
                        : "bg-white border-stone-300 text-[#171717] placeholder:text-stone-300 focus-visible:ring-[#047857]"
                    }`}
                  />

                  {phoneError && <p className="text-xs text-rose-500 mt-1 font-semibold">{phoneError}</p>}

                  <Button
                    type="submit"
                    disabled={isSubmittingPhone || otpCode.length < 4}
                    className={`w-full font-extrabold h-11 rounded-xl shadow-md flex items-center justify-center gap-2 mt-2 cursor-pointer transition-all ${
                      dark 
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white" 
                        : "bg-[#047857] hover:bg-[#065f46] text-white"
                    }`}
                  >
                    {isSubmittingPhone ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Validando código...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Confirmar e Entrar</span>
                      </>
                    )}
                  </Button>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      disabled={resendCooldown > 0 || isSubmittingPhone}
                      onClick={handleSendOtp}
                      className={`text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                        dark ? "text-stone-400 hover:text-stone-200" : "text-stone-600 hover:text-[#047857]"
                      }`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSubmittingPhone ? "animate-spin" : ""}`} />
                      {resendCooldown > 0
                        ? `Reenviar código em ${resendCooldown}s`
                        : "Reenviar código no WhatsApp"}
                    </button>
                  </div>
                </form>
              )}

              <p className={`text-[11px] text-center ${dark ? "text-stone-500" : "text-stone-400"}`}>
                🔒 Verificação oficial por WhatsApp. Seus dados e endereços protegidos.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
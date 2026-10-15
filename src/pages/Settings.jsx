import React, { useState, useEffect } from "react";
import { Settings } from "@/entities/Settings";
import { AdminUser } from "@/entities/AdminUser";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { UploadFile } from "@/integrations/Core";
import { Button } from "@/components/ui/button";
import { 
  Save, 
  Store, 
  Clock, 
  Bike, 
  Users,
  CreditCard,
  Wallet
} from "lucide-react";
import { fetchCityNeighborhoods } from "@/services/cityNeighborhoods";
import { parseBRLToNumber } from "@/utils/moneyMask";
import { toast } from "sonner";
import { validateSchema, settingsSchema, adminUserSchema } from "@/schemas";

// Sub-abas modularizadas
import GeneralSettingsTab from "@/components/admin/settings/GeneralSettingsTab";
import HoursTab from "@/components/admin/settings/HoursTab";
import DeliveryFeesTab from "@/components/admin/settings/DeliveryFeesTab";
import AdminUsersTab from "@/components/admin/settings/AdminUsersTab";
import SubscriptionTab from "@/components/admin/settings/SubscriptionTab";
import PaymentMethodsTab from "@/components/admin/settings/PaymentMethodsTab";

// Constantes e utilitários compartilhados
import {
  DAYS_CONFIG,
  getDayDisplayName,
  normalizeOpenDays,
  defaultOpenDays,
  formatPhone,
  formatCep,
  buildFullAddress,
  ALL_ADMIN_SCREENS
} from "@/components/admin/settings/settingsConstants";

// Re-exporta para compatibilidade com outros módulos que importavam de Settings.jsx
export {
  DAYS_CONFIG,
  getDayDisplayName,
  normalizeOpenDays,
  formatPhone,
  formatCep,
  buildFullAddress
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("geral");
  const [tenantDetails, setTenantDetails] = useState(null);

  const [settings, setSettings] = useState({
    restaurant_name: "",
    restaurant_logo: "",
    opening_time: "",
    closing_time: "",
    open_days: defaultOpenDays(),
    address: "",
    cep: "",
    address_street: "",
    address_number: "",
    address_neighborhood: "",
    address_city: "",
    address_state: "",
    address_complement: "",
    instagram: "",
    whatsapp: "",
    delivery_fee: "",
    min_order_value: "",
    delivery_fee_type: "fixed",
    delivery_neighborhoods: [],
    delivery_unlisted_policy: "block",
    delivery_fallback_fee: "10.00",
    free_delivery_threshold: "",
    salon_mode: "full",
    accepts_delivery: true,
    accepts_takeaway: true
  });

  const [newNeighborhood, setNewNeighborhood] = useState({
    name: "",
    fee: ""
  });

  // Estados para Busca e Importação Oficial de Bairros por Cidade
  const [cityNeighborhoodsList, setCityNeighborhoodsList] = useState([]);
  const [isFetchingCityNeighborhoods, setIsFetchingCityNeighborhoods] = useState(false);
  const [cityNeighborhoodsError, setCityNeighborhoodsError] = useState(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importSearchTerm, setImportSearchTerm] = useState("");
  const [selectedNeighborhoodsToImport, setSelectedNeighborhoodsToImport] = useState(new Set());
  const [batchFee, setBatchFee] = useState("7.00");
  const [showNeighborhoodSuggestions, setShowNeighborhoodSuggestions] = useState(false);

  // Estados para edição inline e alteração em lote de bairros cadastrados
  const [editingNeighborhoodId, setEditingNeighborhoodId] = useState(null);
  const [editingNeighborhoodFee, setEditingNeighborhoodFee] = useState("");
  const [neighborhoodSearchTerm, setNeighborhoodSearchTerm] = useState("");
  const [selectedNeighborhoodIds, setSelectedNeighborhoodIds] = useState(new Set());
  const [bulkApplyFee, setBulkApplyFee] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsId, setSettingsId] = useState(null);

  // Estados para consulta de CEP da Loja
  const [isFetchingCep, setIsFetchingCep] = useState(false);
  const [cepError, setCepError] = useState(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Estado para múltiplos usuários administradores
  const [adminUsers, setAdminUsers] = useState([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userFormData, setUserFormData] = useState({
    username: "",
    password: "",
    role: "admin",
    active: true,
    access_type: "all",
    permissions: ALL_ADMIN_SCREENS.map(s => s.key),
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);

  useEffect(() => {
    loadSettings();
    loadAdminUsers();
  }, []);

  const loadSettings = async () => {
    try {
      const segments = window.location.pathname.split("/").filter(Boolean);
      const RESERVED = ["settings", "dashboard", "orders", "pdv", "menu", "adminlogin", "superadmin"];
      const urlSlug = segments.length > 0 && !RESERVED.includes(segments[0].toLowerCase()) ? segments[0].toLowerCase() : null;
      const currentSlug = urlSlug || localStorage.getItem("current_tenant_slug");
      const currentTenantId = localStorage.getItem("current_tenant_id");
      const isVruum = currentSlug === "vrumm" || currentSlug === "vruum-burguer" || currentTenantId === "a0000000-0000-0000-0000-000000000001";

      if (isSupabaseConfigured() && supabase) {
        let tenantData = null;
        if (currentTenantId) {
          const { data } = await supabase.from("tenants").select("*").eq("id", currentTenantId).maybeSingle();
          tenantData = data;
        }
        if (!tenantData && currentSlug) {
          let slugQuery = supabase.from("tenants").select("*");
          if (currentSlug === "vrumm" || currentSlug === "vruum-burguer") {
            slugQuery = slugQuery.or("slug.eq.vruum-burguer,slug.eq.vrumm,id.eq.a0000000-0000-0000-0000-000000000001");
          } else {
            slugQuery = slugQuery.eq("slug", currentSlug);
          }
          const { data } = await slugQuery.maybeSingle();
          tenantData = data;
        }
        if (!tenantData && isVruum) {
          const { data } = await supabase.from("tenants").select("*").eq("id", "a0000000-0000-0000-0000-000000000001").maybeSingle();
          tenantData = data;
        }

        if (tenantData) {
          setSettingsId(tenantData.id);
          setTenantDetails(tenantData);
          localStorage.setItem("current_tenant_id", tenantData.id);
          localStorage.setItem("current_tenant_slug", tenantData.slug);
          localStorage.setItem("current_tenant_name", tenantData.name);
          const loadedOpenDays = normalizeOpenDays(tenantData.open_days, tenantData.opening_time || "18:00", tenantData.closing_time || "23:00");
          const firstOpen = loadedOpenDays.find(d => d.enabled && d.opening_time);

          setSettings({
            restaurant_name: tenantData.name || "",
            restaurant_logo: tenantData.logo_url || "",
            opening_time: tenantData.opening_time || firstOpen?.opening_time || "18:00",
            closing_time: tenantData.closing_time || firstOpen?.closing_time || "23:00",
            open_days: loadedOpenDays,
            address: tenantData.address || "",
            cep: formatCep(tenantData.cep || ""),
            address_street: tenantData.address_street || "",
            address_number: tenantData.address_number || "",
            address_neighborhood: tenantData.address_neighborhood || "",
            address_city: tenantData.address_city || "",
            address_state: tenantData.address_state || "",
            address_complement: tenantData.address_complement || "",
            instagram: tenantData.instagram || "",
            whatsapp: formatPhone(tenantData.whatsapp || ""),
            delivery_fee: tenantData.delivery_fee?.toString() || "",
            min_order_value: tenantData.min_order_value?.toString() || "",
            delivery_fee_type: tenantData.delivery_fee_type || "fixed",
            delivery_neighborhoods: Array.isArray(tenantData.delivery_neighborhoods) ? tenantData.delivery_neighborhoods : [],
            delivery_unlisted_policy: tenantData.delivery_unlisted_policy || "block",
            delivery_fallback_fee: tenantData.delivery_fallback_fee?.toString() || "10.00",
            free_delivery_threshold: tenantData.free_delivery_threshold?.toString() || "",
            salon_mode: tenantData.salon_mode || (tenantData.plan === "showcase" ? "showcase" : (tenantData.plan === "table" ? "table_only" : "full")),
            accepts_delivery: tenantData.accepts_delivery !== false,
            accepts_takeaway: tenantData.accepts_takeaway !== false,
          });
          setIsLoading(false);
          return;
        }
      }

      if (isVruum) {
        const settingsData = await Settings.list();
        if (settingsData.length > 0) {
          const currentSettings = settingsData[0];
          setSettingsId(currentSettings.id);
          const loadedOpenDays = normalizeOpenDays(currentSettings.open_days, currentSettings.opening_time || "18:00", currentSettings.closing_time || "23:00");
          const firstOpen = loadedOpenDays.find(d => d.enabled && d.opening_time);

          setSettings({
            restaurant_name: currentSettings.restaurant_name || "",
            restaurant_logo: currentSettings.restaurant_logo || "",
            opening_time: currentSettings.opening_time || firstOpen?.opening_time || "18:00",
            closing_time: currentSettings.closing_time || firstOpen?.closing_time || "23:00",
            open_days: loadedOpenDays,
            address: currentSettings.address || "",
            cep: formatCep(currentSettings.cep || ""),
            address_street: currentSettings.address_street || "",
            address_number: currentSettings.address_number || "",
            address_neighborhood: currentSettings.address_neighborhood || "",
            address_city: currentSettings.address_city || "",
            address_state: currentSettings.address_state || "",
            address_complement: currentSettings.address_complement || "",
            instagram: currentSettings.instagram || "",
            whatsapp: formatPhone(currentSettings.whatsapp || ""),
            delivery_fee: currentSettings.delivery_fee?.toString() || "",
            min_order_value: currentSettings.min_order_value?.toString() || "",
            delivery_fee_type: "fixed",
            delivery_neighborhoods: [],
            delivery_unlisted_policy: "block",
            delivery_fallback_fee: "10.00",
            free_delivery_threshold: "",
            salon_mode: "full",
            accepts_delivery: true,
            accepts_takeaway: true
          });
        }
      } else {
        const savedName = localStorage.getItem("current_tenant_name") || (currentSlug ? currentSlug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "");
        setSettings({
          restaurant_name: savedName,
          restaurant_logo: "",
          opening_time: "18:00",
          closing_time: "23:00",
          open_days: defaultOpenDays(),
          address: "",
          cep: "",
          address_street: "",
          address_number: "",
          address_neighborhood: "",
          address_city: "",
          address_state: "",
          address_complement: "",
          instagram: "",
          whatsapp: "",
          delivery_fee: "",
          min_order_value: "",
          delivery_fee_type: "fixed",
          delivery_neighborhoods: [],
          delivery_unlisted_policy: "block",
          delivery_fallback_fee: "10.00",
          free_delivery_threshold: "",
          salon_mode: "full",
          accepts_delivery: true,
          accepts_takeaway: true
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadAdminUsers = async () => {
    try {
      const currentTenantId = localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001";
      if (isSupabaseConfigured() && supabase) {
        const { data, error } = await supabase.rpc("get_store_admin_users", { p_tenant_id: currentTenantId });
        if (!error && Array.isArray(data)) {
          setAdminUsers(data);
          return;
        }
      }
      const users = await AdminUser.filter({ tenant_id: currentTenantId });
      setAdminUsers(Array.isArray(users) ? users : []);
    } catch (_error) {
      console.log("Error loading admin users", _error);
    }
  };

  const handleInputChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleAddressFieldChange = (field, value) => {
    setSettings(prev => {
      const updated = { ...prev, [field]: value };
      const autoAddress = buildFullAddress(updated);
      return {
        ...updated,
        address: autoAddress || updated.address
      };
    });
  };

  const handleCepChange = async (e) => {
    const raw = e.target.value;
    const formatted = formatCep(raw);
    const cleanDigits = raw.replace(/\D/g, "").slice(0, 8);

    setSettings(prev => ({ ...prev, cep: formatted }));
    setCepError(null);

    if (cleanDigits.length === 8) {
      setIsFetchingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanDigits}/json/`);
        const data = await response.json();
        if (data.erro) {
          setCepError("CEP não encontrado. Verifique e tente novamente.");
        } else {
          const logradouro = data.logradouro || "";
          const bairro = data.bairro || "";
          const localidade = data.localidade || "";
          const uf = data.uf || "";

          setSettings(prev => {
            const updated = {
              ...prev,
              cep: formatted,
              address_street: logradouro || prev.address_street,
              address_neighborhood: bairro || prev.address_neighborhood,
              address_city: localidade || prev.address_city,
              address_state: uf || prev.address_state,
            };
            return {
              ...updated,
              address: buildFullAddress(updated) || prev.address,
            };
          });

          setTimeout(() => {
            const numInput = document.getElementById("address_number");
            if (numInput) numInput.focus();
          }, 150);
        }
      } catch (_err) {
        setCepError("Não foi possível consultar o CEP no momento.");
      } finally {
        setIsFetchingCep(false);
      }
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setIsUploadingLogo(true);
      try {
        const currentTenantId = localStorage.getItem("current_tenant_id") || "global";
        const { file_url } = await UploadFile({ file, maxDimension: 500, tenantId: currentTenantId });
        setSettings((prev) => ({ ...prev, restaurant_logo: file_url }));

        if (isSupabaseConfigured() && supabase && currentTenantId && currentTenantId !== "global") {
          await supabase
            .from("tenants")
            .update({ logo_url: file_url, updated_date: new Date().toISOString() })
            .eq("id", currentTenantId);
        }

        if (settingsId) {
          await Settings.update(settingsId, { restaurant_logo: file_url });
        }
        toast.success("Logo atualizado com sucesso!");
      } catch (_error) {
        toast.error("Erro ao fazer upload do logo");
      } finally {
        setIsUploadingLogo(false);
      }
    }
  };

  // Funções de dias e horários
  const handleToggleDay = (dayIndex) => {
    setSettings(prev => ({
      ...prev,
      open_days: prev.open_days.map(d =>
        d.day === dayIndex ? { ...d, enabled: !d.enabled } : d
      )
    }));
  };

  const handleDayTime = (dayIndex, field, value) => {
    setSettings(prev => ({
      ...prev,
      open_days: prev.open_days.map(d =>
        d.day === dayIndex ? { ...d, [field]: value } : d
      )
    }));
  };

  const handleCopyDayTimeToAll = (openTime, closeTime) => {
    setSettings(prev => ({
      ...prev,
      opening_time: openTime,
      closing_time: closeTime,
      open_days: prev.open_days.map(d => ({
        ...d,
        opening_time: openTime,
        closing_time: closeTime
      }))
    }));
    toast.success("Horário replicado para todos os dias!");
  };

  const handleToggleAllDays = (enabledState) => {
    setSettings(prev => ({
      ...prev,
      open_days: prev.open_days.map(d => ({
        ...d,
        enabled: enabledState
      }))
    }));
  };

  // Funções de bairros e taxas
  const handleAddNeighborhood = () => {
    if (!newNeighborhood.name.trim()) return;
    const feeVal = parseBRLToNumber(newNeighborhood.fee);
    const item = {
      id: "nh_" + Date.now().toString(),
      name: newNeighborhood.name.trim(),
      fee: feeVal,
      active: true
    };
    setSettings(prev => ({
      ...prev,
      delivery_neighborhoods: [...(prev.delivery_neighborhoods || []), item]
    }));
    setNewNeighborhood({ name: "", fee: "" });
    toast.success(`Bairro "${item.name}" adicionado com sucesso!`);
  };

  const handleRemoveNeighborhood = (id) => {
    setSettings(prev => ({
      ...prev,
      delivery_neighborhoods: (prev.delivery_neighborhoods || []).filter(n => n.id !== id)
    }));
    toast.success("Bairro removido");
  };

  const handleToggleNeighborhood = (id) => {
    setSettings(prev => ({
      ...prev,
      delivery_neighborhoods: (prev.delivery_neighborhoods || []).map(n =>
        n.id === id ? { ...n, active: n.active === false ? true : false } : n
      )
    }));
  };

  const handleSaveInlineFee = (id) => {
    const feeNum = parseBRLToNumber(editingNeighborhoodFee);
    setSettings(prev => ({
      ...prev,
      delivery_neighborhoods: (prev.delivery_neighborhoods || []).map(n =>
        n.id === id ? { ...n, fee: feeNum } : n
      )
    }));
    toast.success("Taxa do bairro atualizada!");
    setEditingNeighborhoodId(null);
    setEditingNeighborhoodFee("");
  };

  const handleToggleSelectNeighborhood = (id) => {
    setSelectedNeighborhoodIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllFiltered = (filteredItems) => {
    if (selectedNeighborhoodIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedNeighborhoodIds(new Set());
    } else {
      setSelectedNeighborhoodIds(new Set(filteredItems.map(item => item.id)));
    }
  };

  const handleApplyBulkFee = () => {
    const feeNum = parseBRLToNumber(bulkApplyFee);
    if (isNaN(feeNum) || feeNum < 0) {
      toast.error("Informe um valor válido para aplicar em lote.");
      return;
    }
    if (selectedNeighborhoodIds.size === 0) return;

    setSettings(prev => ({
      ...prev,
      delivery_neighborhoods: (prev.delivery_neighborhoods || []).map(n =>
        selectedNeighborhoodIds.has(n.id) ? { ...n, fee: feeNum } : n
      )
    }));

    toast.success(`Taxa de ${selectedNeighborhoodIds.size} bairros atualizada para R$ ${feeNum.toFixed(2).replace(".", ",")}!`);
    setSelectedNeighborhoodIds(new Set());
    setBulkApplyFee("");
  };

  const handleFetchOfficialNeighborhoods = async (openModalAfter = false) => {
    const city = settings.address_city?.trim();
    const uf = settings.address_state?.trim() || "MG";

    if (!city) {
      toast.error("Configure a Cidade da loja antes de buscar bairros.");
      return;
    }

    setIsFetchingCityNeighborhoods(true);
    setCityNeighborhoodsError(null);
    if (openModalAfter) setIsImportModalOpen(true);

    const result = await fetchCityNeighborhoods(city, uf);
    setIsFetchingCityNeighborhoods(false);

    if (result.success && result.neighborhoods.length > 0) {
      setCityNeighborhoodsList(result.neighborhoods);
      const existingNames = new Set((settings.delivery_neighborhoods || []).map(n => (n.name || "").toLowerCase().trim()));
      const initialSelected = new Set(result.neighborhoods.filter(name => !existingNames.has(name.toLowerCase().trim())));
      setSelectedNeighborhoodsToImport(initialSelected);
    } else {
      setCityNeighborhoodsError(result.error || `Não foi possível carregar os bairros de ${city}.`);
    }
  };

  const handleToggleImportSelection = (name) => {
    setSelectedNeighborhoodsToImport(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSelectAllImport = (filteredList) => {
    if (selectedNeighborhoodsToImport.size === filteredList.length) {
      setSelectedNeighborhoodsToImport(new Set());
    } else {
      setSelectedNeighborhoodsToImport(new Set(filteredList));
    }
  };

  const handleBatchImportNeighborhoods = () => {
    if (selectedNeighborhoodsToImport.size === 0) return;

    const feeVal = parseBRLToNumber(batchFee);
    const existingNames = new Set((settings.delivery_neighborhoods || []).map(n => (n.name || "").toLowerCase().trim()));

    const newItems = Array.from(selectedNeighborhoodsToImport)
      .filter(name => !existingNames.has(name.toLowerCase().trim()))
      .map(name => ({
        id: "nh_" + Date.now().toString() + "_" + Math.random().toString(36).substr(2, 5),
        name: name.trim(),
        fee: isNaN(feeVal) ? 0 : feeVal,
        active: true
      }));

    setSettings(prev => ({
      ...prev,
      delivery_neighborhoods: [...(prev.delivery_neighborhoods || []), ...newItems]
    }));

    setIsImportModalOpen(false);
    toast.success(`✓ ${newItems.length} bairros importados com sucesso para ${settings.address_city}!`);
  };

  // Funções de Usuários Administradores
  const handleOpenAddUser = () => {
    setEditingUserId(null);
    setUserFormData({
      username: "",
      password: "",
      role: "admin",
      active: true,
      access_type: "all",
      permissions: ALL_ADMIN_SCREENS.map(s => s.key),
    });
    setShowPassword(false);
    setIsUserModalOpen(true);
  };

  const handleOpenEditUser = (user) => {
    setEditingUserId(user.id);
    let userPerms = ["*"];
    try {
      if (Array.isArray(user.permissions)) {
        userPerms = user.permissions;
      } else if (typeof user.permissions === "string") {
        userPerms = JSON.parse(user.permissions || '["*"]');
      }
    } catch {}

    const isAll = userPerms.includes("*") || userPerms.length === 0;

    setUserFormData({
      username: user.username || "",
      password: "",
      role: user.role || "admin",
      active: user.active !== false,
      access_type: isAll ? "all" : "custom",
      permissions: isAll ? ALL_ADMIN_SCREENS.map(s => s.key) : userPerms,
    });
    setShowPassword(false);
    setIsUserModalOpen(true);
  };

  const toggleScreenPermission = (screenKey) => {
    setUserFormData(prev => {
      const current = prev.permissions || [];
      const exists = current.includes(screenKey);
      const updated = exists 
        ? current.filter(k => k !== screenKey)
        : [...current, screenKey];
      return { ...prev, permissions: updated };
    });
  };

  const handleSelectAllScreens = () => {
    setUserFormData(prev => ({
      ...prev,
      permissions: ALL_ADMIN_SCREENS.map(s => s.key)
    }));
  };

  const handleDeselectAllScreens = () => {
    setUserFormData(prev => ({
      ...prev,
      permissions: []
    }));
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();

    // Validação com Zod
    const validation = validateSchema(adminUserSchema, {
      username: userFormData.username.trim(),
      password: userFormData.password.trim(),
      role: userFormData.role,
      active: userFormData.active,
      permissions: userFormData.access_type === "all" ? ["*"] : userFormData.permissions
    });

    if (!validation.success) {
      if (!editingUserId || validation.errors.username) {
        toast.error(validation.errorList[0] || "Dados do usuário inválidos");
        return;
      }
    }

    const finalPermissions = userFormData.access_type === "all"
      ? ["*"]
      : (userFormData.permissions.length > 0 ? userFormData.permissions : ["Dashboard"]);

    setIsSavingUser(true);
    try {
      const currentTenantId = localStorage.getItem("current_tenant_id") || tenantDetails?.id || "a0000000-0000-0000-0000-000000000001";

      if (editingUserId) {
        if (isSupabaseConfigured() && supabase) {
          const { error: rpcErr } = await supabase.rpc("update_store_admin_user", {
            p_user_id: editingUserId,
            p_username: userFormData.username.trim(),
            p_password: userFormData.password.trim() || null,
            p_role: userFormData.role,
            p_permissions: finalPermissions,
            p_active: userFormData.active,
          });
          if (rpcErr) {
            throw new Error(rpcErr.message || "Erro ao atualizar usuário");
          }
        } else {
          const updatePayload = {
            tenant_id: currentTenantId,
            username: userFormData.username.trim(),
            role: userFormData.role,
            active: userFormData.active,
            permissions: finalPermissions,
          };
          if (userFormData.password.trim()) {
            updatePayload.password = userFormData.password.trim();
          }
          await AdminUser.update(editingUserId, updatePayload);
        }
        toast.success(`Usuário "${userFormData.username}" atualizado!`);
      } else {
        if (isSupabaseConfigured() && supabase) {
          const { error: rpcErr } = await supabase.rpc("create_store_admin_user", {
            p_tenant_id: currentTenantId,
            p_username: userFormData.username.trim(),
            p_password: userFormData.password.trim(),
            p_role: userFormData.role,
            p_permissions: finalPermissions,
          });
          if (rpcErr) {
            throw new Error(rpcErr.message || "Erro ao criar usuário no Supabase Auth");
          }
        } else {
          const createPayload = {
            tenant_id: currentTenantId,
            username: userFormData.username.trim(),
            password: userFormData.password.trim(),
            role: userFormData.role,
            active: userFormData.active,
            permissions: finalPermissions,
          };
          await AdminUser.create(createPayload);
        }
        toast.success(`Usuário "${userFormData.username}" criado com sucesso no sistema!`);
      }

      await loadAdminUsers();
      setIsUserModalOpen(false);
    } catch (_err) {
      toast.error(_err?.message || "Erro ao salvar usuário. Verifique se o nome já existe.");
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDeleteUser = async (user) => {
    if (adminUsers.length <= 1) {
      toast.error("Não é possível excluir o único usuário administrador.");
      return;
    }

    if (confirm(`Excluir o usuário "${user.username}"?`)) {
      try {
        if (isSupabaseConfigured() && supabase) {
          try {
            await supabase.rpc("delete_store_admin_user", { p_user_id: user.id });
          } catch (_rpcErr) {
            console.warn("RPC delete_store_admin_user falhou:", _rpcErr);
          }
        }
        await AdminUser.delete(user.id);
        toast.success(`Usuário "${user.username}" excluído!`);
        await loadAdminUsers();
      } catch (_err) {
        toast.error("Erro ao excluir usuário.");
      }
    }
  };


  // Salvar Configurações Gerais
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const deliveryFeeNum = parseBRLToNumber(settings.delivery_fee);
      const minOrderNum = parseBRLToNumber(settings.min_order_value);
      const fallbackFeeNum = parseBRLToNumber(settings.delivery_fallback_fee);
      const freeThresholdNum = settings.free_delivery_threshold ? parseBRLToNumber(settings.free_delivery_threshold) : null;

      // Validação segura com Zod
      const validationPayload = {
        restaurant_name: settings.restaurant_name,
        restaurant_logo: settings.restaurant_logo,
        opening_time: settings.opening_time || "18:00",
        closing_time: settings.closing_time || "23:00",
        open_days: settings.open_days,
        whatsapp: settings.whatsapp,
        instagram: settings.instagram,
        address: settings.address,
        cep: settings.cep,
        address_street: settings.address_street,
        address_number: settings.address_number,
        address_neighborhood: settings.address_neighborhood,
        address_city: settings.address_city,
        address_state: settings.address_state,
        address_complement: settings.address_complement,
        delivery_fee_type: settings.delivery_fee_type || "fixed",
        delivery_fee: deliveryFeeNum,
        min_order_value: minOrderNum,
        free_delivery_threshold: freeThresholdNum,
        delivery_fallback_fee: fallbackFeeNum,
        delivery_unlisted_policy: settings.delivery_unlisted_policy || "block",
        delivery_neighborhoods: settings.delivery_neighborhoods || [],
        accepts_delivery: settings.accepts_delivery !== false,
        accepts_takeaway: settings.accepts_takeaway !== false,
        salon_mode: settings.salon_mode || "full"
      };

      const zodValidation = validateSchema(settingsSchema, validationPayload);
      if (!zodValidation.success) {
        const firstErr = zodValidation.errorList[0] || "Verifique os campos obrigatórios";
        toast.error(firstErr);
        setIsSaving(false);
        return;
      }

      const segments = window.location.pathname.split("/").filter(Boolean);
      const RESERVED = ["settings", "dashboard", "orders", "pdv", "menu", "adminlogin", "superadmin"];
      const urlSlug = segments.length > 0 && !RESERVED.includes(segments[0].toLowerCase()) ? segments[0].toLowerCase() : null;
      const currentSlug = urlSlug || localStorage.getItem("current_tenant_slug");
      const targetTenantId = settingsId || localStorage.getItem("current_tenant_id");

      const firstEnabledDay = Array.isArray(settings.open_days) ? settings.open_days.find(d => d.enabled && d.opening_time) : null;
      const opTime = settings.opening_time || firstEnabledDay?.opening_time || "18:00";
      const clTime = settings.closing_time || firstEnabledDay?.closing_time || "23:00";

      if (isSupabaseConfigured() && supabase) {
        const payloadData = {
          name: settings.restaurant_name,
          logo_url: settings.restaurant_logo || null,
          opening_time: opTime,
          closing_time: clTime,
          open_days: settings.open_days,
          address: settings.address,
          cep: settings.cep || null,
          address_street: settings.address_street || null,
          address_number: settings.address_number || null,
          address_neighborhood: settings.address_neighborhood || null,
          address_city: settings.address_city || null,
          address_state: settings.address_state || null,
          address_complement: settings.address_complement || null,
          instagram: settings.instagram,
          whatsapp: settings.whatsapp,
          delivery_fee: deliveryFeeNum,
          min_order_value: minOrderNum,
          delivery_fee_type: settings.delivery_fee_type || 'fixed',
          delivery_neighborhoods: settings.delivery_neighborhoods || [],
          delivery_unlisted_policy: settings.delivery_unlisted_policy || 'block',
          delivery_fallback_fee: fallbackFeeNum,
          free_delivery_threshold: freeThresholdNum,
          salon_mode: settings.salon_mode || 'full',
          accepts_delivery: settings.accepts_delivery !== false,
          accepts_takeaway: settings.accepts_takeaway !== false,
          payment_methods: tenantDetails?.payment_methods || null,
        };

        const resolvedId = targetTenantId || (isVruum ? "a0000000-0000-0000-0000-000000000001" : null);

        let savedTenant = null;
        if (resolvedId) {
          const { data: rpcTenant, error: rpcError } = await supabase.rpc("update_tenant_settings", {
            p_tenant_id: resolvedId,
            p_data: payloadData,
          });
          if (!rpcError && rpcTenant) {
            savedTenant = rpcTenant;
          }
        }

        if (!savedTenant) {
          let updateQuery = supabase.from("tenants").update({
            ...payloadData,
            updated_date: new Date().toISOString(),
          });

          if (resolvedId) {
            updateQuery = updateQuery.eq("id", resolvedId);
          } else if (currentSlug) {
            updateQuery = updateQuery.eq("slug", currentSlug);
          }

          const { data: updatedTenants } = await updateQuery.select();
          if (updatedTenants && updatedTenants.length > 0) {
            savedTenant = updatedTenants[0];
          }
        }

        if (savedTenant) {
          setSettingsId(savedTenant.id);
          setTenantDetails(savedTenant);
          localStorage.setItem("current_tenant_id", savedTenant.id);
          localStorage.setItem("current_tenant_slug", savedTenant.slug);
          localStorage.setItem("current_tenant_name", savedTenant.name);
        }
      }

      const isVruum = currentSlug === "vrumm" || currentSlug === "vruum-burguer" || targetTenantId === "a0000000-0000-0000-0000-000000000001";
      if (isVruum && settingsId) {
        try {
          await Settings.update(settingsId, {
            restaurant_name: settings.restaurant_name,
            restaurant_logo: settings.restaurant_logo,
            opening_time: opTime,
            closing_time: clTime,
            open_days: settings.open_days,
            address: settings.address,
            instagram: settings.instagram,
            whatsapp: settings.whatsapp,
            delivery_fee: deliveryFeeNum,
            min_order_value: minOrderNum,
          });
        } catch (_err) {
          console.warn("Sync legacy settings entity:", _err);
        }
      }

      toast.success("Configurações salvas com sucesso!");
    } catch (_error) {
      console.error("Erro ao salvar configurações:", _error);
      toast.error("Erro ao salvar configurações: " + (_error?.message || "Verifique a conexão"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 bg-gray-50 min-h-screen">
        <div className="max-w-4xl mx-auto animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-48"></div>
          <div className="h-4 bg-gray-200 rounded w-64"></div>
          <div className="bg-white p-6 rounded-2xl h-64"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 bg-stone-50/60 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
              Configurações
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 mt-1">
              Gerencie as informações da sua loja, horários, taxas de entrega e acessos.
            </p>
          </div>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm h-11 px-6 rounded-2xl shadow-md flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar Tudo</span>
              </>
            )}
          </Button>
        </div>

        {/* Barra de Abas Elegante */}
        <div className="flex items-center gap-2 border-b border-stone-200 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveTab("geral")}
            className={`flex items-center gap-2 py-3 px-4 font-bold text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "geral"
                ? "border-rose-600 text-rose-600"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Geral & Loja</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("horarios")}
            className={`flex items-center gap-2 py-3 px-4 font-bold text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "horarios"
                ? "border-rose-600 text-rose-600"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Horários de Funcionamento</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("entregas")}
            className={`flex items-center gap-2 py-3 px-4 font-bold text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "entregas"
                ? "border-rose-600 text-rose-600"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <Bike className="w-4 h-4" />
            <span>Taxas & Bairros</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pagamentos")}
            className={`flex items-center gap-2 py-3 px-4 font-bold text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "pagamentos"
                ? "border-emerald-600 text-emerald-600 bg-emerald-50/40 rounded-t-lg"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>Formas de Pagamento</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("usuarios")}
            className={`flex items-center gap-2 py-3 px-4 font-bold text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "usuarios"
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Usuários & Acessos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("assinatura")}
            className={`flex items-center gap-2 py-3 px-4 font-bold text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "assinatura"
                ? "border-rose-600 text-rose-600 bg-rose-50/40 rounded-t-lg"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <CreditCard className="w-4 h-4 text-rose-500" />
            <span>Minha Assinatura</span>
            {tenantDetails?.subscription_status === "pending" && (
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" title="Pagamento pendente" />
            )}
          </button>
        </div>

        {/* Conteúdo das Abas Gerais (com formulário) */}
        {["geral", "horarios", "entregas"].includes(activeTab) && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {activeTab === "geral" && (
              <GeneralSettingsTab
                settings={settings}
                handleInputChange={handleInputChange}
                handleAddressFieldChange={handleAddressFieldChange}
                handleCepChange={handleCepChange}
                handleLogoUpload={handleLogoUpload}
                isUploadingLogo={isUploadingLogo}
                isFetchingCep={isFetchingCep}
                cepError={cepError}
              />
            )}

            {activeTab === "horarios" && (
              <HoursTab
                settings={settings}
                handleToggleAllDays={handleToggleAllDays}
                handleToggleDay={handleToggleDay}
                handleDayTime={handleDayTime}
                handleCopyDayTimeToAll={handleCopyDayTimeToAll}
              />
            )}

            {activeTab === "entregas" && (
              <DeliveryFeesTab
                settings={settings}
                handleInputChange={handleInputChange}
                newNeighborhood={newNeighborhood}
                setNewNeighborhood={setNewNeighborhood}
                handleAddNeighborhood={handleAddNeighborhood}
                handleRemoveNeighborhood={handleRemoveNeighborhood}
                handleToggleNeighborhood={handleToggleNeighborhood}
                editingNeighborhoodId={editingNeighborhoodId}
                setEditingNeighborhoodId={setEditingNeighborhoodId}
                editingNeighborhoodFee={editingNeighborhoodFee}
                setEditingNeighborhoodFee={setEditingNeighborhoodFee}
                handleSaveInlineFee={handleSaveInlineFee}
                neighborhoodSearchTerm={neighborhoodSearchTerm}
                setNeighborhoodSearchTerm={setNeighborhoodSearchTerm}
                selectedNeighborhoodIds={selectedNeighborhoodIds}
                handleToggleSelectNeighborhood={handleToggleSelectNeighborhood}
                handleToggleSelectAllFiltered={handleToggleSelectAllFiltered}
                bulkApplyFee={bulkApplyFee}
                setBulkApplyFee={setBulkApplyFee}
                handleApplyBulkFee={handleApplyBulkFee}
                cityNeighborhoodsList={cityNeighborhoodsList}
                isFetchingCityNeighborhoods={isFetchingCityNeighborhoods}
                cityNeighborhoodsError={cityNeighborhoodsError}
                handleFetchOfficialNeighborhoods={handleFetchOfficialNeighborhoods}
                showNeighborhoodSuggestions={showNeighborhoodSuggestions}
                setShowNeighborhoodSuggestions={setShowNeighborhoodSuggestions}
                isImportModalOpen={isImportModalOpen}
                setIsImportModalOpen={setIsImportModalOpen}
                importSearchTerm={importSearchTerm}
                setImportSearchTerm={setImportSearchTerm}
                selectedNeighborhoodToImport={selectedNeighborhoodsToImport}
                handleToggleImportSelection={handleToggleImportSelection}
                handleSelectAllImport={handleSelectAllImport}
                batchFee={batchFee}
                setBatchFee={setBatchFee}
                handleBatchImportNeighborhoods={handleBatchImportNeighborhoods}
              />
            )}

            {/* Botão Inferior de Salvar */}
            <div className="flex justify-end pt-4 border-t border-stone-200">
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm h-11 px-8 rounded-2xl shadow-md flex items-center gap-2 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span>Salvando Alterações...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Salvar Configurações</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* Abas com Gestão Própria (Fora de qualquer form) */}
        {activeTab === "usuarios" && (
          <div className="space-y-6">
            <AdminUsersTab
              storeCode={tenantDetails?.code || 1}
              storeSlug={tenantDetails?.slug || localStorage.getItem("current_tenant_slug") || "vruum-burguer"}
              adminUsers={adminUsers}
              handleOpenAddUser={handleOpenAddUser}
              handleOpenEditUser={handleOpenEditUser}
              handleDeleteUser={handleDeleteUser}
              isUserModalOpen={isUserModalOpen}
              setIsUserModalOpen={setIsUserModalOpen}
              editingUserId={editingUserId}
              userFormData={userFormData}
              setUserFormData={setUserFormData}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              isSavingUser={isSavingUser}
              handleSaveUser={handleSaveUser}
              handleSelectAllScreens={handleSelectAllScreens}
              handleDeselectAllScreens={handleDeselectAllScreens}
              toggleScreenPermission={toggleScreenPermission}
            />
          </div>
        )}

        {activeTab === "pagamentos" && (
          <div className="space-y-6">
            <PaymentMethodsTab 
              tenantData={tenantDetails} 
              onUpdateTenant={(updated) => setTenantDetails((prev) => ({ ...prev, ...updated }))}
            />
          </div>
        )}

        {activeTab === "assinatura" && (
          <div className="space-y-6">
            <SubscriptionTab 
              tenantData={tenantDetails} 
              onUpdateTenant={(updated) => setTenantDetails((prev) => ({ ...prev, ...updated }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
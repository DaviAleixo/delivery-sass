import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  XCircle, 
  ShoppingBag, 
  ChevronRight, 
  Search, 
  MapPin, 
  Phone, 
  Instagram,
  Ticket
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";

import VrummProductCard from "./VrummProductCard";
import VrummPopularProductsRow from "./VrummPopularProductsRow";
import VrummRecentOrdersRow from "./VrummRecentOrdersRow";
import VrummCart from "./VrummCart";
import VrummProductDetailModal from "./VrummProductDetailModal";

import BannerCarousel from "@/components/menu/BannerCarousel";
import StoreInfoSheet from "@/components/menu/StoreInfoSheet";
import UserProfileSheet from "@/components/menu/UserProfileSheet";
import { User } from "@/entities/User";
import OrderModal from "@/components/menu/OrderModal";
import PixOnlineModal from "@/components/menu/PixOnlineModal";
import { clearCheckoutIdempotencyKey } from "@/utils/checkoutIdempotency";
import { buildCategoryVariationComplementGroup } from "@/utils/pizzaPricing";

export default function VrummMenu({
  tenant,
  tenantId,
  settings,
  resolvedInitialStoreName,
  storeIsOpen,
  isVisualOnly,
  urlMesa,
  salonMode,
  isTableOnly,
  hasTopNotice,
  activeGuestOrder,
  setActiveGuestOrder,
  banners,
  categories,
  activeCategory,
  setActiveCategory,
  popularRankedProducts,
  handleProductClick,
  recentOrders,
  products,
  addToCart,
  isSearching,
  searchQuery,
  setSearchQuery,
  activeCategoryObj,
  filteredProducts,
  cart,
  updateCartQuantity,
  handleCheckout,
  handleCartToggle,
  isCartVisible,
  setIsCartVisible,
  complementGroups,
  productComplementGroups,
  complementItems,
  additionals,
  showOrderModal,
  setShowOrderModal,
  getCartTotal,
  submitOrder,
  isSubmitting,
  pixOnlineOrder,
  setPixOnlineOrder,
  selectedProduct,
  setSelectedProduct,
  navigate,
  deliveryFeeDisplay,
  customerSavedAddress,
}) {
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    User.me().then(u => {
      if (u && u.id) setCurrentUser(u);
      else setCurrentUser(null);
    }).catch(() => setCurrentUser(null));
  }, []);

  return (
    <div className="min-h-screen bg-[#fbfbf9] text-stone-800 selection:bg-emerald-600 selection:text-white">
      {/* Header Glass Limpo e Elegante */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200/80 transition-all">
        <div className="container mx-auto px-4 sm:px-6 py-2.5 max-w-6xl">
          <div className="flex items-center justify-between">
            {/* Logo e Nome */}
            <div className="flex items-center gap-3">
              <motion.div 
                whileHover={{ scale: 1.03 }}
                className="w-10 h-10 sm:w-11 sm:h-11 flex-shrink-0 flex items-center justify-center rounded-2xl overflow-hidden bg-stone-50 border border-stone-100"
              >
                {settings?.restaurant_logo ? (
                  <img src={settings.restaurant_logo} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-sm text-stone-900 bg-stone-100">
                    {(settings?.restaurant_name || resolvedInitialStoreName).substring(0, 2).toUpperCase()}
                  </div>
                )}
              </motion.div>
              <div>
                <h1 className="text-sm sm:text-base font-bold leading-tight text-stone-900 tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {settings?.restaurant_name || resolvedInitialStoreName}
                </h1>
                {!urlMesa && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${storeIsOpen ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      <span className={`text-[11px] font-semibold tracking-wide ${storeIsOpen ? 'text-emerald-700' : 'text-red-600'}`}>
                        {storeIsOpen ? 'Aberto agora' : 'Fechado'}
                      </span>
                    </div>
                    <span className="text-stone-300 text-xs">•</span>
                    <span className="text-stone-500 text-[11px] font-medium">
                      {settings?.opening_time && settings?.closing_time ? `${settings.opening_time} - ${settings.closing_time}` : '18:00 - 23:59'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Ações Topo */}
            <div className="flex items-center gap-1.5">
              {!isVisualOnly && (
                <motion.div whileTap={{ scale: 0.9 }}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCartToggle}
                    title="Carrinho"
                    className="relative text-stone-700 hover:text-emerald-700 hover:bg-stone-100 rounded-full h-9 w-9 cursor-pointer"
                  >
                    <ShoppingBag className="w-4 h-4 text-emerald-700" />
                    {cart.reduce((total, item) => total + item.quantity, 0) > 0 && (
                      <motion.span 
                        key={cart.reduce((total, item) => total + item.quantity, 0)}
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 bg-emerald-700 text-white text-[10px] font-bold rounded-full w-4 h-4 min-w-4 min-h-4 flex items-center justify-center shadow-xs leading-none"
                      >
                        {cart.reduce((total, item) => total + item.quantity, 0)}
                      </motion.span>
                    )}
                  </Button>
                </motion.div>
              )}
              <StoreInfoSheet settings={settings} />
              <UserProfileSheet open={isUserProfileOpen} onOpenChange={setIsUserProfileOpen} />
            </div>
          </div>
        </div>
      </header>

      {/* Banner de Mesa Conectada via QR Code */}
      {!isVisualOnly && urlMesa && (
        <div className="pt-20 container mx-auto px-4 max-w-6xl">
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🍽️</span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Atendimento no Salão</p>
                <p className="text-sm font-bold text-stone-900">Você está na Mesa {urlMesa}</p>
              </div>
            </div>
            <span className="text-[11px] bg-white border border-emerald-200 text-emerald-800 px-3 py-1 rounded-xl font-bold shadow-xs">
              QR Code Ativo
            </span>
          </div>
        </div>
      )}

      {/* Banner de Salão quando loja é mesa-only mas cliente abriu sem QR Code da mesa */}
      {!isVisualOnly && isTableOnly && !urlMesa && (
        <div className="pt-20 container mx-auto px-4 max-w-6xl">
          <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🍽️</span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-blue-800">Autoatendimento nas Mesas</p>
                <p className="text-xs sm:text-sm font-medium text-stone-700">Aponte a câmera para o QR Code da sua mesa para enviar seu pedido direto para a cozinha</p>
              </div>
            </div>
            <span className="text-[11px] bg-white border border-blue-200 text-blue-800 px-3 py-1 rounded-xl font-bold whitespace-nowrap shadow-xs">
              Salão & Mesas
            </span>
          </div>
        </div>
      )}

      {/* Card "Meus Pedidos" Ativo */}
      {!isVisualOnly && !urlMesa && activeGuestOrder && activeGuestOrder.order_type !== 'dine_in' && !activeGuestOrder.table_number && (
        <div className={`${hasTopNotice ? 'pt-3' : 'pt-20'} mb-3 sm:mb-3.5 container mx-auto px-4 max-w-6xl`}>
          <Link to={`${createPageUrl("MyOrders")}?id=${activeGuestOrder.id}`} className="block group">
            <motion.div 
              initial={{ opacity: 0, y: -8 }} 
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-3 sm:p-3.5 border border-stone-200/90 shadow-xs hover:border-emerald-300 hover:shadow-sm transition-all flex items-center justify-between gap-3 cursor-pointer select-none"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100 group-hover:scale-105 transition-transform">
                  <Ticket className="w-5 h-5 text-emerald-700" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-stone-900 group-hover:text-emerald-700 transition-colors">
                    Meus pedidos
                  </h3>
                  <p className="text-xs text-stone-500 font-medium truncate mt-0.5">
                    Acompanhe o status do seu pedido
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  1 ativo
                </span>
                <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-600 group-hover:translate-x-0.5 transition-all" />
              </div>
            </motion.div>
          </Link>
        </div>
      )}

      {!storeIsOpen && (
        <div className={`${activeGuestOrder || hasTopNotice ? 'pt-3' : 'pt-20'} container mx-auto px-4 max-w-6xl`}>
          <div className="rounded-2xl border p-4 bg-red-50 border-red-200 text-red-900 flex items-start gap-3 shadow-xs">
            <XCircle className="h-5 w-5 mt-0.5 text-red-500 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm text-stone-900">Restaurante Fechado no Momento</p>
              <p className="text-xs mt-0.5 text-stone-600">
                Horário de funcionamento: {settings?.opening_time || '18:00'} às {settings?.closing_time || '23:59'}. Você pode explorar o cardápio e montar seu pedido à vontade!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Banner Superior de Cashback */}
      {!isVisualOnly && Boolean(settings?.cashback_enabled ?? tenant?.cashback_enabled) && Number(settings?.cashback_rate ?? tenant?.cashback_rate ?? 5) > 0 && (
        <div className={`${!activeGuestOrder && !hasTopNotice && storeIsOpen ? "pt-[68px]" : "pt-3"} container mx-auto px-4 max-w-6xl`}>
          <div 
            onClick={() => setIsUserProfileOpen(true)}
            className="bg-white border border-stone-200 hover:border-emerald-500/40 rounded-2xl p-3.5 sm:p-4 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-xs hover:shadow-sm"
          >
            <div className="flex-1 min-w-0 pr-1">
              <h3 
                className="font-bold text-sm sm:text-base text-emerald-800 tracking-tight leading-tight"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {currentUser 
                  ? `Cashback de ${Number(settings.cashback_rate)}% ativado` 
                  : `Cashback de ${Number(settings.cashback_rate)}% disponível`}
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 mt-0.5 leading-snug font-normal">
                {currentUser 
                  ? `Faça um pedido e ganhe ${Number(settings.cashback_rate)}% do valor de volta para usar nas próximas compras.` 
                  : `Crie sua conta para ganhar ${Number(settings.cashback_rate)}% do valor de volta e usar nas próximas compras.`}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-emerald-700 shrink-0" />
          </div>
        </div>
      )}

      {/* Banners Carrossel */}
      {banners && banners.length > 0 ? (
        <div className={!activeGuestOrder && !hasTopNotice && storeIsOpen ? "pt-[60px]" : "pt-2"}>
          <BannerCarousel banners={banners} />
        </div>
      ) : (
        !activeGuestOrder && !hasTopNotice && storeIsOpen && <div className="h-[60px]" />
      )}

      {/* Barra de Categorias Pills */}
      <div className="sticky top-[58px] z-30 bg-[#fbfbf9]/95 backdrop-blur-md border-b border-stone-200/80 py-2.5">
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
                  className={`relative whitespace-nowrap flex-shrink-0 px-4 py-2 rounded-2xl text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
                    isActive 
                      ? 'text-white bg-emerald-700 shadow-xs' 
                      : 'text-stone-600 hover:text-stone-900 bg-white border border-stone-200/90 hover:bg-stone-50'
                  }`}
                >
                  <span className="relative z-10">{category.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Seção Principal do Cardápio */}
      <main className="container mx-auto px-4 sm:px-6 pb-32 pt-5 max-w-6xl space-y-8">
        {/* Card de Frete Dinâmico */}
        {!isVisualOnly && !urlMesa && !searchQuery.trim() && deliveryFeeDisplay && (
          <div 
            onClick={() => setIsUserProfileOpen(true)}
            className="bg-white border border-stone-200 hover:border-emerald-500/40 rounded-2xl p-3.5 sm:p-4 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-xs hover:shadow-sm"
          >
            <div className="flex-1 min-w-0 pr-1">
              <h3 
                className="font-bold text-sm sm:text-base text-emerald-800 tracking-tight leading-tight"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {deliveryFeeDisplay.title}
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 mt-0.5 leading-snug font-normal">
                {deliveryFeeDisplay.subtitle}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-emerald-700 shrink-0" />
          </div>
        )}

        {/* Carrossel dos Mais Pedidos */}
        {!searchQuery.trim() && (
          <VrummPopularProductsRow
            products={popularRankedProducts}
            onProductClick={handleProductClick}
            isStoreOpen={storeIsOpen}
            isVisualOnly={isVisualOnly}
          />
        )}

        {/* Carrossel dos Últimos Pedidos */}
        {!isVisualOnly && !searchQuery.trim() && recentOrders.length > 0 && (
          <VrummRecentOrdersRow
            orders={recentOrders}
            products={products}
            onAddToCart={addToCart}
            isStoreOpen={storeIsOpen}
          />
        )}

        {/* Cabeçalho da Categoria com Barra de Busca Global */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-3 border-b border-stone-200/80 pt-1">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-emerald-700 uppercase">
              <span>{isSearching ? "BUSCA NO CARDÁPIO" : "NOSSO CARDÁPIO"}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-stone-900 mt-0.5 tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {isSearching ? `Resultados para "${searchQuery}"` : (activeCategoryObj?.name || "Todos os Produtos")}
            </h2>
            <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
              {isSearching 
                ? `${filteredProducts.length} ${filteredProducts.length === 1 ? 'produto encontrado' : 'produtos encontrados'}`
                : (activeCategoryObj?.description || "Feitos artesanalmente com ingredientes selecionados e muito sabor.")
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
              placeholder="Buscar itens, bebidas, lanches..."
              className="w-full bg-white border border-stone-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 rounded-2xl pl-10 pr-9 py-2 text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 outline-none transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-1 rounded-full text-xs font-bold cursor-pointer"
                aria-label="Limpar busca"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Grid de Produtos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          <AnimatePresence>
            {filteredProducts.map((product, idx) => {
              const matchedCat = (categories || []).find(
                c => c.id === product.category_id || c.id === product.category || (product.category && c.name?.toLowerCase() === String(product.category).toLowerCase())
              );
              const categorySizes = Array.isArray(matchedCat?.sizes) ? matchedCat.sizes : (Array.isArray(activeCategoryObj?.sizes) ? activeCategoryObj.sizes : []);

              return (
                <VrummProductCard
                  key={product.id}
                  product={product}
                  categorySizes={categorySizes}
                  onProductClick={handleProductClick}
                  isStoreOpen={storeIsOpen}
                  isPopular={idx === 0}
                  isVisualOnly={isVisualOnly}
                  cashbackRate={settings?.cashback_enabled ? Number(settings?.cashback_rate || 0) : 0}
                />
              );
            })}
          </AnimatePresence>
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-14 bg-white rounded-3xl border border-stone-200/80 p-8 space-y-2.5 shadow-xs">
            <div className="text-4xl">🍽️</div>
            <h3 className="text-base font-bold text-stone-900">Nenhum produto encontrado</h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              {searchQuery ? `Não encontramos itens para "${searchQuery}". Tente outro termo.` : "Não há produtos disponíveis nesta categoria no momento."}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 border border-emerald-200 px-4 py-1.5 rounded-full transition-colors cursor-pointer"
              >
                Limpar busca
              </button>
            )}
          </div>
        )}
      </main>

      {/* Rodapé Institucional Clean */}
      <footer className="bg-white border-t border-stone-200/80 py-10 px-4">
        <div className="container mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-4 space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-2xl overflow-hidden bg-stone-50 border border-stone-100">
                {settings?.restaurant_logo ? (
                  <img src={settings.restaurant_logo} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-sm text-stone-900 bg-stone-100">
                    {(settings?.restaurant_name || resolvedInitialStoreName).substring(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <h4 className="font-bold text-sm sm:text-base text-stone-900 tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {settings?.restaurant_name || resolvedInitialStoreName}
              </h4>
            </div>
            <p className="text-xs text-stone-500 leading-relaxed max-w-xs font-normal">
              Os melhores produtos preparados com ingredientes selecionados e entrega rápida para você.
            </p>
          </div>

          <div className="md:col-span-4 space-y-2 text-xs text-stone-600">
            <p className="font-bold uppercase tracking-wider text-stone-400 text-[10px]">Localização & Contato</p>
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
              <span>{settings?.address || "Endereço não informado"}</span>
            </div>
            {settings?.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                <span>{settings.phone}</span>
              </div>
            )}
            {settings?.whatsapp && (
              <a
                href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-emerald-700 hover:text-emerald-800 transition-colors font-medium"
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
                className="flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors"
              >
                <Instagram className="w-3.5 h-3.5 text-pink-600 flex-shrink-0" />
                <span>{settings.instagram}</span>
              </a>
            )}
          </div>

          <div className="md:col-span-4 space-y-2 text-xs text-stone-600">
            <p className="font-bold uppercase tracking-wider text-stone-400 text-[10px]">Horário de Funcionamento</p>
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

        <div className="container mx-auto max-w-6xl pt-6 mt-6 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-center gap-4 text-xs text-stone-400">
          <p>© {new Date().getFullYear()} {settings?.restaurant_name || resolvedInitialStoreName}. Todos os direitos reservados.</p>
        </div>
      </footer>

      {/* Carrinho flutuante */}
      {!isVisualOnly && (
        <AnimatePresence>
          <VrummCart
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
        tenantId={tenantId || tenant?.id || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001"}
        initialTableNumber={urlMesa || ""}
        onSubmit={submitOrder}
        isSubmitting={isSubmitting}
        isVrumm={false}
      />

      {pixOnlineOrder && (
        <PixOnlineModal
          isOpen={Boolean(pixOnlineOrder)}
          onClose={() => {
            setPixOnlineOrder(null);
            setShowOrderModal(true);
          }}
          order={pixOnlineOrder}
          accessToken={tenant?.payment_methods?.mp_access_token}
          tenant={tenant}
          onPaymentApproved={(paidOrder) => {
            clearCheckoutIdempotencyKey(tenantId || tenant?.id || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001");
            setPixOnlineOrder(null);
            updateCartQuantity(0, 0); // clear cart
            const tq = paidOrder.tracking_token ? `&token=${paidOrder.tracking_token}` : "";
            navigate(`${createPageUrl("MyOrders")}?id=${paidOrder.id}${tq}`);
          }}
          onPaymentConvertedToDelivery={(convertedOrder) => {
            clearCheckoutIdempotencyKey(tenantId || tenant?.id || localStorage.getItem("current_tenant_id") || "a0000000-0000-0000-0000-000000000001");
            setPixOnlineOrder(null);
            const tq = convertedOrder.tracking_token ? `&token=${convertedOrder.tracking_token}` : "";
            navigate(`${createPageUrl("MyOrders")}?id=${convertedOrder.id}${tq}`);
          }}
        />
      )}
      
      {selectedProduct && (
        <VrummProductDetailModal
          product={selectedProduct}
          complementGroups={(() => {
            const matchedCategory = (categories || []).find(
              c =>
                c.id === selectedProduct.category_id ||
                c.id === selectedProduct.category ||
                (selectedProduct.category &&
                  typeof selectedProduct.category === "string" &&
                  c.name?.toLowerCase() === selectedProduct.category.toLowerCase())
            );
            const virtualVariationGroup = buildCategoryVariationComplementGroup(
              selectedProduct,
              matchedCategory
            );

            const linkedGroupIds = productComplementGroups
              .filter(pcg => pcg.product_id === selectedProduct.id)
              .map(pcg => pcg.group_id);

            const dbGroups = complementGroups
              .filter(g => g.active && linkedGroupIds.includes(g.id))
              .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
              .map(g => ({
                ...g,
                items: complementItems
                  .filter(i => i.group_id === g.id && i.active)
                  .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
              }));

            return virtualVariationGroup ? [virtualVariationGroup, ...dbGroups] : dbGroups;
          })()}
          additionals={additionals.filter(a => a.product_id === selectedProduct.id)}
          isOpen={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={addToCart}
          isVisualOnly={isVisualOnly}
        />
      )}
    </div>
  );
}

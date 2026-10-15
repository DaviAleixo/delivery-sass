import React from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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
import OrderModal from "@/components/menu/OrderModal";
import PixOnlineModal from "@/components/menu/PixOnlineModal";

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
  comboCategory,
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
}) {
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
                    {(settings?.restaurant_name || resolvedInitialStoreName).substring(0, 2).toUpperCase()}
                  </div>
                )}
              </motion.div>
              <div>
                <h1 className="text-base sm:text-lg font-black leading-tight text-white tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {settings?.restaurant_name || resolvedInitialStoreName}
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
              {!isVisualOnly && (
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
              )}
              <StoreInfoSheet settings={settings} dark />
              <UserProfileSheet dark />
            </div>
          </div>
        </div>
      </header>

      {/* Banner de Mesa Conectada via QR Code */}
      {!isVisualOnly && urlMesa && (
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

      {/* Banner de Salão quando loja é mesa-only mas cliente abriu sem QR Code da mesa */}
      {!isVisualOnly && isTableOnly && !urlMesa && (
        <div className="pt-20 container mx-auto px-4 max-w-6xl">
          <div className="bg-gradient-to-r from-blue-950/80 via-[#10141c] to-blue-950/80 border border-blue-500/40 text-blue-200 rounded-2xl p-3.5 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🍽️</span>
              <div>
                <p className="text-[11px] font-black uppercase text-blue-300">Autoatendimento nas Mesas</p>
                <p className="text-xs sm:text-sm font-semibold text-stone-200">Aponte a câmera para o QR Code da sua mesa para enviar seu pedido direto para a cozinha</p>
              </div>
            </div>
            <span className="text-[11px] bg-blue-900/80 border border-blue-400/40 text-blue-200 px-3 py-1 rounded-xl font-bold whitespace-nowrap">
              Salão & Mesas
            </span>
          </div>
        </div>
      )}

      {/* Banner de Pedido em Andamento */}
      {!isVisualOnly && activeGuestOrder && (
        <div className={`${hasTopNotice ? 'pt-3' : 'pt-20'} container mx-auto px-4 max-w-6xl`}>
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
        <div className={`${activeGuestOrder || hasTopNotice ? 'pt-3' : 'pt-20'} container mx-auto px-4 max-w-6xl`}>
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
        <div className={!activeGuestOrder && !hasTopNotice && storeIsOpen ? "pt-[60px]" : "pt-2"}>
          <BannerCarousel banners={banners} />
        </div>
      ) : (
        !activeGuestOrder && !hasTopNotice && storeIsOpen && <div className="h-[60px]" />
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
                      layoutId="vrummActiveCategoryPill"
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
              <VrummProductCard
                key={product.id}
                product={product}
                onProductClick={handleProductClick}
                isStoreOpen={storeIsOpen}
                isPopular={idx === 0}
                isVisualOnly={isVisualOnly}
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
                    {(settings?.restaurant_name || resolvedInitialStoreName).substring(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <h4 className="font-black text-base text-white tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {settings?.restaurant_name || resolvedInitialStoreName}
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
          <p>© {new Date().getFullYear()} {settings?.restaurant_name || resolvedInitialStoreName}. Todos os direitos reservados.</p>
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
        initialTableNumber={urlMesa || ""}
        onSubmit={submitOrder}
        isSubmitting={isSubmitting}
        isVrumm={true}
      />

      {pixOnlineOrder && (
        <PixOnlineModal
          isOpen={Boolean(pixOnlineOrder)}
          onClose={async () => {
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
            updateCartQuantity(0, 0); // clear cart
            navigate(`${createPageUrl("MyOrders")}?id=${paidOrder.id}`);
          }}
          onPaymentConvertedToDelivery={(convertedOrder) => {
            setPixOnlineOrder(null);
            navigate(`${createPageUrl("MyOrders")}?id=${convertedOrder.id}`);
          }}
        />
      )}
      
      {selectedProduct && (
        <VrummProductDetailModal
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
    </div>
  );
}

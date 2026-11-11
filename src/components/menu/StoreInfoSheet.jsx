import { isStoreOpen } from '@/utils/storeStatus';
import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Info, MapPin, Phone, Instagram, User, ChevronRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import UserProfileSheet from "./UserProfileSheet";

export default function StoreInfoSheet({ settings, dark = false, trigger }) {
  if (!settings) return null;
  const isOpen = isStoreOpen(settings);

  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger || (
          <Button 
            variant="ghost" 
            size="icon" 
            className={`rounded-full h-9 w-9 cursor-pointer transition-colors ${
              dark 
                ? "text-stone-300 hover:text-white hover:bg-stone-800/80" 
                : "text-[#171717] hover:text-[#047857] hover:bg-[#D1E9DF]/40"
            }`}
            title="Informações da Loja"
          >
            <Info className="w-4 h-4" />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className={`overflow-y-auto p-4 sm:p-6 scrollbar-hide w-full max-w-full sm:max-w-md ${
        dark 
          ? "bg-[#14100e] text-stone-100 border-l border-stone-800" 
          : "bg-white text-[#171717] border-l border-[#E5EAE7]"
      }`}>
        <SheetHeader className={`pb-4 border-b ${dark ? "border-stone-800" : "border-[#E5EAE7]"}`}>
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
              {settings?.restaurant_logo ? (
                <img 
                  src={settings.restaurant_logo} 
                  alt={settings.restaurant_name || "Logo"} 
                  className="w-full h-full object-contain" 
                />
              ) : (
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm border ${
                  dark ? "bg-stone-900 border-stone-800 text-white" : "bg-[#F7F9F8] border-[#E5EAE7] text-[#171717]"
                }`}>
                  {(settings?.restaurant_name || "R").substring(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <SheetTitle 
                className={`text-lg sm:text-xl font-black ${dark ? "text-white" : "text-[#171717]"}`}
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {settings.restaurant_name || "Restaurante"}
              </SheetTitle>
              <p className={`text-xs ${dark ? "text-stone-400" : "text-stone-500"}`}>Informações & Atendimento</p>
            </div>
          </div>
        </SheetHeader>

        <div className="py-6 space-y-6">
          <div className="space-y-3.5">
            <div className={`flex items-start gap-3.5 p-3.5 rounded-2xl border ${
              dark ? "bg-stone-900/80 border-stone-800" : "bg-[#F7F9F8] border-[#E5EAE7]"
            }`}>
              <div className={`w-9 h-9 border rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                isOpen 
                  ? (dark ? "bg-stone-950 border-emerald-900 text-emerald-400" : "bg-white border-emerald-200 text-emerald-600")
                  : (dark ? "bg-stone-950 border-rose-900 text-rose-400" : "bg-white border-rose-200 text-rose-600")
              }`}>
                <span className={`w-2.5 h-2.5 rounded-full ${isOpen ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
              </div>
              <div>
                <p className={`text-xs font-black uppercase tracking-wider ${dark ? "text-stone-400" : "text-stone-500"}`}>Status da Loja</p>
                <p className={`text-sm font-bold mt-0.5 ${isOpen ? "text-emerald-700" : "text-rose-600"}`}>
                  {isOpen ? "Aberto no momento" : "Fechado no momento"}
                </p>
              </div>
            </div>

            <div className={`flex items-start gap-3.5 p-3.5 rounded-2xl border ${
              dark ? "bg-stone-900/80 border-stone-800" : "bg-[#F7F9F8] border-[#E5EAE7]"
            }`}>
              <div className={`w-9 h-9 border rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                dark ? "bg-stone-950 border-stone-800 text-red-400" : "bg-white border-[#E5EAE7] text-[#047857]"
              }`}>
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <p className={`text-xs font-black uppercase tracking-wider ${dark ? "text-stone-400" : "text-stone-500"}`}>Endereço</p>
                <p className={`text-sm font-bold mt-0.5 ${dark ? "text-white" : "text-[#171717]"}`}>{settings.address || "Consulte nosso endereço"}</p>
              </div>
            </div>

            {settings.whatsapp && (
              <div className={`flex items-start gap-3.5 p-3.5 rounded-2xl border ${
                dark ? "bg-stone-900/80 border-stone-800" : "bg-[#F7F9F8] border-[#E5EAE7]"
              }`}>
                <div className={`w-9 h-9 border rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  dark ? "bg-stone-950 border-stone-800 text-emerald-400" : "bg-white border-[#E5EAE7] text-[#047857]"
                }`}>
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <p className={`text-xs font-black uppercase tracking-wider ${dark ? "text-stone-400" : "text-stone-500"}`}>WhatsApp Oficial</p>
                  <a 
                    href={`https://wa.me/55${settings.whatsapp?.replace(/\D/g, '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={`text-sm font-bold transition-colors inline-block mt-0.5 ${
                      dark ? "text-emerald-400 hover:text-emerald-300" : "text-[#047857] hover:text-[#036348]"
                    }`}
                  >
                    {settings.whatsapp}
                  </a>
                </div>
              </div>
            )}
          </div>

          <Separator className={dark ? "bg-stone-800" : "bg-[#E5EAE7]"} />

          <div>
            <h4 className={`text-xs font-black uppercase tracking-wider mb-3 ${dark ? "text-stone-400" : "text-stone-500"}`}>Redes Sociais</h4>
            <div className="space-y-2">
              {settings.instagram && (
                <a 
                  href={`https://instagram.com/${settings.instagram.replace('@', '')}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                    dark 
                      ? "bg-stone-900/70 hover:bg-stone-800/80 border-stone-800 text-stone-200 hover:text-white" 
                      : "bg-[#F7F9F8] hover:bg-white border-[#E5EAE7] text-[#171717]"
                  }`}
                >
                  <Instagram className="w-4 h-4 text-pink-500" />
                  <span className="text-xs sm:text-sm font-bold">{settings.instagram}</span>
                </a>
              )}
            </div>
          </div>

          <Separator className={dark ? "bg-stone-800" : "bg-[#E5EAE7]"} />

          <div>
            <h4 className={`text-xs font-black uppercase tracking-wider mb-2.5 ${dark ? "text-stone-400" : "text-stone-500"}`}>Minha Conta</h4>
            <UserProfileSheet 
              dark={dark} 
              trigger={
                <Button 
                  variant="outline" 
                  className={`w-full justify-between h-12 rounded-2xl font-bold text-xs sm:text-sm cursor-pointer transition-colors ${
                    dark 
                      ? "bg-stone-900 border-stone-800 text-stone-200 hover:bg-stone-800 hover:text-white" 
                      : "bg-[#F7F9F8] border-[#E5EAE7] text-[#171717] hover:bg-white hover:border-[#047857] hover:text-[#047857]"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <User className="w-4 h-4 text-[#047857]" />
                    <span>Meu Perfil, Endereços & Cupons</span>
                  </span>
                  <ChevronRight className="w-4 h-4 opacity-50" />
                </Button>
              } 
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
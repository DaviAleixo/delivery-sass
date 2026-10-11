import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Info, Clock, MapPin, Phone, Instagram } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function StoreInfoSheet({ settings }) {
  if (!settings) return null;

  const getOpeningHoursText = () => {
    if (settings.opening_time && settings.closing_time) {
      return `Das ${settings.opening_time} às ${settings.closing_time}`;
    }
    return "Horário não informado";
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-stone-300 hover:text-white hover:bg-stone-800/80 rounded-full h-9 w-9 cursor-pointer transition-colors"
          title="Informações da Loja"
        >
          <Info className="w-4 h-4 text-stone-300" />
        </Button>
      </SheetTrigger>
      <SheetContent className="bg-[#14100e] text-stone-100 border-l border-stone-800 p-6 scrollbar-hide">
        <SheetHeader className="pb-4 border-b border-stone-800">
          <div className="flex items-center gap-3.5">
            {/* Foto Real da Loja */}
            <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
              {settings?.restaurant_logo ? (
                <img 
                  src={settings.restaurant_logo} 
                  alt={settings.restaurant_name || "Logo"} 
                  className="w-full h-full object-contain" 
                />
              ) : (
                <span className="text-2xl">🛵</span>
              )}
            </div>
            <div>
              <SheetTitle 
                className="text-lg sm:text-xl font-black text-white"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {settings.restaurant_name || "Delivery 1.0"}
              </SheetTitle>
              <p className="text-xs text-stone-400">Informações & Atendimento</p>
            </div>
          </div>
        </SheetHeader>

        <div className="py-6 space-y-6">
          <div className="space-y-3.5">
            <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-stone-900/80 border border-stone-800">
              <div className="w-9 h-9 bg-stone-950 border border-stone-800 rounded-xl flex items-center justify-center flex-shrink-0 text-red-400 mt-0.5">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-black uppercase text-stone-400 tracking-wider">Funcionamento</p>
                <p className="text-sm font-bold text-white mt-0.5">{getOpeningHoursText()}</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-stone-900/80 border border-stone-800">
              <div className="w-9 h-9 bg-stone-950 border border-stone-800 rounded-xl flex items-center justify-center flex-shrink-0 text-red-400 mt-0.5">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-black uppercase text-stone-400 tracking-wider">Endereço</p>
                <p className="text-sm font-bold text-white mt-0.5">{settings.address || "Consulte nosso endereço"}</p>
              </div>
            </div>

            {settings.whatsapp && (
              <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-stone-900/80 border border-stone-800">
                <div className="w-9 h-9 bg-stone-950 border border-stone-800 rounded-xl flex items-center justify-center flex-shrink-0 text-emerald-400 mt-0.5">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase text-stone-400 tracking-wider">WhatsApp Oficial</p>
                  <a 
                    href={`https://wa.me/55${settings.whatsapp?.replace(/\D/g, '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-emerald-400 hover:text-emerald-300 transition-colors inline-block mt-0.5"
                  >
                    {settings.whatsapp}
                  </a>
                </div>
              </div>
            )}
          </div>

          <Separator className="bg-stone-800" />

          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-stone-400 mb-3">Redes Sociais</h4>
            <div className="space-y-2">
              {settings.instagram && (
                <a 
                  href={`https://instagram.com/${settings.instagram.replace('@', '')}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex items-center gap-3 p-3 rounded-2xl bg-stone-900/70 hover:bg-stone-800/80 border border-stone-800 text-stone-200 hover:text-white transition-all"
                >
                  <Instagram className="w-4 h-4 text-pink-400" />
                  <span className="text-xs sm:text-sm font-bold">{settings.instagram}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
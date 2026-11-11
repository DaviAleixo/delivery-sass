import React, { useState, useEffect } from "react";
import { Instagram, Phone } from "lucide-react";
import { Settings } from "@/entities/Settings";

export default function Footer() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settingsData = await Settings.list();
      if (settingsData.length > 0) {
        setSettings(settingsData[0]);
      }
    } catch (_error) {
      console.log("Error loading settings");
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-white py-8 mt-12">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-6">
          {/* Coluna 1 - Sobre */}
          <div>
            <h3 className="font-bold text-lg mb-3">
              {settings?.restaurant_name || "Restaurante"}
            </h3>
            <p className="text-gray-400 text-sm">
              {settings?.address || "Endereço não informado"}
            </p>
          </div>

          {/* Coluna 2 - Contato */}
          <div>
            <h3 className="font-bold text-lg mb-3">Contato</h3>
            <div className="space-y-2">
              {settings?.phone && (
                <a
                  href={`https://wa.me/${settings.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
                >
                  <Phone className="w-4 h-4" />
                  {settings.phone}
                </a>
              )}
              {settings?.instagram && (
                <a
                  href={`https://instagram.com/${settings.instagram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
                >
                  <Instagram className="w-4 h-4" />
                  {settings.instagram}
                </a>
              )}
            </div>
          </div>

          {/* Coluna 3 - Horário */}
          <div>
            <h3 className="font-bold text-lg mb-3">Horário de Funcionamento</h3>
            <p className="text-gray-400 text-sm">
              {settings?.opening_time && settings?.closing_time
                ? `${settings.opening_time} - ${settings.closing_time}`
                : "Consulte nosso horário"}
            </p>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-6 mt-6">
          <div className="flex flex-col md:flex-row justify-center items-center gap-4 text-sm text-gray-400">
            <p>
              © {currentYear} {settings?.restaurant_name || "Restaurante"}. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
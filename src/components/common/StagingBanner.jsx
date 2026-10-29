import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Indicador visual de ambiente de Homologação / Staging.
 * Só é exibido se VITE_APP_ENV === 'staging' ou se o hostname contiver 'staging'.
 * Garante que lojistas e desenvolvedores saibam exatamente quando estão em ambiente de testes.
 */
export default function StagingBanner() {
  const [minimized, setMinimized] = useState(false);

  const isStagingEnv = 
    import.meta.env.VITE_APP_ENV === 'staging' ||
    (typeof window !== 'undefined' && window.location.hostname.includes('staging'));

  if (!isStagingEnv) return null;

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        title="Ambiente de Homologação / Testes"
        className="fixed bottom-3 right-3 z-50 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1.5 transition-all opacity-80 hover:opacity-100"
      >
        <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
        STAGING
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 right-3 z-50 bg-amber-500/95 backdrop-blur-sm text-amber-950 border border-amber-300 shadow-xl rounded-xl px-3.5 py-2 text-xs flex items-center gap-2 max-w-xs transition-all">
      <AlertTriangle className="w-4 h-4 text-amber-900 shrink-0" />
      <div className="flex-1 leading-tight">
        <strong className="block text-amber-950 font-bold uppercase tracking-wider text-[10px]">
          Ambiente de Homologação
        </strong>
        <span className="text-[11px] text-amber-900">
          Testes ativos. Não afeta lojas em produção.
        </span>
      </div>
      <button 
        onClick={() => setMinimized(true)}
        className="p-1 hover:bg-amber-600/20 rounded-md text-amber-950 transition-colors"
        title="Minimizar badge"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}


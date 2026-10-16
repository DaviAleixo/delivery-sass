import React from "react";

export default function EmptyOrdersIllustration({ className = "w-72 sm:w-80 h-44 sm:h-48" }) {
  return (
    <div className={`relative mx-auto flex items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 380 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-xs"
      >
        <defs>
          {/* Sombra difusa de chão */}
          <radialGradient id="boxGroundShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0F172A" stopOpacity="0.16" />
            <stop offset="50%" stopColor="#0F172A" stopOpacity="0.08" />
            <stop offset="85%" stopColor="#0F172A" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#0F172A" stopOpacity="0" />
          </radialGradient>

          {/* Gradientes da Caixa de Papelão */}
          <linearGradient id="boxFaceLeft" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#D9A675" />
            <stop offset="100%" stopColor="#BF8B56" />
          </linearGradient>

          <linearGradient id="boxFaceRight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#B37C4A" />
            <stop offset="100%" stopColor="#9E6837" />
          </linearGradient>

          <linearGradient id="boxInsideLeft" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8A5227" />
            <stop offset="100%" stopColor="#713F1A" />
          </linearGradient>

          <linearGradient id="boxInsideRight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#713F1A" />
            <stop offset="100%" stopColor="#552E10" />
          </linearGradient>

          <linearGradient id="flapBackLeft" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E9B98A" />
            <stop offset="100%" stopColor="#CCA06E" />
          </linearGradient>

          <linearGradient id="flapBackRight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#CCA06E" />
            <stop offset="100%" stopColor="#B1804E" />
          </linearGradient>

          <linearGradient id="flapFrontLeft" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E9B98A" />
            <stop offset="100%" stopColor="#CCA06E" />
          </linearGradient>

          <linearGradient id="flapFrontRight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#CCA06E" />
            <stop offset="100%" stopColor="#B1804E" />
          </linearGradient>

          {/* Sombra dos cards flutuantes */}
          <filter id="ticketShadow" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0F172A" floodOpacity="0.09" />
          </filter>
        </defs>

        {/* 1. Sombra suave no chão */}
        <ellipse cx="190" cy="208" rx="100" ry="20" fill="url(#boxGroundShadow)" />

        {/* 2. Cards translúcidos no plano de fundo */}
        <g opacity="0.55">
          <rect x="68" y="100" width="54" height="34" rx="6" fill="#F1F5F9" transform="rotate(-14 68 100)" />
          <rect x="254" y="112" width="54" height="34" rx="6" fill="#F1F5F9" transform="rotate(12 254 112)" />
        </g>

        {/* 3. Caixa de Papelão Aberta (3D Isométrica) */}
        <g id="boxGroup">
          {/* Aba Traseira Esquerda (aberta p/ cima) */}
          <path d="M142 120 L190 94 L173 66 L120 90 Z" fill="url(#flapBackLeft)" />

          {/* Aba Traseira Direita (aberta p/ cima) */}
          <path d="M190 94 L238 120 L260 96 L207 66 Z" fill="url(#flapBackRight)" />

          {/* Interior da Caixa */}
          <path d="M142 120 L190 94 L190 148 L142 120 Z" fill="url(#boxInsideLeft)" />
          <path d="M190 94 L238 120 L190 148 Z" fill="url(#boxInsideRight)" />

          {/* Parede Frontal Esquerda */}
          <path d="M142 120 L190 148 L190 200 L142 172 Z" fill="url(#boxFaceLeft)" />

          {/* Parede Frontal Direita */}
          <path d="M190 148 L238 120 L238 172 L190 200 Z" fill="url(#boxFaceRight)" />

          {/* Aba Frontal Esquerda (caída p/ baixo) */}
          <path d="M142 120 L190 148 L179 176 L127 145 Z" fill="url(#flapFrontLeft)" />

          {/* Aba Frontal Direita (caída p/ baixo) */}
          <path d="M190 148 L238 120 L251 145 L199 176 Z" fill="url(#flapFrontRight)" />

          {/* Linha de vinco central sutil */}
          <line x1="190" y1="148" x2="190" y2="200" stroke="#8A5227" strokeWidth="1" opacity="0.35" />
        </g>

        {/* 4. Faíscas / Raios Verdes Acima da Caixa */}
        <g id="greenRays">
          <path d="M175 58 L169 47" stroke="#10B981" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M190 52 L190 39" stroke="#10B981" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M205 58 L211 47" stroke="#10B981" strokeWidth="2.8" strokeLinecap="round" />
        </g>

        {/* 5. Card Flutuante Esquerdo (Relógio Verde com Barra e Linhas) */}
        <g transform="translate(86, 44) rotate(-7)" filter="url(#ticketShadow)">
          {/* Base do Card */}
          <rect x="0" y="0" width="96" height="54" rx="8" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
          {/* Círculo do Relógio */}
          <circle cx="21" cy="20" r="10" stroke="#047857" strokeWidth="2" fill="none" />
          <path d="M21 15 L21 20 L25 22" stroke="#047857" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Linha/Barra de Progresso Verde */}
          <rect x="11" y="36" width="36" height="4" rx="2" fill="#047857" />
          {/* Linhas de Texto */}
          <rect x="42" y="16" width="42" height="4.5" rx="2" fill="#CBD5E1" />
          <rect x="42" y="25" width="28" height="4.5" rx="2" fill="#E2E8F0" />
        </g>

        {/* 6. Card Flutuante Direito (Motocicleta / Entrega com Linhas) */}
        <g transform="translate(204, 46) rotate(7)" filter="url(#ticketShadow)">
          {/* Base do Card */}
          <rect x="0" y="0" width="96" height="54" rx="8" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
          {/* Ícone de Motocicleta */}
          <circle cx="16" cy="24" r="5" stroke="#334155" strokeWidth="1.8" fill="none" />
          <circle cx="32" cy="24" r="5" stroke="#334155" strokeWidth="1.8" fill="none" />
          <path d="M16 24 L22 17 L28 17 L32 24 M22 17 L25 13" stroke="#334155" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          {/* Linhas de Texto */}
          <rect x="44" y="16" width="40" height="4.5" rx="2" fill="#CBD5E1" />
          <rect x="44" y="25" width="26" height="4.5" rx="2" fill="#E2E8F0" />
        </g>
      </svg>
    </div>
  );
}

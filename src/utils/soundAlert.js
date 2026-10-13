function canPlayStoreAudio() {
  if (typeof window === "undefined") return false;
  try {
    const path = window.location.pathname.toLowerCase();
    // Apenas silencia estritamente na tela de gestão do SaaS (/superadmin)
    // ou na tela de login (/adminlogin). Em qualquer tela de restaurante, o som funciona!
    if (path === "/superadmin" || path.startsWith("/superadmin/") || path.includes("/adminlogin")) {
      return false;
    }
  } catch {
    return true;
  }
  return true;
}

// Utilitário de alerta sonoro potente e contínuo para pedidos pendentes usando Web Audio API
class SoundAlertManager {
  constructor() {
    this.audioCtx = null;
    // Padrão sempre ativo (true), a menos que o usuário tenha explicitamente desligado salvando "false"
    this.enabled = typeof window !== "undefined"
      ? localStorage.getItem("vrumburguer_order_sound_enabled") !== "false"
      : true;
    this.isPlaying = false;
    this.isLooping = false;
    this.pendingCount = 0;
    this.loopTimer = null;
    this.activeTimeouts = [];
  }

  getAudioContext() {
    if (typeof window === "undefined") return null;
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }
    } catch (_e) {
      return null;
    }
    return this.audioCtx;
  }

  isEnabled() {
    return this.enabled && canPlayStoreAudio();
  }

  setEnabled(val) {
    this.enabled = !!val;
    if (typeof window !== "undefined") {
      localStorage.setItem("vrumburguer_order_sound_enabled", this.enabled ? "true" : "false");
    }
    if (!this.enabled || !canPlayStoreAudio()) {
      this.stopContinuousAlert();
    } else if (this.pendingCount > 0) {
      this.startContinuousAlert();
    }
  }

  // Atualiza a contagem de pedidos pendentes
  setPendingCount(count) {
    this.pendingCount = Math.max(0, Number(count) || 0);
    if (this.pendingCount > 0 && this.enabled && canPlayStoreAudio()) {
      this.startContinuousAlert();
    } else {
      this.stopContinuousAlert();
    }
  }

  startContinuousAlert() {
    if (!canPlayStoreAudio() || !this.enabled) {
      this.stopContinuousAlert();
      return;
    }
    if (this.isLooping) return;
    this.isLooping = true;
    this.playLoop();
  }

  stopContinuousAlert() {
    this.isLooping = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    this.activeTimeouts.forEach((t) => clearTimeout(t));
    this.activeTimeouts = [];
    this.isPlaying = false;
  }

  playLoop() {
    if (!canPlayStoreAudio() || !this.isLooping || !this.enabled || this.pendingCount <= 0) {
      this.stopContinuousAlert();
      return;
    }

    this.playOrderChime(() => {
      if (canPlayStoreAudio() && this.isLooping && this.enabled && this.pendingCount > 0) {
        this.loopTimer = setTimeout(() => {
          this.playLoop();
        }, 1800); // 1.8s entre repetições de campainha enquanto houver pedidos pendentes
      } else {
        this.stopContinuousAlert();
      }
    });
  }

  // Toca um alerta sonoro potente estilo iFood/Anota AI
  async playOrderChime(onFinish) {
    if (!canPlayStoreAudio() || !this.enabled) {
      if (onFinish) onFinish();
      return;
    }

    try {
      const ctx = this.getAudioContext();
      if (!ctx) {
        if (onFinish) onFinish();
        return;
      }

      // Garante que o contexto de áudio não esteja suspenso pelo navegador
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }

      this.isPlaying = true;

      // Compressor dinâmico para maximizar o volume com segurança
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-15, ctx.currentTime);
      compressor.knee.setValueAtTime(30, ctx.currentTime);
      compressor.ratio.setValueAtTime(12, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);
      compressor.connect(ctx.destination);

      // Função auxiliar para tocar um sino harmônico duplo
      const playBell = (freq, startTime, duration = 0.5, volume = 0.85) => {
        try {
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = "sine";
          osc1.frequency.setValueAtTime(freq, startTime);

          gain1.gain.setValueAtTime(0.001, startTime);
          gain1.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
          gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

          osc1.connect(gain1);
          gain1.connect(compressor);
          osc1.start(startTime);
          osc1.stop(startTime + duration);

          // Harmônico agudo (brilho metálico)
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = "triangle";
          osc2.frequency.setValueAtTime(freq * 2, startTime);

          gain2.gain.setValueAtTime(0.001, startTime);
          gain2.gain.exponentialRampToValueAtTime(volume * 0.4, startTime + 0.015);
          gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.7);

          osc2.connect(gain2);
          gain2.connect(compressor);
          osc2.start(startTime);
          osc2.stop(startTime + duration);
        } catch (_err) {}
      };

      const startBase = ctx.currentTime + 0.05;

      // Sequência de toques cristalinos estilo iFood/Anota AI
      playBell(587.33, startBase + 0.00, 0.45, 0.85); // Ré5
      playBell(783.99, startBase + 0.18, 0.50, 0.95); // Sol5
      playBell(1046.50, startBase + 0.38, 0.80, 1.00); // Dó6

      const t1 = setTimeout(() => {
        if (!this.enabled || !this.audioCtx) return;
        const now2 = this.audioCtx.currentTime;
        playBell(880.00, now2 + 0.00, 0.45, 0.85);
        playBell(1174.66, now2 + 0.18, 0.50, 0.95);
        playBell(1567.98, now2 + 0.38, 0.95, 1.00);
      }, 700);
      this.activeTimeouts.push(t1);

      const t2 = setTimeout(() => {
        if (!this.enabled || !this.audioCtx) return;
        const now3 = this.audioCtx.currentTime;
        playBell(1046.50, now3 + 0.00, 0.40, 0.90);
        playBell(1318.51, now3 + 0.16, 0.45, 0.95);
        playBell(1567.98, now3 + 0.32, 0.55, 1.00);
        playBell(2093.00, now3 + 0.48, 1.10, 1.00);

        const t3 = setTimeout(() => {
          this.isPlaying = false;
          if (onFinish) onFinish();
        }, 1200);
        this.activeTimeouts.push(t3);
      }, 1500);
      this.activeTimeouts.push(t2);

    } catch (err) {
      this.isPlaying = false;
      console.log("Aviso ao tocar som de notificação:", err);
      if (onFinish) onFinish();
    }
  }
}

export const soundAlert = new SoundAlertManager();

// Desbloqueia o AudioContext do navegador no primeiro clique/interação na tela
if (typeof window !== "undefined") {
  const unlockAudio = () => {
    try {
      const ctx = soundAlert.getAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume();
      }
    } catch (_e) {}
  };
  window.addEventListener("click", unlockAudio, { passive: true });
  window.addEventListener("touchstart", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });
}

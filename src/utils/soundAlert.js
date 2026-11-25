function canPlayStoreAudio() {
  if (typeof window === "undefined") return false;
  try {
    const path = window.location.pathname.toLowerCase();
    // Apenas silencia estritamente na tela de gestão do SaaS (/superadmin)
    // ou na tela de login (/login). Em qualquer tela de restaurante, o som funciona!
    if (
      path === "/superadmin" ||
      path.startsWith("/superadmin/") ||
      path === "/login" ||
      path.startsWith("/login/") ||
      path.includes("/adminlogin")
    ) {
      return false;
    }
  } catch {
    return true;
  }
  return true;
}

// Utilitário de alerta sonoro potente, cristalino e contínuo para pedidos pendentes
// Garante sequência de toques em ordem ("trim... trim... trim") sem sobreposição.
class SoundAlertManager {
  constructor() {
    this.audioCtx = null;
    this.enabled = typeof window !== "undefined"
      ? localStorage.getItem("vrumburguer_order_sound_enabled") !== "false"
      : true;
    this.isPlaying = false;
    this.isLooping = false;
    this.pendingCount = 0;
    this.loopTimer = null;
    this.finishTimer = null;
    this.activeNodes = [];
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
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("pendingOrdersCountChanged", { detail: this.pendingCount }));
    }
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
    this.isPlaying = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.finishTimer) {
      clearTimeout(this.finishTimer);
      this.finishTimer = null;
    }
    this.cleanupNodes();
  }

  cleanupNodes() {
    if (this.activeNodes && this.activeNodes.length > 0) {
      this.activeNodes.forEach((node) => {
        try {
          if (node.stop) node.stop();
          if (node.disconnect) node.disconnect();
        } catch (_err) {}
      });
      this.activeNodes = [];
    }
  }

  playLoop() {
    if (!canPlayStoreAudio() || !this.isLooping || !this.enabled || this.pendingCount <= 0) {
      this.stopContinuousAlert();
      return;
    }

    this.playOrderChime(() => {
      // Quando a sequência de toques termina, se ainda houver pedidos pendentes,
      // espera um intervalo limpo de 2.5s antes de tocar a próxima sequência ordenada.
      if (canPlayStoreAudio() && this.isLooping && this.enabled && this.pendingCount > 0) {
        this.loopTimer = setTimeout(() => {
          this.playLoop();
        }, 2500); // 2.5s de silêncio nítido entre repetições
      } else {
        this.stopContinuousAlert();
      }
    });
  }

  // Toca a sequência ordenada de 3 toques estilo iFood ("trim... trim... trim")
  // Trava com isPlaying para garantir que NENHUM som toque em cima do outro.
  async playOrderChime(onFinish) {
    if (!canPlayStoreAudio() || !this.enabled) {
      if (onFinish) onFinish();
      return;
    }

    // Trava de concorrência: se já estiver tocando, NÃO sobrepõe
    if (this.isPlaying) {
      return;
    }

    try {
      const ctx = this.getAudioContext();
      if (!ctx) {
        if (onFinish) onFinish();
        return;
      }

      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }

      this.isPlaying = true;
      this.cleanupNodes();

      // Compressor dinâmico para som nítido, forte e sem estalos
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-12, ctx.currentTime);
      compressor.knee.setValueAtTime(25, ctx.currentTime);
      compressor.ratio.setValueAtTime(8, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.20, ctx.currentTime);
      compressor.connect(ctx.destination);
      this.activeNodes.push(compressor);

      // Função geradora de toque metálico ("trimmmm") com ataque percussivo e brilho harmônico
      const playTrimNote = (fundamentalFreq, startTime, duration = 0.38, volume = 0.90) => {
        try {
          // Onda fundamental (corpo do sino)
          const oscMain = ctx.createOscillator();
          const gainMain = ctx.createGain();
          oscMain.type = "sine";
          oscMain.frequency.setValueAtTime(fundamentalFreq, startTime);

          // Envelope: ataque imediato de 15ms ("TR") e decaimento exponencial suave ("IMMMM")
          gainMain.gain.setValueAtTime(0.0001, startTime);
          gainMain.gain.exponentialRampToValueAtTime(volume, startTime + 0.015);
          gainMain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

          oscMain.connect(gainMain);
          gainMain.connect(compressor);
          oscMain.start(startTime);
          oscMain.stop(startTime + duration + 0.05);

          this.activeNodes.push(oscMain, gainMain);

          // Harmônico cintilante (+3Hz detune para vibrato de campainha de balcão)
          const oscShimmer = ctx.createOscillator();
          const gainShimmer = ctx.createGain();
          oscShimmer.type = "triangle";
          oscShimmer.frequency.setValueAtTime(fundamentalFreq * 2 + 3, startTime);

          gainShimmer.gain.setValueAtTime(0.0001, startTime);
          gainShimmer.gain.exponentialRampToValueAtTime(volume * 0.35, startTime + 0.012);
          gainShimmer.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.75);

          oscShimmer.connect(gainShimmer);
          gainShimmer.connect(compressor);
          oscShimmer.start(startTime);
          oscShimmer.stop(startTime + duration);

          this.activeNodes.push(oscShimmer, gainShimmer);
        } catch (_err) {}
      };

      const startBase = ctx.currentTime + 0.03;

      // SEQUÊNCIA LIMPA E ORDENADA DE 3 TOQUES (SEM SOBREPOSIÇÃO):
      // 1. Primeiro Trim (880 Hz - Lá5): 0.00s até 0.35s
      playTrimNote(880.00, startBase + 0.00, 0.35, 0.85);

      // 2. Segundo Trim (1108 Hz - Dó#6): 0.42s até 0.77s
      playTrimNote(1108.73, startBase + 0.42, 0.35, 0.90);

      // 3. Terceiro Trim (1318.5 Hz - Mi6): 0.84s até 1.50s (eco final agradável)
      playTrimNote(1318.51, startBase + 0.84, 0.65, 0.95);

      // Timer único para liberar a trava e notificar o fim da sequência
      const totalPhraseDurationMs = 1550; // 1.55s
      this.finishTimer = setTimeout(() => {
        this.isPlaying = false;
        this.cleanupNodes();
        if (onFinish) onFinish();
      }, totalPhraseDurationMs);

    } catch (err) {
      this.isPlaying = false;
      this.cleanupNodes();
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

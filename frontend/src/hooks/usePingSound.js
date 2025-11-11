// frontend/src/hooks/usePingSound.js
import { useCallback, useEffect, useRef, useState } from "react";

// 🔊 Audio singleton (una sola instancia para toda la app)
let audioEl = null;
function getAudio() {
  if (!audioEl) {
    audioEl = new Audio("/sounds/notify.mp3");
    audioEl.preload = "auto";
    audioEl.crossOrigin = "anonymous";
    audioEl.loop = false;
    audioEl.volume = 0.7;
  }
  return audioEl;
}

const LS_KEY = "soundEnabled";

export default function usePingSound() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
  });
  const unlockingRef = useRef(false);

  // Guarda en localStorage
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, enabled ? "1" : "0"); } catch {}
  }, [enabled]);

  // Llama esto UNA vez tras interacción de usuario (click/tap) para desbloquear
  const unlock = useCallback(async () => {
    if (unlockingRef.current) return false;
    unlockingRef.current = true;
    try {
      const a = getAudio();

      // Algunos navegadores necesitan un play real. Se reproduce y pausa enseguida.
      await a.play().catch(() => {});
      // detenemos de inmediato; el simple play() ya “desbloquea”
      try { a.pause(); a.currentTime = 0; } catch {}

      setEnabled(true);
      return true;
    } catch {
      setEnabled(false);
      return false;
    } finally {
      unlockingRef.current = false;
    }
  }, []);

  // Reproducir el ping
  const ping = useCallback(async () => {
    if (!enabled) return false;
    try {
      const a = getAudio();
      // reinicia por si quedó a medio reproducir
      try { a.pause(); a.currentTime = 0; } catch {}
      await a.play();
      return true;
    } catch {
      // si falla, marcamos disabled para reintentar desbloqueo
      setEnabled(false);
      return false;
    }
  }, [enabled]);

  const disable = useCallback(() => setEnabled(false), []);

  return { enabled, unlock, ping, disable };
}

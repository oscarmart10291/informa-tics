import React, { useEffect, useRef, useState } from "react";
import { SSE } from "../utils/sse";

async function playNotify() {
  if (localStorage.getItem("sound:on") !== "1") return;
  try {
    const a = new Audio("/sounds/notify.wav");
    a.volume = 0.9;
    await a.play();
    return;
  } catch {}
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 1200;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.45, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.5);
  } catch {}
}

export default function ToasterBarra() {
  const [toast, setToast] = useState(null);
  const timeoutRef = useRef(null);

  // === Cola y estado de reproducción ===
  const queueRef = useRef([]);       // { msg, at }
  const showingRef = useRef(false);  // ¿estamos mostrando algo?

  const showNext = () => {
    clearTimeout(timeoutRef.current);

    const next = queueRef.current.shift();
    if (!next) {
      setToast(null);
      showingRef.current = false;
      return;
    }

    showingRef.current = true;
    setToast(next);
    playNotify();

    // Duración de cada toast (ajusta si quieres)
    timeoutRef.current = setTimeout(() => {
      showNext(); // al terminar, mostrar el siguiente
    }, 5200);
  };

  const enqueue = (msg) => {
    queueRef.current.push({ msg, at: Date.now() });
    if (!showingRef.current) showNext();
  };

  useEffect(() => {
    const sse = SSE.open("BARRA");
    const off = sse.subscribe((ev, evName) => {
      if (evName !== "message") return;
      let data = null;
      try { data = JSON.parse(ev.data); } catch {}
      if (!data || data.type !== "NUEVO_PEDIDO_BARRA") return;

      const mesaTxt = data.mesa && Number(data.mesa) > 0 ? `Mesa ${data.mesa}` : "Pedido en línea";
      const notaTxt = data.nota ? ` • Nota: ${data.nota}` : "";
      const msg = `Nuevo pedido en barra: ${mesaTxt} • ${data.nombre || "—"}${notaTxt}`;
      enqueue(msg);
    });

    return () => {
      off();
      sse.close();
      clearTimeout(timeoutRef.current);
      queueRef.current = [];
      showingRef.current = false;
    };
  }, []);

  if (!toast) return null;

  return (
    <div style={wrap}>
      <div style={box}>
        <div style={title}>🍹 Barra</div>
        <div>{toast.msg}</div>
      </div>
    </div>
  );
}

const wrap = { position: "fixed", right: 14, top: 14, zIndex: 9999 };
const box = {
  background: "#0f172a", color: "#fff", borderRadius: 12, padding: "10px 12px",
  boxShadow: "0 8px 24px rgba(0,0,0,.25)", maxWidth: 420, fontFamily: "Segoe UI, sans-serif", fontSize: 15
};
const title = { fontWeight: 800, marginBottom: 4, opacity: 0.9, fontSize: 12, letterSpacing: ".02em", textTransform: "uppercase" };

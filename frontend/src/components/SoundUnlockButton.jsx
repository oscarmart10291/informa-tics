import React from "react";

export default function SoundUnlockButton() {
  const [ok, setOk] = React.useState(localStorage.getItem("sound:on") === "1");

  async function playProbe() {
    // plan A: archivo wav
    try {
      const a = new Audio("/sounds/notify.wav");
      a.volume = 0.9;
      await a.play();
      return;
    } catch {}
    // plan B: WebAudio (sin archivos)
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 1200;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.5);
    } catch {}
  }

  async function unlock() {
    await playProbe();
    localStorage.setItem("sound:on", "1");
    setOk(true);
  }

  if (ok) return null;
  return (
    <button
      onClick={unlock}
      style={{
        position: "fixed",
        left: 14,
        bottom: 14,
        zIndex: 9999,
        background: "#16a34a",
        color: "#fff",
        border: "none",
        padding: "10px 14px",
        borderRadius: 12,
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      🔊 Activar sonido
    </button>
  );
}

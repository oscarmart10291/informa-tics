// src/utils/connectSSERepartidor.js
import { openSSE } from "../config/api";

/**
 * Suscribe al canal global REPARTIDOR.
 * onEvent(name, payload) se dispara para NUEVO_PEDIDO_REPARTO (y puedes añadir más).
 */
export function connectSSERepartidor(onEvent) {
  const sub = openSSE("REPARTIDOR", {
    ready: (d) => console.log("[SSE] ready repartidor", d),
    ping:  () => {},

    NUEVO_PEDIDO_REPARTO: (payload) => {
      try { onEvent("NUEVO_PEDIDO_REPARTO", payload); } catch {}
    },
    // agrega más si los usarás:
    // ACTUALIZACION_REPARTO: (p) => onEvent("ACTUALIZACION_REPARTO", p),
  });

  return () => sub.close();
}

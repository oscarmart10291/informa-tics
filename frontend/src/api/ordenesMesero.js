// frontend/src/api/ordenesMesero.js
import { http } from "../config/client";

/**
 * Obtiene historial de órdenes terminadas del mesero
 * @param {Object} params
 * @param {number} params.meseroId - ID del mesero (obligatorio)
 * @param {string} [params.desde]  - YYYY-MM-DD (opcional, default últimos 30 días)
 * @param {string} [params.hasta]  - YYYY-MM-DD (opcional)
 * @param {number} [params.page]   - página (1..n)
 * @param {number} [params.pageSize] - tamaño de página
 */
export async function getHistorialOrdenesMesero({ meseroId, desde, hasta, page = 1, pageSize = 20 }) {
  if (!meseroId) throw new Error("meseroId requerido");
  const q = new URLSearchParams();
  q.set("meseroId", meseroId);
  if (desde) q.set("desde", desde);
  if (hasta) q.set("hasta", hasta);
  q.set("page", page);
  q.set("pageSize", pageSize);

  const { data } = await http.get(`/ordenes/historial?${q.toString()}`);
  return data; // { total, page, pageSize, desde, hasta, data: [...] }
}

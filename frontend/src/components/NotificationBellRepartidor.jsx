import React, { useEffect, useState } from 'react';
import { SSE } from '../utils/sse';
import { fetchRepartidorNotifs, markAllRepartidorNotifsRead } from '../api/repartidorNotifs';

export default function NotificationBellRepartidor() {
  const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
  const rolNombre = usuario?.rol?.nombre || '';
  const esRepartidor = String(rolNombre).toUpperCase() === 'REPARTIDOR';
  const repartidorId = usuario?.id;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const unread = items.filter(i => !i.visto).length;

  useEffect(() => {
    if (!esRepartidor || !repartidorId) return;
    fetchRepartidorNotifs({ repartidorId, limit: 20 })
      .then(setItems)
      .catch(() => {});
  }, [esRepartidor, repartidorId]);

  useEffect(() => {
    if (!esRepartidor || !repartidorId) return;

    const globalSSE = SSE.open('REPARTIDOR');
    const scopedSSE = SSE.open('REPARTIDOR', { scoped: true, userId: repartidorId });

    const handler = async (ev, kind) => {
      if (kind === 'ready' || kind === 'ping') return;
      let isNuevo = false;
      if (kind === 'NUEVO_PEDIDO_REPARTO') isNuevo = true;
      else {
        try { const data = ev?.data ? JSON.parse(ev.data) : null; if (data?.type === 'NUEVO_PEDIDO_REPARTO') isNuevo = true; } catch {}
      }
      if (!isNuevo) return;
      try { setItems(await fetchRepartidorNotifs({ repartidorId, limit: 20 })); } catch {}
    };

    const off1 = globalSSE.subscribe(handler, ['NUEVO_PEDIDO_REPARTO']);
    const off2 = scopedSSE.subscribe(handler, ['NUEVO_PEDIDO_REPARTO']);
    const off3 = globalSSE.subscribe(handler);
    const off4 = scopedSSE.subscribe(handler);

    return () => { off1(); off2(); off3(); off4(); globalSSE.close(); scopedSSE.close(); };
  }, [esRepartidor, repartidorId]);

  const limpiar = async () => {
    if (!repartidorId) return;
    try { await markAllRepartidorNotifsRead(repartidorId); } catch {}
    setItems(prev => prev.map(n => ({ ...n, visto: true })));
  };

  if (!esRepartidor || !repartidorId) return null;

  return (
    <div className="relative" style={{ position: 'relative', zIndex: 60 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notificaciones"
        title="Notificaciones"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: 20,
          lineHeight: 1,
          position: 'relative',
          color: 'white',
          padding: 0
        }}
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              background: '#ef4444',
              color: 'white',
              fontSize: 12,
              borderRadius: 9999,
              padding: '2px 6px',
              fontWeight: 700
            }}
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',           // 👈 fijo (no se corta)
            right: 10,                   // pegado a la derecha
            top: 'calc(56px + 6px)',     // debajo del topbar móvil; si tu topbar es más alto súbelo a 64px
            width: 'min(92vw, 360px)',
            maxHeight: 'min(70vh, 520px)',
            overflow: 'auto',
            background: 'white',
            color: '#0f172a',
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,.18)',
            zIndex: 70
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              position: 'sticky', top: 0
            }}
          >
            <div style={{ fontWeight: 600 }}>Notificaciones</div>
            <button
              onClick={limpiar}
              style={{
                background: '#e2e8f0',
                border: 'none',
                borderRadius: 8,
                padding: '6px 10px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Limpiar
            </button>
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '12px' }}>Sin notificaciones.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map(n => (
                <li key={n.id} style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                  <a href="/reparto" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ fontWeight: 600 }}>
                      {n.titulo || 'Nuevo pedido para reparto'}
                    </div>
                    <div style={{ fontSize: 14, color: '#475569' }}>
                      {n.cuerpo ||
                        (n.pedido
                          ? `Pedido ${n.pedido.codigo} · Q${Number(n.pedido.total || 0).toFixed(2)}`
                          : '')}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

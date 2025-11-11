// src/components/VerificarReservaModal.jsx
import React, { useEffect } from 'react';

export default function VerificarReservaModal({
  open = true,
  title = 'Mesa reservada',
  message = 'Está reservada. ¿Es la persona que reservó?',
  confirmLabel = 'Sí, es el cliente',
  cancelLabel = 'Cancelar',
  onCancel,
  onConfirm,
}) {
  // prevenir scroll del body mientras está abierto y limpiarlo al salir
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const close = () => onCancel && onCancel();
  const confirm = () => onConfirm && onConfirm();

  return (
    <div
      // overlay
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,              // por encima del modal de mesas
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()} // evita que el click cierre por burbujeo
        style={{
          width: 520,
          maxWidth: '92vw',
          background: '#fff',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 16px 40px rgba(0,0,0,.25)',
        }}
      >
        <div style={{ background: '#059669', color: '#fff', padding: '10px 14px', fontWeight: 800 }}>
          {title}
        </div>
        <div style={{ padding: 16, color: '#111827' }}>
          {message}
        </div>
        <div style={{ padding: 12, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={close}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#e5e7eb', cursor: 'pointer' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={confirm}
            style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

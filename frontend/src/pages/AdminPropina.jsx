// src/pages/AdminPropina.jsx
import React, { useEffect, useMemo, useState } from 'react';
import PageTopBar from '../components/PageTopBar';
import ToastMessage from '../components/ToastMessage';
import { http } from '../config/client';

const DEF = {
  activa: true,
  porcentaje: 10, // fallback por si el backend aún no devuelve nada
};

// API: ajústalas si tus rutas reales son diferentes
const API_GET = '/propina/reglas/activas?scope=CAJA';
const API_PUT = '/propina/reglas/activas';

function q(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 'Q 0.00';
  return `Q ${v.toFixed(2)}`;
}

export default function AdminPropina() {
  const [loading, setLoading] = useState(true);
  const [activa, setActiva] = useState(DEF.activa);
  const [porcentaje, setPorcentaje] = useState(DEF.porcentaje);
  const [previewSubtotal, setPreviewSubtotal] = useState(100);

  // Toast
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2500);
  };

  async function loadRegla() {
    setLoading(true);
    try {
      const { data } = await http.get(API_GET);
      // Admite backends que devuelvan {activa, porcentaje} ó {regla:{...}}
      const r = data?.regla || data || {};
      if (typeof r.porcentaje === 'number') setPorcentaje(r.porcentaje);
      if (typeof r.activa === 'boolean') setActiva(r.activa);
    } catch (e) {
      console.warn('No se pudo cargar la regla de propina, uso default.', e);
      setActiva(DEF.activa);
      setPorcentaje(DEF.porcentaje);
      showToast('No se pudo cargar la configuración, usando valores por defecto.', 'warning');
    } finally {
      setLoading(false);
    }
  }

  async function guardar() {
    try {
      const body = { scope: 'CAJA', activa: !!activa, porcentaje: Number(porcentaje) || 0 };
      await http.put(API_PUT, body);
      showToast('Configuración de propina guardada.', 'success');
      await loadRegla();
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.error || 'No se pudo guardar';
      showToast(msg, 'danger');
    }
  }

  useEffect(() => { loadRegla(); }, []);

  // Preview
  const p = Math.max(0, Number(porcentaje) || 0);
  const sub = Math.max(0, Number(previewSubtotal) || 0);
  const propinaCalc = useMemo(() => activa ? Number((sub * p / 100).toFixed(2)) : 0, [sub, p, activa]);
  const totalCalc = useMemo(() => Number((sub + propinaCalc).toFixed(2)), [sub, propinaCalc]);

  return (
    <div style={pageWrap}>
      <PageTopBar title="Propina (Admin)" backTo="/admin" />
      <main style={mainWrap}>
        <div style={mainCard}>
          <p style={{ marginTop: 0, color: '#334155' }}>
            Configura la <b>propina</b> que se aplicará en los cobros de caja. El cajero verá el desglose con
            “Propina” en su vista y en el ticket.
          </p>

          <div style={grid2}>
            {/* Configuración */}
            <section style={sectionBox}>
              <h3 style={sectionTitle}>Configuración</h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={switchWrap}>
                  <input
                    type="checkbox"
                    checked={activa}
                    onChange={(e) => setActiva(e.target.checked)}
                  />
                  <span style={switchLabel}>Propina activa</span>
                </label>
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={label}>Porcentaje de propina</label>
                <div style={{ position: 'relative' }}>
                  <span style={pctPrefix}>%</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={porcentaje}
                    onChange={(e) => setPorcentaje(e.target.value)}
                    style={{ ...input, paddingLeft: 36 }}
                    disabled={!activa}
                  />
                </div>
                <div style={mutedSmall}>
                  {activa ? `La caja aplicará automáticamente el ${p}% sobre el subtotal pendiente.` : 'La propina está desactivada.'}
                </div>
              </div>

              <div style={{ marginTop: 18, textAlign: 'right' }}>
                <button onClick={guardar} style={btnPrimary} disabled={loading}>
                  Guardar cambios
                </button>
              </div>
            </section>

            {/* Preview / Calculadora */}
            <section style={sectionBox}>
              <h3 style={sectionTitle}>Preview</h3>
              <div>
                <label style={label}>Subtotal de ejemplo</label>
                <div style={{ position: 'relative' }}>
                  <span style={qPrefix}>Q</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={previewSubtotal}
                    onChange={(e) => setPreviewSubtotal(e.target.value)}
                    style={{ ...input, paddingLeft: 30 }}
                  />
                </div>
              </div>

              <div style={resumeBox}>
                <div style={resumeRow}>
                  <span>Subtotal</span>
                  <b>{q(previewSubtotal)}</b>
                </div>
                <div style={resumeRow}>
                  <span>Propina {activa ? `(${p}%)` : '(desactivada)'}</span>
                  <b>{q(propinaCalc)}</b>
                </div>
                <div style={divider} />
                <div style={{ ...resumeRow, fontSize: 18 }}>
                  <span>Total</span>
                  <b>{q(totalCalc)}</b>
                </div>
              </div>

              <p style={mutedSmall}>
                Esta es una simulación para validar el porcentaje configurado.
                La vista de Caja y el ticket mostrarán este desglose al cobrar.
              </p>
            </section>
          </div>
        </div>
      </main>

      <ToastMessage
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />
    </div>
  );
}

/* ============================== estilos ============================== */
const pageWrap = { minHeight: '100vh', background: '#f6f7fb', fontFamily: 'Segoe UI, sans-serif' };
const mainWrap = { maxWidth: 1100, margin: '20px auto', padding: '0 16px' };
const mainCard = { background: '#fff', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', padding: 20 };

const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 };
const sectionBox = { border: '1px solid #eef2f7', borderRadius: 10, padding: 16, background: '#fff' };
const sectionTitle = { margin: 0, marginBottom: 10, color: '#1f2937', fontSize: 16 };

const label = { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 };
const input = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', outline: 'none' };

const btnPrimary = { background: '#0f766e', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: 10, fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' };

const switchWrap = { display: 'inline-flex', alignItems: 'center', gap: 8, userSelect: 'none' };
const switchLabel = { fontWeight: 600, color: '#1f2937' };

const mutedSmall = { color: '#6b7280', fontSize: 12 };

const resumeBox = { marginTop: 14, border: '1px dashed #cbd5e1', borderRadius: 10, padding: 12, background: '#fafcff' };
const resumeRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', color: '#334155' };
const divider = { height: 1, background: '#e5e7eb', margin: '6px 0' };

const qPrefix = { position: 'absolute', left: 10, top: 9, color: '#6b7280', fontWeight: 700 };
const pctPrefix = { position: 'absolute', left: 10, top: 9, color: '#6b7280', fontWeight: 700 };

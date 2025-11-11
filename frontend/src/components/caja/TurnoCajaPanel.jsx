// src/components/caja/TurnoCajaPanel.jsx
import React, { useMemo, useState } from 'react';
import { http } from '../../config/client';

const DENOMS = [
  { key: 'Q200', label: 'Q200' },
  { key: 'Q100', label: 'Q100' },
  { key: 'Q50',  label: 'Q50'  },
  { key: 'Q20',  label: 'Q20'  },
  { key: 'Q10',  label: 'Q10'  },
  { key: 'Q5',   label: 'Q5'   },
  { key: 'Q1',   label: 'Q1'   },
  { key: 'Q0_50',label: 'Q0.50'},
  { key: 'Q0_25',label: 'Q0.25'},
];
const VALUES = { Q200:200, Q100:100, Q50:50, Q20:20, Q10:10, Q5:5, Q1:1, Q0_50:0.5, Q0_25:0.25 };

/* === Helper para obtener el cajero actual (desde el login) === */
function getCajeroId() {
  try {
    const u = JSON.parse(localStorage.getItem('usuario') || 'null');
    return u?.id || null;
  } catch { return null; }
}

export default function TurnoCajaPanel({
  turno,
  onRefresh,
  onToast = () => {},   // <- Caja.jsx: showToast(msg, type)
  openConfirm = null,   // <- Caja.jsx: cfg => setConfirmData(cfg)
}) {
  const estado = String(turno?.estado || 'PENDIENTE').toUpperCase();
  const idTurno = turno?.id;

  const [showApertura, setShowApertura] = useState(false);
  const [showCierre, setShowCierre] = useState(false);

  const [conteo, setConteo] = useState(() => Object.fromEntries(DENOMS.map(d => [d.key, 0])));
  const [conteoCierre, setConteoCierre] = useState(() => Object.fromEntries(DENOMS.map(d => [d.key, 0])));

  // Cache informativa de la última validación (solo para tooltip/UX)
  const [guardInfo, setGuardInfo] = useState({ ordenesActivas: null, abiertos: null, allowed: true, reason: '' });

  const totalApertura = useMemo(
    () => DENOMS.reduce((acc, d) => acc + (Number(conteo[d.key] || 0) * VALUES[d.key]), 0).toFixed(2),
    [conteo]
  );
  const totalCierre = useMemo(
    () => DENOMS.reduce((acc, d) => acc + (Number(conteoCierre[d.key] || 0) * VALUES[d.key]), 0).toFixed(2),
    [conteoCierre]
  );

  function setVal(key, v) {
    const n = Number(v);
    setConteo(c => ({ ...c, [key]: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0 }));
  }
  function setValCierre(key, v) {
    const n = Number(v);
    setConteoCierre(c => ({ ...c, [key]: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0 }));
  }

  /** =================== Guardas de cierre ===================
   * Regla:
   * - Si hay órdenes activas (dashboard-hoy) y SOLO 1 turno ABIERTA => bloquear cierre.
   * - Si hay 2+ turnos ABIERTA => permitir aunque haya órdenes activas.
   */
  async function fetchGuardInfo() {
    try {
      const [dash, list] = await Promise.all([
        http.get('/reportes/dashboard-hoy'),
        http.get('/caja/turnos/admin/list', { params: { estado: 'Abierta' } }) // devuelve { turnos: [...] }
      ]);

      const ordenesActivas = Number(dash?.data?.ordenesActivas || 0);

      // Soporta ambos shapes: { turnos: [...] } o [] directamente
      const rawTurnos = Array.isArray(list?.data?.turnos) ? list.data.turnos
                         : Array.isArray(list?.data) ? list.data
                         : [];
      const abiertos = rawTurnos.filter(t => String(t?.estado || '').toUpperCase() === 'ABIERTA').length;

      const allowed = !(ordenesActivas > 0 && abiertos <= 1);
      const reason = allowed
        ? ''
        : 'No puedes solicitar el cierre: hay órdenes activas y solo 1 caja abierta.';

      const info = { ordenesActivas, abiertos, allowed, reason };
      setGuardInfo(info);
      return info;
    } catch (e) {
      const info = { ordenesActivas: null, abiertos: null, allowed: false, reason: 'No se pudo validar el estado actual.' };
      setGuardInfo(info);
      return info;
    }
  }

  async function handleOpenCierre() {
    const info = await fetchGuardInfo();
    if (!info.allowed) {
      onToast(info.reason || 'No se pudo validar antes de solicitar el cierre.', 'danger');
      return;
    }
    setShowCierre(v => !v);
  }

  // --- Apertura ---
  async function doSolicitarApertura() {
    const ci = {
      Q200:Number(conteo.Q200||0), Q100:Number(conteo.Q100||0), Q50:Number(conteo.Q50||0),
      Q20:Number(conteo.Q20||0),   Q10:Number(conteo.Q10||0),   Q5:Number(conteo.Q5||0),
      Q1:Number(conteo.Q1||0),     Q0_50:Number(conteo.Q0_50||0), Q0_25:Number(conteo.Q0_25||0),
    };
    const total =
      ci.Q200*200 + ci.Q100*100 + ci.Q50*50 + ci.Q20*20 + ci.Q10*10 +
      ci.Q5*5 + ci.Q1*1 + ci.Q0_50*0.5 + ci.Q0_25*0.25;

    const totalFmt = Number(total.toFixed(2));
    if (totalFmt <= 0) {
      onToast('Debes declarar un monto inicial mayor a 0.', 'warning');
      return;
    }

    const cajeroId = getCajeroId();
    if (!cajeroId) {
      onToast('Sesión inválida: no se encontró el cajero actual.', 'danger');
      return;
    }

    const send = async () => {
      try {
        await http.post('/caja/solicitar', {
          cajeroId,                               // 👈 NECESARIO para getUidFlex(req)
          conteoInicial: { ...ci, total: totalFmt },
          montoApertura: totalFmt,
        });
        onToast('Solicitud de apertura enviada.', 'success');
        setShowApertura(false);
        onRefresh?.();
      } catch (e) {
        const msg = e?.response?.data?.msg || e?.response?.data?.error || 'No se pudo solicitar la apertura';
        onToast(msg, 'danger');
      }
    };

    if (openConfirm) {
      openConfirm({
        title: 'Confirmar solicitud de apertura',
        message: `Se solicitará apertura con efectivo inicial de Q ${totalFmt.toFixed(2)}. ¿Deseas continuar?`,
        confirmText: 'Enviar solicitud',
        confirmVariant: 'success', // verde
        onConfirm: send,
      });
    } else {
      await send();
    }
  }

  // --- Cierre ---
  async function doSolicitarCierre() {
    if (!idTurno) return;

    // Validación inmediatamente antes de enviar (estado pudo cambiar)
    const info = await fetchGuardInfo();
    if (!info.allowed) {
      onToast(info.reason || 'No se puede solicitar el cierre en este momento.', 'danger');
      return;
    }

    const cf = {
      Q200:Number(conteoCierre.Q200||0), Q100:Number(conteoCierre.Q100||0), Q50:Number(conteoCierre.Q50||0),
      Q20:Number(conteoCierre.Q20||0),   Q10:Number(conteoCierre.Q10||0),   Q5:Number(conteoCierre.Q5||0),
      Q1:Number(conteoCierre.Q1||0),     Q0_50:Number(conteoCierre.Q0_50||0), Q0_25:Number(conteoCierre.Q0_25||0),
    };
    const total = DENOMS.reduce((acc, d) => acc + Number(cf[d.key] || 0) * VALUES[d.key], 0);
    const totalFmt = Number(total.toFixed(2));

    const cajeroId = getCajeroId();
    if (!cajeroId) {
      onToast('Sesión inválida: no se encontró el cajero actual.', 'danger');
      return;
    }

    const send = async () => {
      try {
        await http.post(`/caja/${idTurno}/solicitar-cierre`, {
          cajeroId,                // 👈 NECESARIO para getUidFlex(req)
          conteoFinal: cf
        });
        onToast('Solicitud de cierre enviada (pendiente de autorización).', 'success');
        setShowCierre(false);
        onRefresh?.();
      } catch (e) {
        const msg = e?.response?.data?.msg || e?.response?.data?.error || 'No se pudo solicitar el cierre';
        onToast(msg, 'danger');
      }
    };

    if (openConfirm) {
      openConfirm({
        title: 'Confirmar solicitud de cierre',
        message: `Se solicitará cierre con conteo final declarado de Q ${totalFmt.toFixed(2)}. ¿Deseas continuar?`,
        confirmText: 'Enviar solicitud de cierre',
        confirmVariant: 'danger',
        onConfirm: send,
      });
    } else {
      await send();
    }
  }

  const cierreBlockedTooltip = !guardInfo.allowed && guardInfo.reason ? guardInfo.reason : undefined;

  return (
    <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', justifyContent:'space-between'}}>
      <div style={{ fontWeight:700 }}>
        Turno de caja:{' '}
        <span style={{ color: estado === 'ABIERTA' ? '#065f46' : estado === 'CIERRE_PENDIENTE' ? '#7a5b00' : '#7a5b00' }}>
          {estado}
        </span>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button
          onClick={async () => {
            onRefresh?.();
            await fetchGuardInfo(); // refrescamos los guardas también
            onToast('Datos actualizados.', 'info');
          }}
          style={btnGhost}
        >
          Actualizar
        </button>

        {estado === 'ABIERTA' && (
          <>
            <button
              onClick={handleOpenCierre}
              style={{ ...btnDanger, opacity: guardInfo.allowed ? 1 : 0.85, cursor: guardInfo.allowed ? 'pointer' : 'not-allowed' }}
              title={cierreBlockedTooltip}
            >
              Solicitar cierre
            </button>
            {showCierre && (
              <div style={panel}>
                <div style={{fontWeight:700, marginBottom:8}}>Conteo final (cierre)</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
                  {DENOMS.map(d => (
                    <label key={d.key} style={{display:'flex', alignItems:'center', gap:8}}>
                      <span style={{width:60}}>{d.label}</span>
                      <input type="number" min="0" value={conteoCierre[d.key]} onChange={e => setValCierre(d.key, e.target.value)} style={{width:80}} />
                    </label>
                  ))}
                </div>
                <div style={{marginTop:10, fontWeight:700}}>Total declarado: Q {totalCierre}</div>
                <div style={{marginTop:8, display:'flex', gap:8}}>
                  <button onClick={doSolicitarCierre} style={btnDanger}>Enviar solicitud de cierre</button>
                  <button onClick={() => setShowCierre(false)} style={btnGhost}>Cancelar</button>
                </div>
              </div>
            )}
          </>
        )}

        {estado !== 'ABIERTA' && estado !== 'CIERRE_PENDIENTE' && (
          <>
            <button onClick={() => setShowApertura(v => !v)} style={btnPrimary}>Solicitar apertura</button>
            {showApertura && (
              <div style={panel}>
                <div style={{fontWeight:700, marginBottom:8}}>Conteo de efectivo (apertura)</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
                  {DENOMS.map(d => (
                    <label key={d.key} style={{display:'flex', alignItems:'center', gap:8}}>
                      <span style={{width:60}}>{d.label}</span>
                      <input type="number" min="0" value={conteo[d.key]} onChange={e => setVal(d.key, e.target.value)} style={{width:80}} />
                    </label>
                  ))}
                </div>
                <div style={{marginTop:10, fontWeight:700}}>Total: Q {totalApertura}</div>
                <div style={{marginTop:8, display:'flex', gap:8}}>
                  <button onClick={doSolicitarApertura} style={btnPrimary}>Enviar solicitud</button>
                  <button onClick={() => setShowApertura(false)} style={btnGhost}>Cancelar</button>
                </div>
              </div>
            )}
          </>
        )}

        {estado === 'CIERRE_PENDIENTE' && (
          <span style={{ alignSelf:'center', color:'#7a5b00' }}>Cierre pendiente de autorización…</span>
        )}
      </div>
    </div>
  );
}

const btnPrimary = { background:'#0f766e', color:'#fff', border:'none', padding:'8px 12px', borderRadius:8, fontWeight:700 };
const btnDanger  = { background:'#b91c1c', color:'#fff', border:'none', padding:'8px 12px', borderRadius:8, fontWeight:700 };
const btnGhost   = { background:'transparent', color:'#1e3d59', border:'1px solid #cbd5e1', padding:'6px 10px', borderRadius:8, fontWeight:600 };
const panel      = { background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, padding:12 };

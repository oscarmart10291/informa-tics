// src/pages/CambiarPassword.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { http } from '../config/client';
import { useNavigate } from 'react-router-dom';

const RULES = {
  minLen: (s) => (s || '').length >= 10,
  upper:  (s) => /[A-Z]/.test(s || ''),
  lower:  (s) => /[a-z]/.test(s || ''),
  digit:  (s) => /[0-9]/.test(s || ''),
  special:(s) => /[^A-Za-z0-9]/.test(s || ''),
};

function RuleItem({ ok, text }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color: ok ? '#0f8a51' : '#64748b' }}>
      <span style={{
        width: 16, height: 16, borderRadius: 999,
        border: `2px solid ${ok ? '#0f8a51' : '#cbd5e1'}`,
        display: 'inline-flex', alignItems:'center', justifyContent:'center',
        fontSize:11, fontWeight:900
      }}>
        {ok ? '✓' : '•'}
      </span>
      <span>{text}</span>
    </div>
  );
}

export default function CambiarPassword() {
  const navigate = useNavigate();

  const usuario = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('usuario') || 'null'); }
    catch { return null; }
  }, []);

  const [actual, setActual] = useState('');
  const [nueva, setNueva]   = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!usuario) navigate('/login', { replace: true });
  }, [usuario, navigate]);

  const passes = useMemo(() => ({
    minLen: RULES.minLen(nueva),
    upper:  RULES.upper(nueva),
    lower:  RULES.lower(nueva),
    digit:  RULES.digit(nueva),
    special:RULES.special(nueva),
  }), [nueva]);

  const strong = Object.values(passes).every(Boolean);
  const match = nueva && confirm && nueva === confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });

    if (!strong) {
      setMsg({ type: 'error', text: 'La contraseña no cumple la política de seguridad.' });
      return;
    }
    if (!match) {
      setMsg({ type: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }

    setLoading(true);
    try {
      const { data } = await http.post('/auth/change-password', {
        userId: usuario.id,
        actual,
        nueva,
      });

      if (!data?.ok) throw new Error(data?.error || 'No se pudo cambiar la contraseña');

      const actualizado = { ...usuario, debeCambiarPassword: false };
      localStorage.setItem('usuario', JSON.stringify(actualizado));

      setMsg({ type: 'ok', text: 'Contraseña actualizada. Redirigiendo…' });
      setTimeout(() => navigate('/panel', { replace: true }), 800);
    } catch (err) {
      const text = err?.response?.data?.error || err.message || 'Error al cambiar la contraseña';
      setMsg({ type: 'error', text });
    } finally {
      setLoading(false);
    }
  };

  const box = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f3f6f7', fontFamily: 'Segoe UI, sans-serif',
  };

  if (!usuario) {
    return (
      <div style={box}>
        <div style={{ background: '#fff', padding: '1.5rem', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.08)' }}>
          Redirigiendo…
        </div>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ background: '#fff', padding: '2rem', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.08)', width: 460 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Cambiar contraseña</h2>
        <p style={{ marginTop: 0, color: '#64748b' }}>
          Usuario: <b>{usuario.usuario}</b> — {usuario.correo}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <input
            type="password"
            placeholder="Contraseña actual"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            required
            style={input}
            autoComplete="current-password"
            onPaste={(e) => e.preventDefault()}
          />

          <div style={{ display:'grid', gap:8 }}>
            <input
              type="password"
              placeholder="Nueva contraseña (mín. 10)"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              required
              style={input}
              autoComplete="new-password"
              onPaste={(e) => e.preventDefault()}
            />
            <div style={{
              border: '1px dashed #e2e8f0',
              borderRadius: 10,
              padding: '10px 12px',
              background: '#f9fafb'
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color:'#334155' }}>
                Debe cumplir:
              </div>
              <div style={{ display:'grid', gap:6 }}>
                <RuleItem ok={passes.minLen} text="Mínimo 10 caracteres" />
                <RuleItem ok={passes.upper}  text="Al menos 1 letra mayúscula" />
                <RuleItem ok={passes.lower}  text="Al menos 1 letra minúscula" />
                <RuleItem ok={passes.digit}  text="Al menos 1 número" />
                <RuleItem ok={passes.special} text="Al menos 1 caracter especial" />
              </div>
            </div>
          </div>

          <input
            type="password"
            placeholder="Confirmar nueva contraseña"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            style={input}
            autoComplete="new-password"
            onPaste={(e) => e.preventDefault()}
          />
          {!match && confirm?.length > 0 && (
            <div style={{ color:'#b4232e', fontSize:13 }}>Las contraseñas no coinciden.</div>
          )}

          <button type="submit" style={{ ...btn, opacity: strong && match && !loading ? 1 : 0.6 }} disabled={!strong || !match || loading}>
            {loading ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            style={btnSecondary}
            onClick={() => navigate('/panel')}
            disabled={loading}
          >
            Cancelar
          </button>

          {msg.text && (
            <div style={{
              background: msg.type === 'ok' ? '#e7f8ef' : '#fde7e9',
              color: msg.type === 'ok' ? '#0f8a51' : '#b4232e',
              border: `1px solid ${msg.type === 'ok' ? '#a6e3c3' : '#f2b8be'}`,
              padding: '10px 12px', borderRadius: 8
            }}>
              {msg.text}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

const input = {
  padding: '0.75rem', borderRadius: 10, border: '1px solid #d1d5db', outline: 'none',
  background: '#f9fafb', fontSize: 15,
};
const btn = {
  padding: '0.75rem', borderRadius: 10, border: 'none', background: '#0f766e',
  color: '#fff', fontWeight: 700, cursor: 'pointer'
};
const btnSecondary = {
  padding: '0.75rem', borderRadius: 10, border: '1px solid #d1d5db',
  background: '#fff', color: '#111827', fontWeight: 600, cursor: 'pointer'
};

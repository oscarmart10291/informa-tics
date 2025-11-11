// src/pages/Historial.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { http } from '../config/client';
import AdminHeader from '../components/AdminHeader';


function Historial() {
  const [historial, setHistorial] = useState([]);
  const [filtroCampo, setFiltroCampo] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroEntidad, setFiltroEntidad] = useState('todos');

  const camposDisponibles = useMemo(
    () => ['', 'nombre', 'usuario', 'correo', 'contrasena', 'rol', 'estado', 'precio', 'categoria'],
    []
  );

  useEffect(() => {
    obtenerHistorial();
  }, []);

  const obtenerHistorial = async () => {
    try {
      const res = await http.get('/historial');
      setHistorial(res.data);
    } catch (error) {
      console.error('Error al obtener historial:', error);
    }
  };

  const getDescripcionAccion = (accion, campo, valorAnterior, valorNuevo) => {
    if (accion?.startsWith('eliminación de')) return accion;
    if (accion === 'creación') return `Creación: ${valorNuevo}`;
    if (accion === 'modificación' || accion?.includes('Modificación de platillo')) {
      if (campo === 'rol') return `Cambio de rol: ${valorAnterior} → ${valorNuevo}`;
      if (campo === 'contrasena') return `Cambio de contraseña`;
      return `Cambio en ${campo}: ${valorAnterior || '—'} → ${valorNuevo || '—'}`;
    }
    if (accion === 'eliminación') return `Eliminación de ${campo}: ${valorAnterior || '—'}`;
    return accion || '';
  };

  const limpiarFiltros = () => {
    setFiltroCampo('');
    setFiltroUsuario('');
    setFiltroEntidad('todos');
  };

  const historialFiltrado = historial.filter(h =>
    (!filtroCampo || h.campo === filtroCampo) &&
    (!filtroUsuario || (
      (h.usuario?.nombre && h.usuario.nombre.toLowerCase().includes(filtroUsuario.toLowerCase())) ||
      (h.platillo?.nombre && h.platillo.nombre.toLowerCase().includes(filtroUsuario.toLowerCase()))
    )) &&
    (filtroEntidad === 'todos' ||
      (filtroEntidad === 'usuarios' && h.usuario) ||
      (filtroEntidad === 'platillos' && h.platillo))
  );

  /* ===== Estilos coherentes y “pegados” ===== */
  const page = {
    fontFamily: 'Segoe UI, sans-serif',
    backgroundColor: '#f3f6f7',
    minHeight: '100vh'
  };

  const wrap = {
    padding: '20px 24px 28px',
    display: 'grid',
    gap: 16
  };

  const filtersRow = {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap'
  };

  const inputStyle = {
    padding: '0.5rem 0.6rem',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    background: '#ffffff'
  };

  const card = {
    overflowX: 'auto',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
    padding: 16
  };

  const thStyle = {
    backgroundColor: '#005f5f',
    color: 'white',
    padding: '10px',
    borderRight: '1px solid #ddd',
    position: 'sticky',
    top: 0,
    zIndex: 1
  };

  const tdStyle = {
    padding: '10px',
    borderRight: '1px solid #eee',
    borderBottom: '1px solid #f1f5f9',
    color: '#333'
  };

  const btnReset = {
    background: '#94a3b8',
    color: '#fff',
    border: 'none',
    padding: '0.5rem 0.8rem',
    borderRadius: 8,
    fontWeight: 600,
    cursor: 'pointer'
  };

  return (
    <div style={page}>
      {/* Topbar pegado */}
      <AdminHeader titulo="📜 Historial de Modificaciones" />

      <div style={wrap}>
        {/* Filtros */}
        <div style={filtersRow}>
          <div>
            <label style={{ marginRight: 8 }}>Filtrar por entidad:</label>
            <select value={filtroEntidad} onChange={(e) => setFiltroEntidad(e.target.value)} style={inputStyle}>
              <option value="todos">Todos</option>
              <option value="usuarios">Usuarios</option>
              <option value="platillos">Platillos</option>
            </select>
          </div>

          <div>
            <label style={{ marginRight: 8 }}>Filtrar por campo:</label>
            <select value={filtroCampo} onChange={(e) => setFiltroCampo(e.target.value)} style={inputStyle}>
              {camposDisponibles.map((campo, i) => (
                <option key={i} value={campo}>
                  {campo === '' ? 'Todos' : campo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ marginRight: 8 }}>Filtrar por afectado:</label>
            <input
              type="text"
              placeholder="Nombre de usuario o platillo"
              value={filtroUsuario}
              onChange={(e) => setFiltroUsuario(e.target.value)}
              style={inputStyle}
            />
          </div>

          <button onClick={limpiarFiltros} style={btnReset}>Limpiar filtros</button>
        </div>

        {/* Tabla */}
        <div style={card}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Entidad</th>
                <th style={thStyle}>Campo</th>
                <th style={thStyle}>Valor anterior</th>
                <th style={thStyle}>Valor nuevo</th>
                <th style={thStyle}>Acción</th>
                <th style={thStyle}>Fecha</th>
                <th style={thStyle}>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {historialFiltrado.map((h) => (
                <tr key={h.id}>
                  <td style={tdStyle}>{h.id}</td>
                  <td style={tdStyle}>
                    {h.usuario?.nombre
                      ? `Usuario: ${h.usuario.nombre}`
                      : h.platillo?.nombre
                      ? `Platillo: ${h.platillo.nombre}`
                      : '—'}
                  </td>
                  <td style={tdStyle}>{h.campo || '—'}</td>
                  <td style={tdStyle}>{h.valorAnterior || '—'}</td>
                  <td style={tdStyle}>{h.valorNuevo || '—'}</td>
                  <td style={tdStyle}>
                    {getDescripcionAccion(h.accion, h.campo, h.valorAnterior, h.valorNuevo)}
                  </td>
                  <td style={tdStyle}>{h.fecha ? new Date(h.fecha).toLocaleString() : '—'}</td>
                  <td style={tdStyle}>{h.responsable?.nombre || 'Desconocido'}</td>
                </tr>
              ))}
              {historialFiltrado.length === 0 && (
                <tr>
                  <td style={{ ...tdStyle, textAlign: 'center' }} colSpan={8}>
                    Sin resultados con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Historial;

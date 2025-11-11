// src/pages/MenuAdmin.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { http } from '../config/client';
import AdminHeader from '../components/AdminHeader';


function MenuAdmin() {
  const [categorias, setCategorias] = useState([]);
  const [categoriasAbiertas, setCategoriasAbiertas] = useState({}); // { nombreCat: bool }
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    obtenerCategoriasVisibles();
  }, []);

  const obtenerCategoriasVisibles = async () => {
    try {
      setCargando(true);
      // ← este endpoint debe devolver SOLO categorías activo=true con platillos disponible=true
      const { data } = await http.get('/categorias/visibles');
      // data: [{ id, nombre, activo:true, platillos:[{id,nombre,precio,imagenUrl,...}]}]
      setCategorias(data || []);
    } catch (error) {
      console.error('Error al obtener el menú:', error);
      alert('No se pudo cargar el menú.');
    } finally {
      setCargando(false);
    }
  };

  // nombres de categorías ordenados
  const categoriasOrdenadas = useMemo(
    () => categorias.map(c => c.nombre).sort(),
    [categorias]
  );

  // abrir todas por defecto en primer render con datos
  useEffect(() => {
    if (!categoriasOrdenadas.length) return;
    setCategoriasAbiertas(prev => {
      if (Object.keys(prev).length) return prev;
      const abierto = {};
      categoriasOrdenadas.forEach(c => (abierto[c] = true));
      return abierto;
    });
  }, [categoriasOrdenadas]);

  const toggleCategoria = (cat) =>
    setCategoriasAbiertas(prev => ({ ...prev, [cat]: !prev[cat] }));

  const abrirTodas = () =>
    setCategoriasAbiertas(Object.fromEntries(categoriasOrdenadas.map(c => [c, true])));

  const cerrarTodas = () =>
    setCategoriasAbiertas(Object.fromEntries(categoriasOrdenadas.map(c => [c, false])));

  const money = (v) => {
    const n = Number(v ?? 0);
    return `Q${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
  };

  /* ===== estilos ===== */
  const page = { fontFamily: 'Segoe UI, sans-serif', backgroundColor: '#f3f6f7', minHeight: '100vh' };
  const wrap = { padding: '20px 24px 28px', display: 'grid', gap: 16 };
  const h3Cat = {
    margin: '0 0 12px',
    borderBottom: '2px solid #006666',
    paddingBottom: 8,
    color: '#006666',
    cursor: 'pointer',
    userSelect: 'none',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  };
  const gridCards = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' };
  const card = { backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 6px 18px rgba(0,0,0,0.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid #eee' };
  const imgBox = { width: '100%', height: 150, background: '#f2f2f2' };
  const pricePill = { background: '#0f766e', color: '#fff', borderRadius: 8, padding: '2px 8px', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', alignSelf: 'flex-start' };
  const toolsRow = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' };
  const btnGhost = { background: '#e2e8f0', border: 'none', color: '#0f172a', padding: '6px 10px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };

  return (
    <div style={page}>
      <AdminHeader titulo="📋 Menú del Restaurante" />

      <div style={wrap}>
        {/* Herramientas globales */}
        <div style={toolsRow}>
          <button onClick={abrirTodas} style={btnGhost}>Abrir todas</button>
          <button onClick={cerrarTodas} style={btnGhost}>Cerrar todas</button>
        </div>

        {cargando && <div style={{ color: '#475569' }}>Cargando menú…</div>}

        {/* Secciones por categoría (ya filtradas) */}
        {categorias
          .sort((a, b) => a.nombre.localeCompare(b.nombre))
          .map(cat => (
            <section key={cat.id}>
              <h3 onClick={() => toggleCategoria(cat.nombre)} style={h3Cat} title="Mostrar/ocultar categoría">
                {cat.nombre}
                <span style={{ fontSize: 18 }}>{categoriasAbiertas[cat.nombre] ? '🔽' : '▶️'}</span>
              </h3>

              {categoriasAbiertas[cat.nombre] && (
                <div style={gridCards}>
                  {cat.platillos.map(p => (
                    <article key={p.id} style={card}>
                      <div style={imgBox}>
                        {p.imagenUrl ? (
                          <img
                            src={p.imagenUrl}
                            alt={p.nombre}
                            loading="lazy"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            onError={(e) => { e.currentTarget.src = ''; }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>
                            Sin imagen
                          </div>
                        )}
                      </div>

                      <div style={{ padding: '0.9rem 1rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <h4 style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.2 }}>{p.nombre}</h4>
                          <span style={pricePill}>{money(p.precio)}</span>
                        </div>
                        <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>
                          {cat.nombre}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ))}
      </div>
    </div>
  );
}

export default MenuAdmin;

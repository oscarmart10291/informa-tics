// frontend/src/views/VistaMesero.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { http } from '../config/client';
import { useNavigate } from 'react-router-dom';
import PageTopBar from '../components/PageTopBar';
import ToastMessage from '../components/ToastMessage';
import VerificarReservaModal from '../components/VerificarReservaModal';

/* =================== APIs =================== */
async function apiMesasResumen() {
  const { data } = await http.get('/mesas/resumen');
  return data;
}
async function apiReservasProximas({ min = 0, max = 180 } = {}) {
  const { data } = await http.get('/reservas/proximas', { params: { min, max } });
  return data;
}
async function apiAlertas(win = 45) {
  const { data } = await http.get('/reservas/alertas', { params: { win } });
  return data;
}
// Status de mesa con mínimos de reserva vigentes
async function apiMesaStatus(numero) {
  const { data } = await http.get(`/mesas/${numero}/status`);
  return data;
}

const FALLBACK_IMG = '/no-image.png';
const makeUid = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`;

function safeCategoriaTipo(p) {
  try {
    const t = String(p?.categoria?.tipo || '').toUpperCase();
    return t === 'BEBIBLE' || t === 'COMESTIBLE' ? t : 'COMESTIBLE';
  } catch {
    return 'COMESTIBLE';
  }
}
function tipoPorCategoria(p) {
  return safeCategoriaTipo(p) === 'BEBIBLE' ? 'BEBIDA' : 'PLATILLO';
}

/* ======= Hook: detectar modo compacto (tablet/phone) ======= */
function useCompact(breakpoint = 1100) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width:${breakpoint}px)`);
    const on = () => setCompact(mql.matches);
    on();
    try {
      mql.addEventListener('change', on);
      return () => mql.removeEventListener('change', on);
    } catch {
      // Safari viejo
      mql.addListener(on);
      return () => mql.removeListener(on);
    }
  }, [breakpoint]);
  return compact;
}

/* ============ Modal de Confirmación ============ */
function ConfirmarEnvioModal({
  open,
  mesa,
  total,
  itemsCount,
  esReservante,
  minimoMesa,          // minRaciones (personas)
  minimoConsumo,       // Q (monto mínimo)
  platillosNuevos,
  onCambiarMesa,
  onClose,
  onConfirm,
}) {
  if (!open) return null;

  const faltanItems = itemsCount === 0;
  const minRaciones = Number(minimoMesa || 0);
  const minQ        = Number(minimoConsumo || 0);
  const noCumpleRaciones = esReservante && minRaciones > 0 && Number(platillosNuevos || 0) < minRaciones;
  const noCumpleMonto    = esReservante && minQ > 0 && Number(total || 0) < minQ;

  return (
    <div style={modalStyle}>
      <div style={modalContent}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Confirmar envío</h3>

        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          <div>
            <b>Mesa:</b>{' '}
            {mesa ? (
              <span style={{ ...chipMesa, padding: '2px 8px' }}>#{mesa}</span>
            ) : (
              <span style={{ color: '#b91c1c' }}>Sin seleccionar</span>
            )}
          </div>
          <div>
            <b>Ítems:</b> {itemsCount}
          </div>
          <div>
            <b>Total:</b> Q{Number(total).toFixed(2)}
          </div>

          {esReservante && (minRaciones > 0 || minQ > 0) && (
            <div style={{ fontSize: 13, display: 'grid', gap: 4 }}>
              {minQ > 0 && (
                <div style={{ color: noCumpleMonto ? '#b91c1c' : '#0f766e' }}>
                  {noCumpleMonto
                    ? `Mínimo por reserva Q${minQ.toFixed(2)}: aún falta.`
                    : `Mínimo de consumo cumplido (Q${minQ.toFixed(2)}).`}
                </div>
              )}
              {minRaciones > 0 && (
                <div style={{ color: noCumpleRaciones ? '#b91c1c' : '#0f766e' }}>
                  {noCumpleRaciones
                    ? `Reserva de ${minRaciones} persona(s): agrega al menos ${minRaciones} platillo(s).`
                    : `Requisito de platillos cumplido (${minRaciones}).`}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={onCambiarMesa} style={btnGhost}>Cambiar mesa</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnGhost}>Cancelar</button>
            <button
              onClick={onConfirm}
              disabled={!mesa || faltanItems || noCumpleRaciones || noCumpleMonto}
              style={{
                ...btnConfirm,
                opacity: (!mesa || faltanItems || noCumpleRaciones || noCumpleMonto) ? 0.6 : 1,
                cursor: (!mesa || faltanItems || noCumpleRaciones || noCumpleMonto) ? 'not-allowed' : 'pointer',
              }}
            >
              Enviar orden
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ======= Barra horizontal de categorías (compacto) ======= */
function CatBar({ categorias = [], selectedId, onSelect }) {
  const scrollerRef = useRef(null);
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const check = () => setCanScroll(el.scrollWidth > el.clientWidth + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scrollBy = (dx) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dx, behavior: 'smooth' });
  };

  return (
    <div style={{ position: 'relative', padding: '8px 10px', background: '#fff' }}>
      {canScroll && (
        <>
          <button aria-label="izq" onClick={() => scrollBy(-180)} style={chipArrowLeft}>‹</button>
          <button aria-label="der" onClick={() => scrollBy(180)} style={chipArrowRight}>›</button>
        </>
      )}
      <div
        ref={scrollerRef}
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'x mandatory',
          paddingBottom: 4,
          scrollbarWidth: 'thin'
        }}
      >
        {categorias.map((cat) => {
          const active = selectedId === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect?.(cat.id)}
              style={{
                whiteSpace: 'nowrap',
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid ' + (active ? '#0f766e' : '#cbd5e1'),
                background: active ? '#0f766e' : '#fff',
                color: active ? '#fff' : '#0f172a',
                fontWeight: 800,
                scrollSnapAlign: 'start',
                cursor: 'pointer'
              }}
            >
              {cat.nombre}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============ Vista principal ============ */
export default function VistaMesero() {
  const isCompact = useCompact(1100);
  const [showCart, setShowCart] = useState(false);

  const [categorias, setCategorias] = useState([]);
  const [platillos, setPlatillos] = useState([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null);

  // EXISTENTES (edición)
  const [existentes, setExistentes] = useState([]);
  const [deleteIds, setDeleteIds] = useState(new Set());
  const [updatesNota, setUpdatesNota] = useState(new Map());
  const [editNotaModal, setEditNotaModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [notaExistenteTemporal, setNotaExistenteTemporal] = useState('');

  // NUEVOS
  const [carrito, setCarrito] = useState([]);
  const [mostrarNotas, setMostrarNotas] = useState(false);
  const [platilloActual, setPlatilloActual] = useState(null);
  const [notaTemporal, setNotaTemporal] = useState('');

  // Mesas
  const [mostrarMesaModal, setMostrarMesaModal] = useState(false);
  const [mesaSeleccionada, setMesaSeleccionada] = useState(null);
  const [mesasLista, setMesasLista] = useState([]);
  const [loadingMesas, setLoadingMesas] = useState(false);
  const [esClienteReservo, setEsClienteReservo] = useState(false);
  const [minimoMesa, setMinimoMesa] = useState(0); // minRaciones (personas)
  const [minimoConsumo, setMinimoConsumo] = useState(0); // Q (monto)

  // Reservas/alertas
  const [proximasPorMesa, setProximasPorMesa] = useState(new Map());
  const [alertas, setAlertas] = useState([]);

  // Verificar reserva
  const [showVerify, setShowVerify] = useState(false);
  const verifyMesaRef = useRef(null);

  // Editar orden
  const [ordenEditId, setOrdenEditId] = useState(null);
  const [ordenEditCodigo, setOrdenEditCodigo] = useState(null);

  // Modal de confirmación
  const [showConfirmSend, setShowConfirmSend] = useState(false);

  const navigate = useNavigate();
  const usuario = useMemo(() => JSON.parse(localStorage.getItem('usuario')), []);

  // Toast
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 2800);
  };

  useEffect(() => {
    obtenerCategoriasVisibles();
    obtenerPlatillosFiltrados();

    const raw = localStorage.getItem('ordenEnEdicion');
    if (raw) {
      try {
        const ord = JSON.parse(raw);
        setOrdenEditId(ord.id);
        setOrdenEditCodigo(ord.codigo || `#${ord.id}`);
        setMesaSeleccionada(ord.mesa || null);
        cargarOrdenExistente(ord.id);
      } catch {}
    } else {
      setMostrarMesaModal(true);
    }
  }, []);

  useEffect(() => {
    if (!mostrarMesaModal) return;
    (async () => {
      await cargarMesas();
      await refrescarProximas();
      await refrescarAlertas();
    })();
  }, [mostrarMesaModal]);

  // Cuando se selecciona/actualiza la mesa, traer sus mínimos de reserva
  useEffect(() => {
    (async () => {
      if (!mesaSeleccionada) { setMinimoMesa(0); setMinimoConsumo(0); return; }
      try {
        const st = await apiMesaStatus(mesaSeleccionada);
        setMinimoMesa(Number(st?.minRaciones || 0));       // personas
        setMinimoConsumo(Number(st?.minimoReserva || 0));  // Q
      } catch { setMinimoMesa(0); setMinimoConsumo(0); }
    })();
  }, [mesaSeleccionada]);

  const refrescarProximas = async () => {
    try {
      const list = await apiReservasProximas({ min: 0, max: 180 });
      const now = Date.now();
      const map = new Map();
      list.forEach((r) => {
        const mins = Math.max(0, Math.round((new Date(r.inicio).getTime() - now) / 60000));
        if (r.mesaNumero != null) {
          const prev = map.get(r.mesaNumero);
          if (!prev || mins < prev.minutos) {
            map.set(r.mesaNumero, { minutos: mins, reservaId: r.reservaId, cliente: r.cliente });
          }
        }
      });
      setProximasPorMesa(map);
    } catch {}
  };

  const refrescarAlertas = async () => {
    try {
      const data = await apiAlertas(45);
      setAlertas(Array.isArray(data) ? data : []);
    } catch {
      setAlertas([]);
    }
  };

  const cargarMesas = async () => {
    setLoadingMesas(true);
    try {
      const data = await apiMesasResumen();
      setMesasLista(Array.isArray(data) ? data : []);
    } catch {
      setMesasLista([]);
      showToast('No se pudieron cargar las mesas', 'danger');
    } finally {
      setLoadingMesas(false);
    }
  };

  const abrirModalMesa = () => setMostrarMesaModal(true);

  const cargarOrdenExistente = async (id) => {
    try {
      const { data } = await http.get(`/ordenes/${id}`);
      const items = (data?.items || []).map((it) => ({
        id: it.id,
        nombre: it.nombre,
        precio: it.precio,
        nota: it.nota || '',
        tipo: it.tipo === 'BEBIDA' ? 'BEBIDA' : 'PLATILLO',
        estado: it.estado,
        chefId: it.chefId || null,
      }));
      setExistentes(items);
      setDeleteIds(new Set());
      setUpdatesNota(new Map());
      setCarrito([]);
    } catch (e) {
      console.error('cargarOrdenExistente', e);
      showToast('No se pudieron cargar los ítems de la orden', 'danger');
    }
  };

  const obtenerCategoriasVisibles = async () => {
    try {
      const res = await http.get('/categorias/visibles');
      const cats = res.data || [];
      setCategorias(cats);
      if (cats.length) setCategoriaSeleccionada(cats[0].id);
    } catch (error) {
      console.error('categorias visibles', error);
      showToast('Error al cargar categorías', 'danger');
    }
  };

  const obtenerPlatillosFiltrados = async () => {
    try {
      const res = await http.get('/platillos?soloDisponibles=1&soloActivas=1');
      const data = (res.data || []).map((p) => {
        const tipocat = safeCategoriaTipo(p);
        const cat = p.categoria
          ? { ...p.categoria, tipo: p.categoria?.tipo || tipocat }
          : { id: null, nombre: '', tipo: tipocat };
        return { ...p, categoria: cat };
      });
      setPlatillos(data);
    } catch (error) {
      console.error('platillos filtrados', error);
      showToast('Error al cargar platillos', 'danger');
    }
  };

  // Requiere mesa (solo crear)
  const mustSelectMesa = !ordenEditId && !mesaSeleccionada;

  // ===== Carrito (NUEVOS) =====
  const agregarDirecto = (p, tipo = 'PLATILLO') => {
    if (mustSelectMesa) {
      showToast('Primero selecciona una mesa', 'danger');
      setMostrarMesaModal(true);
      return;
    }
    setCarrito((prev) => {
      const idx = prev.findIndex((it) => it.id === p.id && (it.nota || '') === '' && it.tipo === tipo);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = { ...copia[idx], cantidad: (copia[idx].cantidad || 1) + 1 };
        return copia;
      }
      return [
        ...prev,
        { uid: makeUid(), id: p.id, nombre: p.nombre, precio: p.precio, nota: '', cantidad: 1, tipo },
      ];
    });
    showToast(`Agregado: ${p.nombre}`, 'success');
  };

  const agregarConNota = (p, tipo = 'PLATILLO') => {
    if (mustSelectMesa) {
      showToast('Primero selecciona una mesa', 'danger');
      setMostrarMesaModal(true);
      return;
    }
    setPlatilloActual({ ...p, tipo });
    setNotaTemporal('');
    setMostrarNotas(true);
  };

  const confirmarNota = () => {
    if (!platilloActual) return;
    const notaLimpia = (notaTemporal || '').trim();
    setCarrito((prev) => [
      ...prev,
      {
        uid: makeUid(),
        id: platilloActual.id,
        nombre: platilloActual.nombre,
        precio: platilloActual.precio,
        nota: notaLimpia,
        cantidad: 1,
        tipo: platilloActual.tipo || 'PLATILLO',
      },
    ]);
    setMostrarNotas(false);
    showToast(`Agregado: ${platilloActual.nombre}${notaLimpia ? ` (nota)` : ''}`, 'success');
    setPlatilloActual(null);
    setNotaTemporal('');
  };

  const eliminarPorUid = (uid) => setCarrito((prev) => prev.filter((x) => x.uid !== uid));
  const incPorUid = (uid) => setCarrito((prev) => prev.map((x) => (x.uid === uid ? { ...x, cantidad: (x.cantidad || 1) + 1 } : x)));
  const decPorUid = (uid) => setCarrito((prev) => prev.map((x) => (x.uid === uid ? { ...x, cantidad: Math.max(1, (x.cantidad || 1) - 1) } : x)));
  const moverATipo = (uid, nuevoTipo) => setCarrito((prev) => prev.map((x) => (x.uid === uid ? { ...x, tipo: nuevoTipo } : x)));

  // ===== Existentes (edición) =====
  const toggleEliminarExistente = (id) => {
    setDeleteIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const puedeEditarNota = (it) => {
    const s = String(it.estado || '').toUpperCase();
    return s === 'PENDIENTE' || s === 'ASIGNADO';
  };

  const puedeEliminarItem = (it) => {
    const s = String(it.estado || '').toUpperCase();
    return s === 'PENDIENTE' || s === 'ASIGNADO';
  };

  const abrirEditarNota = (it) => {
    setEditTarget({ id: it.id, nombre: it.nombre });
    setNotaExistenteTemporal(it.nota || '');
    setEditNotaModal(true);
  };

  const confirmarEditarNota = () => {
    if (!editTarget) return;
    const cleaned = (notaExistenteTemporal || '').trim();
    setUpdatesNota((prev) => {
      const m = new Map(prev);
      m.set(editTarget.id, cleaned === '' ? null : cleaned);
      return m;
    });
    setExistentes((prev) => prev.map((x) => (x.id === editTarget.id ? { ...x, nota: cleaned } : x)));
    setEditNotaModal(false);
    setEditTarget(null);
    setNotaExistenteTemporal('');
  };

  // Drag & Drop
  const onDragStart = (p) => (e) => {
    if (mustSelectMesa) {
      e.preventDefault();
      showToast('Selecciona una mesa antes de arrastrar', 'danger');
      setMostrarMesaModal(true);
      return;
    }
    e.dataTransfer.setData('app/pizza', JSON.stringify({ ...p, tipo: tipoPorCategoria(p) }));
  };
  const allowDrop = (e) => {
    if (mustSelectMesa) return;
    e.preventDefault();
  };
  const onDropEn = (tipo) => (e) => {
    e.preventDefault();
    if (mustSelectMesa) {
      showToast('Selecciona una mesa primero', 'danger');
      setMostrarMesaModal(true);
      return;
    }
    try {
      const p = JSON.parse(e.dataTransfer.getData('app/pizza'));
      if (!p) return;
      agregarDirecto(p, tipo);
    } catch {}
  };

  // Totales
  const total = useMemo(
    () => [...existentes, ...carrito].reduce((s, it) => s + it.precio * (it.cantidad || 1), 0),
    [existentes, carrito]
  );

  // Total solo del carrito (creación)
  const totalCarrito = useMemo(
    () => carrito.reduce((s, it) => s + it.precio * (it.cantidad || 1), 0),
    [carrito]
  );

  // Conteo de platillos nuevos (para validar reserva)
  const countPlatillosNuevos = useMemo(
    () =>
      carrito
        .filter((i) => (i.tipo || 'PLATILLO') === 'PLATILLO')
        .reduce((s, it) => s + (it.cantidad || 1), 0),
    [carrito]
  );

  // ====== Reglas de bloqueo (dinámico) ======
  const minR = Number(minimoMesa || 0);
  const minQ = Number(minimoConsumo || 0);
  const noCumpleRacionesLive = !ordenEditId && esClienteReservo && minR > 0 && countPlatillosNuevos < minR;
  const noCumpleMontoLive    = !ordenEditId && esClienteReservo && minQ > 0 && Number(totalCarrito.toFixed(2)) < minQ;
  const faltanItemsLive      = !ordenEditId && carrito.length === 0;
  const disableEnviar = !ordenEditId && (
    !mesaSeleccionada || faltanItemsLive || noCumpleRacionesLive || noCumpleMontoLive
  );
  const motivoDisable = !mesaSeleccionada
    ? 'Debes seleccionar una mesa'
    : faltanItemsLive
    ? 'Agrega productos a la orden'
    : noCumpleMontoLive
    ? `Mínimo de consumo Q${minQ.toFixed(2)}`
    : noCumpleRacionesLive
    ? `Agrega al menos ${minR} platillo(s)`
    : '';

  // Guardar / Enviar
  const guardarCambios = async () => {
    const addPlano = carrito.flatMap((item) => {
      const cantidad = item.cantidad || 1;
      const nota = (item.nota || '').trim();
      return Array.from({ length: cantidad }).map(() => ({
        nombre: item.nombre,
        precio: item.precio,
        nota: nota === '' ? null : nota,
        tipo: item.tipo === 'BEBIDA' ? 'BEBIDA' : 'PLATILLO',
      }));
    });
    const delIds = Array.from(deleteIds);
    const upd = Array.from(updatesNota.entries()).map(([id, nota]) => ({ id, nota }));

    if (addPlano.length === 0 && delIds.length === 0 && upd.length === 0) {
      salirSinCambios();
      return;
    }

    try {
      await http.post(`/ordenes/${ordenEditId}/apply`, { add: addPlano, deleteIds: delIds, update: upd });
      showToast('Cambios aplicados', 'success');
      localStorage.removeItem('ordenEnEdicion');
      setCarrito([]);
      setDeleteIds(new Set());
      setUpdatesNota(new Map());
      navigate('/mesero/ordenes');
    } catch (error) {
      console.error('apply orden', error);
      showToast(error?.response?.data?.error || 'No se pudieron aplicar los cambios', 'danger');
    }
  };

  const enviarNuevaOrden = async () => {
    if (!mesaSeleccionada) {
      showToast('Selecciona una mesa', 'danger');
      setMostrarMesaModal(true);
      return;
    }
    if (carrito.length === 0) {
      showToast('Agrega productos', 'danger');
      return;
    }

    const itemsPlano = carrito.flatMap((item) => {
      const cantidad = item.cantidad || 1;
      const nota = (item.nota || '').trim();
      return Array.from({ length: cantidad }).map(() => ({
        nombre: item.nombre,
        precio: item.precio,
        nota: nota === '' ? null : nota,
        tipo: item.tipo === 'BEBIDA' ? 'BEBIDA' : 'PLATILLO',
      }));
    });

    // Validaciones de reserva (servidor/segunda barrera)
    const minR = Number(minimoMesa || 0);
    const platillos = itemsPlano.filter((it) => it.tipo === 'PLATILLO').length;
    if (esClienteReservo && minR > 0 && platillos < minR) {
      showToast(`Reserva de ${minR} persona(s): agrega al menos ${minR} platillo(s).`, 'danger');
      return;
    }
    const minQ = Number(minimoConsumo || 0);
    const totQ = Number(itemsPlano.reduce((s, it) => s + Number(it.precio || 0), 0).toFixed(2));
    if (esClienteReservo && minQ > 0 && totQ < minQ) {
      showToast(`Mínimo por reserva Q${minQ.toFixed(2)}. Actual: Q${totQ.toFixed(2)}.`, 'danger');
      return;
    }

    const prox = proximasPorMesa.get(mesaSeleccionada);
    const reservaId = prox?.reservaId || null;

    try {
      await http.post('/ordenes', {
        mesa: mesaSeleccionada,
        meseroId: usuario.id,
        items: itemsPlano,
        esReservante: !!esClienteReservo,
        reservaId,
      });
      showToast('Orden enviada exitosamente', 'success');
      setCarrito([]);
      setExistentes([]);
      setMesaSeleccionada(null);
      setEsClienteReservo(false);
      setMinimoMesa(0);
      setMinimoConsumo(0);
      setMostrarMesaModal(false);
      setOrdenEditId(null);
      setOrdenEditCodigo(null);
      setTimeout(() => navigate('/mesero/ordenes'), 700);
    } catch (error) {
      console.error('enviar orden', error);
      const msg = error?.response?.data?.error || 'Error al enviar la orden';
      showToast(msg, 'danger');
      if (error?.response?.status === 409 || error?.response?.status === 404) {
        cargarMesas();
      }
    }
  };

  const salirSinCambios = () => {
    localStorage.removeItem('ordenEnEdicion');
    navigate('/mesero/ordenes');
  };

  /* =================== UI =================== */
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Segoe UI, sans-serif',
        width: '100vw',
        overflow: 'hidden',
      }}
    >
      <PageTopBar title={ordenEditId ? 'Editar Orden' : 'Generar Orden'} backTo="/panel" />

      {/* Barra compacta: chips de categorías + mesa + ver pedido */}
      {isCompact && (
        <div style={{ position: 'sticky', top: 48, zIndex: 4, background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
          <CatBar
            categorias={categorias}
            selectedId={categoriaSeleccionada}
            onSelect={(id) => setCategoriaSeleccionada(id)}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>Mesa:</strong>
              {mesaSeleccionada ? (
                <span style={chipMesa}>#{mesaSeleccionada}</span>
              ) : (
                <span style={{ color: '#b91c1c', fontWeight: 700 }}>Selecciona</span>
              )}
              {!ordenEditId && (
                <button onClick={() => setMostrarMesaModal(true)} style={btnGhost}>Cambiar</button>
              )}
            </div>
            <button onClick={() => setShowCart(true)} style={btnConfirm}>
              🧺 Ver pedido {carrito.length > 0 ? `· Q${totalCarrito.toFixed(2)}` : ''}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', width: '100%', boxSizing: 'border-box' }}>
        {/* Sidebar IZQ: Categorías (escritorio) */}
        {!isCompact && (
          <div style={{ flex: '0 0 260px', padding: '1rem', borderRight: '2px solid #ccc', overflowY: 'auto', WebkitOverflowScrolling:'touch', touchAction:'pan-y' }}>
            <h2 style={{ fontSize: '1.2rem' }}>Categorías</h2>
            {categorias.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoriaSeleccionada(cat.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  marginBottom: '.8rem',
                  padding: '.6rem',
                  fontSize: '1rem',
                  backgroundColor: categoriaSeleccionada === cat.id ? '#004d4d' : '#eee',
                  color: categoriaSeleccionada === cat.id ? '#fff' : '#000',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                {cat.nombre}
              </button>
            ))}
            {!ordenEditId && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
                {mustSelectMesa ? 'Selecciona una mesa para comenzar.' : ``}
              </div>
            )}
          </div>
        )}

        {/* Centro: Platillos (siempre visible) */}
        <div style={{ flex: '1 1 auto', minWidth: 0, padding: '1rem', overflowY: 'auto', WebkitOverflowScrolling:'touch', touchAction:'pan-y', overscrollBehavior:'contain' }}>
          {ordenEditId && (
            <div
              style={{
                background: '#fff8e1',
                border: '1px solid #ffecb3',
                padding: '.6rem 1rem',
                borderRadius: 8,
                marginBottom: '1rem',
              }}
            >
              Editando la orden <b>{ordenEditCodigo || `#${ordenEditId}`}</b>.
              <span style={{ marginLeft: 10, color: '#7c2d12' }}>
                Puedes agregar ítems nuevos. Solo se permite eliminar ítems en estado <b>PENDIENTE</b> o <b>ASIGNADO</b>.
              </span>
            </div>
          )}

          <h2>Platillos</h2>

          {mustSelectMesa && (
            <div style={{ background: '#fff3', backdropFilter: 'blur(1px)', border: '1px dashed #ef4444', color: '#b91c1c', padding: 12, borderRadius: 10, marginBottom: 12 }}>
              Primero debes <b>seleccionar una mesa</b>. Se abrirá el selector automáticamente.
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '1rem',
              ...(mustSelectMesa ? { opacity: 0.6, pointerEvents: 'none' } : {}),
            }}
          >
            {platillos
              .filter((p) => p.categoria?.id === categoriaSeleccionada)
              .map((p) => (
                <div
                  key={p.id}
                  draggable={!mustSelectMesa && !isCompact}
                  onDragStart={onDragStart(p)}
                  style={{
                    background: '#fff',
                    padding: '1rem',
                    borderRadius: 10,
                    boxShadow: '0 2px 6px rgba(0,0,0,.1)',
                    cursor: mustSelectMesa ? 'not-allowed' : (!isCompact ? 'grab' : 'default'),
                  }}
                >
                  <img
                    src={p.imagenUrl || FALLBACK_IMG}
                    alt={p.nombre}
                    onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }}
                    style={{
                      width: '100%',
                      height: 140,
                      objectFit: 'cover',
                      borderRadius: 8,
                      marginBottom: '1rem',
                      display: 'block',
                    }}
                  />
                  <h4 style={{ margin: 0 }}>{p.nombre}</h4>
                  <p style={{ marginTop: '.3rem' }}>Q{Number(p.precio).toFixed(2)}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => agregarDirecto(p, tipoPorCategoria(p))}
                      style={{ padding: '.5rem .8rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6 }}
                    >
                      Agregar
                    </button>
                    <button
                      onClick={() => agregarConNota(p, tipoPorCategoria(p))}
                      style={{ padding: '.5rem .8rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6 }}
                    >
                      Agregar con nota
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Derecha: pedido (escritorio) */}
        {!isCompact && (
          <div style={{ flex: '0 0 480px', padding: '0', borderLeft: '2px solid #ccc', background: '#fff', display: 'flex', flexDirection: 'column' }}>
            {/* Header sticky */}
            <div
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 5,
                background: '#fff',
                borderBottom: '1px solid #e5e7eb',
                padding: '0.8rem 1rem',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {ordenEditId ? (
                  <strong>Modo edición</strong>
                ) : (
                  <>
                    <strong>Mesa:</strong>
                    {mesaSeleccionada ? <span style={chipMesa}>#{mesaSeleccionada}</span> : <span style={{ color: '#b91c1c', fontWeight: 700 }}>Selecciona una mesa</span>}
                    <span style={{ marginLeft: 8, color: '#334155', fontWeight: 700 }}>Total: Q{totalCarrito.toFixed(2)}</span>

                    {/* Aviso compacto en header cuando hay mínimos por reserva */}
                    {!ordenEditId && mesaSeleccionada && esClienteReservo && (minR > 0 || minQ > 0) && (
                      <span
                        style={{
                          marginLeft: 8,
                          background: '#fffbeb',
                          border: '1px solid #fcd34d',
                          color: '#92400e',
                          padding: '2px 8px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                        title="Mesa reservada con mínimos"
                      >
                        Mesa reservada: {minQ > 0 ? `min. Q${minQ.toFixed(2)}` : ''}{minQ > 0 && minR > 0 ? ' · ' : ''}{minR > 0 ? `min. ${minR} plat.` : ''}
                      </span>
                    )}
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {ordenEditId ? (
                  <>
                    <button onClick={salirSinCambios} style={btnGhost}>Salir sin cambios</button>
                    <button onClick={guardarCambios} style={btnConfirm}>Guardar cambios</button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      if (disableEnviar) return;
                      setShowConfirmSend(true);
                    }}
                    disabled={disableEnviar}
                    title={disableEnviar ? motivoDisable : 'Enviar orden a cocina/barra'}
                    style={{
                      ...btnConfirm,
                      opacity: disableEnviar ? 0.6 : 1,
                      cursor: disableEnviar ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {mesaSeleccionada ? 'Enviar Orden' : 'Seleccionar mesa'}
                  </button>
                )}
              </div>
            </div>

            {/* Cuerpo */}
            <RightPanelBody
              {...{
                ordenEditId, existentes, deleteIds, updatesNota,
                puedeEditarNota, puedeEliminarItem, abrirEditarNota, toggleEliminarExistente,
                mustSelectMesa, carrito, incPorUid, decPorUid, eliminarPorUid, moverATipo,
                totalCarrito, minR, minQ, countPlatillosNuevos, esClienteReservo,
                allowDrop, onDropEn
              }}
            />
          </div>
        )}
      </div>

      {/* ======= Drawer del pedido en modo compacto ======= */}
      {isCompact && showCart && (
        <Drawer side="right" onClose={() => setShowCart(false)} width={Math.min(520, Math.floor(window.innerWidth * 0.92))}>
          {/* Header compacto del pedido */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {ordenEditId ? (
                <strong>Modo edición</strong>
              ) : (
                <>
                  <strong>Mesa:</strong>
                  {mesaSeleccionada ? <span style={chipMesa}>#{mesaSeleccionada}</span> : <span style={{ color: '#b91c1c', fontWeight: 700 }}>Selecciona una mesa</span>}
                  <span style={{ marginLeft: 8, color: '#334155', fontWeight: 700 }}>Total: Q{totalCarrito.toFixed(2)}</span>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {ordenEditId ? (
                <>
                  <button onClick={salirSinCambios} style={btnGhost}>Salir</button>
                  <button onClick={async () => { await guardarCambios(); setShowCart(false); }} style={btnConfirm}>Guardar</button>
                </>
              ) : (
                <button
                  onClick={() => {
                    if (disableEnviar) return;
                    setShowConfirmSend(true);
                  }}
                  disabled={disableEnviar}
                  title={disableEnviar ? motivoDisable : 'Enviar orden a cocina/barra'}
                  style={{
                    ...btnConfirm,
                    opacity: disableEnviar ? 0.6 : 1,
                    cursor: disableEnviar ? 'not-allowed' : 'pointer',
                  }}
                >
                  Enviar
                </button>
              )}
            </div>
          </div>

          {/* Cuerpo del panel derecho (reutilizamos componente) */}
          <RightPanelBody
            {...{
              ordenEditId, existentes, deleteIds, updatesNota,
              puedeEditarNota, puedeEliminarItem, abrirEditarNota, toggleEliminarExistente,
              mustSelectMesa, carrito, incPorUid, decPorUid, eliminarPorUid, moverATipo,
              totalCarrito, minR, minQ, countPlatillosNuevos, esClienteReservo,
              allowDrop, onDropEn
            }}
          />
        </Drawer>
      )}

      {/* Toast */}
      <ToastMessage message={toast.message} type={toast.type} show={toast.show} onClose={() => setToast((prev) => ({ ...prev, show: false }))} />

      {/* Modal nota NUEVO item */}
      {mostrarNotas && (
        <div style={modalStyle}>
          <div style={modalContent}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Agregar nota</h3>
            <textarea value={notaTemporal} onChange={(e) => setNotaTemporal(e.target.value)} placeholder="Ej: Sin cebolla, extra salsa…" style={textarea} />
            <div style={modalActions}>
              <button onClick={() => setMostrarNotas(false)} style={btnGhost}>Cancelar</button>
              <button onClick={confirmarNota} style={btnConfirm}>Añadir al carrito</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nota EXISTENTE */}
      {editNotaModal && (
        <div style={modalStyle}>
          <div style={modalContent}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              Nota para: <span style={{ color: '#0f766e' }}>{editTarget?.nombre}</span>
            </h3>
            <textarea
              value={notaExistenteTemporal}
              onChange={(e) => setNotaExistenteTemporal(e.target.value)}
              placeholder="Escribe o deja vacío para quitar la nota…"
              style={textarea}
            />
            <div style={modalActions}>
              <button
                onClick={() => {
                  setEditNotaModal(false);
                  setEditTarget(null);
                }}
                style={btnGhost}
              >
                Cancelar
              </button>
              <button onClick={confirmarEditarNota} style={btnConfirm}>
                Guardar nota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal mesa (seleccionar/actualizar mesa) */}
      {mostrarMesaModal && !ordenEditId && (
        <div
          style={modalStyle}
          onClick={(e) => {
            if (e.target === e.currentTarget) setMostrarMesaModal(false);
          }}
        >
          <div style={modalContent}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Asignar mesa</h3>
              <button aria-label="Cerrar" onClick={() => setMostrarMesaModal(false)} style={btnClose} title="Cerrar">×</button>
            </div>

            {alertas.length > 0 && (
              <div style={{ background: '#fff1f2', border: '1px solid #fecaca', color: '#991b1b', padding: '6px 10px', borderRadius: 8, marginBottom: 8, fontSize: 14 }}>
                <b>Alertas:</b> {alertas.length} reserva(s) comienzan pronto.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button
                onClick={async () => {
                  await cargarMesas();
                  await refrescarProximas();
                  await refrescarAlertas();
                }}
                style={btnGhost}
              >
                Actualizar
              </button>
            </div>

            {loadingMesas ? (
              <div style={emptyBox}>Cargando mesas…</div>
            ) : mesasLista.length === 0 ? (
              <div style={emptyBox}>No hay mesas registradas.</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8, margin: '1rem 0' }}>
                  {mesasLista.map((m) => {
                    const estado = String(m.estado).toUpperCase();
                    const disponible = estado === 'DISPONIBLE';
                    const reservadaFlag = estado === 'RESERVADA';
                    const ocupada = estado === 'OCUPADA';

                    const proxima = proximasPorMesa.get(m.numero);
                    const soon = !!proxima && proxima.minutos <= 45;
                    const started = !!proxima && proxima.minutos === 0;

                    const bg =
                      mesaSeleccionada === m.numero
                        ? '#004d4d'
                        : ocupada
                        ? '#fecaca'
                        : reservadaFlag || soon
                        ? '#fde68a'
                        : '#c7f9cc';

                    const handleClick = async () => {
                      if (ocupada) return;
                      if (reservadaFlag || soon) {
                        verifyMesaRef.current = m;
                        setShowVerify(true);
                        return;
                      }
                      setMesaSeleccionada(m.numero);
                      setEsClienteReservo(false);
                      try {
                        const st = await apiMesaStatus(m.numero);
                        setMinimoMesa(Number(st?.minRaciones || 0));      // personas
                        setMinimoConsumo(Number(st?.minimoReserva || 0)); // Q
                      } catch { setMinimoMesa(0); setMinimoConsumo(0); }
                    };

                    const title = ocupada
                      ? 'Ocupada'
                      : (reservadaFlag || soon)
                      ? `Reservada${proxima ? (proxima.minutos === 0 ? ' (en curso)' : ` en ${proxima.minutos} min`) : ''}${m.reservadaPor ? ` • ${m.reservadaPor}` : ''}`
                      : `Capacidad: ${m.capacidad}`;

                    return (
                      <button
                        key={m.id}
                        onClick={handleClick}
                        disabled={ocupada}
                        title={title}
                        style={{
                          position: 'relative',
                          width: '78px',
                          height: '78px',
                          border: 'none',
                          borderRadius: 12,
                          fontSize: '1.2rem',
                          fontWeight: 800,
                          cursor: ocupada ? 'not-allowed' : 'pointer',
                          color: mesaSeleccionada === m.numero ? '#fff' : '#111',
                          backgroundColor: bg,
                          opacity: ocupada ? 0.85 : 1,
                        }}
                      >
                        {m.numero}

                        {proxima && (
                          <span
                            style={{
                              position: 'absolute',
                              top: 6,
                              right: 6,
                              background: '#0ea5e9',
                              color: '#fff',
                              fontSize: 10,
                              fontWeight: 900,
                              padding: '2px 6px',
                              borderRadius: 999,
                            }}
                            title={
                              started
                                ? `Reserva en curso${proxima.cliente ? ` • ${proxima.cliente}` : ''}`
                                : `Reserva en ${proxima.minutos} min${proxima.cliente ? ` • ${proxima.cliente}` : ''}`
                            }
                          >
                            {started ? 'En curso' : `Res. ${proxima.minutos}`}
                          </span>
                        )}

                        {!disponible && (
                          <span
                            style={{
                              position: 'absolute',
                              bottom: 6,
                              left: 6,
                              right: 6,
                              fontSize: 10,
                              fontWeight: 900,
                              color: (reservadaFlag || soon) ? '#92400e' : '#991b1b',
                              textTransform: 'uppercase',
                            }}
                          >
                            {(reservadaFlag || soon) ? 'RESERVADA' : 'OCUPADA'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                  <b>Leyenda:</b> Verde = disponible, Amarillo = reservada (seleccionable), Rojo = ocupada
                </div>
              </>
            )}

            {/* Footer del modal */}
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'space-between' }}>
              <button
                onClick={() => {
                  setMostrarMesaModal(false);
                  navigate('/panel');
                }}
                style={btnGhost}
              >
                Cancelar y volver
              </button>

              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button
                  onClick={() => {
                    if (!mesaSeleccionada) {
                      showToast('Debes seleccionar una mesa para continuar', 'danger');
                      return;
                    }
                    setMostrarMesaModal(false);
                    if (carrito.length > 0) setShowConfirmSend(true);
                  }}
                  style={btnGhost}
                >
                  {mesaSeleccionada ? 'Usar esta mesa' : 'Seleccionar mesa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal “¿Es la persona que reservó?” */}
      {showVerify && (
        <VerificarReservaModal
          open={showVerify}
          title={`Mesa ${verifyMesaRef.current?.numero} reservada`}
          message={(() => {
            const m = verifyMesaRef.current;
            const nombre =
              m?.reservadaPor ||
              (m ? proximasPorMesa.get(m.numero)?.cliente : null);
            return nombre
              ? `Está reservada por ${nombre}. ¿Es la persona que reservó?`
              : 'Está reservada. ¿Es la persona que reservó?';
          })()}
          confirmLabel="Sí, es el cliente"
          onCancel={() => {
            setShowVerify(false);
            verifyMesaRef.current = null;
          }}
          onConfirm={async () => {
            const m = verifyMesaRef.current;
            setShowVerify(false);
            verifyMesaRef.current = null;
            if (!m) return;
            setMesaSeleccionada(m.numero);
            setEsClienteReservo(true);
            try {
              const st = await apiMesaStatus(m.numero);
              const minR = Number(st?.minRaciones || 0);
              const minQ = Number(st?.minimoReserva || 0);
              setMinimoMesa(minR);      // personas
              setMinimoConsumo(minQ);   // Q
              if (minR > 0 || minQ > 0) {
                const parts = [];
                if (minQ > 0) parts.push(`Q${minQ.toFixed(2)}`);
                if (minR > 0) parts.push(`${minR} platillos`);
                showToast(`Consumo mínimo ${parts.join(' y ')} para ocupar la mesa reservada`, 'danger');
              }
            } catch {
              setMinimoMesa(0);
              setMinimoConsumo(0);
            }
          }}
        />
      )}

      {/* Modal de Confirmar Envío */}
      <ConfirmarEnvioModal
        open={showConfirmSend}
        mesa={mesaSeleccionada}
        total={totalCarrito}
        itemsCount={carrito.length}
        esReservante={esClienteReservo}
        minimoMesa={minimoMesa}
        minimoConsumo={minimoConsumo}
        platillosNuevos={countPlatillosNuevos}
        onCambiarMesa={() => {
          setShowConfirmSend(false);
          setMostrarMesaModal(true);
        }}
        onClose={() => setShowConfirmSend(false)}
        onConfirm={async () => {
          setShowConfirmSend(false);
          await enviarNuevaOrden();
        }}
      />
    </div>
  );
}

/* ======= Subcomponentes reutilizables ======= */
function Drawer({ side = 'right', width = Math.min(520, Math.floor(window.innerWidth * 0.92)), onClose, children }) {
  const fromLeft = side === 'left';
  return (
    <div style={drawerOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div
        style={{
          ...drawerPanel,
          width,
          [fromLeft ? 'left' : 'right']: 0,
          transform: 'translateX(0)',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          overscrollBehavior: 'contain',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} aria-label="Cerrar" style={btnClose}>×</button>
        </div>
        <div style={{ padding: '0 10px 14px' }}>{children}</div>
      </div>
    </div>
  );
}

function RightPanelBody(props) {
  const {
    ordenEditId, existentes, deleteIds, updatesNota,
    puedeEditarNota, puedeEliminarItem, abrirEditarNota, toggleEliminarExistente,
    mustSelectMesa, carrito, incPorUid, decPorUid, eliminarPorUid, moverATipo,
    totalCarrito, minR, minQ, countPlatillosNuevos, esClienteReservo,
    allowDrop, onDropEn
  } = props;

  return (
    <div style={{ padding: '1rem', overflowY: 'auto', WebkitOverflowScrolling:'touch', touchAction:'pan-y', overscrollBehavior:'contain', display: 'grid', gap: 16 }}>
      {/* Banner descriptivo de mínimos en el panel derecho */}
      {!ordenEditId && esClienteReservo && (minR > 0 || minQ > 0) && (
        <div
          style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            color: '#92400e',
            padding: '8px 12px',
            borderRadius: 8,
          }}
        >
          Mesa reservada:
          {minQ > 0 ? <> mínimo <b>Q{minQ.toFixed(2)}</b> {minQ > 0 ? `(actual: Q${totalCarrito.toFixed(2)})` : ''}</> : null}
          {minR > 0 ? <> {minQ > 0 ? 'y ' : ''}<b>{minR}</b> platillo(s) {minR > 0 ? `(actual: ${countPlatillosNuevos})` : ''}</> : null}.
        </div>
      )}

      {/* EXISTENTES */}
      {ordenEditId && (
        <section style={section}>
          <h3 style={{ marginTop: 0 }}>Ya en la orden</h3>
          {existentes.length === 0 ? (
            <div style={emptyBox}>Sin ítems previos.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {existentes.map((it) => {
                const canEdit   = puedeEditarNota(it);
                const canDelete = puedeEliminarItem(it);
                const marcado   = deleteIds.has(it.id);
                const editado   = updatesNota.has(it.id);

                return (
                  <div
                    key={it.id}
                    style={{
                      padding: '10px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      background: marcado ? '#fee2e2' : '#f8fafc',
                      opacity: (!canEdit && !canDelete) ? 0.8 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <strong>{it.nombre}</strong> • Q{Number(it.precio).toFixed(2)} • {it.tipo}
                        {it.nota ? (
                          <div style={{ fontSize: 13, color: '#6b7280' }}>
                            <em>Nota: {it.nota}</em> {editado && <span style={{ marginLeft: 6, fontWeight: 700, color: '#0f766e' }}>(editada)</span>}
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: '#6b7280' }}>
                            <em>Sin nota</em> {editado && <span style={{ marginLeft: 6, fontWeight: 700, color: '#0f766e' }}>(agregada)</span>}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          Estado: {it.estado}
                          {it.chefId ? ` • Chef ${it.chefId}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          disabled={!canEdit}
                          onClick={() => abrirEditarNota(it)}
                          style={{
                            padding: '.4rem .7rem',
                            borderRadius: 6,
                            border: '1px solid #94a3b8',
                            background: '#fff',
                            color: '#0f172a',
                            cursor: !canEdit ? 'not-allowed' : 'pointer',
                            fontWeight: 700,
                          }}
                          title={!canEdit ? 'No se puede editar nota (ya en cocina o entregado)' : 'Editar nota'}
                        >
                          Editar nota
                        </button>

                        <button
                          disabled={!canDelete}
                          onClick={() => toggleEliminarExistente(it.id)}
                          style={{
                            padding: '.4rem .7rem',
                            border: 'none',
                            cursor: !canDelete ? 'not-allowed' : 'pointer',
                            background: marcado ? '#991b1b' : '#ef4444',
                            color: '#fff',
                            fontWeight: 700,
                          }}
                          title={
                            !canDelete
                              ? 'No se puede eliminar (solo PENDIENTE o ASIGNADO)'
                              : (marcado ? 'Deshacer' : 'Marcar para eliminar')
                          }
                        >
                          {marcado ? 'Deshacer' : 'Eliminar'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 13, color: '#64748b' }}>
            * Reglas: solo se puede <b>eliminar</b> ítems en <b>PENDIENTE</b> o <b>ASIGNADO</b>. Puedes <b>agregar</b> nuevos ítems aunque haya ítems en preparación o listos.
          </div>
        </section>
      )}

      {/* NUEVOS */}
      <section style={section}>
        <h3 style={{ marginTop: 0 }}>{ordenEditId ? 'Nuevos a agregar' : 'Pedido'}</h3>

        {/* Zona platillos */}
        <div
          onDragOver={allowDrop}
          onDrop={onDropEn('PLATILLO')}
          style={{
            background: '#f1f5f9',
            border: '2px dashed #0f766e',
            minHeight: 120,
            borderRadius: 10,
            padding: 10,
            marginBottom: 12,
            ...(mustSelectMesa ? { opacity: 0.6 } : {}),
          }}
        >
          <h4 style={{ marginTop: 0 }}>🍽️ Platillos (para cocina)</h4>
          {carrito.filter((i) => i.tipo === 'PLATILLO').length === 0 &&
          (!ordenEditId || existentes.filter((i) => i.tipo === 'PLATILLO').length === 0) ? (
            <p style={{ margin: 0, color: '#64748b' }}>{mustSelectMesa ? 'Selecciona una mesa para empezar.' : 'Arrastra aquí o usa “Agregar”.'}</p>
          ) : null}

          {carrito
            .filter((i) => i.tipo === 'PLATILLO')
            .map((item) => {
              const cant = item.cantidad || 1;
              const sub = item.precio * cant;
              return (
                <div key={item.uid} style={{ marginBottom: '0.6rem', background: '#e2e8f0', padding: '0.6rem', borderRadius: 8 }}>
                  <strong>
                    {item.nombre}
                    {cant > 1 ? ` x${cant}` : ''}
                  </strong>
                  <div>
                    Q{item.precio.toFixed(2)}
                    {cant > 1 ? ` • Subtotal: Q${sub.toFixed(2)}` : ''}
                  </div>
                  {item.nota && (
                    <div>
                      <em>Nota: {item.nota}</em>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button onClick={() => incPorUid(item.uid)}>+1</button>
                    <button onClick={() => decPorUid(item.uid)}>-1</button>
                    <button onClick={() => eliminarPorUid(item.uid)} style={{ background: '#e11d48', color: '#fff', border: 'none', borderRadius: 4, padding: '.2rem .5rem' }}>
                      Eliminar
                    </button>
                    <button onClick={() => moverATipo(item.uid, 'BEBIDA')}>→ Bebidas</button>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Zona bebidas */}
        <div
          onDragOver={allowDrop}
          onDrop={onDropEn('BEBIDA')}
          style={{
            background: '#fef3c7',
            border: '2px dashed #ea580c',
            minHeight: 120,
            borderRadius: 10,
            padding: 10,
            ...(mustSelectMesa ? { opacity: 0.6 } : {}),
          }}
        >
          <h4 style={{ marginTop: 0 }}>🥤 Bebidas (para barra)</h4>
          {carrito.filter((i) => i.tipo === 'BEBIDA').length === 0 &&
          (!ordenEditId || existentes.filter((i) => i.tipo === 'BEBIDA').length === 0) ? (
            <p style={{ margin: 0, color: '#a16207' }}>{mustSelectMesa ? 'Selecciona una mesa para empezar.' : 'Arrastra aquí si es bebida.'}</p>
          ) : null}

          {carrito
            .filter((i) => i.tipo === 'BEBIDA')
            .map((item) => {
              const cant = item.cantidad || 1;
              const sub = item.precio * cant;
              return (
                <div key={item.uid} style={{ marginBottom: '0.6rem', background: '#fde68a', padding: '0.6rem', borderRadius: 8 }}>
                  <strong>
                    {item.nombre}
                    {cant > 1 ? ` x${cant}` : ''}
                  </strong>
                  <div>
                    Q{item.precio.toFixed(2)}
                    {cant > 1 ? ` • Subtotal: Q${sub.toFixed(2)}` : ''}
                  </div>
                  {item.nota && (
                    <div>
                      <em>Nota: {item.nota}</em>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button onClick={() => incPorUid(item.uid)}>+1</button>
                    <button onClick={() => decPorUid(item.uid)}>-1</button>
                    <button onClick={() => eliminarPorUid(item.uid)} style={{ background: '#e11d48', color: '#fff', border: 'none', borderRadius: 4, padding: '.2rem .5rem' }}>
                      Eliminar
                    </button>
                    <button onClick={() => moverATipo(item.uid, 'PLATILLO')}>→ Platillos</button>
                  </div>
                </div>
              );
            })}
        </div>

        {!ordenEditId && <div style={{ marginTop: 10, color: '#334155', fontWeight: 700 }}>Total nuevos: Q{totalCarrito.toFixed(2)}</div>}
      </section>
    </div>
  );
}

/* =================== Estilos =================== */
const section = { background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' };
const emptyBox = { background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: '12px 10px', color: '#64748b', fontSize: 15 };

const modalStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 999,
};

const modalContent = {
  background: '#fff',
  padding: 24,
  borderRadius: 12,
  width: 480,
  maxWidth: '92vw',
  boxSizing: 'border-box',
  boxShadow: '0 12px 32px rgba(0,0,0,.18)',
};

const textarea = {
  width: '100%',
  minHeight: 120,
  padding: 12,
  fontSize: '1rem',
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  outline: 'none',
  resize: 'vertical',
  boxSizing: 'border-box',
};

const modalActions = { display: 'flex', justifyContent: 'space-between', marginTop: 16 };

const btnGhost = {
  padding: '.6rem 1.2rem',
  background: '#e5e7eb',
  color: '#111827',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
};

const btnConfirm = {
  padding: '.6rem 1.2rem',
  background: '#004d4d',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
};

const chipMesa = {
  background: '#e0f2fe',
  color: '#075985',
  padding: '2px 8px',
  borderRadius: 999,
  fontWeight: 700,
};

const btnClose = {
  background: 'transparent',
  border: 'none',
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 4,
  borderRadius: 6,
};

const drawerOverlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.45)',
  zIndex: 998,
  display: 'flex',
};

const drawerPanel = {
  position: 'fixed',
  top: 0,
  bottom: 0,
  background: '#fff',
  boxShadow: '0 10px 30px rgba(0,0,0,.3)',
  padding: '10px 8px',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  touchAction: 'pan-y',
  overscrollBehavior: 'contain',
};

/* Flechas para la barra de chips (compacto) */
const chipArrowLeft = {
  position: 'absolute',
  left: 6,
  top: '50%',
  transform: 'translateY(-50%)',
  border: '1px solid #cbd5e1',
  borderRadius: 999,
  background: '#fff',
  cursor: 'pointer',
  width: 28,
  height: 28,
  lineHeight: '26px',
  textAlign: 'center',
  fontWeight: 900,
  zIndex: 2
};
const chipArrowRight = { ...chipArrowLeft, left: 'auto', right: 6 };


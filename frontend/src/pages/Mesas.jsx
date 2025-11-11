import React, { useEffect, useRef, useState } from 'react';
import { http, openSSE } from '../config/client';
import AdminHeader from '../components/AdminHeader';
import ToastMessage from '../components/ToastMessage';
import { Modal } from 'bootstrap';
import { FiPlus, FiEdit2, FiSave, FiX, FiTrash2, FiPower } from 'react-icons/fi';

const FALLBACK_CAP = 4;

export default function Mesas() {
  const [mesas, setMesas] = useState([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({ numero: '', capacidad: '' });
  const [editId, setEditId] = useState(null);

  const sseRef = useRef(null);

  // Toast
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 3000);
  };

  // Modal confirm
  const [confirmData, setConfirmData] = useState(null);
  const modalRef = useRef(null);
  const modalInstanceRef = useRef(null);

  useEffect(() => {
    if (!confirmData) return;
    modalInstanceRef.current = new Modal(modalRef.current, { backdrop: true, keyboard: true });

    const node = modalRef.current;
    const onHidden = () => {
      setConfirmData(null);
      if (modalInstanceRef.current) modalInstanceRef.current.dispose();
      modalInstanceRef.current = null;
    };

    node.addEventListener('hidden.bs.modal', onHidden);
    modalInstanceRef.current.show();
    return () => node.removeEventListener('hidden.bs.modal', onHidden);
  }, [confirmData]);

  const closeModal = () => { if (modalInstanceRef.current) modalInstanceRef.current.hide(); };

  async function fetchMesas() {
    try {
      const { data } = await http.get('/mesas');
      setMesas(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('GET /mesas', e?.response?.data || e?.message);
      showToast(e?.response?.data?.error || 'No se pudieron cargar las mesas', 'danger');
    }
  }

  useEffect(() => {
    fetchMesas();

    // SSE
    try {
      const es = openSSE('/mesas/stream');
      sseRef.current = es;
      es.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          if (payload?.type?.startsWith('mesa_')) fetchMesas();
        } catch {}
      };
      es.onerror = () => {};
      return () => es.close();
    } catch {}

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setForm({ numero: '', capacidad: '' });
    setEditId(null);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const numero = Number(form.numero);
    const capacidad = Number(form.capacidad || FALLBACK_CAP);

    if (!Number.isInteger(numero) || numero < 1) {
      showToast('Número de mesa inválido', 'danger');
      return;
    }
    if (!Number.isInteger(capacidad) || capacidad < 1) {
      showToast('Capacidad inválida', 'danger');
      return;
    }

    const dupLocal = mesas.some((m) => m.numero === numero && m.id !== editId);
    if (dupLocal) return showToast(`Ya existe una mesa con el número ${numero}.`, 'danger');

    setLoading(true);
    try {
      if (editId) {
        await http.patch(`/mesas/${editId}`, { numero, capacidad });
        showToast('Mesa actualizada', 'success');
      } else {
        await http.post('/mesas', { numero, capacidad });
        showToast('Mesa creada', 'success');
      }
      await fetchMesas();
      resetForm();
    } catch (e2) {
      const status = e2?.response?.status;
      if (status === 409) showToast(`Ya existe una mesa con el número ${numero}.`, 'danger');
      else showToast(e2?.response?.data?.error || 'No se pudo guardar', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (m) => {
    setEditId(m.id);
    setForm({ numero: String(m.numero), capacidad: String(m.capacidad) });
  };

  const cancelarEdit = () => resetForm();

  // ------- Acciones con modal --------
  const pedirEliminar = (m) => {
    setConfirmData({
      title: `Eliminar mesa #${m.numero}`,
      message: 'Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          await http.delete(`/mesas/${m.id}`);
          showToast('Mesa eliminada', 'success');
          await fetchMesas();
        } catch (e) {
          showToast(e?.response?.data?.error || 'No se pudo eliminar la mesa', 'danger');
        } finally {
          closeModal();
        }
      },
    });
  };

  const pedirToggleActiva = (m) => {
    const vaAActivar = !m.activa;
    const title = vaAActivar ? `Activar mesa #${m.numero}` : `Desactivar mesa #${m.numero}`;
    const msg = vaAActivar
      ? 'La mesa volverá a estar disponible para meseros y clientes.'
      : 'Mientras esté desactivada no aparecerá para meseros ni clientes.';

    setConfirmData({
      title,
      message: msg,
      confirmText: vaAActivar ? 'Activar' : 'Desactivar',
      confirmVariant: vaAActivar ? 'primary' : 'warning',
      onConfirm: async () => {
        try {
          await http.patch(`/mesas/${m.id}/activar`, { activa: vaAActivar });
          showToast(vaAActivar ? 'Mesa activada' : 'Mesa desactivada', 'success');
          await fetchMesas();
        } catch (e) {
          showToast(e?.response?.data?.error || 'No se pudo cambiar el estado', 'danger');
        } finally {
          closeModal();
        }
      },
    });
  };

  // ------- helpers visuales -------
  const estadoLabel = (m) => {
    if (m.activa === false) return 'Inactiva';
    if (m.estado === 'RESERVADA') return 'Reservada';
    if (m.estado === 'OCUPADA') return 'Ocupada';
    return 'Disponible';
  };
  const estadoClass = (m) => {
    if (m.activa === false) return 'badge off';
    if (m.estado === 'RESERVADA') return 'badge warn';
    if (m.estado === 'OCUPADA') return 'badge danger';
    return 'badge ok';
  };

  return (
    <>
      <AdminHeader />

      <div className="mesas-page">
        <div className="container">
          <div className="title-row">
            <h1 className="page-title">Mesas</h1>
          </div>

          {/* Formulario crear/editar */}
          <form className="card" onSubmit={onSubmit}>
            <div className="grid">
              <div className="field">
                <label>Número de mesa</label>
                <input
                  type="number"
                  min="1"
                  value={form.numero}
                  onChange={(e) => setForm({ ...form, numero: e.target.value })}
                  placeholder="Ej. 1"
                />
              </div>
              <div className="field">
                <label>Capacidad</label>
                <input
                  type="number"
                  min="1"
                  value={form.capacidad}
                  onChange={(e) => setForm({ ...form, capacidad: e.target.value })}
                  placeholder="Ej. 4"
                />
              </div>
              <div className="field actions">
                <button className="btn primary" type="submit" disabled={loading}>
                  {editId ? (<><FiSave/> Guardar</>) : (<><FiPlus/> Crear mesa</>)}
                </button>
                {editId && (
                  <button type="button" className="btn" onClick={cancelarEdit}><FiX/> Cancelar</button>
                )}
              </div>
            </div>
          </form>

          {/* Listado */}
          <div className="card">
            <h2 className="card-title">Listado de mesas</h2>
            <div className="mesas-grid">
              {mesas.map((m) => (
                <div key={m.id} className="mesa-card">
                  <div className="mesa-row">
                    <div className="mesa-num">Mesa {m.numero}</div>
                    <div className={estadoClass(m)}>{estadoLabel(m)}</div>
                  </div>

                  <div className="mesa-row">
                    <div>Capacidad: <b>{m.capacidad}</b></div>
                  </div>

                  {!!m.reservadaPor && m.activa !== false && (
                    <div className="mesa-row small">Reservada por: <b>{m.reservadaPor}</b></div>
                  )}

                  <div className="mesa-actions">
                    <button className="btn" onClick={() => startEdit(m)}><FiEdit2/> Editar</button>

                    <button
                      className={`btn ${m.activa ? 'warn' : 'primary'}`}
                      onClick={() => pedirToggleActiva(m)}
                      disabled={m.activa && m.estado !== 'DISPONIBLE'}
                      title={m.activa && m.estado !== 'DISPONIBLE' ? 'No puedes desactivar una mesa en uso' : ''}
                    >
                      <FiPower/>{m.activa ? ' Desactivar' : ' Activar'}
                    </button>

                    <button className="btn danger" onClick={() => pedirEliminar(m)}>
                      <FiTrash2/> Eliminar
                    </button>
                  </div>
                </div>
              ))}
              {mesas.length === 0 && <div className="empty">No hay mesas aún.</div>}
            </div>
          </div>
        </div>

        {/* Toast */}
        <ToastMessage
          message={toast.message}
          type={toast.type}
          show={toast.show}
          onClose={() => setToast((prev) => ({ ...prev, show: false }))}
        />

        {/* Modal (con clase confirm-modal para forzar contraste) */}
        {confirmData && (
          <div className="modal fade confirm-modal" tabIndex="-1" ref={modalRef}>
            <div className="modal-dialog">
              <div className="modal-content">
                <div
                  className={`modal-header text-white ${
                    confirmData.confirmVariant === 'warning'
                      ? 'bg-warning'
                      : confirmData.confirmVariant === 'primary'
                      ? 'bg-primary'
                      : 'bg-danger'
                  }`}
                >
                  <h5 className="modal-title">{confirmData.title}</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={closeModal} />
                </div>
                <div className="modal-body">
                  <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{confirmData.message}</p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                  <button
                    type="button"
                    className={`btn ${
                      confirmData.confirmVariant === 'warning'
                        ? 'btn-warning'
                        : confirmData.confirmVariant === 'primary'
                        ? 'btn-primary'
                        : 'btn-danger'
                    }`}
                    onClick={confirmData.onConfirm}
                  >
                    {confirmData.confirmText || 'Aceptar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* estilos */}
      <style>{`
        .container { max-width: 1100px; margin: 0 auto; padding: 16px; }
        .title-row { display:flex; justify-content:space-between; align-items:center; }
        .page-title { margin: 8px 0 12px; font-size: 22px; font-weight: 800; color:#0f172a; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
        .card-title { margin: 0 0 12px; font-size: 16px; font-weight: 600; }
        .grid { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: end; }
        .field label { display:block; font-size:12px; color:#475569; margin-bottom:4px; }
        .field input { width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; }
        .actions { display:flex; gap:8px; }
        /* Botones de la página (no modal) */
        .mesas-page .btn { display:inline-flex; gap:8px; align-items:center; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc; cursor:pointer; }
        .mesas-page .btn.primary { background:#2563eb; border-color:#2563eb; color:#fff; }
        .mesas-page .btn.warn    { background:#f59e0b; border-color:#f59e0b; color:#fff; }
        .mesas-page .btn.danger  { background:#ef4444; border-color:#ef4444; color:#fff; }
        .mesas-page .btn:disabled { opacity:.6; cursor:not-allowed; }
        .mesas-page .mesas-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:12px; }
        .mesas-page .mesa-card { border:1px solid #e2e8f0; border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:8px; }
        .mesas-page .mesa-row { display:flex; justify-content:space-between; align-items:center; }
        .mesas-page .mesa-row.small { font-size:12px; color:#475569; }
        .mesas-page .mesa-num { font-weight:700; }
        .mesas-page .badge { padding:4px 8px; border-radius:999px; font-size:12px; }
        .mesas-page .badge.ok { background:#e6fffa; color:#0f766e; border:1px solid #99f6e4; }
        .mesas-page .badge.warn { background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; }
        .mesas-page .badge.danger { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; }
        .mesas-page .badge.off { background:#f3f4f6; color:#374151; border:1px solid #e5e7eb; }
        .mesas-page .mesa-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .mesas-page .empty { padding:8px; color:#64748b; font-style:italic; }

        /* ===== Modal con contraste forzado (evita que .mesas-page .btn afecte) ===== */
        .confirm-modal .modal-content { border-radius:14px; overflow:hidden; }
        .confirm-modal .modal-header { font-weight:800; }
        .confirm-modal .modal-body { color:#0f172a; }
        .confirm-modal .btn {
          opacity: 1 !important;
          filter: none !important;
          background: #e5e7eb !important;
          border: 1px solid #cbd5e1 !important;
          color: #0f172a !important;
          font-weight: 600;
          padding: 8px 14px;
          border-radius: 10px;
          min-width: 120px;
        }
        .confirm-modal .btn:hover { background:#d1d5db !important; }
        .confirm-modal .btn-secondary {
          background:#f1f5f9 !important; border-color:#cbd5e1 !important; color:#0f172a !important;
        }
        .confirm-modal .btn-danger {
          background:#ef4444 !important; border-color:#ef4444 !important; color:#fff !important;
        }
        .confirm-modal .btn-primary {
          background:#2563eb !important; border-color:#2563eb !important; color:#fff !important;
        }
        .confirm-modal .btn-warning {
          background:#f59e0b !important; border-color:#f59e0b !important; color:#111827 !important;
        }
      `}</style>
    </>
  );
}

// src/pages/Usuarios.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http } from "../config/api";
import AdminHeader from "../components/AdminHeader";
import ToastMessage from "../components/ToastMessage";
import { Modal } from "bootstrap";

const POLL_MS = 8000; // ⏱️ cada 8s

function Usuarios() {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);

  const usuarioSesion = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("usuario")); } catch { return null; }
  }, []);
  const responsableId = usuarioSesion && usuarioSesion.id ? usuarioSesion.id : 1;

  const [formData, setFormData] = useState({
    nombre: "", usuario: "", correo: "", rolId: "", responsableId,
  });
  const [editando, setEditando] = useState(null);
  const [viendoEliminados, setViendoEliminados] = useState(false);

  // Toast
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 3000);
  };

  // Modal de confirmacion
  const [confirmData, setConfirmData] = useState(null);
  const modalRef = useRef(null);
  const modalInstanceRef = useRef(null);

  // refs para polling
  const pollingRef = useRef(null);
  const viendoEliminadosRef = useRef(viendoEliminados);

  useEffect(() => {
    if (!confirmData) return;
    modalInstanceRef.current = new Modal(modalRef.current, { backdrop: true, keyboard: true });
    const node = modalRef.current;
    const onHidden = () => {
      setConfirmData(null);
      if (modalInstanceRef.current) modalInstanceRef.current.dispose();
      modalInstanceRef.current = null;
    };
    node.addEventListener("hidden.bs.modal", onHidden);
    modalInstanceRef.current.show();
    return () => node.removeEventListener("hidden.bs.modal", onHidden);
  }, [confirmData]);

  const closeModal = () => {
    if (modalInstanceRef.current) modalInstanceRef.current.hide();
  };

  const esAdmin = (u) => {
    const n = u && u.rol && u.rol.nombre ? u.rol.nombre.toLowerCase() : "";
    return n === "administrador";
  };

  const obtenerUsuarios = async (inactivos = false) => {
    try {
      const { data } = await http.get(`/usuarios${inactivos ? "?inactivos=1" : ""}`);
      // hasOpenOrders, hasActiveKitchen, hasActiveBar, hasOpenCashbox, hasActiveDelivery
      setUsuarios(data);
    } catch {
      // evita ruido de toast en polling, solo mostraría una vez si quieres:
      // showToast("Error al obtener usuarios", "danger");
    }
  };

  const obtenerRoles = async () => {
    try {
      const { data } = await http.get('/roles');
      const rolesFiltrados = data.filter((r) => {
        const n = r && r.nombre ? r.nombre.toLowerCase() : "";
        return n !== "administrador" && n !== "cliente";
      });
      setRoles(rolesFiltrados);
    } catch {
      showToast("Error al obtener roles", "danger");
    }
  };

  // Carga inicial + arranque de polling
  useEffect(() => {
    if (!usuarioSesion) return navigate("/login");
    obtenerUsuarios(false);
    obtenerRoles();

    // listener para refrescar al volver a enfoque
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        obtenerUsuarios(viendoEliminadosRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // arranca polling
    startPolling();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, usuarioSesion]);

  // Mantener ref sincronizada con viendoEliminados
  useEffect(() => {
    viendoEliminadosRef.current = viendoEliminados;
  }, [viendoEliminados]);

  const startPolling = () => {
    stopPolling();
    pollingRef.current = setInterval(() => {
      // pausa si la pestaña no está visible
      if (document.visibilityState !== "visible") return;
      obtenerUsuarios(viendoEliminadosRef.current);
    }, POLL_MS);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleChange = (e) => setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const resetForm = () => {
    setFormData({ nombre: "", usuario: "", correo: "", rolId: "", responsableId });
  };

  const crearUsuario = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        nombre: formData.nombre.trim(),
        usuario: formData.usuario.trim(),
        correo: formData.correo.trim(),
        rolId: formData.rolId,
        responsableId,
      };
      await http.post('/usuarios', payload);
      resetForm();
      await obtenerUsuarios(false);
      showToast("Usuario creado y contraseña temporal enviada por correo", "success");
    } catch (error) {
      const resp = error.response;
      if (resp && resp.status === 409 && resp.data && resp.data.existeInactivo && resp.data.usuarioId) {
        const { usuarioId, nombre, usuarioDup, correoDup } = resp.data;
        setConfirmData({
          title: "Usuario eliminado existente",
          message:
            "Ya existe un usuario eliminado:\n" +
            `${nombre} — ${usuarioDup} — ${correoDup}\n\n` +
            "¿Deseas restaurarlo y enviar una contraseña temporal por correo?",
          confirmText: "Restaurar ahora",
          confirmVariant: "primary",
          onConfirm: async () => {
            try {
              await http.put(`/usuarios/${usuarioId}/restaurar`, { responsableId });
              await http.post(`/usuarios/${usuarioId}/reset-password`);
              setViendoEliminados(false);
              await obtenerUsuarios(false);
              showToast("Usuario restaurado y temporal enviada", "success");
            } catch (e2) {
              showToast(
                (e2.response && e2.response.data && e2.response.data.error) || "No se pudo restaurar/enviar temporal",
                "danger"
              );
            } finally {
              closeModal();
            }
          },
        });
        return;
      }
      showToast((resp && resp.data && resp.data.error) || "Error al crear usuario", "danger");
    }
  };

  const editarUsuario = (usuario) => {
    setEditando(usuario);
    const rolCoincidente = roles.find((r) => r && r.nombre === (usuario && usuario.rol ? usuario.rol.nombre : ""));
    setFormData({
      nombre: usuario.nombre,
      usuario: usuario.usuario,
      correo: usuario.correo,
      rolId: rolCoincidente ? rolCoincidente.id : "",
      responsableId,
    });
  };

  const cancelarEdicion = () => { setEditando(null); resetForm(); };

  const guardarCambios = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        nombre: formData.nombre.trim(),
        usuario: formData.usuario.trim(),
        correo: formData.correo.trim(),
        rolId: formData.rolId,
        responsableId,
      };
      const { data } = await http.put(`/usuarios/${editando.id}`, payload);
      const actualizado = {
        ...data.usuario,
        rol: (data.usuario && data.usuario.rol) ? data.usuario.rol : { nombre: "Desconocido" },
      };
      setUsuarios((prev) => prev.map((u) => (u.id === actualizado.id ? actualizado : u)));
      cancelarEdicion();
      showToast("Usuario actualizado", "success");
      // refresco inmediato para re-evaluar flags
      obtenerUsuarios(viendoEliminadosRef.current);
    } catch (error) {
      showToast((error.response && error.response.data && error.response.data.error) || "Error al actualizar usuario", "danger");
    }
  };

  const eliminarUsuario = (id) => {
    setConfirmData({
      title: "Confirmar desactivacion",
      message: "¿Estás seguro de que deseas desactivar este usuario?",
      confirmText: "Desactivar",
      confirmVariant: "danger",
      onConfirm: async () => {
        try {
          await http.delete(`/usuarios/${id}`);
          setUsuarios((prev) => prev.filter((u) => u.id !== id));
          showToast("Usuario desactivado", "success");
          obtenerUsuarios(viendoEliminadosRef.current);
        } catch (error) {
          const msg = error?.response?.data?.error || "Error al desactivar usuario";
          showToast(msg, "danger");
        } finally {
          closeModal();
        }
      },
    });
  };

  const restaurarUsuario = (id) => {
    setConfirmData({
      title: "Confirmar restauración",
      message: "¿Deseas restaurar este usuario?",
      confirmText: "Restaurar",
      confirmVariant: "primary",
      onConfirm: async () => {
        try {
          await http.put(`/usuarios/${id}/restaurar`, { responsableId });
          await obtenerUsuarios(true);
          showToast("Usuario restaurado", "success");
          // refresco a la lista en vista actual
          obtenerUsuarios(viendoEliminadosRef.current);
        } catch (error) {
          showToast((error.response && error.response.data && error.response.data.error) || "Error al restaurar usuario", "danger");
        } finally {
          closeModal();
        }
      },
    });
  };

  const confirmarReenvioTemporal = (u) => {
    setConfirmData({
      title: "Reenviar contraseña temporal",
      message:
        "Se generará una NUEVA contraseña temporal para:\n" +
        `${u.nombre} — ${u.usuario} — ${u.correo}\n\n` +
        "• Se enviará por correo al usuario.\n" +
        "• La temporal anterior dejará de funcionar.\n\n" +
        "¿Quieres continuar?",
      confirmText: "Reenviar ahora",
      confirmVariant: "primary",
      onConfirm: async () => {
        try {
          await http.post(`/usuarios/${u.id}/reset-password`);
          showToast("Contraseña temporal enviada", "success");
        } catch (err) {
          showToast((err.response && err.response.data && err.response.data.error) || "No se pudo reenviar", "danger");
        } finally {
          closeModal();
        }
      },
    });
  };

  /* ===== estilos (solo ASCII) ===== */
  const page = { minHeight: "100vh", backgroundColor: "#f3f6f7", fontFamily: "Poppins, Segoe UI, sans-serif" };
  const wrapTop = { padding: "20px 24px 0", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" };
  const toggleBtn = {
    backgroundColor: "#0f766e", color: "#fff", border: "none",
    padding: "0.55rem 0.9rem", borderRadius: 8, fontWeight: 700, cursor: "pointer"
  };
  const smallBtn = {
    backgroundColor: "#1f2937", color: "#fff", border: "none",
    padding: "0.45rem 0.8rem", borderRadius: 8, fontWeight: 600, cursor: "pointer"
  };
  const wrap = {
    padding: "12px 24px 28px", display: "grid", gridTemplateColumns: "1fr 1fr",
    gap: "24px", alignItems: "start"
  };
  const card = { backgroundColor: "#ffffff", padding: "20px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" };
  const inputStyle = {
    padding: "0.8rem 1rem", borderRadius: "12px", border: "1.5px solid #d1d5db", outline: "none",
    backgroundColor: "#f9fafb", fontSize: "0.95rem", transition: "all 0.2s ease",
    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.05)"
  };
  const btnBase = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    height: 40, minWidth: 180, padding: "0.55rem 1rem", border: "none",
    borderRadius: 8, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
  };
  const buttonPrimary = { ...btnBase, backgroundColor: "#007f5f", color: "#fff", minWidth: 160 };
  const buttonEdit = { ...btnBase, backgroundColor: "#f0ad4e", color: "#fff" };
  const buttonResend = { ...btnBase, backgroundColor: "#2563eb", color: "#fff" };
  const buttonDelete = { ...btnBase, backgroundColor: "#e63946", color: "#fff" };
  const buttonRestore = { ...btnBase, backgroundColor: "#2563eb", color: "#fff", minWidth: 140 };
  const buttonCancel = { ...btnBase, backgroundColor: "#cccccc", color: "#333", minWidth: 140 };
  const actionsRow = { display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" };
  const tituloLista = viendoEliminados ? "Usuarios Desactivados" : "Usuarios Registrados";

  // Defensa extra en el select
  const rolesVisibles = roles.filter((r) => {
    const n = r && r.nombre ? r.nombre.toLowerCase() : "";
    return n !== "administrador" && n !== "cliente";
  });

  return (
    <div style={page}>
      <AdminHeader titulo="Gestion de Usuarios" />

      <div style={wrapTop}>
        <button
          style={toggleBtn}
          onClick={async () => {
            const next = !viendoEliminados;
            setViendoEliminados(next);
            await obtenerUsuarios(next);
          }}
        >
          {viendoEliminados ? "← Ver activos" : "Usuarios desactivados"}
        </button>

        {/* botón manual de refresco rápido */}
        <button
          style={smallBtn}
          onClick={() => obtenerUsuarios(viendoEliminados)}
          title="Actualizar ahora"
        >
          Actualizar
        </button>
      </div>

      <div style={wrap}>
        {/* Lista */}
        <div style={card}>
          <h2 style={{ marginBottom: 12, color: "#1e3d59" }}>{tituloLista}</h2>

          {usuarios.length === 0 ? (
            <p style={{ margin: 0, color: "#64748b" }}>
              {viendoEliminados ? "No hay usuarios eliminados." : "No hay usuarios registrados."}
            </p>
          ) : (
            Object.entries(
              usuarios.reduce((acc, u) => {
                const rol = u && u.rol && u.rol.nombre ? u.rol.nombre : "Sin rol";
                if (!acc[rol]) acc[rol] = [];
                acc[rol].push(u);
                return acc;
              }, {})
            ).map(([rol, users]) => (
              <details key={rol} open style={{ marginBottom: 12 }}>
                <summary style={{ fontWeight: 600, color: "#007f5f", cursor: "pointer", marginBottom: 6 }}>
                  {rol}
                </summary>

                <ul style={{ listStyle: "none", paddingLeft: 16, margin: 0 }}>
                  {users.map((u) => {
                    const roleName = (u.rol?.nombre || "").toLowerCase();

                    const lockMesero     = roleName === "mesero"     && u.hasOpenOrders;
                    const lockCocinero   = roleName === "cocinero"   && u.hasActiveKitchen;
                    const lockBar        = roleName === "bartender"  && u.hasActiveBar;
                    const lockCajero     = roleName === "cajero"     && u.hasOpenCashbox;
                    const lockRepartidor = roleName === "repartidor" && u.hasActiveDelivery;

                    const hasLocks = lockMesero || lockCocinero || lockBar || lockCajero || lockRepartidor;

                    let lockReason = "";
                    if (lockMesero) lockReason = "Tiene órdenes activas";
                    if (lockCocinero) lockReason = "Tiene platillos en curso";
                    if (lockBar) lockReason = "Tiene bebidas en curso";
                    if (lockCajero) lockReason = "Tiene turno de caja activo o pendiente";
                    if (lockRepartidor) lockReason = "Tiene entregas en curso";

                    return (
                      <li
                        key={u.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          alignItems: "center",
                          padding: "8px 0",
                          borderBottom: "1px solid #eee",
                          columnGap: 12,
                        }}
                      >
                        <span>
                          {u.nombre} — {u.usuario} — {u.correo}
                          {hasLocks ? (
                            <span
                              style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: "#b45309" }}
                            >
                              ({lockReason.toLowerCase()})
                            </span>
                          ) : null}
                        </span>

                        {viendoEliminados ? (
                          <div style={actionsRow}>
                            <button onClick={() => restaurarUsuario(u.id)} style={buttonRestore}>
                              Restaurar
                            </button>
                          </div>
                        ) : (
                          !esAdmin(u) && (
                            <div style={actionsRow}>
                              <button onClick={() => editarUsuario(u)} style={buttonEdit}>
                                Editar
                              </button>
                              <button onClick={() => confirmarReenvioTemporal(u)} style={buttonResend}>
                                Reenviar temporal
                              </button>
                              <button
                                onClick={() => eliminarUsuario(u.id)}
                                style={{
                                  ...buttonDelete,
                                  opacity: hasLocks ? 0.6 : 1,
                                  cursor: hasLocks ? "not-allowed" : "pointer",
                                }}
                                disabled={hasLocks}
                                title={hasLocks ? lockReason : ""}
                              >
                                Desactivar
                              </button>
                            </div>
                          )
                        )}
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))
          )}
        </div>

        {/* Formulario */}
        {!viendoEliminados && (
          <div style={card}>
            <h3 style={{ marginBottom: 16, color: "#1e3d59" }}>
              {editando ? "Editar Usuario" : "Registrar Nuevo Usuario"}
            </h3>

            <form onSubmit={editando ? guardarCambios : crearUsuario} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                type="text"
                name="nombre"
                placeholder="Nombre completo"
                value={formData.nombre}
                onChange={handleChange}
                style={inputStyle}
                required
              />
              <input
                type="text"
                name="usuario"
                placeholder="Nombre de usuario"
                value={formData.usuario}
                onChange={handleChange}
                style={inputStyle}
                required
              />
              <input
                type="email"
                name="correo"
                placeholder="Correo electrónico"
                value={formData.correo}
                onChange={handleChange}
                style={inputStyle}
                required
              />
              <select
                name="rolId"
                value={formData.rolId}
                onChange={handleChange}
                style={inputStyle}
                required
              >
                <option value="">Seleccionar un rol</option>
                {rolesVisibles.map((r) => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>

              <button type="submit" style={buttonPrimary}>
                {editando ? "Guardar cambios" : "Crear usuario"}
              </button>

              {editando && (
                <button type="button" onClick={cancelarEdicion} style={buttonCancel}>
                  Cancelar
                </button>
              )}
            </form>
          </div>
        )}
      </div>

      {/* Toast */}
      <ToastMessage
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast((prev) => ({ ...prev, show: false }))}
      />

      {/* Modal */}
      {confirmData && (
        <div className="modal fade" tabIndex="-1" ref={modalRef}>
          <div className="modal-dialog mt-5">
            <div className={`modal-content border-${confirmData.confirmVariant === "primary" ? "primary" : "danger"}`}>
              <div className={`modal-header text-white ${confirmData.confirmVariant === "primary" ? "bg-primary" : "bg-danger"}`}>
                <h5 className="modal-title">{confirmData.title}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={closeModal}></button>
              </div>
              <div className="modal-body">
                <p style={{ whiteSpace: "pre-line", margin: 0 }}>{confirmData.message}</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                <button type="button" className={`btn btn-${confirmData.confirmVariant || "danger"}`} onClick={confirmData.onConfirm}>
                  {confirmData.confirmText || "Desactivar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Usuarios;

// src/components/CancelarReservaModal.jsx
import React, { useEffect, useRef, useState } from "react";
import { Modal } from "bootstrap";

/**
 * Modal en 2 pasos para cancelar una reserva:
 * 1) Confirmación
 * 2) Reembolso (sí/no) + motivo (opcional)
 *
 * Props:
 * - open (boolean)
 * - onClose()
 * - onSubmit({ reembolsar:boolean, motivo:string })
 * - reserva?: { id, nombre, mesaNumero, fechaHora, hastaHora }
 */
export default function CancelReservaModal({ open, onClose, onSubmit, reserva }) {
  const modalRef = useRef(null);
  const [bsModal, setBsModal] = useState(null);

  const [step, setStep] = useState(1);
  const [reembolsar, setReembolsar] = useState(false);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!modalRef.current) return;
    const m = new Modal(modalRef.current, { backdrop: "static", keyboard: false });
    setBsModal(m);
    return () => {
      try { m.dispose(); } catch {}
    };
  }, []);

  // abrir/cerrar imperativo al cambiar "open"
  useEffect(() => {
    if (!bsModal) return;
    if (open) {
      // reset valores al abrir
      setStep(1);
      setReembolsar(false);
      setMotivo("");
      bsModal.show();
    } else {
      bsModal.hide();
    }
  }, [open, bsModal]);

  const close = () => {
    onClose?.();
  };

  const next = () => setStep(2);
  const back = () => setStep(1);

  const submit = () => {
    onSubmit?.({ reembolsar, motivo: motivo.trim() });
  };

  // helpers de texto
  const toLocal = (iso) => (iso ? new Date(iso).toLocaleString("es-GT", { hour12: false }) : "");
  const mesaTxt = reserva?.mesaNumero != null ? `Mesa #${reserva.mesaNumero}` : "Mesa";

  return (
    <div className="modal fade" tabIndex="-1" ref={modalRef}>
      <div className="modal-dialog">
        <div className="modal-content" style={{ borderRadius: 12, overflow: "hidden" }}>
          {/* Header estilo alerta (rojo) como en la captura */}
          <div className="modal-header" style={{ background: "#dc3545" }}>
            <h5 className="modal-title text-white">
              {step === 1 ? "Confirmar cancelación" : "Detalles de cancelación"}
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              aria-label="Close"
              onClick={close}
            />
          </div>

          <div className="modal-body">
            {step === 1 ? (
              <>
                <p className="mb-2">
                  ¿Estás seguro de <b>cancelar la reservación</b> de <b>{mesaTxt}</b>
                  {reserva?.fechaHora ? (
                    <> ({toLocal(reserva.fechaHora)} — {toLocal(reserva.hastaHora)})</>
                  ) : null}
                  ?
                </p>
                <p className="text-muted mb-0">
                  Esta acción liberará la mesa y notificará al cliente por correo.
                </p>
              </>
            ) : (
              <>
                <div className="form-check mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="chkRefund"
                    checked={reembolsar}
                    onChange={(e) => setReembolsar(e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="chkRefund">
                    Realizar reembolso del anticipo (Q50.00)
                  </label>
                </div>

                <div className="mb-2">
                  <label className="form-label">Motivo (opcional)</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Ej.: Cliente no se presentará, emergencia, error al agendar, etc."
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </div>

                <small className="text-muted">
                  Si la cancelación ocurre con menos de 24 horas de anticipación, tu política puede indicar que no
                  aplica reembolso.
                </small>
              </>
            )}
          </div>

          <div className="modal-footer">
            {step === 1 ? (
              <>
                <button type="button" className="btn btn-secondary" onClick={close}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-danger" onClick={next}>
                  Sí, cancelar la reserva
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-outline-secondary" onClick={back}>
                  Atrás
                </button>
                <button type="button" className="btn btn-danger" onClick={submit}>
                  Confirmar cancelación
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

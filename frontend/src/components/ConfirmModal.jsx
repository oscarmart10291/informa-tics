// src/components/ConfirmModal.jsx
import React, { useEffect, useRef } from 'react';
import { Modal } from 'bootstrap';

export default function ConfirmModal({ title, message, onConfirm, onCancel }) {
  const modalRef = useRef(null);
  let bsModal = null;

  useEffect(() => {
    if (modalRef.current) {
      bsModal = new Modal(modalRef.current);
      bsModal.show();
    }
  }, []);

  const handleConfirm = () => {
    onConfirm();
    bsModal.hide();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    bsModal.hide();
  };

  return (
    <div className="modal fade" tabIndex="-1" ref={modalRef}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-danger">
          <div className="modal-header bg-danger text-white">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close btn-close-white" onClick={handleCancel}></button>
          </div>
          <div className="modal-body">
            <p>{message}</p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={handleCancel}>
              Cancelar
            </button>
            <button type="button" className="btn btn-danger" onClick={handleConfirm}>
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

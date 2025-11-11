// src/components/ToastMessage.jsx
import { useEffect, useRef } from 'react';
import { Toast } from 'bootstrap';

export default function ToastMessage({ message, type = 'success', show, onClose }) {
  const toastRef = useRef(null);

  useEffect(() => {
    if (toastRef.current) {
      toastRef.current.addEventListener('hidden.bs.toast', onClose);
    }
    return () => {
      if (toastRef.current) {
        toastRef.current.removeEventListener('hidden.bs.toast', onClose);
      }
    };
  }, [onClose]);

  useEffect(() => {
    if (show && toastRef.current) {
      const bsToast = new Toast(toastRef.current, { delay: 3000 });
      bsToast.show();
    }
  }, [show]);

  return (
    <div className="toast-container position-fixed top-0 start-50 translate-middle-x p-3" style={{ zIndex: 1100 }}>
      <div
        ref={toastRef}
        className={`toast align-items-center text-bg-${type} border-0`}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <div className="d-flex">
          <div className="toast-body">{message}</div>
          <button
            type="button"
            className="btn-close btn-close-white me-2 m-auto"
            data-bs-dismiss="toast"
            aria-label="Close"
          ></button>
        </div>
      </div>
    </div>
  );
}

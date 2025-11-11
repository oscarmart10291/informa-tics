// backend/src/services/orden.finalizado.notify.js
const { sendTicketPdfForOrden } = require('./ticket.pdf.mailer');

const up = (s='') => String(s||'').toUpperCase();

/** Llama esto cada vez que actualices una orden y ya tengas el objeto actualizado. */
function notifyTicketIfFinal(ordenActualizada) {
  if (!ordenActualizada?.id) return;

  const e = up(ordenActualizada.estado);
  const d = up(ordenActualizada.deliveryStatus);

  // Cubre salón: FINALIZADO y domicilio: ENTREGADO
  if (e === 'FINALIZADO' || d === 'ENTREGADO') {
    // no bloquea la respuesta http
    sendTicketPdfForOrden(ordenActualizada.id).catch(err => {
      console.error('[notifyTicketIfFinal] error enviando ticket PDF:', err);
    });
  }
}

module.exports = { notifyTicketIfFinal };

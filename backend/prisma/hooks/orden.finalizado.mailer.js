// backend/src/prisma/hooks/orden.finalizado.mailer.js
const { sendTicketPdfForOrden } = require('../../src/services/ticket.pdf.mailer');

const up = (s='') => String(s||'').toUpperCase();

function transitionedToFinal(before, after){
  const be = up(before?.estado);
  const ae = up(after?.estado);
  const bd = up(before?.deliveryStatus);
  const ad = up(after?.deliveryStatus);

  if (be !== 'FINALIZADO' && ae === 'FINALIZADO') return true;
  if (bd !== 'ENTREGADO' && ad === 'ENTREGADO')   return true; // reparto/domicilio
  return false;
}

function registerOrdenFinalizadoMailer(prisma){
  prisma.$use(async (params, next) => {
    if (params.model !== 'Orden' || params.action !== 'update') {
      return next(params);
    }
    const id = params.args?.where?.id;
    const before = id ? await prisma.orden.findUnique({ where: { id: Number(id) } }) : null;

    const result = await next(params);

    try {
      if (before && transitionedToFinal(before, result)) {
        // no bloquea la respuesta HTTP
        sendTicketPdfForOrden(result.id).catch(err => {
          console.error('[orden.finalizado.mailer] sendTicketPdfForOrden error:', err);
        });
      }
    } catch (e) {
      console.error('[orden.finalizado.mailer] hook error:', e);
    }

    return result;
  });
}

module.exports = { registerOrdenFinalizadoMailer };

//backend/src/services/ticket.pdf.mailer.js
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const { sendEmail } = require('./email');
const { htmlToPdfBuffer } = require('./pdf');
const { ticketHtmlFromTicket, ticketHtmlFromPedido } = require('./ticket.html');

const up = (s='') => String(s||'').toUpperCase();
const esc = (t='') =>
  String(t)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');

function pickEmail(orden){
  return (
    orden?.pedidoCliente?.clienteEmail ||
    orden?.pedidoCliente?.email ||
    orden?.clienteEmail ||
    ''
  );
}

async function getLatestTicketForOrden(ordenId){
  try {
    const t = await prisma.ticket.findFirst({
      where: { ordenId: Number(ordenId) },
      orderBy: { id: 'desc' },
    });
    if (t) return t;
  } catch (_) {}

  try {
    const tv = await prisma.ticketVenta.findFirst({
      where: { ordenId: Number(ordenId) },
      orderBy: { id: 'desc' },
    });
    if (tv) {
      return {
        id: tv.id,
        fechaPago: tv.fechaPago || tv.createdAt || tv.creadoEn || null,
        metodoPago: tv.metodoPago,
        montoRecibido: tv.montoRecibido,
        cambio: tv.cambio,
        totalAPagar: tv.totalAPagar ?? tv.total ?? null,
        posCorrelativo: tv.posCorrelativo,
      };
    }
  } catch (_) {}

  return null;
}

async function resolveRecipientEmail(orden) {
  let to = pickEmail(orden);
  if (to) return to;

  try {
    const ped = await prisma.pedidoCliente.findFirst({
      where: { ordenId: Number(orden.id) },
      select: { clienteEmail: true, email: true }
    });
    to = ped?.clienteEmail || ped?.email || '';
  } catch (_) {}
  return to;
}

async function getLastEntregaObs(orden) {
  try {
    const pedidoId = orden?.pedidoCliente?.id ??
      (await prisma.pedidoCliente.findFirst({
        where: { ordenId: Number(orden.id) },
        select: { id: true }
      }))?.id;

    if (!pedidoId) return null;

    const obs = await prisma.observacionEntrega.findFirst({
      where: { pedidoId: Number(pedidoId) },
      orderBy: { createdAt: 'desc' },
      select: { texto: true, createdAt: true }
    });

    return (obs?.texto || '').trim() || null;
  } catch {
    return null;
  }
}

async function sendTicketPdfForOrden(ordenId){
  const orden = await prisma.orden.findUnique({
    where: { id: Number(ordenId) },
    include: {
      items: true,
      pedidoCliente: true,
      mesero: true,
      // ✅ Relación correcta: tickets (plural). Traemos el más reciente.
      tickets: {
        orderBy: { id: 'desc' },
        take: 1
        // Si tu modelo tiene un campo 'tipo' y quieres solo VENTA:
        // where: { tipo: 'VENTA' },
      },
    }
  });

  if (!orden) {
    console.warn('[ticket.pdf.mailer] Orden no encontrada:', ordenId);
    return;
  }

  // === Obtener ticket (más reciente) ===
  let ticket = null;

  if (Array.isArray(orden.tickets) && orden.tickets.length) {
    const t = orden.tickets[0];
    ticket = {
      id: t.id,
      fechaPago: t.fechaPago || t.createdAt || t.creadoEn || null,
      metodoPago: t.metodoPago,
      montoRecibido: t.montoRecibido,
      cambio: t.cambio,
      totalAPagar: t.totalAPagar ?? t.total ?? null,
      posCorrelativo: t.posCorrelativo,
      orden: {
        id: orden.id,
        codigo: orden.codigo,
        items: (orden.items || []).map(it => ({
          nombre: it.nombre,
          nota: it.nota,
          precio: Number(it.precio || 0),
          qty: Number(it.qty || 1),
        })),
      },
    };
  }

  // 🔙 Compatibilidad con esquemas anteriores
  if (!ticket) ticket = await getLatestTicketForOrden(orden.id);

  const html = ticket
    ? ticketHtmlFromTicket(ticket, {
        tipoEntrega: orden.pedidoCliente?.tipoEntrega,
        clienteNombre: orden.pedidoCliente?.clienteNombre || orden.pedidoCliente?.receptorNombre,
        telefonoEntrega: orden.pedidoCliente?.telefono,
        direccionEntrega: orden.pedidoCliente?.direccion,
        mesaTexto: orden.mesaTexto,
        mesa: orden.mesa,
      })
    : ticketHtmlFromPedido({
        id: orden.id,
        codigo: orden.codigo,
        mesa: orden.mesa,
        mesaTexto: orden.mesaTexto,
        tipoEntrega: orden.pedidoCliente?.tipoEntrega,
        clienteNombre: orden.pedidoCliente?.clienteNombre || orden.pedidoCliente?.receptorNombre,
        telefonoEntrega: orden.pedidoCliente?.telefono,
        direccionEntrega: orden.pedidoCliente?.direccion,
        items: (orden.items || []).map(it => ({
          nombre: it.nombre,
          qty: it.qty || 1,
          precio: it.precio,
          nota: it.nota,
        })),
        total: orden.total,
        ticketMetodoPago: orden.metodoPago,
        ticketMontoRecibido: orden.montoRecibido,
        ticketCambio: orden.cambio,
        ticketPosCorrelativo: orden.posCorrelativo,
        ticketAprobado: !!ticket,
        ticketId: ticket?.id,
      });

  // === Generar PDF ===
  let pdfBuffer = null;
  try {
    const pdfRaw = await htmlToPdfBuffer(html);
    pdfBuffer = Buffer.isBuffer(pdfRaw) ? pdfRaw : Buffer.from(pdfRaw);
    console.log('[ticket.pdf.mailer] PDF generado', pdfBuffer.length, 'bytes para orden', orden.id);
  } catch (err) {
    console.error('[ticket.pdf.mailer] Error generando PDF (intento 1):', err?.message || err);
    // 🔁 Plan B
    try {
      const pdfRaw = await htmlToPdfBuffer(html, { margin: undefined, width: undefined });
      pdfBuffer = Buffer.isBuffer(pdfRaw) ? pdfRaw : Buffer.from(pdfRaw);
      console.log('[ticket.pdf.mailer] PDF generado en reintento', pdfBuffer.length, 'bytes');
    } catch (err2) {
      console.error('[ticket.pdf.mailer] Reintento PDF falló:', err2?.message || err2);
    }
  }

  // === Destinatario ===
  const to = await resolveRecipientEmail(orden);
  if (!to) {
    console.warn('[ticket.pdf.mailer] No hay correo para enviar ticket de orden', orden.id);
    return;
  }

  // === Observación de entrega (si la hay) ===
  const lastObs = await getLastEntregaObs(orden);

  const codeOrId = orden.codigo ? `#${orden.codigo}` : `#${orden.id}`;
  const subject = `Pedido ${codeOrId} entregado — gracias por tu compra`;
  const body = `
    <div style="font-family:Segoe UI,Arial,sans-serif">
      <h2 style="margin:0 0 .25rem">¡Gracias por tu compra!</h2>
      <p style="margin:.25rem 0">Tu pedido ${codeOrId} fue <b>entregado</b>.</p>
      ${lastObs ? `<p style="margin:.25rem 0"><b>Observación del repartidor:</b> ${esc(lastObs)}</p>` : ''}
      ${pdfBuffer ? '<p style="margin:.25rem 0">Adjuntamos tu <b>ticket de venta</b> en PDF.</p>' :
        '<p style="margin:.25rem 0"><b>No pudimos generar el PDF esta vez</b>, pero tu compra fue registrada correctamente.</p>'}
      <p style="margin:.75rem 0">¡Que lo disfrutes!</p>
    </div>`;

  try {
    const mail = { to, subject, html: body };
    if (pdfBuffer && pdfBuffer.length) {
      mail.attachments = [{
        filename: `ticket_${ticket?.id || orden.id}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }];
    }
    await sendEmail(mail);
    console.log('[ticket.pdf.mailer] Email enviado a', to, 'para orden', orden.id);
  } catch (err) {
    console.error('[ticket.pdf.mailer] Error enviando email:', err?.message || err);
  }
}

module.exports = { sendTicketPdfForOrden };

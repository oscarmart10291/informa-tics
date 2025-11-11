// backend/src/services/email.js
require('dotenv').config();

const RAW_PROVIDER = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase().replace(/"/g, '').trim();
// ⚠️ En Railway a veces pegan "resend" con comillas: las quitamos.
const EMAIL_PROVIDER = RAW_PROVIDER === 'smtp' ? 'smtp' : 'resend';

// FROM: para Resend usa dominio verificado; si no, usa onboarding@resend.dev
const FROM_EMAIL_RESEND = process.env.RESEND_FROM
  || process.env.SMTP_FROM
  || 'Restaurante 2025 <onboarding@resend.dev>';

const FROM_EMAIL_SMTP = process.env.SMTP_FROM || process.env.SMTP_USER;
const REPLY_TO = process.env.REPLY_TO || FROM_EMAIL_RESEND;

function log(obj) {
  const redacted = JSON.parse(JSON.stringify(obj, (k, v) => {
    if (/pass|key/i.test(k)) return '***';
    return v;
  }));
  console.log('[email]', redacted);
}

/* ---------------------------- PROVEEDOR: RESEND ---------------------------- */
async function sendViaResend({ to, subject, html, text, attachments }) {
  const key = (process.env.RESEND_API_KEY || '').trim().replace(/"/g, '');
  if (!key) throw new Error('Falta RESEND_API_KEY');
  const from = FROM_EMAIL_RESEND;

  log({ provider: 'resend', from, to, subject });

  const { Resend } = require('resend');
  const resend = new Resend(key);

  const files = (attachments || []).map(a => ({
    filename: a.filename || a.name,
    content: a.content,
    path: a.path,
  }));

  const { data, error } = await resend.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    reply_to: REPLY_TO,
    attachments: files.length ? files : undefined,
  });

  if (error) throw new Error(`Resend error: ${error.message || String(error)}`);
  console.log(`📧 Resend OK: ${data?.id} -> ${to}`);
  return data;
}

/* ----------------------------- PROVEEDOR: SMTP ----------------------------- */
async function sendViaSmtp({ to, subject, html, text, attachments }) {
  const nodemailer = require('nodemailer');
  const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
  const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
  const SMTP_SECURE = String(process.env.SMTP_SECURE ?? 'false') !== 'false'; // true=465
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS;
  const from = FROM_EMAIL_SMTP;

  log({ provider: 'smtp', host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE, from, to, subject });

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    pool: true, maxConnections: 2, maxMessages: 50,
    connectionTimeout: 60_000, greetingTimeout: 30_000, socketTimeout: 60_000,
    logger: true, debug: true,
  });

  await transporter.verify(); // si aquí revienta, es bloqueo de puertos
  const info = await transporter.sendMail({ from, to, subject, html, text, attachments, replyTo: REPLY_TO });
  console.log(`📧 SMTP OK: <${info.messageId}> -> ${to}`);
  return info;
}

/* ------------------------------- FACHADA ----------------------------------- */
async function sendEmail(opts = {}) {
  if (!opts.to) throw new Error('sendEmail: falta "to"');
  if (EMAIL_PROVIDER === 'smtp') return sendViaSmtp(opts);
  return sendViaResend(opts);
}

console.log(`[email] provider="${EMAIL_PROVIDER}" from="${EMAIL_PROVIDER === 'resend' ? FROM_EMAIL_RESEND : FROM_EMAIL_SMTP}" replyTo="${REPLY_TO}"`);

module.exports = { sendEmail };

//backend/src/services/tipocambio.banguat.js
const axios = require('axios');
const { parseStringPromise } = require('xml2js');

/**
 * Orden de fuentes:
 * 1) Banguat SOAP 1.1 (oficial)
 * 2) exchangerate.host (fallback)
 * 3) open.er-api.com (fallback)
 * 4) CurrencyLayer (opcional si pones CURRENCYLAYER_KEY en .env)
 *
 * Siempre devolvemos: { fuente, fechaGT, fechaISO, gtqPorUsd, cached?, stale? }
 */

const TC_URL_BANGUAT_ASMX = 'https://www.banguat.gob.gt/variables/ws/tipocambio.asmx';
const SOAP_ACTION = 'http://www.banguat.gob.gt/variables/ws/TipoCambioDia';
const SOAP_BODY = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <TipoCambioDia xmlns="http://www.banguat.gob.gt/variables/ws/" />
  </soap:Body>
</soap:Envelope>`;

const TC_URL_EXRATE  = 'https://api.exchangerate.host/latest?base=USD&symbols=GTQ';
const TC_URL_ERAPI   = 'https://open.er-api.com/v6/latest/USD';

const CURRENCYLAYER_KEY = process.env.CURRENCYLAYER_KEY || '';
const TC_URL_CLAYER = CURRENCYLAYER_KEY
  ? `http://api.currencylayer.com/live?access_key=${CURRENCYLAYER_KEY}&currencies=GTQ`
  : null;

// axios base
const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'InformaTics/1.0',
    Accept: '*/*',
  },
});

// Caché simple
let cache = { data: null, at: 0 };
const TTL_MS = 10 * 60 * 1000;

function parseFechaGTtoISO(fechaStr) {
  // dd/mm/yyyy -> yyyy-mm-dd
  const [dd, mm, yyyy] = String(fechaStr || '').split('/');
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/* ====================== Fuentes ====================== */

// 1) Banguat SOAP 1.1 (POST + SOAPAction)
async function fromBanguatSOAP() {
  const { data: xml } = await http.post(
    TC_URL_BANGUAT_ASMX,
    SOAP_BODY,
    {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': SOAP_ACTION,
      },
    }
  );

  const obj = await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: false });

  // Navegación SOAP -> ...Body -> TipoCambioDiaResponse -> TipoCambioDiaResult -> CambioDolar -> VarDolar
  const vd =
    obj?.['soap:Envelope']?.['soap:Body']?.TipoCambioDiaResponse?.TipoCambioDiaResult?.CambioDolar?.VarDolar
    || obj?.Envelope?.Body?.TipoCambioDiaResponse?.TipoCambioDiaResult?.CambioDolar?.VarDolar;

  if (!vd) throw new Error('Banguat SOAP: estructura desconocida');

  const fecha = vd?.fecha || vd?.Fecha || vd?.FECHA;
  const ref   = vd?.referencia || vd?.Referencia || vd?.REFERENCIA;

  const rate = Number(String(ref).replace(',', '.'));
  if (!Number.isFinite(rate)) throw new Error('Banguat SOAP: tasa inválida');

  return {
    fuente: 'Banguat',
    fechaGT: fecha || null,
    fechaISO: parseFechaGTtoISO(fecha) || null,
    gtqPorUsd: rate,
  };
}

// 2) exchangerate.host
async function fromExchangeRateHost() {
  const { data } = await http.get(TC_URL_EXRATE);
  const rate = Number(data?.rates?.GTQ);
  const dateISO = data?.date || null;
  if (!Number.isFinite(rate)) throw new Error('exchangerate.host: tasa inválida');
  return {
    fuente: 'exchangerate.host',
    fechaGT: dateISO ? dateISO.split('-').reverse().join('/') : null,
    fechaISO: dateISO,
    gtqPorUsd: rate,
  };
}

// 3) open.er-api.com
async function fromOpenERAPI() {
  const { data } = await http.get(TC_URL_ERAPI);
  const rate = Number(data?.rates?.GTQ);
  if (!Number.isFinite(rate)) throw new Error('open.er-api.com: tasa inválida');
  const dateISO = (data?.time_last_update_utc)
    ? new Date(data.time_last_update_utc).toISOString().slice(0,10)
    : null;
  return {
    fuente: 'open.er-api.com',
    fechaGT: dateISO ? dateISO.split('-').reverse().join('/') : null,
    fechaISO: dateISO,
    gtqPorUsd: rate,
  };
}

// 4) CurrencyLayer (opcional)
async function fromCurrencyLayer() {
  if (!TC_URL_CLAYER) throw new Error('CurrencyLayer no configurado');
  const { data } = await http.get(TC_URL_CLAYER);
  const rate = Number(data?.quotes?.USDGTQ);
  if (!data?.success || !Number.isFinite(rate)) throw new Error('CurrencyLayer: tasa inválida');
  const dateISO = data?.timestamp ? new Date(data.timestamp * 1000).toISOString().slice(0,10) : null;
  return {
    fuente: 'CurrencyLayer',
    fechaGT: dateISO ? dateISO.split('-').reverse().join('/') : null,
    fechaISO: dateISO,
    gtqPorUsd: rate,
  };
}

/* ====================== Orquestador ====================== */

async function getTipoCambio() {
  const now = Date.now();
  if (cache.data && now - cache.at < TTL_MS) return { ...cache.data, cached: true };

  const attempts = [
    { name: 'Banguat SOAP', fn: fromBanguatSOAP },
    { name: 'exchangerate.host', fn: fromExchangeRateHost },
    { name: 'open.er-api.com', fn: fromOpenERAPI },
  ];
  if (TC_URL_CLAYER) attempts.push({ name: 'CurrencyLayer', fn: fromCurrencyLayer });

  let lastErr;
  for (const a of attempts) {
    try {
      const data = await a.fn();
      cache = { data, at: now };
      return data;
    } catch (e) {
      lastErr = e;
      console.warn(`[TipoCambio] ${a.name} falló:`, e?.message || e);
    }
  }

  if (cache.data) return { ...cache.data, stale: true };
  const err = new Error(`No se pudo obtener tipo de cambio. Último error: ${lastErr?.message || lastErr}`);
  err.code = 'TC_UNAVAILABLE';
  throw err;
}

module.exports = { getTipoCambio };

// backend/src/utils/passwordPolicy.js
const bcrypt = require('bcryptjs');

const POLICY = {
  minLen: 10,
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  digit:     /[0-9]/,
  special:   /[^A-Za-z0-9]/,
};

function isStrongPassword(pwd) {
  if (typeof pwd !== 'string') return false;
  return (
    pwd.length >= POLICY.minLen &&
    POLICY.uppercase.test(pwd) &&
    POLICY.lowercase.test(pwd) &&
    POLICY.digit.test(pwd) &&
    POLICY.special.test(pwd)
  );
}

function policyMessage() {
  return `La contraseña debe tener al menos ${POLICY.minLen} caracteres e incluir: 1 mayúscula, 1 minúscula, 1 número y 1 caracter especial.`;
}

async function isReusedPassword(newPlain, lastNHashes) {
  for (const r of lastNHashes || []) {
    try {
      if (await bcrypt.compare(newPlain, r.hash)) return true;
    } catch (_) {}
  }
  return false;
}

module.exports = { isStrongPassword, policyMessage, isReusedPassword };

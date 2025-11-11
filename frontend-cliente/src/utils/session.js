// src/utils/session.js
export function getUser() {
  try { return JSON.parse(localStorage.getItem("usuario")) || null; }
  catch { return null; }
}
export function logout() {
  localStorage.removeItem("usuario");
  window.location.href = "/";
}

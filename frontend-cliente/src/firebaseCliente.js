// frontend-cliente/src/firebaseCliente.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyALJkQrlDiNlmXBr32JMv1rQTKi4GLjgIA",
  authDomain: "restaurante-login-7039a.firebaseapp.com",
  projectId: "restaurante-login-7039a",
  storageBucket: "restaurante-login-7039a.firebasestorage.app",
  messagingSenderId: "790123023157",
  appId: "1:790123023157:web:c0a0dc392c78af878d9a7c",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("email"); // 👈 Asegura que siempre incluya el correo


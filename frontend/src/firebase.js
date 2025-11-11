import { initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyALJkQrlDiNlmXBr32JMv1rQTKi4GLjgIA",
  authDomain: "restaurante-login-7039a.firebaseapp.com",
  projectId: "restaurante-login-7039a",
  // 👇 usa el bucket EXACTO que muestra Firebase (firebasestorage.app)
  storageBucket: "restaurante-login-7039a.firebasestorage.app",
  messagingSenderId: "790123023157",
  appId: "1:790123023157:web:c0a0dc392c78af878d9a7c"
};

const app = initializeApp(firebaseConfig);
export const storage = getStorage(app);

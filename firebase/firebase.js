import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: " ",
  authDomain: "wirdwatcher.firebaseapp.com",
  projectId: "wirdwatcher",
  storageBucket: "wirdwatcher.firebasestorage.app",
  messagingSenderId: "823312667756",
  appId: "",
  measurementId: "G-LSCMGQNWK6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut };
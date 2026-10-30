import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as fbSignOut, 
  onAuthStateChanged as fbOnAuthStateChanged,
  User 
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Konfigurasi Firebase Anda (ambil dari Firebase Console proyek Anda)
const firebaseConfig = {
  apiKey: "MASUKKAN_API_KEY_ANDA",
  authDomain: "MASUKKAN_AUTH_DOMAIN_ANDA",
  projectId: "MASUKKAN_PROJECT_ID",
  storageBucket: "MASUKKAN_STORAGE_BUCKET",
  messagingSenderId: "MASUKKAN_MESSAGING_SENDER_ID",
  appId: "MASUKKAN_APP_ID"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// --- KONFIGURASI GOOGLE AUTH ---
export const googleProvider = new GoogleAuthProvider();

// Fungsi helper untuk memicu popup login Google
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Gagal login dengan Google:", error);
    throw error;
  }
};

// Ekspor ulang fungsi auth standar agar kompatibel dengan komponen Anda
export const signOut = () => fbSignOut(auth);
export const onAuthStateChanged = (authInst: any, callback: (user: User | null) => void) => {
  return fbOnAuthStateChanged(auth, callback);
};

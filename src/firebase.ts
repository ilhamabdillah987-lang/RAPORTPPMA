// Customized Unlimited Database Adapter with Firebase Google Authentication
// Replaces Google Cloud Firestore with zero-quota local Express companion server backend storage!
// Maintains actual Firebase Google Auth so that administrative accounts can sign in.

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup as firebaseSignInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged as firebaseOnAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';

const firebaseConfig = {
  projectId: "gen-lang-client-0907548714",
  appId: "1:864220989117:web:c5ffa3931f909b9f8099d4",
  apiKey: "AIzaSyCbuFxxnKZQu0MikWoinMpokR1DYkpuGvc",
  authDomain: "gen-lang-client-0907548714.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-d25c6ecd-70a5-4eaf-ba09-7b9e3261718b",
  storageBucket: "gen-lang-client-0907548714.firebasestorage.app",
  messagingSenderId: "864220989117"
};

// Initialize Firebase App & Auth
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithPopup = firebaseSignInWithPopup;
export const signOut = firebaseSignOut;
export const onAuthStateChanged = firebaseOnAuthStateChanged;
export type User = FirebaseUser;

// Local Database Adapters
export const db = { type: 'local_database' };

export function collection(dbInstance: any, name: string) {
  return { type: 'collection', name };
}

export function doc(dbInstance: any, collectionName: string, id?: string) {
  return { type: 'doc', path: collectionName, id };
}

export function query(colRef: any, ...clauses: any[]) {
  return { type: 'query', colRef, clauses };
}

export function where(field: string, op: string, value: any) {
  return { type: 'where', field, op, value };
}

export async function getDocs(queryInst: any) {
  let url = '/api/students';
  if (queryInst?.clauses) {
    const classClause = queryInst.clauses.find((c: any) => c.field === 'class');
    if (classClause) {
      url += `?class=${encodeURIComponent(classClause.value)}`;
    }
  }
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Gagal mengambil data dari database lokal: ${response.statusText}`);
  }
  
  const students = await response.json();
  return {
    docs: students.map((s: any) => ({
      id: s.id,
      data: () => s
    }))
  };
}

export async function getDoc(docRef: any) {
  if (docRef.path === 'configs') {
    const res = await fetch(`/api/configs/${encodeURIComponent(docRef.id)}`);
    if (!res.ok) {
      return {
        exists: () => false,
        data: () => ({ value: null })
      };
    }
    const data = await res.json();
    return {
      exists: () => data.value !== undefined && data.value !== null,
      data: () => data
    };
  }
  
  const res = await fetch(`/api/students/${encodeURIComponent(docRef.id)}`);
  if (!res.ok) {
    return {
      exists: () => false,
      data: () => ({})
    };
  }
  const data = await res.json();
  return {
    exists: () => true,
    data: () => data
  };
}

export async function setDoc(docRef: any, data: any, options?: any) {
  if (docRef.path === 'configs') {
    const res = await fetch(`/api/configs/${encodeURIComponent(docRef.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      throw new Error(`Gagal menyimpan konfigurasi: ${res.statusText}`);
    }
    return;
  }
  
  const res = await fetch(`/api/students/${encodeURIComponent(docRef.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    throw new Error(`Gagal menyimpan data santri: ${res.statusText}`);
  }
}

export async function updateDoc(docRef: any, data: any) {
  return setDoc(docRef, data);
}

export async function deleteDoc(docRef: any) {
  if (docRef.path === 'students') {
    const res = await fetch(`/api/students/${encodeURIComponent(docRef.id)}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      throw new Error(`Gagal menghapus data santri: ${res.statusText}`);
    }
  }
}

export function onSnapshot(docRef: any, callback: (snapshot: any) => void, onError?: (error: any) => void) {
  const fetchRef = async () => {
    try {
      if (docRef.path === 'configs') {
        const res = await fetch(`/api/configs/${encodeURIComponent(docRef.id)}`);
        if (res.ok) {
          const data = await res.json();
          callback({
            exists: () => data.value !== undefined && data.value !== null,
            data: () => data
          });
        } else {
          callback({
            exists: () => false,
            data: () => ({ value: null })
          });
        }
      }
    } catch (err) {
      if (onError) onError(err);
    }
  };
  
  fetchRef();
  const interval = setInterval(fetchRef, 5000);
  return () => clearInterval(interval);
}

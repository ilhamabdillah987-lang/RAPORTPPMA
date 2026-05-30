// Customized Unlimited Database Adapter
// Replaces Google Cloud Firestore with zero-quota local Express companion server backend storage!

export const db = { type: 'local_database' };

export const auth = {
  currentUser: {
    uid: 'local_teacher',
    email: 'guru@alhikmah.id',
    emailVerified: true
  }
};

export const googleProvider = { providerId: 'google.com' };

export const signInWithPopup = async () => ({ user: auth.currentUser });
export const signOut = async () => {};
export const onAuthStateChanged = (authInstance: any, callback: (user: any) => void) => {
  callback(auth.currentUser);
  return () => {};
};

export type User = typeof auth.currentUser;

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
  const interval = setInterval(fetchRef, 4000);
  return () => clearInterval(interval);
}

// Standalone Local Database Client
// Connects directly to local Express APIs with ZERO external integrations or Firebase dependency.
// Everyone is logged in as 'guru' by default for unlimited, unrestricted editing and full data persistence.

export const db = { type: 'local_database' };
export const auth = { currentUser: { uid: 'local-guru', email: 'guru@alhikmah.id', emailVerified: true } };
export type User = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
};

// Pending writes tracker for Firestore synchronization
let pendingWritesCount = 0;
let pendingListeners: (() => void)[] = [];

export function registerPendingWrite() {
  pendingWritesCount++;
}

export function resolvePendingWrite() {
  if (pendingWritesCount > 0) {
    pendingWritesCount--;
  }
  if (pendingWritesCount === 0) {
    const list = [...pendingListeners];
    pendingListeners = [];
    list.forEach(resolve => resolve());
  }
}

export async function waitForPendingWrites(dbInstance: any): Promise<void> {
  if (pendingWritesCount <= 0) {
    // Mini delay to ensure everything gets settled
    await new Promise(resolve => setTimeout(resolve, 150));
    return;
  }
  await new Promise<void>((resolve) => {
    pendingListeners.push(resolve);
  });
  await new Promise(resolve => setTimeout(resolve, 150));
}

export const signOut = async (authInst?: any) => {
  // Standalone mode is always active
  return Promise.resolve();
};

export const onAuthStateChanged = (authInst: any, callback: (user: any) => void) => {
  // Automatically authenticate with a default local coordinator role
  setTimeout(() => {
    callback({
      uid: 'local-guru',
      email: 'guru@alhikmah.id',
      emailVerified: true
    });
  }, 10);
  return () => {};
};

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

// Loads multiple documents from the server-side Lowdb database
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
    throw new Error(`Gagal mengambil data dari server: ${response.statusText}`);
  }

  const students = await response.json();
  return {
    docs: students.map((s: any) => ({
      id: s.id,
      data: () => s
    }))
  };
}

// Loads a single document (usually config key) from the server-side Lowdb database
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
      exists: () => data.value !== undefined && data.value !== null && data.value !== "",
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

// Writes documents to the server-side Lowdb database
export async function setDoc(docRef: any, data: any, options?: any) {
  registerPendingWrite();
  try {
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

    if (docRef.path === 'students') {
      const res = await fetch(`/api/students/${encodeURIComponent(docRef.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        throw new Error(`Gagal menyimpan data santri: ${res.statusText}`);
      }
    }
  } finally {
    resolvePendingWrite();
  }
}

export async function updateDoc(docRef: any, data: any) {
  const details = await getDoc(docRef);
  const existing = details.exists() ? details.data() : {};
  return setDoc(docRef, { ...existing, ...data });
}

// Deletes a student from the server-side Lowdb database
export async function deleteDoc(docRef: any) {
  registerPendingWrite();
  try {
    if (docRef.path === 'students') {
      const res = await fetch(`/api/students/${encodeURIComponent(docRef.id)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        throw new Error(`Gagal menghapus data santri: ${res.statusText}`);
      }
    }
  } finally {
    resolvePendingWrite();
  }
}

// Real-time snapshot emulation via simple interval polling
export function onSnapshot(docRef: any, callback: (snapshot: any) => void, onError?: (error: any) => void) {
  const fetchRef = async () => {
    try {
      const snap = await getDoc(docRef);
      callback(snap);
    } catch (err) {
      if (onError) onError(err);
    }
  };

  fetchRef();
  const interval = setInterval(fetchRef, 12000);
  return () => clearInterval(interval);
}

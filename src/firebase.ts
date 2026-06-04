// Customized Unlimited Database Adapter with Google Sheets Multi-User Storage
// Stores all primary data on the authenticated user's private Google Sheet!
// Maintains Firebase Google Auth for secure administrative and user login.

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

// Standard Sheets and minimally requested Drive scopes
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

export type User = FirebaseUser;

// Google Sheets State Cache (In-Memory ONLY as mandated by constraints)
let cachedAccessToken: string | null = null;
let spreadsheetId: string | null = null;
let sheetsInfo: Record<string, number> = {};

export function setAccessToken(token: string | null) {
  cachedAccessToken = token;
  if (!token) {
    spreadsheetId = null;
    sheetsInfo = {};
  }
}

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

// Custom wrapped auth listeners
export const onAuthStateChanged = (authInst: any, callback: (user: FirebaseUser | null) => void) => {
  return firebaseOnAuthStateChanged(authInst, (user) => {
    if (!user) {
      setAccessToken(null);
    }
    callback(user);
  });
};

export const signInWithPopup = async (authInst: any, providerInst: any) => {
  const result = await firebaseSignInWithPopup(authInst, providerInst);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    setAccessToken(credential.accessToken);
  }
  return result;
};

export const signOut = async (authInst: any) => {
  await firebaseSignOut(authInst);
  setAccessToken(null);
};

// Local Database Adapter Interfaces
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

// Google Sheets Auto-Initer Finder
async function ensureSpreadsheet(): Promise<string> {
  const token = cachedAccessToken;
  if (!token) {
    throw new Error("Akses Google Sheets belum diotorisasi. Hubungkan akun Google Anda.");
  }

  if (spreadsheetId) return spreadsheetId;

  // 1. Search for existing file in Google Drive
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("name='Raport_Al_Hikmah_Database' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false")}`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!searchRes.ok) {
    throw new Error(`Gagal mencari database Google Sheets: ${searchRes.statusText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    const foundId = searchData.files[0].id;
    spreadsheetId = foundId;
    await fetchSheetsInfo(foundId, token);
    return foundId;
  }

  // 2. Create new spreadsheet if not found
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: "Raport_Al_Hikmah_Database"
      },
      sheets: [
        {
          properties: {
            title: "Students"
          }
        },
        {
          properties: {
            title: "Configs"
          }
        }
      ]
    })
  });

  if (!createRes.ok) {
    throw new Error(`Gagal membuat database Google Sheets baru: ${createRes.statusText}`);
  }

  const createData = await createRes.json();
  const createdId = createData.spreadsheetId;
  spreadsheetId = createdId;

  // Parse Sheet IDs
  if (createData.sheets) {
    for (const s of createData.sheets) {
      sheetsInfo[s.properties.title] = s.properties.sheetId;
    }
  }

  // 3. Initialize headers for Students & Configs
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${createdId}/values/Students!A1:I1?valueInputOption=RAW`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: "Students!A1:I1",
      majorDimension: "ROWS",
      values: [["id", "name", "class", "noUrut", "semester", "tahunPelajaran", "nomorInduk", "data", "updatedAt"]]
    })
  });

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${createdId}/values/Configs!A1:C1?valueInputOption=RAW`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: "Configs!A1:C1",
      majorDimension: "ROWS",
      values: [["key", "value", "updatedAt"]]
    })
  });

  return createdId;
}

async function fetchSheetsInfo(id: string, token: string) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.ok) {
    const data = await res.json();
    if (data.sheets) {
      for (const s of data.sheets) {
        sheetsInfo[s.properties.title] = s.properties.sheetId;
      }
    }
  }
}

// Google Sheets implementation of GET docs
export async function getDocs(queryInst: any) {
  const token = cachedAccessToken;
  
  // Dynamic Fallback
  if (!token) {
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

  // Google Sheets Primary Database
  const ssid = await ensureSpreadsheet();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssid}/values/Students!A2:I1000`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`Gagal membaca data santri dari Google Sheets: ${res.statusText}`);
  }

  const data = await res.json();
  const rows = data.values || [];
  
  let students = rows.map((row: any) => {
    try {
      return JSON.parse(row[7]);
    } catch (_) {
      return {
        id: row[0] || "",
        name: row[1] || "",
        class: row[2] || "",
        noUrut: Number(row[3]) || 0,
        semester: row[4] || "GANJIL",
        tahunPelajaran: row[5] || "",
        nomorInduk: row[6] || "",
      };
    }
  });

  // Client-side filtration matching firebase queries
  if (queryInst?.clauses) {
    const classClause = queryInst.clauses.find((c: any) => c.field === 'class');
    if (classClause) {
      students = students.filter((s: any) => s.class === classClause.value);
    }
  }

  return {
    docs: students.map((s: any) => ({
      id: s.id,
      data: () => s
    }))
  };
}

// Google Sheets implementation of GET doc
export async function getDoc(docRef: any) {
  const token = cachedAccessToken;

  // Dynamic Fallback
  if (!token) {
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

  // Google Sheets Primary Database
  const ssid = await ensureSpreadsheet();

  if (docRef.path === 'configs') {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssid}/values/Configs!A2:C500`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      const data = await res.json();
      const rows = data.values || [];
      const match = rows.find((row: any) => row[0] === docRef.id);
      if (match) {
        let val = match[1];
        // Autoparse JSON if possible
        try {
          if ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']'))) {
            val = JSON.parse(val);
          }
        } catch (_) {}
        return {
          exists: () => true,
          data: () => ({ value: val })
        };
      }
    }

    return {
      exists: () => false,
      data: () => ({ value: null })
    };
  }

  // Student specific Doc request
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssid}/values/Students!A2:I1000`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (res.ok) {
    const data = await res.json();
    const rows = data.values || [];
    const match = rows.find((row: any) => row[0] === docRef.id);
    if (match) {
      try {
        return {
          exists: () => true,
          data: () => JSON.parse(match[7])
        };
      } catch (_) {
        return {
          exists: () => true,
          data: () => ({ id: match[0], name: match[1], class: match[2] })
        };
      }
    }
  }

  return {
    exists: () => false,
    data: () => ({})
  };
}

// Google Sheets implementation of SET doc
export async function setDoc(docRef: any, data: any, options?: any) {
  const token = cachedAccessToken;

  // Dynamic Fallback
  if (!token) {
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
    return;
  }

  // Google Sheets Primary Database
  const ssid = await ensureSpreadsheet();

  if (docRef.path === 'configs') {
    const resKeys = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssid}/values/Configs!A:A`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    let rowIndex = -1;
    if (resKeys.ok) {
      const keysData = await resKeys.json();
      const keys = keysData.values || [];
      rowIndex = keys.findIndex((row: any) => row[0] === docRef.id);
    }

    const valueStr = typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
    const rowValues = [docRef.id, valueStr, data.updatedAt || new Date().toISOString()];

    if (rowIndex !== -1) {
      const rowNum = rowIndex + 1;
      const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssid}/values/Configs!A${rowNum}:C${rowNum}?valueInputOption=RAW`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range: `Configs!A${rowNum}:C${rowNum}`,
          majorDimension: "ROWS",
          values: [rowValues]
        })
      });
      if (!updateRes.ok) {
        throw new Error(`Gagal memperbarui konfigurasi di Sheets: ${updateRes.statusText}`);
      }
    } else {
      const appendRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssid}/values/Configs!A:C:append?valueInputOption=RAW`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range: "Configs!A:C",
          majorDimension: "ROWS",
          values: [rowValues]
        })
      });
      if (!appendRes.ok) {
        throw new Error(`Gagal menyimpan konfigurasi baru di Sheets: ${appendRes.statusText}`);
      }
    }
    return;
  }

  if (docRef.path === 'students') {
    const student = data;
    const resKeys = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssid}/values/Students!A:A`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    let rowIndex = -1;
    if (resKeys.ok) {
      const keysData = await resKeys.json();
      const keys = keysData.values || [];
      rowIndex = keys.findIndex((row: any) => row[0] === docRef.id);
    }

    const rowValues = [
      student.id,
      student.name || "",
      student.class || "",
      student.noUrut || 0,
      student.semester || "GANJIL",
      student.tahunPelajaran || "",
      student.nomorInduk || "",
      JSON.stringify(student),
      new Date().toISOString()
    ];

    if (rowIndex !== -1) {
      const rowNum = rowIndex + 1;
      const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssid}/values/Students!A${rowNum}:I${rowNum}?valueInputOption=RAW`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range: `Students!A${rowNum}:I${rowNum}`,
          majorDimension: "ROWS",
          values: [rowValues]
        })
      });
      if (!updateRes.ok) {
        throw new Error(`Gagal menyimpan data santri ke Google Sheets: ${updateRes.statusText}`);
      }
    } else {
      const appendRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssid}/values/Students!A:I:append?valueInputOption=RAW`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range: "Students!A:I",
          majorDimension: "ROWS",
          values: [rowValues]
        })
      });
      if (!appendRes.ok) {
        throw new Error(`Gagal menyimpan data santri ke Google Sheets: ${appendRes.statusText}`);
      }
    }

    // Secondary process helper to sync background monitoring panel
    try {
      fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          className: student.class,
          students: [student],
          waliKelas: student.waliKelas || ''
        })
      });
    } catch (_) {}
  }
}

export async function updateDoc(docRef: any, data: any) {
  // Merge load logic to maintain safety
  const details = await getDoc(docRef);
  const existing = details.exists() ? details.data() : {};
  return setDoc(docRef, { ...existing, ...data });
}

// Google Sheets implementation of DELETE doc
export async function deleteDoc(docRef: any) {
  const token = cachedAccessToken;

  // Dynamic Fallback
  if (!token) {
    if (docRef.path === 'students') {
      const res = await fetch(`/api/students/${encodeURIComponent(docRef.id)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        throw new Error(`Gagal menghapus data santri: ${res.statusText}`);
      }
    }
    return;
  }

  // Google Sheets Primary Database
  const ssid = await ensureSpreadsheet();

  if (docRef.path === 'students') {
    const resKeys = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssid}/values/Students!A:A`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!resKeys.ok) return;

    const keysData = await resKeys.json();
    const keys = keysData.values || [];
    const rowIndex = keys.findIndex((row: any) => row[0] === docRef.id);

    if (rowIndex === -1) return;

    const sheetId = sheetsInfo["Students"];
    if (sheetId === undefined) {
      throw new Error("Gagal memperoleh ID tab Students.");
    }

    const deleteRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssid}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: "ROWS",
                startIndex: rowIndex,
                endIndex: rowIndex + 1
              }
            }
          }
        ]
      })
    });

    if (!deleteRes.ok) {
      throw new Error(`Gagal menghapus baris dari Google Sheets: ${deleteRes.statusText}`);
    }
  }
}

// Live configuration changes wrapper
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
  const interval = setInterval(fetchRef, 10000);
  return () => clearInterval(interval);
}

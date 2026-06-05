import express, { Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import bcrypt from "bcryptjs";
import fs from "fs";

// Initialize Firebase SDK
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection as firestoreCollection, 
  doc as firestoreDoc, 
  getDoc as firestoreGetDoc, 
  getDocs as firestoreGetDocs, 
  setDoc as firestoreSetDoc, 
  deleteDoc as firestoreDeleteDoc, 
  query as firestoreQuery, 
  where as firestoreWhere 
} from "firebase/firestore";
import { sql } from "@vercel/postgres";

dotenv.config();

const PORT = 3000;

interface Data {
  students: any[];
  classesBackup?: Record<string, { students: any[]; updatedAt: string; waliKelas?: string }>;
  configs?: Record<string, any>;
  teachers?: any[];
}

const app = express();
export default app;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Setup Vercel Database connection
const isVercelDb = !!process.env.POSTGRES_URL;

async function initVercelDb() {
  if (!isVercelDb) {
    console.log("[Server] Vercel Database (POSTGRES_URL) not detected. Operating in hybrid Local/Firestore mode.");
    return;
  }
  try {
    console.log("[Server] Initializing Vercel Postgres tables...");
    await sql`
      CREATE TABLE IF NOT EXISTS students (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255),
        class VARCHAR(100),
        data JSONB,
        updated_at VARCHAR(100)
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS classes_backup (
        class_name VARCHAR(100) PRIMARY KEY,
        data JSONB,
        updated_at VARCHAR(100)
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS configs (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at VARCHAR(100)
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS teachers (
        username VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255),
        pwd_hash TEXT,
        wali_kelas VARCHAR(100),
        updated_at VARCHAR(100)
      );
    `;
    console.log("[Server] Vercel Postgres tables verified & initialized successfully.");
  } catch (err) {
    console.error("[Server] Critical failure during Vercel Postgres initialization:", err);
  }
}

// Setup Firebase Firestore connection
let firebaseApp: any = null;
let firestoreDb: any = null;

try {
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(firebaseConfigPath)) {
    const config = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
    firebaseApp = initializeApp(config);
    firestoreDb = getFirestore(firebaseApp, config.firestoreDatabaseId);
    console.log("[Server] Connected to persistent Firestore with DB ID:", config.firestoreDatabaseId);
  } else {
    console.warn("[Server] firebase-applet-config.json not found. Operating with local lowdb fallback.");
  }
} catch (err) {
  console.error("[Server] Firebase configuration or initialization error:", err);
}

// Explicit lowdb setup (used as robust offline fallback)
const adapter = new JSONFile<Data>(path.join(process.cwd(), 'db.json'));
const defaultData: Data = { students: [], classesBackup: {}, configs: {}, teachers: [] };
const dbLocal = new Low<Data>(adapter, defaultData);

let writeQueue = Promise.resolve();
async function safeWrite(): Promise<void> {
  return new Promise<void>((resolve) => {
    writeQueue = writeQueue
      .then(async () => {
        try {
          await dbLocal.write();
        } catch (err) {
          console.warn("[safeWriteError - Handled Gracefully]", err);
        }
      })
      .then(resolve);
  });
}

(async () => {
  await initVercelDb();
  await dbLocal.read();
  if (!dbLocal.data) {
    dbLocal.data = defaultData;
    await safeWrite();
  } else {
    let changed = false;
    if (!dbLocal.data.classesBackup) {
      dbLocal.data.classesBackup = {};
      changed = true;
    }
    if (!dbLocal.data.configs) {
      dbLocal.data.configs = {};
      changed = true;
    }
    if (!dbLocal.data.students) {
      dbLocal.data.students = [];
      changed = true;
    }
    if (!dbLocal.data.teachers) {
      dbLocal.data.teachers = [];
      changed = true;
    }
    if (changed) {
      await safeWrite();
    }
  }
})();

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", usingCloudDatabase: isVercelDb || !!firestoreDb, databaseType: isVercelDb ? "vercel-postgres" : (firestoreDb ? "firestore" : "local-lowdb") });
  });

  // Public Student Routes
  app.get("/api/students", async (req, res) => {
    try {
      const { class: className } = req.query;
      
      if (isVercelDb) {
        if (className) {
          const backupRes = await sql`SELECT data FROM classes_backup WHERE class_name = ${className as string}`;
          if (backupRes.rows.length > 0) {
            const data = backupRes.rows[0].data;
            if (data && data.students && data.students.length > 0) {
              return res.json(data.students);
            }
          }
          
          const studentsRes = await sql`SELECT data FROM students WHERE class = ${className as string}`;
          const students = studentsRes.rows.map(row => row.data);
          return res.json(students);
        } else {
          const studentsRes = await sql`SELECT data FROM students`;
          const students = studentsRes.rows.map(row => row.data);
          return res.json(students);
        }
      } else if (firestoreDb) {
        if (className) {
          // Check classes_backup collection first
          const backupDocRef = firestoreDoc(firestoreDb, "classes_backup", className as string);
          const backupSnap = await firestoreGetDoc(backupDocRef);
          if (backupSnap.exists()) {
            const data = backupSnap.data();
            if (data && data.students && data.students.length > 0) {
              return res.json(data.students);
            }
          }
          
          // Fallback to querying students directly
          const colRef = firestoreCollection(firestoreDb, "students");
          const q = firestoreQuery(colRef, firestoreWhere("class", "==", className as string));
          const snap = await firestoreGetDocs(q);
          const students = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          return res.json(students);
        } else {
          const colRef = firestoreCollection(firestoreDb, "students");
          const snap = await firestoreGetDocs(colRef);
          const students = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          return res.json(students);
        }
      } else {
        if (!dbLocal.data) throw new Error("Database not initialized");
        if (className) {
          const backup = dbLocal.data.classesBackup?.[className as string];
          if (backup && backup.students) {
            return res.json(backup.students);
          }
          const students = (dbLocal.data.students || []).filter(s => s.class === className);
          return res.json(students);
        }
        res.json(dbLocal.data.students || []);
      }
    } catch (error: any) {
      console.error("Get Students Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/students", async (req, res) => {
    try {
      const student = req.body;
      const studentId = student.id || Date.now().toString();
      const newStudent = {
        ...student,
        id: studentId,
        updatedAt: new Date().toISOString()
      };

      if (isVercelDb) {
        await sql`
          INSERT INTO students (id, name, class, data, updated_at)
          VALUES (${studentId}, ${newStudent.name || ""}, ${newStudent.class || ""}, ${JSON.stringify(newStudent)}, ${newStudent.updatedAt})
          ON CONFLICT (id) DO UPDATE SET 
            name = EXCLUDED.name,
            class = EXCLUDED.class,
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
        `;

        // Update class packet backup as well
        if (newStudent.class) {
          const cls = newStudent.class;
          const backupRes = await sql`SELECT data FROM classes_backup WHERE class_name = ${cls}`;
          let currentStudents: any[] = [];
          let currentWali = "";
          if (backupRes.rows.length > 0) {
            const backupData = backupRes.rows[0].data || {};
            currentStudents = backupData.students || [];
            currentWali = backupData.waliKelas || "";
          }
          currentStudents = currentStudents.filter(s => s.id !== studentId);
          currentStudents.push(newStudent);
          const updatedBackup = {
            students: currentStudents,
            updatedAt: new Date().toISOString(),
            waliKelas: currentWali
          };
          await sql`
            INSERT INTO classes_backup (class_name, data, updated_at)
            VALUES (${cls}, ${JSON.stringify(updatedBackup)}, ${updatedBackup.updatedAt})
            ON CONFLICT (class_name) DO UPDATE SET
              data = EXCLUDED.data,
              updated_at = EXCLUDED.updated_at
          `;
        }
      } else if (firestoreDb) {
        const docRef = firestoreDoc(firestoreDb, "students", studentId);
        await firestoreSetDoc(docRef, newStudent, { merge: true });

        // Update class packet backup as well
        if (newStudent.class) {
          const cls = newStudent.class;
          const backupDocRef = firestoreDoc(firestoreDb, "classes_backup", cls);
          const backupSnap = await firestoreGetDoc(backupDocRef);
          let currentStudents: any[] = [];
          let currentWali = "";
          if (backupSnap.exists()) {
            const backupData = backupSnap.data() || {};
            currentStudents = backupData.students || [];
            currentWali = backupData.waliKelas || "";
          }
          currentStudents = currentStudents.filter(s => s.id !== studentId);
          currentStudents.push(newStudent);
          await firestoreSetDoc(backupDocRef, {
            students: currentStudents,
            updatedAt: new Date().toISOString(),
            waliKelas: currentWali
          }, { merge: true });
        }
      } else {
        if (!dbLocal.data) throw new Error("Database not initialized");
        dbLocal.data.students.push(newStudent);
        await safeWrite();
      }
      res.status(201).json(newStudent);
    } catch (error: any) {
      console.error("Create Student Error:", error);
      res.status(500).json({ message: `Gagal membuat data santri: ${error.message || error}` });
    }
  });

  app.put("/api/students/:id", async (req, res) => {
    const { id } = req.params;
    const studentUpdate = req.body;
    
    try {
      let finalStudent: any;

      if (isVercelDb) {
        let existingStudent: any = null;
        const studentRes = await sql`SELECT data FROM students WHERE id = ${id}`;
        if (studentRes.rows.length > 0) {
          existingStudent = studentRes.rows[0].data;
        }

        finalStudent = {
          ...(existingStudent || {}),
          ...studentUpdate,
          id,
          updatedAt: new Date().toISOString()
        };

        await sql`
          INSERT INTO students (id, name, class, data, updated_at)
          VALUES (${id}, ${finalStudent.name || ""}, ${finalStudent.class || ""}, ${JSON.stringify(finalStudent)}, ${finalStudent.updatedAt})
          ON CONFLICT (id) DO UPDATE SET 
            name = EXCLUDED.name,
            class = EXCLUDED.class,
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
        `;

        // Update class packet backup
        if (finalStudent.class) {
          const cls = finalStudent.class;
          const backupRes = await sql`SELECT data FROM classes_backup WHERE class_name = ${cls}`;
          let currentStudents: any[] = [];
          let currentWali = "";
          if (backupRes.rows.length > 0) {
            const backupData = backupRes.rows[0].data || {};
            currentStudents = backupData.students || [];
            currentWali = backupData.waliKelas || "";
          }
          const sIndex = currentStudents.findIndex(s => s.id === id);
          if (sIndex === -1) {
            currentStudents.push(finalStudent);
          } else {
            currentStudents[sIndex] = finalStudent;
          }
          const updatedBackup = {
            students: currentStudents,
            updatedAt: new Date().toISOString(),
            waliKelas: currentWali
          };
          await sql`
            INSERT INTO classes_backup (class_name, data, updated_at)
            VALUES (${cls}, ${JSON.stringify(updatedBackup)}, ${updatedBackup.updatedAt})
            ON CONFLICT (class_name) DO UPDATE SET
              data = EXCLUDED.data,
              updated_at = EXCLUDED.updated_at
          `;
        }
      } else if (firestoreDb) {
        const docRef = firestoreDoc(firestoreDb, "students", id);
        const docSnap = await firestoreGetDoc(docRef);
        if (docSnap.exists()) {
          finalStudent = {
            ...docSnap.data(),
            ...studentUpdate,
            id,
            updatedAt: new Date().toISOString()
          };
        } else {
          finalStudent = {
            ...studentUpdate,
            id,
            updatedAt: new Date().toISOString()
          };
        }
        await firestoreSetDoc(docRef, finalStudent, { merge: true });

        if (finalStudent.class) {
          const cls = finalStudent.class;
          const backupDocRef = firestoreDoc(firestoreDb, "classes_backup", cls);
          const backupSnap = await firestoreGetDoc(backupDocRef);
          let currentStudents: any[] = [];
          let currentWali = "";
          if (backupSnap.exists()) {
            const backupData = backupSnap.data() || {};
            currentStudents = backupData.students || [];
            currentWali = backupData.waliKelas || "";
          }
          const sIndex = currentStudents.findIndex(s => s.id === id);
          if (sIndex === -1) {
            currentStudents.push(finalStudent);
          } else {
            currentStudents[sIndex] = finalStudent;
          }
          await firestoreSetDoc(backupDocRef, {
            students: currentStudents,
            updatedAt: new Date().toISOString(),
            waliKelas: currentWali
          }, { merge: true });
        }
      } else {
        if (!dbLocal.data) throw new Error("Database not initialized");
        if (!dbLocal.data.students) dbLocal.data.students = [];

        const index = dbLocal.data.students.findIndex(s => s.id === id);
        if (index === -1) {
          finalStudent = {
            ...studentUpdate,
            id,
            updatedAt: new Date().toISOString()
          };
          dbLocal.data.students.push(finalStudent);
        } else {
          finalStudent = {
            ...dbLocal.data.students[index],
            ...studentUpdate,
            id,
            updatedAt: new Date().toISOString()
          };
          dbLocal.data.students[index] = finalStudent;
        }

        if (finalStudent.class) {
          const cls = finalStudent.class;
          if (!dbLocal.data.classesBackup) dbLocal.data.classesBackup = {};
          if (!dbLocal.data.classesBackup[cls]) {
            dbLocal.data.classesBackup[cls] = { students: [], updatedAt: new Date().toISOString() };
          }
          const clsStudents = dbLocal.data.classesBackup[cls].students || [];
          const sIndex = clsStudents.findIndex(s => s.id === id);
          if (sIndex === -1) {
            clsStudents.push(finalStudent);
          } else {
            clsStudents[sIndex] = finalStudent;
          }
          dbLocal.data.classesBackup[cls].students = clsStudents;
          dbLocal.data.classesBackup[cls].updatedAt = new Date().toISOString();
        }
        await safeWrite();
      }

      res.json(finalStudent);
    } catch (error: any) {
      console.error("Update Student Error:", error);
      res.status(500).json({ message: `Gagal memperbarui data santri: ${error.message || error}` });
    }
  });

  app.delete("/api/students/:id", async (req, res) => {
    const { id } = req.params;
    try {
      if (isVercelDb) {
        const studentRes = await sql`SELECT data FROM students WHERE id = ${id}`;
        if (studentRes.rows.length > 0) {
          const student = studentRes.rows[0].data;
          await sql`DELETE FROM students WHERE id = ${id}`;

          if (student.class) {
            const cls = student.class;
            const backupRes = await sql`SELECT data FROM classes_backup WHERE class_name = ${cls}`;
            if (backupRes.rows.length > 0) {
              const backupData = backupRes.rows[0].data || {};
              const currentStudents = (backupData.students || []).filter((s: any) => s.id !== id);
              const updatedBackup = {
                ...backupData,
                students: currentStudents,
                updatedAt: new Date().toISOString()
              };
              await sql`
                INSERT INTO classes_backup (class_name, data, updated_at)
                VALUES (${cls}, ${JSON.stringify(updatedBackup)}, ${updatedBackup.updatedAt})
                ON CONFLICT (class_name) DO UPDATE SET
                  data = EXCLUDED.data,
                  updated_at = EXCLUDED.updated_at
              `;
            }
          }
        }
      } else if (firestoreDb) {
        const docRef = firestoreDoc(firestoreDb, "students", id);
        const docSnap = await firestoreGetDoc(docRef);
        if (docSnap.exists()) {
          const student = docSnap.data();
          await firestoreDeleteDoc(docRef);

          if (student.class) {
            const cls = student.class;
            const backupDocRef = firestoreDoc(firestoreDb, "classes_backup", cls);
            const backupSnap = await firestoreGetDoc(backupDocRef);
            if (backupSnap.exists()) {
              const backupData = backupSnap.data() || {};
              const currentStudents = (backupData.students || []).filter((s: any) => s.id !== id);
              await firestoreSetDoc(backupDocRef, {
                students: currentStudents,
                updatedAt: new Date().toISOString()
              }, { merge: true });
            }
          }
        }
      } else {
        if (!dbLocal.data) throw new Error("Database not initialized");
        const index = dbLocal.data.students.findIndex(s => s.id === id);
        
        if (index === -1) {
          return res.status(404).json({ message: "Student not found" });
        }

        const classLabel = dbLocal.data.students[index].class;
        dbLocal.data.students.splice(index, 1);

        if (classLabel && dbLocal.data.classesBackup && dbLocal.data.classesBackup[classLabel]) {
          dbLocal.data.classesBackup[classLabel].students = (dbLocal.data.classesBackup[classLabel].students || []).filter(s => s.id !== id);
          dbLocal.data.classesBackup[classLabel].updatedAt = new Date().toISOString();
        }

        await safeWrite();
      }
      res.status(204).send();
    } catch (error: any) {
      console.error("Delete Student Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get configuration key
  app.get("/api/configs/:key", async (req, res) => {
    try {
      const { key } = req.params;
      let value = "";
      
      if (isVercelDb) {
        const configRes = await sql`SELECT value FROM configs WHERE key = ${key}`;
        if (configRes.rows.length > 0) {
          value = configRes.rows[0].value || "";
        }
      } else if (firestoreDb) {
        const docRef = firestoreDoc(firestoreDb, "configs", key);
        const docSnap = await firestoreGetDoc(docRef);
        if (docSnap.exists()) {
          value = docSnap.data().value || "";
        }
      } else {
        value = dbLocal.data?.configs?.[key] || "";
      }
      res.json({ value });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Set configuration key
  app.post("/api/configs/:key", async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      
      if (isVercelDb) {
        const updatedAt = new Date().toISOString();
        await sql`
          INSERT INTO configs (key, value, updated_at)
          VALUES (${key}, ${value}, ${updatedAt})
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = EXCLUDED.updated_at
        `;
      } else if (firestoreDb) {
        const docRef = firestoreDoc(firestoreDb, "configs", key);
        await firestoreSetDoc(docRef, { value }, { merge: true });
      } else {
        if (!dbLocal.data) {
          dbLocal.data = { students: [], classesBackup: {}, configs: {} };
        }
        if (!dbLocal.data.configs) {
          dbLocal.data.configs = {};
        }
        dbLocal.data.configs[key] = value;
        await safeWrite();
      }
      res.json({ success: true, key, value });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Background Backup Endpoint
  app.post("/api/backup", async (req, res) => {
    try {
      const { className, students, waliKelas } = req.body;
      if (!className) {
        return res.status(400).json({ error: "Missing className" });
      }

      if (isVercelDb) {
        const backupRes = await sql`SELECT data FROM classes_backup WHERE class_name = ${className}`;
        let existingWali = "";
        if (backupRes.rows.length > 0) {
          existingWali = backupRes.rows[0].data?.waliKelas || "";
        }
        const updatedBackup = {
          students: students || [],
          updatedAt: new Date().toISOString(),
          waliKelas: waliKelas || existingWali
        };
        await sql`
          INSERT INTO classes_backup (class_name, data, updated_at)
          VALUES (${className}, ${JSON.stringify(updatedBackup)}, ${updatedBackup.updatedAt})
          ON CONFLICT (class_name) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
        `;

        if (students && Array.isArray(students)) {
          for (const s of students) {
            if (s && s.id) {
              const updatedAt = new Date().toISOString();
              await sql`
                INSERT INTO students (id, name, class, data, updated_at)
                VALUES (${s.id}, ${s.name || ""}, ${s.class || ""}, ${JSON.stringify(s)}, ${updatedAt})
                ON CONFLICT (id) DO UPDATE SET 
                  name = EXCLUDED.name,
                  class = EXCLUDED.class,
                  data = EXCLUDED.data,
                  updated_at = EXCLUDED.updated_at
              `;
            }
          }
        }
      } else if (firestoreDb) {
        const backupDocRef = firestoreDoc(firestoreDb, "classes_backup", className);
        const backupSnap = await firestoreGetDoc(backupDocRef);
        let existingWali = "";
        if (backupSnap.exists()) {
          existingWali = backupSnap.data().waliKelas || "";
        }
        await firestoreSetDoc(backupDocRef, {
          students: students || [],
          updatedAt: new Date().toISOString(),
          waliKelas: waliKelas || existingWali
        }, { merge: true });

        if (students && Array.isArray(students)) {
          for (const s of students) {
            if (s && s.id) {
              const studentDocRef = firestoreDoc(firestoreDb, "students", s.id);
              await firestoreSetDoc(studentDocRef, { ...s, updatedAt: new Date().toISOString() }, { merge: true });
            }
          }
        }
      } else {
        if (!dbLocal.data) {
          dbLocal.data = { students: [], classesBackup: {}, configs: {} };
        }
        if (!dbLocal.data.classesBackup) {
          dbLocal.data.classesBackup = {};
        }

        dbLocal.data.classesBackup[className] = {
          students: students || [],
          updatedAt: new Date().toISOString(),
          waliKelas: waliKelas || dbLocal.data.classesBackup[className]?.waliKelas || ""
        };

        if (students && Array.isArray(students)) {
          if (!dbLocal.data.students) dbLocal.data.students = [];
          dbLocal.data.students = dbLocal.data.students.filter(s => s.class !== className);
          dbLocal.data.students.push(...students);
        }

        await safeWrite();
      }
      res.json({ success: true, className, count: (students || []).length });
    } catch (err: any) {
      console.error("Backup error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get Class-Specific Backup JSON Data
  app.get("/api/backup/:className", async (req, res) => {
    try {
      const { className } = req.params;
      
      if (isVercelDb) {
        const backupRes = await sql`SELECT data FROM classes_backup WHERE class_name = ${className}`;
        if (backupRes.rows.length > 0) {
          return res.json(backupRes.rows[0].data);
        }
        
        // Query as secondary fallback
        const studentsRes = await sql`SELECT data FROM students WHERE class = ${className}`;
        const classStudents = studentsRes.rows.map(row => row.data);
        if (classStudents.length > 0) {
          const backupInfo = {
            students: classStudents,
            updatedAt: new Date().toISOString(),
            waliKelas: ""
          };
          await sql`
            INSERT INTO classes_backup (class_name, data, updated_at)
            VALUES (${className}, ${JSON.stringify(backupInfo)}, ${backupInfo.updatedAt})
            ON CONFLICT (class_name) DO UPDATE SET
              data = EXCLUDED.data,
              updated_at = EXCLUDED.updated_at
          `;
          return res.json(backupInfo);
        }
        return res.status(404).json({ error: "Backup data kelas tidak ditemukan" });
      } else if (firestoreDb) {
        const backupDocRef = firestoreDoc(firestoreDb, "classes_backup", className);
        const backupSnap = await firestoreGetDoc(backupDocRef);
        if (backupSnap.exists()) {
          return res.json(backupSnap.data());
        }
        
        // Query as secondary fallback
        const colRef = firestoreCollection(firestoreDb, "students");
        const q = firestoreQuery(colRef, firestoreWhere("class", "==", className));
        const snap = await firestoreGetDocs(q);
        const classStudents = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (classStudents.length > 0) {
          const backupInfo = {
            students: classStudents,
            updatedAt: new Date().toISOString(),
            waliKelas: ""
          };
          await firestoreSetDoc(backupDocRef, backupInfo, { merge: true });
          return res.json(backupInfo);
        }
        return res.status(404).json({ error: "Backup data kelas tidak ditemukan" });
      } else {
        if (!dbLocal.data || !dbLocal.data.classesBackup || !dbLocal.data.classesBackup[className] || !dbLocal.data.classesBackup[className].students || dbLocal.data.classesBackup[className].students.length === 0) {
          const classStudents = dbLocal.data?.students?.filter(s => s.class === className) || [];
          if (classStudents.length > 0) {
            if (!dbLocal.data.classesBackup) dbLocal.data.classesBackup = {};
            dbLocal.data.classesBackup[className] = {
              students: classStudents,
              updatedAt: new Date().toISOString(),
              waliKelas: ""
            };
            await safeWrite();
            return res.json(dbLocal.data.classesBackup[className]);
          }
          return res.status(404).json({ error: "Backup data kelas tidak ditemukan" });
        }
        res.json(dbLocal.data.classesBackup[className]);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Download Class JSON Backup Route
  app.get("/api/classes-download/:className", async (req, res) => {
    try {
      const { className } = req.params;
      let data: any = null;

      if (isVercelDb) {
        const backupRes = await sql`SELECT data FROM classes_backup WHERE class_name = ${className}`;
        if (backupRes.rows.length > 0) {
          data = backupRes.rows[0].data;
        }
      } else if (firestoreDb) {
        const backupDocRef = firestoreDoc(firestoreDb, "classes_backup", className);
        const backupSnap = await firestoreGetDoc(backupDocRef);
        if (backupSnap.exists()) {
          data = backupSnap.data();
        }
      } else {
        if (dbLocal.data && dbLocal.data.classesBackup && dbLocal.data.classesBackup[className]) {
          data = dbLocal.data.classesBackup[className];
        }
      }

      if (!data) {
        return res.status(404).send("Backup data kelas tidak ditemukan");
      }
      res.setHeader('Content-disposition', `attachment; filename=Raport_Backup_Kelas_${className.replace(/\s+/g, '_')}.json`);
      res.setHeader('Content-type', 'application/json');
      res.send(JSON.stringify(data, null, 2));
    } catch (err: any) {
      res.status(500).send("Gagal mengunduh backup: " + err.message);
    }
  });

  // Status Summary API
  app.get("/api/status-summary", async (req, res) => {
    try {
      const predefinedClasses = [
        '7 MTs Putra', '7 MTs Putri', '7 MTs Putra & Putri',
        '7 SMP Putra', '7 SMP Putri', '7 SMP Putra & Putri',
        '8 MTs Putra', '8 MTs Putri', '8 MTs Putra & Putri',
        '8 SMP Putra', '8 SMP Putri', '8 SMP Putra & Putri',
        '9 MTs Putra', '9 MTs Putri', '9 MTs Putra & Putri',
        '9 SMP Putra', '9 SMP Putri', '9 SMP Putra & Putri',
        '10 SMA Putra', '10 SMA Putri', '10 SMA Putra & Putri',
        '11 SMA Putra', '11 SMA Putri', '11 SMA Putra & Putri',
        '12 SMA Putra', '12 SMA Putri', '12 SMA Putra & Putri',
        'ALUMNI'
      ];
      
      let backups: any = {};
      if (isVercelDb) {
        const backupRes = await sql`SELECT class_name, data FROM classes_backup`;
        backupRes.rows.forEach(row => {
          backups[row.class_name] = row.data;
        });
      } else if (firestoreDb) {
        const colRef = firestoreCollection(firestoreDb, "classes_backup");
        const snap = await firestoreGetDocs(colRef);
        snap.forEach(doc => {
          backups[doc.id] = doc.data();
        });
      } else {
        backups = dbLocal.data?.classesBackup || {};
      }
      
      const classSummary = predefinedClasses.map(cls => {
        const backup = backups[cls];
        const hasData = !!(backup && backup.students && backup.students.length > 0);
        return {
          name: cls,
          hasData,
          studentCount: hasData ? backup.students.length : 0,
          waliKelas: backup?.waliKelas || "-",
          updatedAt: backup?.updatedAt || null
        };
      });

      res.json({
        classes: classSummary,
        totalClasses: predefinedClasses.length,
        filledClasses: classSummary.filter(c => c.hasData).length,
        totalStudents: classSummary.reduce((sum, c) => sum + c.studentCount, 0),
        serverTime: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Teacher Management & Auth APIs ---

  // Get all teachers
  app.get("/api/teachers", async (req, res) => {
    try {
      let teachersList: any[] = [];
      if (isVercelDb) {
        const teachersRes = await sql`SELECT username, name, pwd_hash, wali_kelas FROM teachers`;
        teachersList = teachersRes.rows.map(row => ({
          username: row.username,
          name: row.name,
          pwdHash: row.pwd_hash,
          waliKelas: row.wali_kelas
        }));
      } else if (firestoreDb) {
        const colRef = firestoreCollection(firestoreDb, "teachers");
        const snap = await firestoreGetDocs(colRef);
        teachersList = snap.docs.map(doc => doc.data());
      } else {
        teachersList = dbLocal.data?.teachers || [];
      }

      const mapped = teachersList.map(t => ({
        username: t && t.username ? t.username : "unknown",
        name: t && t.name ? t.name : (t && t.username ? t.username : "unknown"),
        waliKelas: t && t.waliKelas ? t.waliKelas : ""
      }));
      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create a teacher account
  app.post("/api/teachers", async (req, res) => {
    console.log("[Server] POST /api/teachers body payload:", req.body);
    try {
      const { username, password, waliKelas, name } = req.body;
      if (!username || !password || !waliKelas) {
        console.warn("[Server] Validation failed for teacher creation:", { username, password: !!password, waliKelas });
        return res.status(400).json({ error: "Username, password, dan waliKelas harus diisi" });
      }

      const preservedUsername = username.trim();

      if (isVercelDb) {
        const teacherRes = await sql`SELECT username FROM teachers WHERE LOWER(username) = LOWER(${preservedUsername})`;
        if (teacherRes.rows.length > 0) {
          return res.status(400).json({ error: "Username sudah digunakan" });
        }

        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);

        const newTeacher = {
          username: preservedUsername,
          name: (name || username).trim(),
          pwdHash: hash,
          waliKelas: waliKelas.trim()
        };

        const updatedAt = new Date().toISOString();
        await sql`
          INSERT INTO teachers (username, name, pwd_hash, wali_kelas, updated_at)
          VALUES (${preservedUsername.toLowerCase()}, ${newTeacher.name}, ${newTeacher.pwdHash}, ${newTeacher.waliKelas}, ${updatedAt})
          ON CONFLICT (username) DO UPDATE SET
            name = EXCLUDED.name,
            pwd_hash = EXCLUDED.pwd_hash,
            wali_kelas = EXCLUDED.wali_kelas,
            updated_at = EXCLUDED.updated_at
        `;

        const cls = waliKelas.trim();
        const backupRes = await sql`SELECT data FROM classes_backup WHERE class_name = ${cls}`;
        let currentStudents: any[] = [];
        if (backupRes.rows.length > 0) {
          const backupData = backupRes.rows[0].data || {};
          currentStudents = backupData.students || [];
        }
        const updatedBackup = {
          students: currentStudents,
          updatedAt: new Date().toISOString(),
          waliKelas: preservedUsername.toLowerCase()
        };
        await sql`
          INSERT INTO classes_backup (class_name, data, updated_at)
          VALUES (${cls}, ${JSON.stringify(updatedBackup)}, ${updatedBackup.updatedAt})
          ON CONFLICT (class_name) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
        `;
      } else if (firestoreDb) {
        const docRef = firestoreDoc(firestoreDb, "teachers", preservedUsername.toLowerCase());
        const docSnap = await firestoreGetDoc(docRef);
        if (docSnap.exists()) {
          return res.status(400).json({ error: "Username sudah digunakan" });
        }

        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);

        const newTeacher = {
          username: preservedUsername,
          name: (name || username).trim(),
          pwdHash: hash,
          waliKelas: waliKelas.trim()
        };

        await firestoreSetDoc(docRef, newTeacher, { merge: true });

        const cls = waliKelas.trim();
        const backupDocRef = firestoreDoc(firestoreDb, "classes_backup", cls);
        await firestoreSetDoc(backupDocRef, { waliKelas: preservedUsername.toLowerCase() }, { merge: true });

      } else {
        if (!dbLocal.data) {
          dbLocal.data = { students: [], classesBackup: {}, configs: {}, teachers: [] };
        }
        if (!dbLocal.data.teachers) {
          dbLocal.data.teachers = [];
        }

        const exists = dbLocal.data.teachers.some(t => t && t.username && t.username.toLowerCase() === preservedUsername.toLowerCase());
        if (exists) {
          return res.status(400).json({ error: "Username sudah digunakan" });
        }

        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);

        const newTeacher = {
          username: preservedUsername,
          name: (name || username).trim(),
          pwdHash: hash,
          waliKelas: waliKelas.trim()
        };

        dbLocal.data.teachers.push(newTeacher);

        if (!dbLocal.data.classesBackup) dbLocal.data.classesBackup = {};
        const cls = waliKelas.trim();
        if (!dbLocal.data.classesBackup[cls]) {
          dbLocal.data.classesBackup[cls] = { students: [], updatedAt: new Date().toISOString(), waliKelas: preservedUsername.toLowerCase() };
        } else {
          dbLocal.data.classesBackup[cls].waliKelas = preservedUsername.toLowerCase();
        }

        await safeWrite();
      }

      res.status(201).json({ success: true, teacher: { username: preservedUsername, waliKelas: waliKelas.trim() } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Edit a teacher account
  app.put("/api/teachers/:username", async (req, res) => {
    try {
      const { username } = req.params;
      const { password, waliKelas, name } = req.body;
      
      if (isVercelDb) {
        const teacherRes = await sql`SELECT username, name, pwd_hash, wali_kelas FROM teachers WHERE LOWER(username) = LOWER(${username})`;
        if (teacherRes.rows.length === 0) {
          return res.status(404).json({ error: "Guru tidak ditemukan" });
        }

        const teacher = {
          username: teacherRes.rows[0].username,
          name: teacherRes.rows[0].name,
          pwdHash: teacherRes.rows[0].pwd_hash,
          waliKelas: teacherRes.rows[0].wali_kelas
        };

        if (name) teacher.name = name.trim();
        if (waliKelas) {
          teacher.waliKelas = waliKelas.trim();
          
          const backupRes = await sql`SELECT data FROM classes_backup WHERE class_name = ${waliKelas.trim()}`;
          let currentStudents: any[] = [];
          if (backupRes.rows.length > 0) {
            currentStudents = backupRes.rows[0].data?.students || [];
          }
          const updatedBackup = {
            students: currentStudents,
            updatedAt: new Date().toISOString(),
            waliKelas: username.toLowerCase()
          };
          await sql`
            INSERT INTO classes_backup (class_name, data, updated_at)
            VALUES (${waliKelas.trim()}, ${JSON.stringify(updatedBackup)}, ${updatedBackup.updatedAt})
            ON CONFLICT (class_name) DO UPDATE SET
              data = EXCLUDED.data,
              updated_at = EXCLUDED.updated_at
          `;
        }
        if (password && password.trim().length > 0) {
          const salt = bcrypt.genSaltSync(10);
          teacher.pwdHash = bcrypt.hashSync(password, salt);
        }

        const updatedAt = new Date().toISOString();
        await sql`
          INSERT INTO teachers (username, name, pwd_hash, wali_kelas, updated_at)
          VALUES (${teacher.username.toLowerCase()}, ${teacher.name}, ${teacher.pwdHash}, ${teacher.waliKelas}, ${updatedAt})
          ON CONFLICT (username) DO UPDATE SET
            name = EXCLUDED.name,
            pwd_hash = EXCLUDED.pwd_hash,
            wali_kelas = EXCLUDED.wali_kelas,
            updated_at = EXCLUDED.updated_at
        `;

        return res.json({ success: true, teacher: { username: teacher.username, name: teacher.name || teacher.username, waliKelas: teacher.waliKelas } });
      } else if (firestoreDb) {
        const docRef = firestoreDoc(firestoreDb, "teachers", username.toLowerCase());
        const docSnap = await firestoreGetDoc(docRef);
        if (!docSnap.exists()) {
          return res.status(404).json({ error: "Guru tidak ditemukan" });
        }

        const teacher = docSnap.data();
        if (name) teacher.name = name.trim();
        if (waliKelas) {
          teacher.waliKelas = waliKelas.trim();
          const backupDocRef = firestoreDoc(firestoreDb, "classes_backup", waliKelas.trim());
          await firestoreSetDoc(backupDocRef, { waliKelas: username.toLowerCase() }, { merge: true });
        }
        if (password && password.trim().length > 0) {
          const salt = bcrypt.genSaltSync(10);
          teacher.pwdHash = bcrypt.hashSync(password, salt);
        }

        await firestoreSetDoc(docRef, teacher, { merge: true });
        return res.json({ success: true, teacher: { username: teacher.username, name: teacher.name || teacher.username, waliKelas: teacher.waliKelas } });
      } else {
        if (!dbLocal.data || !dbLocal.data.teachers) {
          return res.status(404).json({ error: "Data teachers tidak ditemukan" });
        }

        const idx = dbLocal.data.teachers.findIndex(t => t && t.username && t.username.toLowerCase() === username.toLowerCase());
        if (idx === -1) {
          return res.status(404).json({ error: "Guru tidak ditemukan" });
        }

        const teacher = dbLocal.data.teachers[idx];
        if (name) {
          teacher.name = name.trim();
        }
        if (waliKelas) {
          teacher.waliKelas = waliKelas.trim();
          if (!dbLocal.data.classesBackup) dbLocal.data.classesBackup = {};
          const cls = waliKelas.trim();
          if (!dbLocal.data.classesBackup[cls]) {
            dbLocal.data.classesBackup[cls] = { students: [], updatedAt: new Date().toISOString(), waliKelas: username.toLowerCase() };
          } else {
            dbLocal.data.classesBackup[cls].waliKelas = username.toLowerCase();
          }
        }

        if (password && password.trim().length > 0) {
          const salt = bcrypt.genSaltSync(10);
          teacher.pwdHash = bcrypt.hashSync(password, salt);
        }

        dbLocal.data.teachers[idx] = teacher;
        await safeWrite();
        res.json({ success: true, teacher: { username: teacher.username, name: teacher.name || teacher.username, waliKelas: teacher.waliKelas } });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete a teacher account
  app.delete("/api/teachers/:username", async (req, res) => {
    try {
      const { username } = req.params;
      
      if (isVercelDb) {
        const teacherRes = await sql`SELECT username, name, pwd_hash, wali_kelas FROM teachers WHERE LOWER(username) = LOWER(${username})`;
        if (teacherRes.rows.length === 0) {
          return res.status(404).json({ error: "Guru tidak ditemukan" });
        }

        const teacher = {
          username: teacherRes.rows[0].username,
          name: teacherRes.rows[0].name,
          pwdHash: teacherRes.rows[0].pwd_hash,
          waliKelas: teacherRes.rows[0].wali_kelas
        };

        const cls = teacher.waliKelas;
        if (cls) {
          const backupRes = await sql`SELECT data FROM classes_backup WHERE class_name = ${cls}`;
          if (backupRes.rows.length > 0) {
            const backupData = backupRes.rows[0].data || {};
            if (backupData.waliKelas === username.toLowerCase()) {
              const updatedBackup = {
                ...backupData,
                waliKelas: "-"
              };
              await sql`
                INSERT INTO classes_backup (class_name, data, updated_at)
                VALUES (${cls}, ${JSON.stringify(updatedBackup)}, ${new Date().toISOString()})
                ON CONFLICT (class_name) DO UPDATE SET
                  data = EXCLUDED.data,
                  updated_at = EXCLUDED.updated_at
              `;
            }
          }
        }

        await sql`DELETE FROM teachers WHERE LOWER(username) = LOWER(${username})`;
      } else if (firestoreDb) {
        const docRef = firestoreDoc(firestoreDb, "teachers", username.toLowerCase());
        const docSnap = await firestoreGetDoc(docRef);
        if (!docSnap.exists()) {
          return res.status(404).json({ error: "Guru tidak ditemukan" });
        }

        const teacher = docSnap.data();
        const cls = teacher.waliKelas;
        if (cls) {
          const backupDocRef = firestoreDoc(firestoreDb, "classes_backup", cls);
          const backupSnap = await firestoreGetDoc(backupDocRef);
          if (backupSnap.exists() && backupSnap.data().waliKelas === username.toLowerCase()) {
            await firestoreSetDoc(backupDocRef, { waliKelas: "-" }, { merge: true });
          }
        }

        await firestoreDeleteDoc(docRef);
      } else {
        if (!dbLocal.data || !dbLocal.data.teachers) {
          return res.status(404).json({ error: "Guru tidak ditemukan" });
        }

        const idx = dbLocal.data.teachers.findIndex(t => t && t.username && t.username.toLowerCase() === username.toLowerCase());
        if (idx === -1) {
          return res.status(404).json({ error: "Guru tidak ditemukan" });
        }

        const teacher = dbLocal.data.teachers[idx];
        const cls = teacher.waliKelas;
        if (cls && dbLocal.data.classesBackup && dbLocal.data.classesBackup[cls] && dbLocal.data.classesBackup[cls].waliKelas === username.toLowerCase()) {
          dbLocal.data.classesBackup[cls].waliKelas = "-";
        }

        dbLocal.data.teachers.splice(idx, 1);
        await safeWrite();
      }
      res.json({ success: true, message: `Guru ${username} berhasil dihapus` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Teacher login
  app.post("/api/auth/teacher-login", async (req, res) => {
    try {
      const loginIdentifier = (req.body.name || req.body.username || "").toString().trim();
      if (!loginIdentifier) {
        return res.status(400).json({ error: "Nama guru diperlukan untuk masuk" });
      }

      let teachersList: any[] = [];
      if (isVercelDb) {
        const teachersRes = await sql`SELECT username, name, pwd_hash, wali_kelas FROM teachers`;
        teachersList = teachersRes.rows.map(row => ({
          username: row.username,
          name: row.name,
          pwdHash: row.pwd_hash,
          waliKelas: row.wali_kelas
        }));
      } else if (firestoreDb) {
        const colRef = firestoreCollection(firestoreDb, "teachers");
        const snap = await firestoreGetDocs(colRef);
        teachersList = snap.docs.map(doc => doc.data());
      } else {
        if (!dbLocal.data || !dbLocal.data.teachers) {
          return res.status(400).json({ error: "Data guru belum diinisialisasi di sistem" });
        }
        teachersList = dbLocal.data.teachers;
      }

      const normalizedInput = loginIdentifier.toLowerCase().replace(/\s+/g, '');
      const teacher = teachersList.find(t => {
        if (!t) return false;
        const normName = t.name ? t.name.toLowerCase().replace(/\s+/g, '') : '';
        const normUser = t.username ? t.username.toLowerCase().replace(/\s+/g, '') : '';
        return normName === normalizedInput || normUser === normalizedInput;
      });

      if (!teacher) {
        return res.status(400).json({ error: "Nama guru tidak ditemukan di sistem. Hubungi administrator." });
      }

      res.json({
        success: true,
        teacher: {
          username: teacher.username,
          name: teacher.name || teacher.username,
          waliKelas: teacher.waliKelas
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Server Portal - Monitor Pengisian Kelas Raport Al-Hikmah
  app.get("/status", async (req, res) => {
    const predefinedClasses = [
      '7 MTs Putra', '7 MTs Putri', '7 MTs Putra & Putri',
      '7 SMP Putra', '7 SMP Putri', '7 SMP Putra & Putri',
      '8 MTs Putra', '8 MTs Putri', '8 MTs Putra & Putri',
      '8 SMP Putra', '8 SMP Putri', '8 SMP Putra & Putri',
      '9 MTs Putra', '9 MTs Putri', '9 MTs Putra & Putri',
      '9 SMP Putra', '9 SMP Putri', '9 SMP Putra & Putri',
      '10 SMA Putra', '10 SMA Putri', '10 SMA Putra & Putri',
      '11 SMA Putra', '11 SMA Putri', '11 SMA Putra & Putri',
      '12 SMA Putra', '12 SMA Putri', '12 SMA Putra & Putri',
      'ALUMNI'
    ];
    
    let backups: any = {};
    if (isVercelDb) {
      try {
        const backupRes = await sql`SELECT class_name, data FROM classes_backup`;
        backupRes.rows.forEach(row => {
          backups[row.class_name] = row.data;
        });
      } catch (err) {
        console.warn("Status endpoint error reading Vercel Postgres:", err);
        backups = dbLocal.data?.classesBackup || {};
      }
    } else if (firestoreDb) {
      try {
        const colRef = firestoreCollection(firestoreDb, "classes_backup");
        const snap = await firestoreGetDocs(colRef);
        snap.forEach(doc => {
          backups[doc.id] = doc.data();
        });
      } catch (err) {
        console.warn("Status endpoint error reading Firestore:", err);
        backups = dbLocal.data?.classesBackup || {};
      }
    } else {
      backups = dbLocal.data?.classesBackup || {};
    }
    
    // Calculate Stats
    let totalClassesWithData = 0;
    let totalStudents = 0;
    const classStats = predefinedClasses.map(cls => {
      const backup = backups[cls];
      const hasData = !!(backup && backup.students && backup.students.length > 0);
      const studentCount = hasData ? backup.students.length : 0;
      if (hasData) {
        totalClassesWithData++;
        totalStudents += studentCount;
      }
      return {
        name: cls,
        hasData,
        studentCount,
        waliKelas: backup?.waliKelas || "-",
        updatedAt: backup?.updatedAt ? new Date(backup.updatedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + " WIB" : "-"
      };
    });

    const percentComplete = Math.round((totalClassesWithData / predefinedClasses.length) * 100);

    // Format HTML for a gorgeous responsive dashboard
    const html = `<!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Monitor Pengisian Raport Al-Hikmah</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
      <style>
        body {
          font-family: 'Plus Jakarta Sans', sans-serif;
          background: #f8fafc;
        }
        .font-mono-custom {
          font-family: 'JetBrains Mono', monospace;
        }
      </style>
    </head>
    <body class="min-h-screen text-slate-800 flex flex-col">
      <!-- Top Elegant Banner -->
      <header class="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 text-white shadow-xl py-8 px-6 @container">
        <div class="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center p-2.5 border border-white/20 shadow-inner">
               <span class="text-3xl">📊</span>
            </div>
            <div>
              <p class="text-[10px] font-extrabold tracking-[0.2em] uppercase text-blue-200">SISTEM MONITORING UTAMA</p>
              <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight">KONTROL PENGISIAN KELAS</h1>
              <p class="text-xs text-blue-100/70 mt-1 font-medium">Layanan Server Pemantau & Cadangan Data Raport Al-Hikmah</p>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <a href="/" class="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-xl text-xs font-bold uppercase transition-all shadow-sm flex items-center gap-2">
              <span>⬅️ Kembalikan ke Aplikasi</span>
            </a>
          </div>
        </div>
      </header>

      <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        <!-- Dashboard Stats Row -->
        <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div class="bg-white p-6 rounded-3xl border border-blue-50 shadow-sm flex items-center gap-5">
            <div class="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl font-bold">📂</div>
            <div>
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">KELAS TERISI</p>
              <h3 class="text-2xl font-extrabold text-slate-800">${totalClassesWithData} <span class="text-xs font-medium text-slate-400">dari ${predefinedClasses.length} Kelas</span></h3>
              <div class="w-24 bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                <div class="bg-blue-600 h-full rounded-full" style="width: ${percentComplete}%"></div>
              </div>
            </div>
          </div>
          
          <div class="bg-white p-6 rounded-3xl border border-emerald-50 shadow-sm flex items-center gap-5">
            <div class="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl font-bold">👥</div>
            <div>
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">TOTAL SANTRI DIINPUT</p>
              <h3 class="text-2xl font-extrabold text-slate-800">${totalStudents} <span class="text-xs font-medium text-slate-400">Orang</span></h3>
              <p class="text-xs text-slate-500 mt-1">Data aman tersimpan di Server lokal</p>
            </div>
          </div>

          <div class="bg-white p-6 rounded-3xl border border-indigo-50 shadow-sm flex items-center gap-5 sm:col-span-2 lg:col-span-1">
            <div class="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl font-bold">⚡</div>
            <div>
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">STATUS SERVER</p>
              <h3 class="text-lg font-bold text-emerald-600 flex items-center gap-1.5 leading-none mt-1">
                <span class="w-2.5 h-2.5 bg-emerald-500 rounded-full inline-block animate-ping"></span> ONLINE & AKTIF
              </h3>
              <p class="text-xs text-slate-500 mt-2 font-mono-custom text-[10px]">${new Date().toISOString()}</p>
            </div>
          </div>
        </section>

        <!-- Search Bar Section -->
        <section class="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h4 class="text-base font-extrabold text-slate-800 uppercase tracking-tight">🔍 Cari Santri di Semua Kelas</h4>
              <p class="text-xs text-slate-500">Mencari nama dikoordinatkan di semua tingkat kelas yang sudah diinput</p>
            </div>
            <div class="w-full md:max-w-md relative">
              <input 
                id="search-input" 
                type="text" 
                placeholder="Ketik nama santri/NISN disini..." 
                class="w-full px-5 py-3 outline-none border border-slate-200 focus:border-blue-500 rounded-2xl text-sm font-medium transition-all focus:ring-4 focus:ring-blue-50"
              />
            </div>
          </div>
          <!-- Real-time Search Results Area -->
          <div id="search-results-box" class="hidden bg-blue-50/50 p-4 rounded-2xl border border-blue-100 space-y-2">
            <p class="text-xs font-bold text-blue-700 uppercase tracking-widest">🔍 Hasil Pencarian:</p>
            <div id="search-items" class="grid grid-cols-1 sm:grid-cols-2 gap-3"></div>
          </div>
        </section>

        <!-- Classes Grid -->
        <section class="space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-extrabold text-slate-800 tracking-tight uppercase">Daftar Status Pengisian Kelas</h2>
            <span class="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">Disinkronkan otomatis dari perolehan aplikasi</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            ${classStats.map(cls => {
              const data = backups[cls.name];
              const studentList = data?.students || [];
              const showCheck = cls.hasData;

              return `
              <div class="bg-white rounded-3xl border ${showCheck ? 'border-emerald-100 shadow-md shadow-emerald-50/50' : 'border-slate-200'} p-6 transition-all hover:translate-y-[-2px] flex flex-col justify-between">
                <div>
                  <div class="flex items-center justify-between mb-4">
                    <span class="px-4 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-black tracking-widest">KELAS ${cls.name}</span>
                    ${showCheck 
                      ? `<span class="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider rounded-xl border border-emerald-100 flex items-center gap-1">🟢 TERISI</span>`
                      : `<span class="px-2.5 py-1.5 bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider rounded-xl border border-slate-200/60 flex items-center gap-1">❌ KOSONG</span>`
                    }
                  </div>

                  <!-- Details -->
                  <div class="space-y-2.5 my-5">
                    <div class="flex justify-between items-center text-xs">
                      <span class="text-slate-400 font-bold">Wali Kelas:</span>
                      <span class="text-slate-700 font-bold uppercase truncate max-w-[140px]">${cls.waliKelas}</span>
                    </div>
                    <div class="flex justify-between items-center text-xs">
                      <span class="text-slate-400 font-bold">Jumlah Santri:</span>
                      <span class="text-slate-800 font-black">${cls.studentCount} Santri</span>
                    </div>
                    <div class="flex justify-between items-center text-xs">
                      <span class="text-slate-400 font-bold">Sync Terakhir:</span>
                      <span class="text-slate-500 font-medium font-mono-custom text-[10px]">${cls.updatedAt}</span>
                    </div>
                  </div>

                  <!-- Student List Accordion if they exist -->
                  ${studentList.length > 0 ? `
                  <div class="mt-4 border-t border-slate-100 pt-4">
                    <details class="group cursor-pointer">
                      <summary class="list-none flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-blue-600 transition-colors">
                        <span>📋 Klik Daftar Santri (${studentList.length})</span>
                        <span class="transition-transform group-open:rotate-180 text-lg">▼</span>
                      </summary>
                      <div class="mt-3 max-h-[160px] overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                        ${studentList.map((st: any, index: number) => `
                          <div class="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs hover:bg-blue-50/30 transition-colors">
                            <span class="font-bold text-slate-700 text-[10px] truncate max-w-[120px]">${index+1}. ${st.name}</span>
                            <span class="font-mono-custom text-[9px] text-slate-400">${st.nomorInduk || '-'}</span>
                          </div>
                        `).join('')}
                      </div>
                    </details>
                  </div>
                  ` : ''}
                </div>

                <div class="mt-6 pt-4 border-t border-slate-100 flex gap-2">
                  ${showCheck 
                    ? `<a href="/api/classes-download/${encodeURIComponent(cls.name)}" class="w-full text-center py-2.5 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-wider rounded-xl hover:bg-blue-100 border border-blue-100 transition-all shadow-sm">📥 Unduh Backup</a>`
                    : `<button disabled class="w-full py-2.5 bg-slate-50 text-slate-300 text-[10px] font-black uppercase tracking-wider rounded-xl border border-slate-200/40 cursor-not-allowed">Belum diinput</button>`
                  }
                </div>
              </div>
              `;
            }).join('')}
          </div>
        </section>
      </main>

      <!-- Bottom Status Footer -->
      <footer class="mt-20 border-t border-slate-200 bg-white py-8 px-6 text-center text-slate-400 text-xs font-bold uppercase tracking-widest no-print">
        <p>© 2026 AL-HIKMAH CLOUD MONITORING RAPORT • SECURE SERVER BACKUP</p>
      </footer>

      <!-- JavaScript for searches -->
      <script>
        const allStudentsData = ${JSON.stringify(backups)};
        const searchInput = document.getElementById('search-input');
        const resultsBox = document.getElementById('search-results-box');
        const itemsBox = document.getElementById('search-items');

        searchInput.addEventListener('input', (e) => {
          const query = e.target.value.toLowerCase().trim();
          if (query.length < 2) {
            resultsBox.classList.add('hidden');
            itemsBox.innerHTML = '';
            return;
          }

          const matched = [];
          Object.keys(allStudentsData).forEach(clsName => {
            const classData = allStudentsData[clsName];
            if (classData && classData.students) {
              classData.students.forEach(student => {
                if (
                  (student.name && student.name.toLowerCase().includes(query)) ||
                  (student.nomorInduk && student.nomorInduk.toLowerCase().includes(query))
                ) {
                  matched.push({
                    name: student.name,
                    nomorInduk: student.nomorInduk,
                    className: clsName
                  });
                }
              });
            }
          });

          if (matched.length > 0) {
            resultsBox.classList.remove('hidden');
            itemsBox.innerHTML = matched.map(m => \`
              <div class="bg-white p-3.5 rounded-xl border border-blue-100 shadow-sm flex flex-col justify-center">
                <span class="text-xs font-black text-slate-800 uppercase">\${m.name}</span>
                <span class="text-[10px] text-slate-400 font-mono-custom mt-0.5">NI: \${m.nomorInduk || '-'}</span>
                <span class="mt-2 inline-block self-start text-[8px] font-extrabold tracking-widest text-blue-600 bg-blue-50 px-2 py-1 rounded-md uppercase border border-blue-100">💻 KELAS \${m.className}</span>
              </div>
            \`).join('');
          } else {
            resultsBox.classList.remove('hidden');
            itemsBox.innerHTML = \`<div class="col-span-full text-center py-4 text-xs font-bold text-slate-400">Tidak ada santri yang cocok</div>\`;
          }
        });
      </script>
    </body>
    </html>`;
    
    res.send(html);
  });

  // Vite setup
  if (process.env.NODE_ENV !== "production") {
    createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    }).then(vite => {
      app.use(vite.middlewares);
    }).catch(err => {
      console.error("[Server] Gagal menginisialisasi Vite middleware:", err);
    });
  } else {
    if (!process.env.VERCEL) {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

import express, { Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

dotenv.config();

const PORT = 3000;

interface Data {
  students: any[];
  classesBackup?: Record<string, { students: any[]; updatedAt: string; waliKelas?: string }>;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cors());

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // Explicit lowdb setup
  const adapter = new JSONFile<Data>(path.join(process.cwd(), 'db.json'));
  const defaultData: Data = { students: [], classesBackup: {} };
  const db = new Low<Data>(adapter, defaultData);
  
  await db.read();
  if (!db.data) {
    db.data = defaultData;
    await db.write();
  } else if (!db.data.classesBackup) {
    db.data.classesBackup = {};
    await db.write();
  }

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Public Student Routes
  app.get("/api/students", async (req, res) => {
    try {
      if (!db.data) throw new Error("Database not initialized");
      const { class: className } = req.query;
      
      let students = db.data.students;
      if (className) {
        students = students.filter(s => s.class === className);
      }
      
      res.json(students);
    } catch (error: any) {
      console.error("Get Students Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/students", async (req, res) => {
    try {
      if (!db.data) throw new Error("Database not initialized");
      const student = req.body;
      const newStudent = {
        ...student,
        id: student.id || Date.now().toString()
      };
      db.data.students.push(newStudent);
      await db.write();
      res.status(201).json(newStudent);
    } catch (error: any) {
      console.error("Create Student Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/students/:id", async (req, res) => {
    const { id } = req.params;
    const studentUpdate = req.body;
    
    try {
      if (!db.data) throw new Error("Database not initialized");
      const index = db.data.students.findIndex(s => s.id === id);
      
      if (index === -1) {
        return res.status(404).json({ message: "Student not found" });
      }

      db.data.students[index] = {
        ...db.data.students[index],
        ...studentUpdate,
        id // ensure ID doesn't change
      };

      await db.write();
      res.json(db.data.students[index]);
    } catch (error: any) {
      console.error("Update Student Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/students/:id", async (req, res) => {
    const { id } = req.params;
    try {
      if (!db.data) throw new Error("Database not initialized");
      const index = db.data.students.findIndex(s => s.id === id);
      
      if (index === -1) {
        return res.status(404).json({ message: "Student not found" });
      }

      db.data.students.splice(index, 1);
      await db.write();
      res.status(204).send();
    } catch (error: any) {
      console.error("Delete Student Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Background Backup Endpoint (Stores client state to db.json local backup)
  app.post("/api/backup", async (req, res) => {
    try {
      const { className, students, waliKelas } = req.body;
      if (!className) {
        return res.status(400).json({ error: "Missing className" });
      }

      if (!db.data) {
        db.data = { students: [], classesBackup: {} };
      }
      if (!db.data.classesBackup) {
        db.data.classesBackup = {};
      }

      // Merge current students array to existing classesBackup
      db.data.classesBackup[className] = {
        students: students || [],
        updatedAt: new Date().toISOString(),
        waliKelas: waliKelas || db.data.classesBackup[className]?.waliKelas || ""
      };

      await db.write();
      res.json({ success: true, className, count: (students || []).length });
    } catch (err: any) {
      console.error("Backup error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Download Class JSON Backup Route
  app.get("/api/classes-download/:className", (req, res) => {
    try {
      const { className } = req.params;
      if (!db.data || !db.data.classesBackup || !db.data.classesBackup[className]) {
        return res.status(404).send("Backup data kelas tidak ditemukan");
      }
      const data = db.data.classesBackup[className];
      res.setHeader('Content-disposition', `attachment; filename=Raport_Backup_Kelas_${className.replace(/\s+/g, '_')}.json`);
      res.setHeader('Content-type', 'application/json');
      res.send(JSON.stringify(data, null, 2));
    } catch (err: any) {
      res.status(500).send("Gagal mengunduh backup: " + err.message);
    }
  });

  // Status Summary API
  app.get("/api/status-summary", (req, res) => {
    try {
      const predefinedClasses = ['7 MTs', '7 SMP', '8 MTs', '8 SMP', '9 MTs', '9 SMP', '10 SMA', '11 SMA', '12 SMA', 'ALUMNI'];
      const backups = db.data?.classesBackup || {};
      
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

  // Server Portal - Monitor Pengisian Kelas Raport Al-Hikmah
  app.get("/status", async (req, res) => {
    const predefinedClasses = ['7 MTs', '7 SMP', '8 MTs', '8 SMP', '9 MTs', '9 SMP', '10 SMA', '11 SMA', '12 SMA', 'ALUMNI'];
    const backups = db.data?.classesBackup || {};
    
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

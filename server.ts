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
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(cors());

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // Explicit lowdb setup
  const adapter = new JSONFile<Data>(path.join(process.cwd(), 'db.json'));
  const defaultData: Data = { students: [] };
  const db = new Low<Data>(adapter, defaultData);
  
  await db.read();
  if (!db.data) {
    db.data = defaultData;
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

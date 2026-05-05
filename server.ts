import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import * as bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";
import dotenv from "dotenv";
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret";
const PORT = 3000;

interface User {
  id: number;
  username: string;
  password: string;
  name: string;
}

interface Data {
  users: User[];
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
  const defaultData: Data = { users: [], students: [] };
  const db = new Low<Data>(adapter, defaultData);
  
  // Read data from JSON file, this will create db.json if it doesn't exist
  await db.read();
  if (!db.data) {
    db.data = defaultData;
    await db.write();
  }

  // Middleware to verify JWT
  const authenticateToken = (req: any, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({ message: "Unauthorized" });

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) {
        console.error("JWT Verify Error:", err);
        return res.status(403).json({ message: "Forbidden" });
      }
      req.user = user;
      next();
    });
  };

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Auth Routes
  app.post("/api/auth/register", async (req, res) => {
    const { username, password, name } = req.body;
    console.log(`[AUTH] Registration request for: ${username}`);
    try {
      if (!db.data) throw new Error("Database not initialized");
      
      const userExists = db.data.users.find(u => u.username === username);
      if (userExists) {
        console.warn(`[AUTH] Registration failed: Username ${username} already exists`);
        return res.status(400).json({ message: "Username already exists" });
      }

      console.log(`[AUTH] Hashing password for: ${username}`);
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = {
        id: Date.now(),
        username,
        password: hashedPassword,
        name
      };

      db.data.users.push(newUser);
      await db.write();
      
      console.log(`[AUTH] Registration successful: ${username}`);
      res.status(201).json({ message: "User registered successfully" });
    } catch (error: any) {
      console.error("[AUTH] Registration Error:", error);
      res.status(500).json({ message: "Internal server error: " + error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    console.log(`[AUTH] Login attempt for: ${username}`);
    try {
      if (!db.data) throw new Error("Database not initialized");

      const user = db.data.users.find(u => u.username === username);
      if (user) {
        console.log(`[AUTH] User found, comparing passwords for: ${username}`);
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
          const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
          console.log(`[AUTH] Login successful: ${username}`);
          res.json({ token, user: { id: user.id, username: user.username, name: user.name } });
          return;
        }
      }
      
      console.warn(`[AUTH] Login failed: Invalid credentials for ${username}`);
      res.status(401).json({ message: "Invalid credentials" });
    } catch (error: any) {
      console.error("[AUTH] Login Error:", error);
      res.status(500).json({ message: "Internal server error: " + error.message });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
    try {
      if (!db.data) throw new Error("Database not initialized");
      const user = db.data.users.find(u => u.id === req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      console.error("Auth Me Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Student Routes
  app.get("/api/students", authenticateToken, async (req: any, res) => {
    try {
      if (!db.data) throw new Error("Database not initialized");
      const students = db.data.students.filter(s => s.user_id === req.user.id);
      res.json(students);
    } catch (error: any) {
      console.error("Get Students Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/students", authenticateToken, async (req: any, res) => {
    try {
      if (!db.data) throw new Error("Database not initialized");
      const student = req.body;
      const newStudent = {
        ...student,
        user_id: req.user.id
      };
      db.data.students.push(newStudent);
      await db.write();
      res.status(201).json(newStudent);
    } catch (error: any) {
      console.error("Create Student Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/students/:id", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const studentUpdate = req.body;
    
    try {
      if (!db.data) throw new Error("Database not initialized");
      const index = db.data.students.findIndex(s => s.id === id && s.user_id === req.user.id);
      
      if (index === -1) {
        return res.status(404).json({ message: "Student not found or unauthorized" });
      }

      db.data.students[index] = {
        ...db.data.students[index],
        ...studentUpdate,
        id, // ensure ID doesn't change
        user_id: req.user.id // ensure user_id doesn't change
      };

      await db.write();
      res.json(db.data.students[index]);
    } catch (error: any) {
      console.error("Update Student Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/students/:id", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      if (!db.data) throw new Error("Database not initialized");
      const index = db.data.students.findIndex(s => s.id === id && s.user_id === req.user.id);
      
      if (index === -1) {
        return res.status(404).json({ message: "Student not found or unauthorized" });
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

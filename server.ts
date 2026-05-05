import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";
import dotenv from "dotenv";
import { JSONFilePreset } from 'lowdb/node';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret";
const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(cors());

  // Database setup with lowdb (pure JS, no GLIBC issues)
  const defaultData = { users: [], students: [] };
  const db = await JSONFilePreset('db.json', defaultData);

  // Middleware to verify JWT
  const authenticateToken = (req: any, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({ message: "Unauthorized" });

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.status(403).json({ message: "Forbidden" });
      req.user = user;
      next();
    });
  };

  // Auth Routes
  app.post("/api/auth/register", async (req, res) => {
    const { username, password, name } = req.body;
    try {
      const userExists = db.data.users.find(u => u.username === username);
      if (userExists) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = {
        id: Date.now(),
        username,
        password: hashedPassword,
        name
      };

      db.data.users.push(newUser);
      await db.write();
      
      res.status(201).json({ message: "User registered successfully" });
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    const user = db.data.users.find(u => u.username === username);

    if (user && (await bcrypt.compare(password, user.password))) {
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
      res.json({ token, user: { id: user.id, username: user.username, name: user.name } });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
    const user = db.data.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password, ...safeUser } = user;
    res.json(safeUser);
  });

  // Student Routes
  app.get("/api/students", authenticateToken, async (req: any, res) => {
    const students = db.data.students.filter(s => s.user_id === req.user.id);
    res.json(students);
  });

  app.post("/api/students", authenticateToken, async (req: any, res) => {
    const student = req.body;
    const newStudent = {
      ...student,
      user_id: req.user.id
    };
    db.data.students.push(newStudent);
    await db.write();
    res.status(201).json(newStudent);
  });

  app.put("/api/students/:id", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const studentUpdate = req.body;
    
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
  });

  app.delete("/api/students/:id", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const index = db.data.students.findIndex(s => s.id === id && s.user_id === req.user.id);
    
    if (index === -1) {
      return res.status(404).json({ message: "Student not found or unauthorized" });
    }

    db.data.students.splice(index, 1);
    await db.write();
    res.status(204).send();
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

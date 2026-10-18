import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { prisma } from "./db.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok", db: "ok" });
});

app.listen(PORT, () => {
  console.log(`API prête sur http://localhost:${PORT}`);
});

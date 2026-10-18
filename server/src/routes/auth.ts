import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db.js";
import { clearAuthCookie, setAuthCookie } from "../lib/cookies.js";
import { HttpError } from "../lib/httpError.js";
import { signToken } from "../lib/jwt.js";
import { getUserId, requireAuth } from "../middleware/auth.js";

// Nettoie l'email (espaces, majuscules) avant d'en vérifier le format
const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Email invalide"));

const registerSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(50),
  email: emailSchema,
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .max(72, "Le mot de passe est trop long"),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Le mot de passe est requis"),
});

// Champs renvoyés au client (jamais le hash du mot de passe)
const publicUser = { id: true, email: true, name: true, theme: true, createdAt: true } as const;

// Limite les tentatives de connexion/inscription pour freiner le brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: "Trop de tentatives, réessaie dans quelques minutes" },
});

export const authRouter = Router();

authRouter.post("/register", authLimiter, async (req, res) => {
  const { name, email, password } = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, "Un compte existe déjà avec cet email");

  const user = await prisma.user.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 10) },
    select: publicUser,
  });

  setAuthCookie(res, signToken(user.id));
  res.status(201).json({ user });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...publicUser, passwordHash: true },
  });
  // Même message dans les deux cas pour ne pas révéler si l'email existe
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "Email ou mot de passe incorrect");
  }

  setAuthCookie(res, signToken(user.id));
  const { passwordHash: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: getUserId(req) }, select: publicUser });
  if (!user) {
    // Le compte a été supprimé alors que le cookie était encore valide
    clearAuthCookie(res);
    throw new HttpError(401, "Non authentifié");
  }
  res.json({ user });
});

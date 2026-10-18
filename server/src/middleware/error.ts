import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/httpError.js";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Route introuvable" });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Données invalides",
      details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Contrainte d'unicité Prisma (ex. deux étiquettes avec le même nom)
  if (err?.code === "P2002") {
    res.status(409).json({ error: "Cet élément existe déjà" });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: "Fichier trop volumineux" });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "JSON invalide" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Erreur interne du serveur" });
};

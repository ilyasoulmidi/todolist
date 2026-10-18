// Point d'entrée Vercel : toute l'API Express tourne dans une seule fonction serverless.
// Le code est compilé au build (server/dist) ; le front est servi directement par Vercel.
import { createApp } from "../server/dist/app.js";

export default createApp();

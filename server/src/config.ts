function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresInDays: 7,
  isProduction: process.env.NODE_ENV === "production",
};

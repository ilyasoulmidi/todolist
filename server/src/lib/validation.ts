import { z } from "zod";

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale attendue (ex. #22c55e)");

export const idParam = z.object({ id: z.string().min(1) });

// Date ISO (ou null pour effacer la valeur)
export const nullableDate = z.coerce.date().nullable();

// "a,b,c" ou ?x=a&x=b → ["a", "b", "c"]
export function csvList<T extends z.ZodType>(item: T) {
  return z.preprocess((v) => {
    if (v === undefined || v === "") return undefined;
    const values = Array.isArray(v) ? v : [v];
    return values.flatMap((s) => String(s).split(",")).map((s) => s.trim()).filter(Boolean);
  }, z.array(item).optional());
}

export const booleanQuery = z.enum(["true", "false"]).transform((v) => v === "true");

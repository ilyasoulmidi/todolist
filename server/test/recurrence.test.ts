import { describe, expect, it } from "vitest";
import { isValidRule, nextOccurrence } from "../src/lib/recurrence.js";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const next = (rule: string, from: string) => nextOccurrence(rule, d(from))?.toISOString().slice(0, 10);

describe("parseRule / isValidRule", () => {
  it.each([
    "FREQ=DAILY",
    "FREQ=DAILY;INTERVAL=3",
    "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    "freq=weekly;byday=sa",
    "FREQ=MONTHLY;BYMONTHDAY=31",
    "FREQ=YEARLY",
  ])("accepte %s", (rule) => expect(isValidRule(rule)).toBe(true));

  it.each([
    "",
    "FREQ=HOURLY",
    "FREQ=DAILY;INTERVAL=0",
    "FREQ=DAILY;INTERVAL=abc",
    "FREQ=WEEKLY;BYDAY=XX",
    "FREQ=DAILY;BYDAY=MO",
    "FREQ=MONTHLY;BYMONTHDAY=32",
    "FREQ=DAILY;COUNT=3",
    "n'importe quoi",
  ])("refuse %s", (rule) => expect(isValidRule(rule)).toBe(false));
});

describe("nextOccurrence", () => {
  it("quotidien et intervalle", () => {
    expect(next("FREQ=DAILY", "2026-10-18")).toBe("2026-10-19");
    expect(next("FREQ=DAILY;INTERVAL=3", "2026-10-30")).toBe("2026-11-02");
  });

  it("hebdomadaire sans jour : même jour la semaine suivante", () => {
    expect(next("FREQ=WEEKLY", "2026-10-18")).toBe("2026-10-25");
    expect(next("FREQ=WEEKLY;INTERVAL=2", "2026-10-18")).toBe("2026-11-01");
  });

  it("hebdomadaire avec jours : prochain jour choisi", () => {
    // 2026-10-19 est un lundi
    expect(next("FREQ=WEEKLY;BYDAY=MO,WE,FR", "2026-10-19")).toBe("2026-10-21");
    expect(next("FREQ=WEEKLY;BYDAY=MO,WE,FR", "2026-10-23")).toBe("2026-10-26");
    // Jours ouvrés depuis un vendredi → lundi
    expect(next("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "2026-10-23")).toBe("2026-10-26");
    // Dimanche (fin de semaine à la française) → lundi suivant
    expect(next("FREQ=WEEKLY;BYDAY=MO,SU", "2026-10-25")).toBe("2026-10-26");
  });

  it("hebdomadaire avec jours et intervalle : saute des semaines", () => {
    expect(next("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH", "2026-10-22")).toBe("2026-11-02");
  });

  it("mensuel : même jour, avec ajustement en fin de mois", () => {
    expect(next("FREQ=MONTHLY", "2026-10-18")).toBe("2026-11-18");
    expect(next("FREQ=MONTHLY", "2027-01-31")).toBe("2027-02-28");
    expect(next("FREQ=MONTHLY;INTERVAL=3", "2026-11-15")).toBe("2027-02-15");
  });

  it("mensuel à jour fixe", () => {
    expect(next("FREQ=MONTHLY;BYMONTHDAY=1", "2026-10-18")).toBe("2026-11-01");
    expect(next("FREQ=MONTHLY;BYMONTHDAY=25", "2026-10-18")).toBe("2026-10-25");
    expect(next("FREQ=MONTHLY;BYMONTHDAY=31", "2027-01-31")).toBe("2027-02-28");
  });

  it("annuel, y compris le 29 février", () => {
    expect(next("FREQ=YEARLY", "2026-10-18")).toBe("2027-10-18");
    expect(next("FREQ=YEARLY", "2028-02-29")).toBe("2029-02-28");
  });

  it("renvoie null pour une règle invalide", () => {
    expect(nextOccurrence("FREQ=NEVER", d("2026-10-18"))).toBeNull();
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { decidir, siguienteOcurrencia, MAX_INTENTOS } from "../lib/planificador";

const MIN = 60_000;
const ahora = Date.parse("2026-01-10T12:00:00Z");
const ok = { ok: true, en: "x" };
const falla = (reintentable?: boolean) => ({ ok: false, error: "boom", reintentable, en: "x" });

test("decidir: todas las páginas ok → completado", () => {
  const d = decidir(["1", "2"], { "1": ok, "2": ok }, 0, ahora);
  assert.equal(d.estado, "completado");
  assert.equal(d.ultimoError, null);
});

test("decidir: fallo reintentable → pendiente con backoff 5/20/60 min", () => {
  const esperas = [5, 20, 60];
  for (let previos = 0; previos < MAX_INTENTOS - 1; previos++) {
    const d = decidir(["1"], { "1": falla(true) }, previos, ahora);
    assert.equal(d.estado, "pendiente");
    assert.equal(d.intentos, previos + 1);
    assert.equal(Date.parse(d.proximaFecha!), ahora + esperas[previos] * MIN);
  }
});

test("decidir: al llegar al máximo de intentos → error", () => {
  const d = decidir(["1"], { "1": falla(true) }, MAX_INTENTOS - 1, ahora);
  assert.equal(d.estado, "error");
  assert.equal(d.proximaFecha, undefined);
});

test("decidir: error fatal (token vencido) no se reintenta", () => {
  const d = decidir(["1"], { "1": falla(false) }, 0, ahora);
  assert.equal(d.estado, "error");
});

test("decidir: una página ok y otra con error fatal → error, y menciona solo la fallida", () => {
  const d = decidir(["1", "2"], { "1": ok, "2": falla(false) }, 0, ahora);
  assert.equal(d.estado, "error");
  assert.match(d.ultimoError!, /^2:/);
});

test("decidir: página sin resultado cuenta como fallida", () => {
  const d = decidir(["1", "2"], { "1": ok }, 0, ahora);
  assert.equal(d.estado, "pendiente");
});

test("siguienteOcurrencia: ninguna → null", () => {
  assert.equal(siguienteOcurrencia("2026-01-10T09:00:00Z", "ninguna", ahora), null);
});

test("siguienteOcurrencia: diaria y semanal", () => {
  assert.equal(siguienteOcurrencia("2026-01-10T09:00:00Z", "diaria", ahora), "2026-01-11T09:00:00.000Z");
  assert.equal(siguienteOcurrencia("2026-01-10T09:00:00Z", "semanal", ahora), "2026-01-17T09:00:00.000Z");
});

test("siguienteOcurrencia: si el cron estuvo caído salta a la primera fecha futura (sin ráfaga)", () => {
  assert.equal(siguienteOcurrencia("2026-01-01T09:00:00Z", "diaria", ahora), "2026-01-11T09:00:00.000Z");
});

test("serie sin deriva: partir de la fecha original, no de la reintentada", () => {
  const original = "2026-01-10T09:00:00Z";
  const reintentada = "2026-01-10T10:05:00Z"; // se publicó tras un reintento con backoff
  const hoy = Date.parse("2026-01-10T10:06:00Z");
  assert.equal(siguienteOcurrencia(original, "diaria", hoy), "2026-01-11T09:00:00.000Z");
  assert.equal(siguienteOcurrencia(reintentada, "diaria", hoy), "2026-01-11T10:05:00.000Z"); // el bug anterior
});

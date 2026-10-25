import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearHoras, repartirFechas, aplicarPlantilla } from "../lib/lote";

test("parsearHoras: normaliza, ordena y descarta basura", () => {
  assert.deepEqual(parsearHoras("18:30, 9:00; 25:00 xx 09:00"), ["09:00", "18:30"]);
  assert.deepEqual(parsearHoras(""), []);
});

test("repartirFechas: n fechas futuras, ordenadas, solo en días permitidos", () => {
  const ahora = new Date(2026, 0, 5, 8, 0, 0).getTime(); // lunes
  const fechas = repartirFechas(
    6,
    { inicio: new Date(2026, 0, 5), horas: ["09:00", "18:00"], dias: [1, 3, 5], variacionMin: 0 },
    ahora
  );
  assert.equal(fechas.length, 6);
  for (let i = 1; i < fechas.length; i++) assert.ok(fechas[i] > fechas[i - 1]);
  for (const f of fechas) {
    assert.ok([1, 3, 5].includes(f.getDay()));
    assert.ok(f.getTime() >= ahora + 2 * 60_000);
  }
});

test("repartirFechas: sin horas o sin días → vacío", () => {
  assert.deepEqual(repartirFechas(3, { inicio: new Date(), horas: [], dias: [1], variacionMin: 0 }), []);
  assert.deepEqual(repartirFechas(3, { inicio: new Date(), horas: ["09:00"], dias: [], variacionMin: 0 }), []);
});

test("repartirFechas: la variación se limita a ±30 min", () => {
  const ahora = new Date(2026, 0, 5, 0, 0, 0).getTime();
  const fechas = repartirFechas(
    10,
    { inicio: new Date(2026, 0, 5), horas: ["12:00"], dias: [0, 1, 2, 3, 4, 5, 6], variacionMin: 999, semilla: 3 },
    ahora
  );
  for (const f of fechas) {
    const minutos = f.getHours() * 60 + f.getMinutes();
    assert.ok(Math.abs(minutos - 720) <= 30, `desvío demasiado grande: ${minutos}`);
  }
});

test("aplicarPlantilla: variables y '$' en la descripción no se interpretan", () => {
  const t = aplicarPlantilla("#{n} {nombre} — {descripcion} por {autor}", 3, "mi_video-final.mp4", "cuesta $& y $1", "@ana");
  assert.equal(t, "#3 mi video final — cuesta $& y $1 por @ana");
});

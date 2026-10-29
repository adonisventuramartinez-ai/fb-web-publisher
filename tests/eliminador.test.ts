import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FILTRO_VACIO, type ItemFb, aCsv, confirmacionCorrecta, confirmacionEsperada, esFatal, esLimiteDeRitmo, filtrar, idValido, tipoValido, trocear,
} from "../lib/eliminador";

const item = (id: string, fecha: string, texto = ""): ItemFb => ({ id, fecha, texto, miniatura: null, enlace: null });
const HOY = Date.parse("2026-10-28T12:00:00Z");

test("idValido acepta IDs de Graph y rechaza intentos de inyección", () => {
  assert.equal(idValido("1234567890"), true);
  assert.equal(idValido("123456789_987654321"), true);
  for (const mal of ["", "abc", "123", "12345/comments", "12345?access_token=x", "../me", "12345 6", 12345, null, undefined])
    assert.equal(idValido(mal as any), false, String(mal));
});

test("tipoValido", () => {
  assert.equal(tipoValido("reels"), true);
  assert.equal(tipoValido("fotos"), true);
  assert.equal(tipoValido("me/accounts"), false);
});

test("filtrar por texto, rango de fechas y antigüedad", () => {
  const lista = [
    item("10000001", "2026-10-20T10:00:00Z", "Receta de PASTA"),
    item("10000002", "2026-08-01T10:00:00Z", "Viaje a la playa"),
    item("10000003", "2025-01-15T10:00:00Z", "Pasta vieja"),
  ];
  assert.equal(filtrar(lista, FILTRO_VACIO, HOY).length, 3);
  assert.deepEqual(filtrar(lista, { ...FILTRO_VACIO, texto: "pasta" }, HOY).map((i) => i.id), ["10000001", "10000003"]);
  assert.deepEqual(filtrar(lista, { ...FILTRO_VACIO, masDeDias: 365 }, HOY).map((i) => i.id), ["10000003"]);
  assert.deepEqual(filtrar(lista, { ...FILTRO_VACIO, masDeDias: 30 }, HOY).map((i) => i.id), ["10000002", "10000003"]);
  assert.deepEqual(filtrar(lista, { ...FILTRO_VACIO, desde: "2026-08-01", hasta: "2026-08-01" }, HOY).map((i) => i.id), ["10000002"]);
});

test("trocear reparte en lotes sin perder ni repetir", () => {
  const r = trocear([1, 2, 3, 4, 5, 6, 7], 3);
  assert.deepEqual(r, [[1, 2, 3], [4, 5, 6], [7]]);
  assert.deepEqual(trocear([], 3), []);
});

test("confirmación exige escribir el número exacto", () => {
  assert.equal(confirmacionEsperada(42), "ELIMINAR 42");
  assert.equal(confirmacionCorrecta("eliminar 42", 42), true);
  assert.equal(confirmacionCorrecta("ELIMINAR 41", 42), false);
  assert.equal(confirmacionCorrecta("si", 42), false);
  assert.equal(confirmacionCorrecta("ELIMINAR 0", 0), false);
});

test("clasificación de errores de Graph", () => {
  assert.equal(esLimiteDeRitmo(4), true);
  assert.equal(esLimiteDeRitmo(32), true);
  assert.equal(esLimiteDeRitmo(190), false);
  assert.equal(esFatal(190), true);
  assert.equal(esFatal(200), true);
  assert.equal(esFatal(4), false);
  assert.equal(esFatal(undefined), false);
});

test("CSV de respaldo escapa comillas y saltos de línea", () => {
  const csv = aCsv([{ ...item("10000001", "2026-01-01T00:00:00Z", 'Dijo "hola"\ny adiós'), enlace: "https://fb.com/x" }]);
  const [cab, fila] = csv.split("\n");
  assert.equal(cab, "id,fecha,texto,enlace,duracion_seg");
  assert.equal(fila, '"10000001","2026-01-01T00:00:00Z","Dijo ""hola"" y adiós","https://fb.com/x",""');
});

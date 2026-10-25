import { test } from "node:test";
import assert from "node:assert/strict";

import { firmarSesion, verificarSesion } from "../lib/session";

// El secreto se lee al firmar/verificar (no al importar), así que basta con fijarlo aquí
process.env.SESSION_SECRET = "a".repeat(40);

test("sesión firmada válida", async () => {
  const t = await firmarSesion({ sub: "123", nombre: "Ana", rol: "usuario" }, 60);
  const s = await verificarSesion(t);
  assert.equal(s?.sub, "123");
  assert.equal(s?.rol, "usuario");
});

test("sesión caducada se rechaza", async () => {
  const t = await firmarSesion({ sub: "123", nombre: "Ana", rol: "usuario" }, -10);
  assert.equal(await verificarSesion(t), null);
});

test("token manipulado se rechaza (no se puede subir a admin)", async () => {
  const t = await firmarSesion({ sub: "123", nombre: "Ana", rol: "usuario" }, 60);
  const [payload, firma] = t.split(".");
  const falso = Buffer.from(JSON.stringify({ sub: "123", nombre: "Ana", rol: "admin", exp: 9999999999 })).toString("base64url");
  assert.equal(await verificarSesion(`${falso}.${firma}`), null);
  assert.equal(await verificarSesion(`${payload}.AAAA`), null);
  assert.equal(await verificarSesion("basura"), null);
  assert.equal(await verificarSesion(undefined), null);
});

test("firmado con otro secreto no vale", async () => {
  const t = await firmarSesion({ sub: "1", nombre: "x", rol: "usuario" }, 60);
  process.env.SESSION_SECRET = "b".repeat(40);
  assert.equal(await verificarSesion(t), null);
  process.env.SESSION_SECRET = "a".repeat(40);
});

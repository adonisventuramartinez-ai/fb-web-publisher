import { test } from "node:test";
import assert from "node:assert/strict";

import { encriptar, desencriptar } from "../lib/crypto";

process.env.ENCRYPTION_KEY = "0123456789abcdef".repeat(4);

test("encriptar/desencriptar ida y vuelta (con unicode)", () => {
  const original = "EAAG…token-de-página ñ 🔑";
  const c = encriptar(original);
  assert.notEqual(c, original);
  assert.equal(desencriptar(c), original);
});

test("cada cifrado usa un IV distinto", () => {
  assert.notEqual(encriptar("igual"), encriptar("igual"));
});

test("un cifrado alterado falla (GCM autentica)", () => {
  const [iv, tag, data] = encriptar("secreto").split(":");
  const alterado = [iv, tag, Buffer.from("otro-dato").toString("base64")].join(":");
  assert.throws(() => desencriptar(alterado));
  assert.throws(() => desencriptar(`${iv}:${tag}`));
});

test("clave inválida da un error claro", async () => {
  const previa = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = "corta";
  assert.throws(() => encriptar("x"), /ENCRYPTION_KEY/);
  process.env.ENCRYPTION_KEY = previa;
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { limpiarEnv, urlSupabase, repoGithub, tipoLlaveSupabase, esLlaveSecreta } from "../lib/env";

test("limpiarEnv quita espacios, saltos de línea y comillas", () => {
  assert.equal(limpiarEnv("  abc\n"), "abc");
  assert.equal(limpiarEnv('"abc"'), "abc");
  assert.equal(limpiarEnv("'abc' "), "abc");
  assert.equal(limpiarEnv(undefined), "");
});

test("urlSupabase normaliza la URL del proyecto", () => {
  for (const v of ["https://abc.supabase.co", "https://abc.supabase.co/", "https://abc.supabase.co/rest/v1", "https://abc.supabase.co/rest/v1/", ' "https://abc.supabase.co/" \n']) {
    assert.equal(urlSupabase(v), "https://abc.supabase.co", v);
  }
});

test("repoGithub acepta URL completa, .git y espacios", () => {
  for (const v of ["user/repo", "https://github.com/user/repo", "https://github.com/user/repo.git", " user/repo/ \n", "github.com/user/repo"]) {
    assert.equal(repoGithub(v), "user/repo", v);
  }
});

test("tipoLlaveSupabase distingue la llave secreta de la pública", () => {
  const jwt = (role: string) => `x.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.y`;
  assert.equal(tipoLlaveSupabase("sb_secret_abc"), "secret");
  assert.equal(tipoLlaveSupabase("sb_publishable_abc"), "publishable");
  assert.equal(tipoLlaveSupabase(jwt("service_role")), "service_role");
  assert.equal(tipoLlaveSupabase(jwt("anon")), "anon");
  assert.equal(tipoLlaveSupabase("algo-raro"), "desconocida");
  assert.equal(esLlaveSecreta("secret"), true);
  assert.equal(esLlaveSecreta("service_role"), true);
  assert.equal(esLlaveSecreta("anon"), false);
  assert.equal(esLlaveSecreta("publishable"), false);
});

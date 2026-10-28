import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarEntrada } from "../lib/tiktok";

test("video con URL completa", () => {
  assert.deepEqual(clasificarEntrada("https://www.tiktok.com/@ana/video/7234567890123456789?is_from_webapp=1"), {
    tipo: "video",
    plataforma: "tiktok",
    url: "https://www.tiktok.com/@ana/video/7234567890123456789",
  });
});

test("enlaces cortos", () => {
  assert.equal(clasificarEntrada("https://vm.tiktok.com/ZMabc123/")?.tipo, "video");
  assert.equal(clasificarEntrada("vt.tiktok.com/ZSabc/")?.tipo, "video");
  assert.equal(clasificarEntrada("https://www.tiktok.com/t/ZTabc/")?.tipo, "video");
});

test("perfiles", () => {
  assert.deepEqual(clasificarEntrada("@ana_99"), { tipo: "perfil", plataforma: "tiktok", url: "https://www.tiktok.com/@ana_99" });
  assert.equal(clasificarEntrada("https://www.tiktok.com/@ana")?.tipo, "perfil");
});

test("Instagram: reels, posts y enlaces compartidos", () => {
  const v = (u: string) => ({ tipo: "video", plataforma: "instagram", url: u });
  assert.deepEqual(clasificarEntrada("https://www.instagram.com/reel/C8abcDEF123/?igsh=xyz"), v("https://www.instagram.com/reel/C8abcDEF123/"));
  assert.deepEqual(clasificarEntrada("instagram.com/reels/C8abcDEF123"), v("https://www.instagram.com/reel/C8abcDEF123/"));
  assert.deepEqual(clasificarEntrada("https://www.instagram.com/ana.g/reel/C8abcDEF123/"), v("https://www.instagram.com/reel/C8abcDEF123/"));
  assert.deepEqual(clasificarEntrada("https://www.instagram.com/p/C8abcDEF123/"), v("https://www.instagram.com/p/C8abcDEF123/"));
  assert.deepEqual(clasificarEntrada("https://www.instagram.com/share/reel/BAbcDeF123/"), v("https://www.instagram.com/share/reel/BAbcDeF123/"));
});

test("Instagram: rechaza perfiles, stories y trucos", () => {
  for (const malo of [
    "https://www.instagram.com/ana.g/",
    "https://www.instagram.com/stories/ana/1234567890/",
    "https://www.instagram.com/reel/",
    "https://instagram.com.evil.com/reel/C8abcDEF123/",
    "https://evil.com/instagram.com/reel/C8abcDEF123/",
  ]) {
    assert.equal(clasificarEntrada(malo), null, malo);
  }
});

test("rechaza otros dominios y trucos de host", () => {
  for (const malo of [
    "https://youtube.com/watch?v=1",
    "https://tiktok.com.evil.com/@a/video/12345678",
    "https://evil.com/tiktok.com/@a/video/12345678",
    "ftp://tiktok.com/@a",
    "javascript:alert(1)",
    "",
    "x".repeat(400),
  ]) {
    assert.equal(clasificarEntrada(malo), null, malo.slice(0, 40));
  }
});

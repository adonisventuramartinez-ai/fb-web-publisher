import { test } from "node:test";
import assert from "node:assert/strict";
import { armarMensaje, limpiarTexto, sugerirHashtags, sugerirTitulos } from "../lib/sugerencias";

test("limpiarTexto quita hashtags, menciones y enlaces", () => {
  assert.equal(limpiarTexto("Mira esto @ana https://x.com/a #viral  genial"), "Mira esto genial");
});

test("títulos: variados, sin duplicados y con límite", () => {
  const t = sugerirTitulos("Receta de arroz con coco en 10 minutos. Súper fácil #cocina", "chef");
  assert.ok(t.length >= 4 && t.length <= 6);
  assert.equal(t[0], "Receta de arroz con coco en 10 minutos");
  assert.equal(new Set(t.map((x) => x.toLowerCase())).size, t.length);
  assert.ok(t.every((x) => x.length <= 120));
});

test("títulos: sin descripción devuelve opciones genéricas", () => {
  assert.ok(sugerirTitulos("", "").length >= 3);
});

test("hashtags: propios primero, palabras clave y genéricos, sin repetir", () => {
  const { recomendados, todos } = sugerirHashtags("Receta de arroz con coco #Cocina #cocina #recetas", "chef");
  assert.equal(recomendados.length, 5);
  assert.equal(recomendados[0], "#cocina");
  assert.ok(todos.includes("#arroz") || todos.includes("#receta"));
  assert.equal(new Set(todos.map((h) => h.toLowerCase())).size, todos.length);
  assert.ok(todos.every((h) => /^#\S+$/.test(h)));
});

test("hashtags: sin descripción usa los genéricos", () => {
  assert.deepEqual(sugerirHashtags("", "").recomendados.slice(0, 2), ["#reels", "#viral"]);
});

test("armarMensaje une texto y hashtags", () => {
  assert.equal(armarMensaje("Hola #x", ["#a", "#a", "#b"]), "Hola\n\n#a #b");
});

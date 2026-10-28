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

import { aHashtag, parsearTrendsRss } from "../lib/tendencias";

test("tendencias: parsea el RSS, crea hashtags y prioriza las relacionadas", () => {
  const xml = `<rss xmlns:ht="https://trends.google.com/trending/rss"><channel>
    <item><title>Béisbol Dominicano</title><ht:approx_traffic>5K+</ht:approx_traffic></item>
    <item><title>Receta de arroz</title><ht:approx_traffic>200+</ht:approx_traffic></item>
    <item><title><![CDATA[Tom &amp; Jerry]]></title></item>
    <item><title>una frase demasiado larga para ser hashtag de verdad</title></item>
  </channel></rss>`;
  const t = parsearTrendsRss(xml, "Mira mi receta de arroz con coco");
  assert.equal(t[0].termino, "Receta de arroz");
  assert.equal(t[0].relacionada, true);
  assert.equal(t[0].hashtag, "#recetadearroz");
  assert.equal(t.find((x) => x.termino === "Béisbol Dominicano")?.hashtag, "#beisboldominicano");
  assert.equal(t.find((x) => x.termino === "Béisbol Dominicano")?.trafico, "5K+");
  assert.equal(t.find((x) => x.termino.startsWith("una frase"))?.hashtag, null);
  assert.equal(aHashtag("Tom & Jerry"), "#tomjerry");
});

// 🔒 Verificar autorización (COMENTADO PARA PRUEBAS)
// const authHeader = req.headers.get("authorization");
// const secret = process.env.CRON_SECRET;
// if (secret && authHeader !== `Bearer ${secret}`) {
//   console.error("❌ Intento no autorizado al cron");
//   return NextResponse.json({ error: "No autorizado" }, { status: 401 });
// }
console.log("✅ CRON EJECUTADO (sin verificación de token)");

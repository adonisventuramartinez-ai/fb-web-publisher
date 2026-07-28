# Publicador Multi-Página de Facebook (versión web)

App en Next.js para publicar fotos, videos y reels en varias páginas de Facebook a la vez, desplegable en Vercel.

## Cómo funciona

- El login OAuth pasa por una función serverless (`/api/auth/callback`), la única parte que usa tu App Secret.
- Las subidas de fotos/videos van **directo del navegador a Facebook** (no pasan por Vercel), así se evita el límite de tamaño de las funciones serverless.

## 1. Configura tu app de Facebook

En https://developers.facebook.com/apps/, en tu app existente (o una nueva):

1. **Inicio de sesión con Facebook → Configuración** → agrega esta Redirect URI (la vas a tener después de desplegar, ver paso 3):
   ```
   https://TU-PROYECTO.vercel.app/api/auth/callback
   ```
   (para probar en local, agrega también `http://localhost:3000/api/auth/callback`)

2. Verifica que tengas los permisos: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`, `pages_read_user_content`.

## 2. Prueba en local (opcional)

```bash
npm install
cp .env.example .env.local
# Edita .env.local con tu App ID y App Secret reales
npm run dev
```
Abre http://localhost:3000

## 3. Desplegar en Vercel

1. Sube esta carpeta a un repositorio de GitHub (crea uno nuevo, sube todos estos archivos).
2. Ve a https://vercel.com → **Add New → Project** → importa el repositorio.
3. En **Environment Variables**, agrega:
   - `FB_APP_ID` = tu App ID
   - `FB_APP_SECRET` = tu App Secret
   - `NEXT_PUBLIC_FB_APP_ID` = el mismo App ID
4. Dale **Deploy**.
5. Cuando termine, copia la URL que te da Vercel (ej. `https://fb-web-publisher-tuusuario.vercel.app`).
6. Vuelve a Facebook Developers → Inicio de sesión con Facebook → Configuración, y agrega esa URL + `/api/auth/callback` como Redirect URI válida (paso 1).
7. Abre tu URL de Vercel, dale "Conectar con Facebook", y prueba publicar.

## Notas

- El token se guarda en `localStorage` del navegador (no en un servidor) — cierra sesión con el botón si usas una compu compartida.
- Mientras la app de Facebook esté en modo Desarrollo, solo funcionará con tu usuario y los que agregues como Tester en "Roles de la app".

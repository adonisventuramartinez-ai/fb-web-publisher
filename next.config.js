/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    FB_APP_ID: process.env.FB_APP_ID,
    FB_APP_SECRET: process.env.FB_APP_SECRET,
    NEXT_PUBLIC_FB_APP_ID: process.env.NEXT_PUBLIC_FB_APP_ID,
  },
  // Configuración para leer archivos .env en producción
  serverRuntimeConfig: {
    // Will only be available on the server side
  },
  publicRuntimeConfig: {
    // Will be available on both server and client
    NEXT_PUBLIC_FB_APP_ID: process.env.NEXT_PUBLIC_FB_APP_ID,
  },
}

module.exports = nextConfig

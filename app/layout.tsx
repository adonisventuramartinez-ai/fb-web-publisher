export const metadata = {
  title: "Publicador Multi-Página de Facebook",
  description: "Publica fotos, videos y reels en varias páginas de Facebook"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "Segoe UI, Arial, sans-serif", background: "#f0f2f5" }}>
        {children}
      </body>
    </html>
  );
}

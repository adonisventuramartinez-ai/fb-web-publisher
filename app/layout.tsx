import { Toaster } from "react-hot-toast";

export const metadata = {
  title: "Publicador Multi-Página de Facebook",
  description: "Publica fotos, videos y reels en varias páginas de Facebook",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "Segoe UI, Arial, sans-serif" }}>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: { fontSize: "14px" },
            success: { iconTheme: { primary: "#34a853", secondary: "white" } },
            error: { iconTheme: { primary: "#c62828", secondary: "white" } },
          }}
        />
      </body>
    </html>
  );
}

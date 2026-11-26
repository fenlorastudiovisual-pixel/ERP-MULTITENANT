import "./globals.css";

export const metadata = {
  title: "ERP Multitenant — Super Admin",
  description: "Consola de administración del ERP multitenant",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

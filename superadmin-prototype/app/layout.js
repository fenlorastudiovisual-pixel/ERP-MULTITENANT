import "./globals.css";

export const metadata = {
  title: "Samjuro ERP — Super Admin",
  description: "Prototipo navegable del Super Admin del ERP multitenant",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

import "./app.css";

export const metadata = {
  title: "Control Instituto",
  description: "Panel privado de Control Instituto",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="icon" href="/appwrite.svg" />
        <link rel="icon" type="image/svg+xml" href="/appwrite.svg" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

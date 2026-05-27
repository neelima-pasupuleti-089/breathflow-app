import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BreatheFlow Health Monitor",
  description:
    "Wearable multi-parameter health monitoring dashboard with sensor fusion stress detection.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

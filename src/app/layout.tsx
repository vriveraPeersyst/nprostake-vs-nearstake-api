import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NPRO vs NEAR Staking Comparison",
  description:
    "API to compare staking rewards between NPRO pool and regular NEAR staking",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

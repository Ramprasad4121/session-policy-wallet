import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Session Policy Wallet",
  description: "Restricted session keys with on-chain enforceable policies",
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

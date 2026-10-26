import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stochastic Sandbox | Quantitative SDE Simulator",
  description: "High-performance Monte Carlo simulator for stochastic processes: GBM, OU, CIR, Heston, and custom SDEs. Visualize paths, distributions, and option trees.",
  keywords: ["stochastic", "SDE", "Monte Carlo", "GBM", "Heston", "quantitative finance", "options pricing"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased overflow-hidden">{children}</body>
    </html>
  );
}

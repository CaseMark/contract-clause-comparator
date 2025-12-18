import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/layout/Navigation";
import { CustomizationProvider } from "@/lib/customization-context";
import { ComparisonProvider } from "@/lib/comparison-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Contract Clause Comparator",
  description: "Compare clauses across contracts. Upload multiple versions or templates, see diffs highlighted, find non-standard terms with AI-powered risk scoring.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <CustomizationProvider>
          <ComparisonProvider>
            <Navigation />
            <div className="flex-1">
              {children}
            </div>
            {/* Global Footer - Always at bottom */}
            <footer className="border-t bg-background mt-auto">
              <div className="container max-w-7xl py-6 text-center text-sm text-muted-foreground">
                <p>Powered by Case.dev</p>
              </div>
            </footer>
          </ComparisonProvider>
        </CustomizationProvider>
      </body>
    </html>
  );
}

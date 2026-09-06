import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs';
import ThemeProvider, { THEME_STORAGE_KEY } from "../components/ThemeProvider";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const title = "AI Document Vault";
const description = "An AI-searchable, chat-able document vault — semantic search and RAG chat over your saved links and uploaded PDFs, Word, Markdown and text files, with automatic summaries and smart categorization.";

// Absolute base for OG/canonical URLs. VERCEL_PROJECT_PRODUCTION_URL is injected
// by Vercel and follows the project's real domain, so a rename can't leave social
// previews pointing at a dead host the way a hardcoded fallback did.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    images: ["/logo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/logo.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f11" },
  ],
};

// Runs before first paint so the stored theme is on <html> by the time any
// pixels land — without it, a dark-theme user sees a white flash on every
// navigation. Dark when nothing is stored; "system" means no attribute, which
// lets color-scheme fall through to the OS.
const NO_FLASH_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)})||"dark";if(p==="system"){document.documentElement.removeAttribute("data-theme")}else{document.documentElement.setAttribute("data-theme",p==="light"?"light":"dark")}}catch(e){document.documentElement.setAttribute("data-theme","dark")}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.className} h-full`} data-theme="dark" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        </head>
        <body className="min-h-full flex flex-col">
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

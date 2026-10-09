import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BookMyProtest — Show up prepared", template: "%s · BookMyProtest" },
  description: "Plan the paperwork, permissions and logistics behind your public gathering — in one place.",
};
export const viewport: Viewport = { themeColor: "#0d0d0b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:bg-accent focus:p-3 focus:font-bold">Skip to content</a>
        {children}
      </body>
    </html>
  );
}

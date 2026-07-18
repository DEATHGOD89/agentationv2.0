import type { Metadata } from "next";
import "./globals.scss";
import { ToolbarProvider } from "./ToolbarProvider";
import { SideNav } from "./SideNav";
import { MobileNav } from "./MobileNav";
import { MobileNotice } from "./MobileNotice";

export const metadata: Metadata = {
  metadataBase: new URL("https://agentation.com"),
  title: "Megamorph",
  description: "The visual feedback tool for agents.",
  icons: {
    icon: "/megamorph.png",
  },
  openGraph: {
    title: "Megamorph",
    description: "The visual feedback tool for agents.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Agentation toolbar",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Megamorph",
    description: "The visual feedback tool for agents.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Cascadia+Code:ital@1&family=Caveat:wght@700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/megamorph.png" sizes="any" />
      </head>
      <body>
        <MobileNotice />
        <MobileNav />
        <SideNav />
        <main className="main-content">{children}</main>
        <ToolbarProvider />
      </body>
    </html>
  );
}

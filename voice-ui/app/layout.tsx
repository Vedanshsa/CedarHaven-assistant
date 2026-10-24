import { Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "@/app/components/theme-provider";
import { cn } from "@/lib/shadcn/utils";
import { getAppConfig, getStyles } from "@/lib/utils";
import { headers } from "next/headers";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

interface RootLayoutProps {
  children: React.ReactNode;
}

export default async function RootLayout({ children }: RootLayoutProps) {
  const hdrs = await headers();
  const appConfig = await getAppConfig(hdrs);
  const styles = getStyles(appConfig);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(spaceGrotesk.variable, "dark scroll-smooth antialiased")}
    >
      <head>
        {styles && <style>{styles}</style>}
        <title>Cedarhaven Assistant — Voice</title>
        <meta
          name="description"
          content="Cedarhaven municipal voice assistant: answers only from the town guides and shows its sources."
        />
        <meta name="theme-color" content="#030712" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="scanlines overflow-x-hidden relative min-h-screen">
        {/* Global Hexagonal Grid Background */}
        <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" style={{ opacity: 0.06 }}>
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="hex" x="0" y="0" width="50" height="57.735" patternUnits="userSpaceOnUse">
                <polygon
                  points="25,0 50,14.434 50,43.301 25,57.735 0,43.301 0,14.434"
                  fill="none"
                  stroke="#00f0ff"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hex)" />
          </svg>
        </div>

        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <div className="relative z-10 min-h-screen flex flex-col">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}

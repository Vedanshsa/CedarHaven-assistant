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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const appConfig = await getAppConfig(requestHeaders);
  const styles = getStyles(appConfig);

  return (
    <html lang="en" suppressHydrationWarning className={cn(spaceGrotesk.variable, "scroll-smooth antialiased")}>
      <head>
        {styles && <style>{styles}</style>}
        <title>Cedarhaven Assistant</title>
        <meta name="description" content="A private Cedarhaven guide assistant with saved text and voice conversations." />
        <meta name="theme-color" content="#f8fafc" />
      </head>
      <body className="relative min-h-screen overflow-x-hidden">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <div className="relative min-h-screen">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );
}

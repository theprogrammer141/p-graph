import { ClerkProvider, SignInButton, SignUpButton, OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./components/theme-provider";
import { ThemeSwitcher } from "./components/theme-switcher";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "p-graph",
  description: "Codebase visualization graph",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId } = await auth();

  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
        <body suppressHydrationWarning className="min-h-full flex flex-col bg-background text-foreground">
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <header className="flex justify-between items-center px-4 h-11 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xs sticky top-0 z-20 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-xs bg-zinc-900 dark:bg-zinc-100" />
                  p-graph
                </span>
                <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 px-1 py-0.5 border border-zinc-200 dark:border-zinc-800 rounded-xs">
                  v0.1
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                {!userId ? (
                  <div className="flex items-center gap-2">
                    <SignInButton mode="modal">
                      <button className="px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer">
                        Sign In
                      </button>
                    </SignInButton>
                    <SignUpButton mode="modal">
                      <button className="px-2.5 py-1 text-xs font-medium bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 rounded-xs hover:opacity-90 transition-opacity cursor-pointer">
                        Sign Up
                      </button>
                    </SignUpButton>
                  </div>
                ) : (
                  <>
                    <OrganizationSwitcher hidePersonal={false} />
                    <UserButton />
                  </>
                )}
                <div className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-800" />
                <ThemeSwitcher />
              </div>
            </header>
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
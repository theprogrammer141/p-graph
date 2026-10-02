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
        <body suppressHydrationWarning className="min-h-full flex flex-col bg-white dark:bg-black text-black dark:text-white">
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <header className="flex justify-end items-center p-4 gap-4 h-16 border-b border-black/[.08] dark:border-white/[.145]">
              {!userId ? (
                <>
                  <SignInButton />
                  <SignUpButton />
                </>
              ) : (
                <>
                  <OrganizationSwitcher hidePersonal={false} />
                  <UserButton />
                </>
              )}
              <ThemeSwitcher />
            </header>
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
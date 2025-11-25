// pages/_app.tsx
import "../styles/globals.css";
import type { AppProps } from "next/app";
import React from "react";
import { useUser } from "@/lib/useUser";
import { useRouter } from "next/router";
import { UserProvider } from "@/lib/UserContext";

function AppShell({ children }: { children: React.ReactNode }) {
  const { error } = useUser();
  const router = useRouter();

  const isAuthPage = router.pathname === "/login";

  if (isAuthPage) {
    return (
      <>
        {children}
        {error && (
          <div className="fixed bottom-2 right-2 bg-red-100 text-red-700 text-xs px-3 py-1 rounded shadow">
            {error}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="p-4">{children}</main>
      {error && (
        <div className="fixed bottom-2 right-2 bg-red-100 text-red-700 text-xs px-3 py-1 rounded shadow">
          {error}
        </div>
      )}
    </div>
  );
}

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <UserProvider>
      <AppShell>
        <Component {...pageProps} />
      </AppShell>
    </UserProvider>
  );
}

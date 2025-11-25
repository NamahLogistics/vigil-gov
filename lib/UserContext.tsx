// lib/UserContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  getAuth,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import { app } from "@/firebaseClient";
import { apiFetch } from "./authClient";
import type { User } from "./types";

interface UserContextValue {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  authLoading: boolean;
  profileLoading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1) Firebase auth state – yeh sirf YAHI chalega
  useEffect(() => {
    const auth = getAuth(app);

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);
      setAuthLoading(false);

      if (!fbUser) {
        setUser(null);
      }
    });

    return () => unsub();
  }, []);

  // 2) Profile (/api/me) – per login sirf 1 call
  useEffect(() => {
    if (authLoading) return;

    if (!firebaseUser) {
      setUser(null);
      setProfileLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      try {
        setProfileLoading(true);
        setError(null);

        const res = await apiFetch("/api/me");
        const data = await res.json().catch(() => ({} as any));

        if (!res.ok) {
          throw new Error((data as any).error || "Failed to load user profile");
        }

        if (!cancelled) {
          setUser((data as any).user || null);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("loadProfile error:", err);
          setError(err.message || "Error loading profile");
          setUser(null);
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, authLoading]);

  async function signOut() {
    const auth = getAuth(app);
    await auth.signOut();
  }

  const value: UserContextValue = {
    firebaseUser,
    user,
    authLoading,
    profileLoading,
    error,
    signOut,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export function useUserContext(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUserContext must be used inside <UserProvider>");
  }
  return ctx;
}

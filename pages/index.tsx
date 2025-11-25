// pages/index.tsx
import React, { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useUser } from "@/lib/useUser";

const HomePage: React.FC = () => {
  const router = useRouter();
  const { user, firebaseUser, authLoading, profileLoading } = useUser();
const idRef = useRef(Math.random().toString(36).slice(2));
  const loading = authLoading || profileLoading;
  const photoUrl = (user as any)?.photoUrl as string | undefined;

  // prevent multiple redirects
  const redirectingRef = useRef(false);

  useEffect(() => {
     console.log("useUser effect", idRef.current, { authLoading, firebaseUser });

    if (loading) return;
    if (redirectingRef.current) return;

    // 1) Not logged in → login page
    if (!firebaseUser) {
      redirectingRef.current = true;
      router.replace("/login");
      return;
    }

    // 2) Firebase user mil gaya, par Firestore profile abhi aa rahi hai
    if (!user) {
      return;
    }

    // 3) ADMIN ke liye koi face gate nahi.
    if (user.role === "ADMIN") {
      redirectingRef.current = true;
      router.replace("/admin");
      return;
    }

    // 4) Sirf NON-ADMIN officers ke liye face gate
    if (!photoUrl) {
      redirectingRef.current = true;
      router.replace("/setup-face");
      return;
    }

    // 5) Face set ho chuka, ab role-wise redirect
    redirectingRef.current = true;
    switch (user.role) {
      case "JE":
      case "FE":
        router.replace("/je");
        break;
      case "SDO":
        router.replace("/sdo");
        break;
      case "EE":
        router.replace("/ee");
        break;
      case "SE":
        router.replace("/se");
        break;
      case "CE":
        router.replace("/ce");
        break;
      default:
        router.replace("/admin");
        break;
    }
  }, [loading, firebaseUser, user, photoUrl, router]);

  // ---------- UI while redirecting ----------

  if (loading) {
    return (
      <div className="p-6 text-center text-sm text-gray-600">
        Loading…
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="p-6 text-center text-sm text-gray-600">
        Redirecting to login…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 text-center text-sm text-gray-600">
        Waiting for your user profile…
      </div>
    );
  }

  if (user.role !== "ADMIN" && !photoUrl) {
    return (
      <div className="p-6 text-center text-sm text-gray-600">
        Redirecting to face setup…
      </div>
    );
  }

  return (
    <div className="p-6 text-center text-sm text-gray-600">
      Redirecting…
    </div>
  );
};

export default HomePage;

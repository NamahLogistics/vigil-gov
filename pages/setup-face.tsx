// pages/setup-face.tsx
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useUser } from "@/lib/useUser";
import { apiFetch } from "@/lib/authClient";

const SetupFacePage: React.FC = () => {
  const router = useRouter();
  const { user, firebaseUser, authLoading, profileLoading } = useUser();

  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = authLoading || profileLoading;

  function goToRole(role: string) {
    switch (role) {
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
  }

  // Guard + ADMIN skip
  useEffect(() => {
    if (loading) return;

    // Not logged in → login
    if (!firebaseUser) {
      router.replace("/login");
      return;
    }

    if (!user) return;

    // Admin ko yahan selfie nahi deni
    if (user.role === "ADMIN") {
      goToRole(user.role);
      return;
    }

    // NOTE:
    // Non-admin ke liye yahan photoUrl check nahi kar rahe,
    // kyunki index.tsx already ensure karta hai ki
    // photoUrl missing ho tabhi yahan redirect ho.
  }, [loading, firebaseUser, user, router]);

  async function handleUpload() {
    try {
      if (!file) {
        setError("Please capture or choose a clear face photograph.");
        return;
      }
      if (!user) {
        setError("Officer profile not loaded. Please refresh the page.");
        return;
      }

      setSaving(true);
      setError(null);

      const form = new FormData();
      form.append("file", file);

      const res = await apiFetch("/api/user/upload-face", {
        method: "POST",
        body: form,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Unable to save photo.");
      }

      // After successful save, go to role dashboard
      goToRole(user.role);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong while saving the photo.");
    } finally {
      setSaving(false);
    }
  }

  // ---------- RENDER ----------

  if (loading || !firebaseUser || !user) {
    return (
      <div className="p-6 text-center text-sm text-gray-600">
        Loading officer profile…
      </div>
    );
  }

  // At this point: logged in + user present + role ≠ ADMIN
  return (
    <div className="max-w-sm mx-auto p-6 mt-10 bg-white shadow rounded text-center space-y-4">
      {/* Officer info */}
      <div className="text-xs text-gray-500 text-left mb-2">
        <div className="font-semibold text-gray-700">
          {user.name} ({user.role})
        </div>
        {user.orgUnitPath && <div>{user.orgUnitPath}</div>}
      </div>

      <h1 className="text-lg font-semibold">
        Face Registration for Site Verification
      </h1>
      <p className="text-xs text-gray-600">
        Please capture a clear front-facing photo. This will be used to verify
        your identity during site visits (Face + GPS). The photo is stored
        securely for departmental use only.
      </p>

      <input
        type="file"
        accept="image/*"
        capture="user"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="w-full border p-2 rounded text-sm"
      />

      {error && (
        <div className="text-red-600 text-xs mt-1">
          {error}
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={saving}
        className="w-full bg-blue-600 text-white py-2 rounded text-sm disabled:opacity-60"
      >
        {saving ? "Saving photo…" : "Save & Continue"}
      </button>

      <p className="text-[11px] text-gray-500 mt-1">
        Tip: Use good lighting, remove cap/helmet, and keep your full face
        visible in the frame.
      </p>
    </div>
  );
};

export default SetupFacePage;

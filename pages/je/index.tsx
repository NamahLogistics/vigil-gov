// pages/je/index.tsx

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/authClient";

type UserRole = "JE" | "FE" | "SDO" | "EE" | "SE" | "CE" | "ADMIN";

interface Project {
  id: string;
  name: string;
  orgUnitPath: string;
  sanctionedAmount: number;
  physicalPercent: number;
  financialPercent: number;
  riskLevel?: "low" | "medium" | "high";
}

interface Package {
  id: string;
  name: string;
  amount: number;
  discipline: string;
  physicalPercent: number;
  financialPercent: number;
  ownerJeId: string;
}

interface Stage {
  id: string;
  name: string;
  order: number;
  weightPercent: number;
  reportedProgressPercent?: number;
  verifiedProgressPercent?: number;
  verificationSource?: "site" | "office" | "unknown";
}

interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
  orgUnitPath: string;
  departmentId: string;
}

const JEPage: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");

  const [stages, setStages] = useState<Stage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string>("");

  // Progress upload state
  const [zone, setZone] = useState("");
  const [note, setNote] = useState("");
  const [progressPhotoFile, setProgressPhotoFile] = useState<File | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [jePercent, setJePercent] = useState<string>("");

  // Visit state
  const [visitFaceFile, setVisitFaceFile] = useState<File | null>(null);
  const [visitLoading, setVisitLoading] = useState(false);

  // UI feedback
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [loadingStages, setLoadingStages] = useState(false);

  // 1) Load current user + project list
  useEffect(() => {
    (async () => {
      try {
        setError(null);
        setLoadingProjects(true);

        const res = await apiFetch("/api/projects");
        const data = await res.json().catch(() => ({} as any));

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load projects");
        }

        setProjects(data.projects || []);

        // (We will fetch currentUser later via projectDashboard)
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Error loading projects");
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  // 2) When project changes, load packages + currentUser (from dashboard)
  useEffect(() => {
    if (!selectedProjectId) {
      setPackages([]);
      setSelectedPackageId("");
      setStages([]);
      setSelectedStageId("");
      return;
    }

    (async () => {
      try {
        setError(null);
        setLoadingPackages(true);

        // Fetch packages for selected project
        const pkgRes = await apiFetch(
          `/api/packages?projectId=${encodeURIComponent(selectedProjectId)}`
        );
        const pkgData = await pkgRes.json().catch(() => ({} as any));

        if (!pkgRes.ok) {
          throw new Error(pkgData?.error || "Failed to load packages");
        }

        setPackages(pkgData.packages || []);
        setSelectedPackageId("");
        setStages([]);
        setSelectedStageId("");

        // Also fetch projectDashboard ONCE for this project to get currentUser
        const dashRes = await apiFetch(
          `/api/projectDashboard?projectId=${encodeURIComponent(
            selectedProjectId
          )}`
        );
        const dash = await dashRes.json().catch(() => ({} as any));

        if (dashRes.ok && dash.currentUser) {
          setCurrentUser(dash.currentUser);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Error loading project details");
      } finally {
        setLoadingPackages(false);
      }
    })();
  }, [selectedProjectId]);

  // 3) When package changes, load stages
  useEffect(() => {
    if (!selectedProjectId || !selectedPackageId) {
      setStages([]);
      setSelectedStageId("");
      return;
    }

    (async () => {
      try {
        setError(null);
        setLoadingStages(true);

        const res = await apiFetch(
          `/api/stages?projectId=${encodeURIComponent(
            selectedProjectId
          )}&packageId=${encodeURIComponent(selectedPackageId)}`
        );
        const data = await res.json().catch(() => ({} as any));

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load stages");
        }

        setStages(data.stages || []);
        setSelectedStageId("");
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Error loading stages");
      } finally {
        setLoadingStages(false);
      }
    })();
  }, [selectedProjectId, selectedPackageId]);

  // Visit handler – JE marks site visit with face+GPS
  async function handleMarkVisit() {
    try {
      setError(null);
      setMessage(null);

      if (!selectedProjectId) {
        setError("Select a project first");
        return;
      }
      if (!visitFaceFile) {
        setError("Select a face photo to mark visit");
        return;
      }
      if (!navigator.geolocation) {
        setError("Geolocation not supported in this browser");
        return;
      }

      setVisitLoading(true);

      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
          })
      );

      const { latitude, longitude, accuracy } = position.coords;

      const formData = new FormData();
      formData.append("projectId", selectedProjectId);
      formData.append("visitType", "site");
      formData.append("lat", latitude.toString());
      formData.append("lng", longitude.toString());
      formData.append("accuracy", (accuracy || 0).toString());
      formData.append("face", visitFaceFile);

      const res = await apiFetch("/api/visits", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(data?.error || "Visit failed");
      }

      if (data.event?.faceVerified === false) {
        setMessage("Visit recorded but face verification failed.");
      } else {
        setMessage(
          data.event?.geoVerified
            ? "Visit recorded (face + geo verified)."
            : "Visit recorded (face verified; outside geo radius)."
        );
      }

      setVisitFaceFile(null);
      const input = document.getElementById(
        "je-face-input"
      ) as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (err: any) {
      console.error(err);
      // Geolocation specific message
      if (err?.code === 1) {
        setError("Location permission denied. Please allow GPS to mark visit.");
      } else if (err?.code === 2) {
        setError("Unable to fetch location. Try again in open area.");
      } else if (err?.code === 3) {
        setError("Location request timed out. Please try again.");
      } else {
        setError(err.message || "Error marking visit");
      }
    } finally {
      setVisitLoading(false);
    }
  }

  // Progress upload (photo of work) – requires recent visit (enforced in backend)
  async function handleUploadProgress(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError(null);
      setMessage(null);

      if (!selectedProjectId || !selectedPackageId || !selectedStageId) {
        setError("Select project, package, and stage");
        return;
      }
      if (!progressPhotoFile) {
        setError("Please choose a work photo");
        return;
      }

      const parsedPercent = Number(jePercent);
      if (!jePercent || Number.isNaN(parsedPercent)) {
        setError("Please enter stage progress in % (0–100).");
        return;
      }
      const boundedPercent = Math.max(0, Math.min(100, parsedPercent));

      setProgressLoading(true);

      const formData = new FormData();
      formData.append("projectId", selectedProjectId);
      formData.append("packageId", selectedPackageId);
      formData.append("stageId", selectedStageId);
      formData.append("jePercent", String(boundedPercent));
      if (zone) formData.append("zone", zone);
      if (note) formData.append("note", note);
      formData.append("photos", progressPhotoFile);

      const res = await apiFetch("/api/events", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(data?.error || "Upload failed");
      }

      setMessage("Progress uploaded. Waiting for SDO verification.");

      // Reset file input + form fields
      setProgressPhotoFile(null);
      setJePercent("");
      const input = document.getElementById(
        "progress-photo-input"
      ) as HTMLInputElement | null;
      if (input) input.value = "";

      // Reload stages (to get updated reportedProgressPercent)
      const reload = await apiFetch(
        `/api/stages?projectId=${encodeURIComponent(
          selectedProjectId
        )}&packageId=${encodeURIComponent(selectedPackageId)}`
      );
      const fresh = await reload.json().catch(() => ({} as any));
      if (reload.ok) {
        setStages(fresh.stages || []);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error uploading progress");
    } finally {
      setProgressLoading(false);
    }
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedPackage = packages.find((p) => p.id === selectedPackageId);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold mb-2">JE / FE – My Projects</h1>

      {error && (
        <div className="bg-red-100 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="bg-green-100 text-green-700 px-3 py-2 rounded text-sm">
          {message}
        </div>
      )}

      {/* Current user info (if loaded) */}
      {currentUser && (
        <div className="border rounded p-2 text-xs text-gray-700 flex justify-between">
          <div>
            <div className="font-medium">
              {currentUser.name} ({currentUser.role})
            </div>
            <div>Org: {currentUser.orgUnitPath}</div>
          </div>
          <div className="text-right">
            <div>Dept: {currentUser.departmentId}</div>
          </div>
        </div>
      )}

      {/* Project selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Project</label>
        <select
          className="border rounded px-2 py-1 w-full text-sm"
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          disabled={loadingProjects}
        >
          <option value="">
            {loadingProjects ? "Loading projects…" : "Select project"}
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} – Phy {p.physicalPercent?.toFixed?.(1) ?? 0}% / Fin{" "}
              {p.financialPercent?.toFixed?.(1) ?? 0}%{" "}
              {p.riskLevel && ` (${p.riskLevel})`}
            </option>
          ))}
        </select>
        {loadingProjects && (
          <div className="text-xs text-gray-500">Please wait…</div>
        )}
        {!loadingProjects && projects.length === 0 && (
          <div className="text-xs text-gray-500">
            No projects assigned to your login yet.
          </div>
        )}
      </div>

      {/* Quick link to full project page */}
      {selectedProject && (
        <div className="text-xs">
          <Link
            href={`/project/${selectedProject.id}`}
            className="text-blue-600 hover:underline"
          >
            Open full project dashboard →
          </Link>
        </div>
      )}

      {/* Package selection */}
      {selectedProjectId && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">Package</label>
          <select
            className="border rounded px-2 py-1 w-full text-sm"
            value={selectedPackageId}
            onChange={(e) => setSelectedPackageId(e.target.value)}
            disabled={loadingPackages}
          >
            <option value="">
              {loadingPackages ? "Loading packages…" : "Select package"}
            </option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} – ₹{pkg.amount.toLocaleString("en-IN")} (Phy{" "}
                {pkg.physicalPercent?.toFixed?.(1) ?? 0}% / Fin{" "}
                {pkg.financialPercent?.toFixed?.(1) ?? 0}%)
              </option>
            ))}
          </select>
          {loadingPackages && (
            <div className="text-xs text-gray-500">Please wait…</div>
          )}
          {!loadingPackages && selectedProjectId && packages.length === 0 && (
            <div className="text-xs text-gray-500">
              No packages mapped for this project.
            </div>
          )}
        </div>
      )}

      {/* Stage selection + upload */}
      {selectedPackageId && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Left: JE progress upload */}
          <form
            onSubmit={handleUploadProgress}
            className="border rounded p-3 space-y-3 text-sm"
          >
            <div className="font-medium">Upload Work Progress</div>
            <p className="text-xs text-gray-600">
              1) First mark your site visit using face & GPS. <br />
              2) Then upload work photos stage-wise. System will block uploads
              without a recent site visit.
            </p>

            <div>
              <label className="block text-xs font-medium mb-1">Stage</label>
              <select
                className="border rounded px-2 py-1 w-full text-sm"
                value={selectedStageId}
                onChange={(e) => setSelectedStageId(e.target.value)}
                disabled={loadingStages || stages.length === 0}
              >
                <option value="">
                  {loadingStages
                    ? "Loading stages…"
                    : stages.length === 0
                    ? "No stages defined"
                    : "Select stage"}
                </option>
                {stages.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.order}. {st.name} ({st.weightPercent}%)
                    {" · JE "}
                    {(st.reportedProgressPercent ?? 0).toFixed(1)}%
                    {" / SDO "}
                    {(st.verifiedProgressPercent ?? 0).toFixed(1)}%
                  </option>
                ))}
              </select>
              {loadingStages && (
                <div className="text-xs text-gray-500 mt-1">
                  Loading stages…
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Stage Progress (% by JE)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className="border rounded px-2 py-1 w-full text-sm"
                value={jePercent}
                onChange={(e) => setJePercent(e.target.value)}
                placeholder="e.g. 40"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Kitna % kaam ho chuka hai (0–100). SDO baad me verify karega.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Zone / Location
                </label>
                <input
                  className="border rounded px-2 py-1 w-full text-sm"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  placeholder="Bay 3–4, Block A..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Note (optional)
                </label>
                <input
                  className="border rounded px-2 py-1 w-full text-sm"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Slab concreting in progress"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Work Photo
              </label>
              <input
                id="progress-photo-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) =>
                  setProgressPhotoFile(e.target.files?.[0] || null)
                }
              />
            </div>

            <button
              type="submit"
              disabled={progressLoading}
              className="bg-green-600 text-white px-3 py-1 rounded text-xs disabled:opacity-50"
            >
              {progressLoading ? "Uploading..." : "Upload Progress"}
            </button>
          </form>

          {/* Right: Mark visit card */}
          <div className="border rounded p-3 space-y-2 text-sm">
            <div className="font-medium">Mark Site Visit (Face + GPS)</div>
            <p className="text-xs text-gray-600">
              Use this whenever you go to site. System will link your face and
              location to this project for 24 hours.
            </p>

            <div>
              <label className="block text-xs font-medium mb-1">
                Face Photo
              </label>
              <input
                id="je-face-input"
                type="file"
                accept="image/*"
                capture="user"
                onChange={(e) =>
                  setVisitFaceFile(e.target.files?.[0] || null)
                }
              />
            </div>

            <button
              type="button"
              disabled={visitLoading}
              onClick={handleMarkVisit}
              className="bg-blue-600 text-white px-3 py-1 rounded text-xs disabled:opacity-50"
            >
              {visitLoading ? "Marking..." : "Mark visit now"}
            </button>
          </div>
        </div>
      )}

      {/* Stage status table below (read-only summary for selected package) */}
      {selectedPackage && stages.length > 0 && (
        <div className="border rounded p-3 text-xs space-y-2 mt-2">
          <div className="font-medium">
            Stage-wise Status – {selectedPackage.name}
          </div>
          <table className="min-w-full border text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Stage</th>
                <th className="border px-2 py-1 text-right">Weight %</th>
                <th className="border px-2 py-1 text-right">JE %</th>
                <th className="border px-2 py-1 text-right">SDO %</th>
                <th className="border px-2 py-1 text-center">Verification</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((st) => {
                const src = st.verificationSource || "unknown";
                return (
                  <tr key={st.id} className="hover:bg-gray-50">
                    <td className="border px-2 py-1">
                      {st.order}. {st.name}
                    </td>
                    <td className="border px-2 py-1 text-right">
                      {st.weightPercent}%
                    </td>
                    <td className="border px-2 py-1 text-right">
                      {(st.reportedProgressPercent ?? 0).toFixed(1)}%
                    </td>
                    <td className="border px-2 py-1 text-right">
                      {(st.verifiedProgressPercent ?? 0).toFixed(1)}%
                    </td>
                    <td className="border px-2 py-1 text-center">
                      {src === "site" && (
                        <span className="text-green-700 font-medium">
                          SDO – site
                        </span>
                      )}
                      {src === "office" && (
                        <span className="text-yellow-700 font-medium">
                          SDO – office
                        </span>
                      )}
                      {src === "unknown" && (
                        <span className="text-gray-500">JE only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default JEPage;

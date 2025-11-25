// pages/sdo/index.tsx

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/authClient";

type UserRole = "JE" | "FE" | "SDO" | "EE" | "SE" | "CE" | "ADMIN";

interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
  orgUnitPath: string;
  departmentId: string;
}

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

const SDOPage: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");

  const [stages, setStages] = useState<Stage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string>("");

  // Visit
  const [visitFaceFile, setVisitFaceFile] = useState<File | null>(null);
  const [visitType, setVisitType] = useState<"site" | "office">("site");
  const [visitLoading, setVisitLoading] = useState(false);

  // UI
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [loadingStages, setLoadingStages] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 1) Load projects visible to SDO
  useEffect(() => {
    (async () => {
      try {
        setError(null);
        setLoadingProjects(true);

        const res = await apiFetch("/api/projects");
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || "Failed to load projects");
        }

        setProjects(data.projects || []);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Error loading projects");
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  // 2) When project changes, load packages & currentUser
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

        // Packages
        const pkgRes = await apiFetch(
          `/api/packages?projectId=${encodeURIComponent(selectedProjectId)}`
        );
        const pkgData = await pkgRes.json().catch(() => ({}));
        if (!pkgRes.ok) {
          throw new Error(pkgData.error || "Failed to load packages");
        }
        setPackages(pkgData.packages || []);
        setSelectedPackageId("");
        setStages([]);
        setSelectedStageId("");

        // Dashboard for currentUser info
        const dashRes = await apiFetch(
          `/api/projectDashboard?projectId=${encodeURIComponent(
            selectedProjectId
          )}`
        );
        if (dashRes.ok) {
          const dash = await dashRes.json().catch(() => ({}));
          if (dash.currentUser) {
            setCurrentUser(dash.currentUser);
          }
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
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Failed to load stages");
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

  // SDO visit (face + GPS for site, or face-only office)
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

      const formData = new FormData();
      formData.append("projectId", selectedProjectId);
      formData.append("visitType", visitType);
      formData.append("face", visitFaceFile);

      if (visitType === "site") {
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

        formData.append("lat", latitude.toString());
        formData.append("lng", longitude.toString());
        formData.append("accuracy", (accuracy || 0).toString());
      } else {
        setVisitLoading(true);
      }

      const res = await apiFetch("/api/visits", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Visit failed");
      }

      if (data.event?.faceVerified === false) {
        setMessage("Visit recorded but face verification failed.");
      } else {
        if (visitType === "site") {
          setMessage(
            data.event?.geoVerified
              ? "Site visit recorded (face + geo verified)."
              : "Site visit recorded (face verified; outside geo radius)."
          );
        } else {
          setMessage("Office visit recorded (face verified).");
        }
      }

      setVisitFaceFile(null);
      const input = document.getElementById(
        "sdo-face-input"
      ) as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error marking visit");
    } finally {
      setVisitLoading(false);
    }
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedPackage = packages.find((p) => p.id === selectedPackageId);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold mb-2">
        SDO – Verification & Attendance
      </h1>

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

      {/* Current User */}
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
        >
          <option value="">Select project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} – Phy {p.physicalPercent?.toFixed?.(1) ?? 0}% / Fin{" "}
              {p.financialPercent?.toFixed?.(1) ?? 0}%{" "}
              {p.riskLevel && ` (${p.riskLevel})`}
            </option>
          ))}
        </select>
        {loadingProjects && (
          <div className="text-xs text-gray-500">Loading projects…</div>
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
          >
            <option value="">Select package</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} – ₹{pkg.amount.toLocaleString("en-IN")} (Phy{" "}
                {pkg.physicalPercent?.toFixed?.(1) ?? 0}% / Fin{" "}
                {pkg.financialPercent?.toFixed?.(1) ?? 0}%)
              </option>
            ))}
          </select>
          {loadingPackages && (
            <div className="text-xs text-gray-500">Loading packages…</div>
          )}
        </div>
      )}

      {/* Main layout: left = visit card, right = stage status */}
      {selectedPackageId && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* LEFT: Visit card (face + GPS or office) */}
          <div className="border rounded p-3 space-y-2 text-sm">
            <div className="font-medium">Mark Visit (Face + GPS)</div>
            <p className="text-xs text-gray-600">
              To verify from site, choose{" "}
              <span className="font-semibold">Site visit</span>. For office
              MB-check verification, choose{" "}
              <span className="font-semibold">Office</span>. System will show
              this in dashboards.
            </p>

            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="visitType"
                  value="site"
                  checked={visitType === "site"}
                  onChange={() => setVisitType("site")}
                />
                Site visit
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="visitType"
                  value="office"
                  checked={visitType === "office"}
                  onChange={() => setVisitType("office")}
                />
                Office (no GPS)
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Face Photo
              </label>
              <input
                id="sdo-face-input"
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
              {visitLoading ? "Marking…" : "Mark visit now"}
            </button>
          </div>

          {/* RIGHT: Stage status table (read-only; click-through to project page if needed) */}
          {selectedPackage && stages.length > 0 && (
            <div className="border rounded p-3 text-xs space-y-2 mt-2 md:mt-0">
              <div className="font-medium">
                Stage-wise Status – {selectedPackage.name}
              </div>
              {loadingStages && (
                <div className="text-xs text-gray-500">Loading stages…</div>
              )}
              <table className="min-w-full border text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border px-2 py-1 text-left">Stage</th>
                    <th className="border px-2 py-1 text-right">Weight %</th>
                    <th className="border px-2 py-1 text-right">JE %</th>
                    <th className="border px-2 py-1 text-right">SDO %</th>
                    <th className="border px-2 py-1 text-center">
                      Verification
                    </th>
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
                              Site visit
                            </span>
                          )}
                          {src === "office" && (
                            <span className="text-yellow-700 font-medium">
                              Office
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
              <div className="text-[11px] text-gray-500 mt-1">
                For detailed AI + JE + SDO comments on a specific stage, open
                the full project dashboard and click that stage.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SDOPage;

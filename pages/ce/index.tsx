// pages/ce/index.tsx

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/authClient";

type RiskLevel = "low" | "medium" | "high";

type RoleKey = "JE" | "SDO" | "EE" | "SE" | "CE";

interface RoleAttendance {
  totalVisits: number;
  lastVisit: number | null;
  lastBy: string | null;
  lastVisitType?: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  orgUnitPath: string;

  sanctionedAmount: number;
  physicalPercent: number;
  financialPercent: number;
  expectedPhysicalPercent: number;

  agreementStartDate?: number;
  agreementEndDate?: number;
  expectedCompletionDate?: number;
  actualCompletionDate?: number;

  gap: number;
  risk: RiskLevel;
  attendance: Record<RoleKey, RoleAttendance>;
}

function formatDate(ts?: number | null) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function formatDateTime(ts?: number | null) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CEDashboard: React.FC = () => {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CE visit state
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [visitFaceFile, setVisitFaceFile] = useState<File | null>(null);
  const [visitLoading, setVisitLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // -------------------------
  // LOAD PROJECTS
  // -------------------------
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const res = await apiFetch("/api/admin/projects-by-role");
        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        const normalized: ProjectRow[] = data.projects.map((p: any) => {
          const gap = (p.physicalPercent || 0) - (p.financialPercent || 0);
          return {
            ...p,
            gap,
            risk: gap < -20 ? "high" : gap < -10 ? "medium" : "low",
            expectedPhysicalPercent: p.expectedPhysicalPercent || 0,
          };
        });

        setProjects(normalized);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // -------------------------
  // CE SITE VISIT (FACE + GEO)
  // -------------------------
  async function handleMarkVisit() {
    try {
      setError(null);
      setMessage(null);

      if (!selectedProjectId) {
        setError("Select a project first.");
        return;
      }
      if (!visitFaceFile) {
        setError("Upload a face photo.");
        return;
      }

      if (!navigator.geolocation) {
        setError("GPS not supported.");
        return;
      }

      setVisitLoading(true);

      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
        })
      );

      const { latitude, longitude, accuracy } = position.coords;

      const formData = new FormData();
      formData.append("projectId", selectedProjectId);
      formData.append("visitType", "site");
      formData.append("face", visitFaceFile);
      formData.append("lat", latitude.toString());
      formData.append("lng", longitude.toString());
      formData.append("accuracy", String(accuracy || 0));

      const res = await apiFetch("/api/visits", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage(
        data.event?.geoVerified
          ? "CE site visit recorded (face + geo verified)."
          : "CE visit recorded (face verified; outside geofence)."
      );

      setVisitFaceFile(null);
      const input = document.getElementById("ce-face-input") as HTMLInputElement;
      if (input) input.value = "";
    } catch (err: any) {
      setError(err.message);
    } finally {
      setVisitLoading(false);
    }
  }

  function AttCell(a?: RoleAttendance) {
    if (!a) return <div>-</div>;
    return (
      <div>
        <div>{a.totalVisits}</div>
        <div className="text-[10px] text-gray-500">{formatDateTime(a.lastVisit)}</div>
      </div>
    );
  }

  // -------------------------
  // RENDER
  // -------------------------
  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">CE Dashboard – My Area</h1>
        <Link href="/" className="text-xs border px-2 py-1 rounded">← Home</Link>
      </div>

      {error && <div className="bg-red-100 text-red-700 px-3 py-2 rounded">{error}</div>}
      {message && <div className="bg-green-100 text-green-700 px-3 py-2 rounded">{message}</div>}
      {loading && <div className="text-sm text-gray-500">Loading projects…</div>}

      {/* ----------------------------- */}
      {/* CE SITE VISIT CARD */}
      {/* ----------------------------- */}
      {projects.length > 0 && (
        <div className="border rounded p-3 space-y-3 text-sm">
          <div className="font-medium">Mark CE Site Visit (Face + GPS)</div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Project</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Phy {p.physicalPercent.toFixed(1)}% / Fin{" "}
                    {p.financialPercent.toFixed(1)}%)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium">Face Photo</label>
              <input
                id="ce-face-input"
                type="file"
                accept="image/*"
                capture="user"
                onChange={(e) => setVisitFaceFile(e.target.files?.[0] || null)}
              />
              <button
                disabled={visitLoading}
                onClick={handleMarkVisit}
                className="bg-blue-600 text-white text-xs rounded px-3 py-1 mt-1 disabled:opacity-50"
              >
                {visitLoading ? "Marking…" : "Mark CE visit now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------- */}
      {/* PROJECT TABLE WITH BARS + TIMELINE + ATTENDANCE */}
      {/* ----------------------------- */}
      {projects.length > 0 && (
        <div className="border rounded p-3 text-xs space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-medium">Projects (Risk Sorted)</div>
            <div className="text-gray-500 text-[11px]">
              Gap = Physical% − Financial%. Large negative gap → high risk.
            </div>
          </div>

          <table className="min-w-full border text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1">Project</th>
                <th className="border px-2 py-1">Timeline</th>
                <th className="border px-2 py-1 text-right">Sanction</th>

                {/* ATT */}
                <th className="border px-2 py-1 text-center">JE</th>
                <th className="border px-2 py-1 text-center">SDO</th>
                <th className="border px-2 py-1 text-center">EE</th>
                <th className="border px-2 py-1 text-center">SE</th>
                <th className="border px-2 py-1 text-center">CE</th>

                {/* BARS */}
                <th className="border px-2 py-1 w-64 text-center">Progress</th>

                <th className="border px-2 py-1">Open</th>
              </tr>
            </thead>

            <tbody>
              {projects.map((p) => {
                const expected = p.expectedPhysicalPercent;
                const actual = p.physicalPercent;
                const fin = p.financialPercent;

                const att = p.attendance;

                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="border px-2 py-1 font-semibold">{p.name}</td>

                    {/* TIMELINE */}
                    <td className="border px-2 py-1">
                      <div>Start: {formatDate(p.agreementStartDate)}</div>
                      <div>End: {formatDate(p.agreementEndDate)}</div>
                      <div>Expected: {formatDate(p.expectedCompletionDate)}</div>
                      <div className="text-[10px] text-gray-600">
                        Actual: {formatDate(p.actualCompletionDate)}
                      </div>
                    </td>

                    <td className="border px-2 py-1 text-right">
                      ₹{p.sanctionedAmount.toLocaleString("en-IN")}
                    </td>

                    {/* ATTENDANCE */}
                    <td className="border px-2 py-1">{AttCell(att.JE)}</td>
                    <td className="border px-2 py-1">{AttCell(att.SDO)}</td>
                    <td className="border px-2 py-1">{AttCell(att.EE)}</td>
                    <td className="border px-2 py-1">{AttCell(att.SE)}</td>
                    <td className="border px-2 py-1">{AttCell(att.CE)}</td>

                    {/* PROGRESS BAR */}
                    <td className="border px-2 py-1">
                      <div className="relative bg-gray-200 h-3 rounded w-full">
                        <div
                          className="absolute left-0 top-0 h-3 bg-green-600 rounded"
                          style={{ width: `${actual}%` }}
                        ></div>
                        <div
                          className="absolute left-0 top-0 h-3 bg-blue-600 opacity-70 rounded"
                          style={{ width: `${expected}%` }}
                        ></div>
                        <div
                          className="absolute left-0 top-0 h-3 bg-yellow-500 opacity-70 rounded"
                          style={{ width: `${fin}%` }}
                        ></div>
                      </div>

                      <div className="flex justify-between text-[10px] mt-1">
                        <span>Actual {actual}%</span>
                        <span>Plan {expected}%</span>
                        <span>Fin {fin}%</span>
                      </div>
                    </td>

                    <td className="border px-2 py-1">
                      <Link href={`/project/${p.id}`} className="text-blue-600 hover:underline">
                        View →
                      </Link>
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

export default CEDashboard;

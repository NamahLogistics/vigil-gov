// pages/ee/index.tsx
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/authClient";

type RiskLevel = "low" | "medium" | "high";
type RoleKey = "JE" | "SDO" | "EE" | "SE" | "CE" | "ADMIN";

interface RoleAttendance {
  totalVisits: number;
  lastVisit: number | null;
  lastBy: string | null;
  lastVisitType: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  orgUnitPath: string;
  departmentId: string;
  sanctionedAmount: number;
  physicalPercent: number;
  financialPercent: number;
  riskLevel: RiskLevel;
  gap: number;
  attendance: Record<RoleKey, RoleAttendance>;
  expectedPhysicalPercent: number;
}

interface PackageLite {
  id: string;
  name: string;
  amount: number;
  discipline: string;
  physicalPercent?: number;
  financialPercent?: number;
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

function formatDateTime(ts: number | null | undefined) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AttCell({ att }: { att?: RoleAttendance }) {
  if (!att) return <div>-</div>;
  const lastType =
    att.lastVisitType === "site"
      ? "Site"
      : att.lastVisitType === "office"
      ? "Office"
      : "";

  return (
    <div className="leading-tight">
      <div className="font-medium text-center">{att.totalVisits}</div>
      <div className="text-[10px] text-gray-500 text-center">
        {formatDateTime(att.lastVisit)}
      </div>
      {lastType && (
        <div className="text-[10px] text-gray-400 text-center">
          {lastType}
        </div>
      )}
    </div>
  );
}

function riskBadge(risk: RiskLevel) {
  const base =
    "inline-flex items-center px-1.5 py-[1px] rounded-full text-[10px] font-medium";
  if (risk === "high") {
    return (
      <span className={`${base} bg-red-100 text-red-700`}>High risk</span>
    );
  }
  if (risk === "medium") {
    return (
      <span className={`${base} bg-amber-100 text-amber-700`}>Medium</span>
    );
  }
  return (
    <span className={`${base} bg-green-100 text-green-700`}>Low</span>
  );
}

function clampPercent(v: number | undefined | null): number {
  if (!v && v !== 0) return 0;
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

const EEDashboard: React.FC = () => {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Stage creation state (EE defines stages) ---
  const [stageProjectId, setStageProjectId] = useState<string>("");
  const [packages, setPackages] = useState<PackageLite[]>([]);
  const [stagePackageId, setStagePackageId] = useState<string>("");
  const [stages, setStages] = useState<Stage[]>([]);

  const [stageName, setStageName] = useState("");
  const [stageOrder, setStageOrder] = useState<string>("");
  const [stageWeight, setStageWeight] = useState<string>("");

  const [loadingPackages, setLoadingPackages] = useState(false);
  const [loadingStages, setLoadingStages] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [stageMessage, setStageMessage] = useState<string | null>(null);

  // LOAD PROJECTS ONLY (for EE risk dashboard + stage creation project dropdown)
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await apiFetch("/api/admin/projects-by-role");
        const data = await res.json().catch(() => ({} as any));

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load projects");
        }

        const normalized: ProjectRow[] = (data.projects || []).map((p: any) => {
          const physical = p.physicalPercent || 0;
          const financial = p.financialPercent || 0;
          const gap = physical - financial;
          const risk: RiskLevel =
            gap < -20 ? "high" : gap < -10 ? "medium" : "low";

          return {
            id: p.id,
            name: p.name,
            orgUnitPath: p.orgUnitPath || "",
            departmentId: p.departmentId || "",
            sanctionedAmount: p.sanctionedAmount || 0,
            physicalPercent: physical,
            financialPercent: financial,
            riskLevel: risk,
            gap,
            attendance: p.attendance || {},
            expectedPhysicalPercent: p.expectedPhysicalPercent || 0,
          };
        });

        setProjects(normalized);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load projects");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // When stageProjectId changes → load packages for that project
  useEffect(() => {
    if (!stageProjectId) {
      setPackages([]);
      setStagePackageId("");
      setStages([]);
      return;
    }

    (async () => {
      try {
        setStageError(null);
        setStageMessage(null);
        setLoadingPackages(true);

        const res = await apiFetch(
          `/api/packages?projectId=${encodeURIComponent(stageProjectId)}`
        );
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load packages");
        }

        setPackages(data.packages || []);
        setStagePackageId("");
        setStages([]);
      } catch (err: any) {
        console.error(err);
        setStageError(err.message || "Error loading packages");
      } finally {
        setLoadingPackages(false);
      }
    })();
  }, [stageProjectId]);

  // When package selected → load existing stages
  useEffect(() => {
    if (!stageProjectId || !stagePackageId) {
      setStages([]);
      return;
    }

    (async () => {
      try {
        setStageError(null);
        setStageMessage(null);
        setLoadingStages(true);

        const res = await apiFetch(
          `/api/stages?projectId=${encodeURIComponent(
            stageProjectId
          )}&packageId=${encodeURIComponent(stagePackageId)}`
        );
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load stages");
        }

        const list: Stage[] = (data.stages || []).slice().sort((a: Stage, b: Stage) => {
          const ao = a.order ?? 0;
          const bo = b.order ?? 0;
          return ao - bo;
        });

        setStages(list);
      } catch (err: any) {
        console.error(err);
        setStageError(err.message || "Error loading stages");
      } finally {
        setLoadingStages(false);
      }
    })();
  }, [stageProjectId, stagePackageId]);

  const totalWeight = stages.reduce(
    (sum, st) => sum + (st.weightPercent || 0),
    0
  );

  async function handleCreateStage(e: React.FormEvent) {
    e.preventDefault();
    try {
      setStageError(null);
      setStageMessage(null);

      if (!stageProjectId || !stagePackageId) {
        setStageError("Select project and package first.");
        return;
      }
      if (!stageName.trim()) {
        setStageError("Stage name is required.");
        return;
      }

      const orderNum = Number(stageOrder || "0");
      const weightNum = Number(stageWeight || "0");

      if (Number.isNaN(orderNum) || orderNum < 0) {
        setStageError("Enter a valid stage order (0 or above).");
        return;
      }
      if (Number.isNaN(weightNum) || weightNum <= 0) {
        setStageError("Enter a valid weight percentage (>0).");
        return;
      }

      setSavingStage(true);

      const res = await apiFetch("/api/ee/create-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: stageProjectId,
          packageId: stagePackageId,
          name: stageName.trim(),
          order: orderNum,
          weightPercent: weightNum,
        }),
      });

      const body = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to create stage");
      }

      const newStage: Stage | null = body.stage || null;
      if (newStage) {
        setStages((prev) =>
          [...prev, newStage].sort(
            (a, b) => (a.order ?? 0) - (b.order ?? 0)
          )
        );
      } else {
        // fallback: reload stages
        const reload = await apiFetch(
          `/api/stages?projectId=${encodeURIComponent(
            stageProjectId
          )}&packageId=${encodeURIComponent(stagePackageId)}`
        );
        const fresh = await reload.json().catch(() => ({} as any));
        if (reload.ok && fresh.stages) {
          setStages(
            fresh.stages.slice().sort((a: Stage, b: Stage) => {
              const ao = a.order ?? 0;
              const bo = b.order ?? 0;
              return ao - bo;
            })
          );
        }
      }

      setStageMessage("Stage created successfully.");
      setStageName("");
      setStageOrder("");
      setStageWeight("");
    } catch (err: any) {
      console.error(err);
      setStageError(err.message || "Error creating stage.");
    } finally {
      setSavingStage(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">EE Dashboard – My Division</h1>
          <p className="text-xs text-gray-600 mt-1">
            Summary of physical vs financial progress, plan vs actual, and
            role-wise visit attendance for all projects under your division.
          </p>
        </div>
        <Link href="/" className="text-xs px-2 py-1 border rounded">
          ← Home
        </Link>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 px-3 py-2 rounded text-xs">
          {error}
        </div>
      )}

      {/* --- PROJECT RISK VIEW --- */}
      <div className="border rounded p-3 text-xs space-y-2">
        <div className="font-medium mb-1">Project Risk View (Division)</div>

        {loading ? (
          <div className="text-xs text-gray-600">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="text-xs text-gray-500">
            No projects mapped to your EE login yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border text-[11px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border px-2 py-1 text-left">Project</th>
                  <th className="border px-2 py-1 text-right">Sanction</th>
                  <th className="border px-2 py-1 text-center">JE</th>
                  <th className="border px-2 py-1 text-center">SDO</th>
                  <th className="border px-2 py-1 text-center">EE</th>
                  <th className="border px-2 py-1 text-center">SE</th>
                  <th className="border px-2 py-1 text-center">CE</th>
                  <th className="border px-2 py-1 text-center w-64">
                    Progress Comparison
                  </th>
                  <th className="border px-2 py-1 text-left">Open</th>
                </tr>
              </thead>

              <tbody>
                {projects.map((p) => {
                  const att = p.attendance;
                  const actual = clampPercent(p.physicalPercent);
                  const expected = clampPercent(p.expectedPhysicalPercent);
                  const fin = clampPercent(p.financialPercent);

                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="border px-2 py-1 align-top">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-[10px] text-gray-500">
                          {p.departmentId}
                        </div>
                        <div className="mt-1">{riskBadge(p.riskLevel)}</div>
                      </td>

                      <td className="border px-2 py-1 text-right align-top whitespace-nowrap">
                        ₹{p.sanctionedAmount.toLocaleString("en-IN")}
                      </td>

                      {/* ATTENDANCE */}
                      <td className="border px-2 py-1 align-top">
                        <AttCell att={att.JE} />
                      </td>
                      <td className="border px-2 py-1 align-top">
                        <AttCell att={att.SDO} />
                      </td>
                      <td className="border px-2 py-1 align-top">
                        <AttCell att={att.EE} />
                      </td>
                      <td className="border px-2 py-1 align-top">
                        <AttCell att={att.SE} />
                      </td>
                      <td className="border px-2 py-1 align-top">
                        <AttCell att={att.CE} />
                      </td>

                      {/* BAR CHART */}
                      <td className="border px-2 py-1 align-top">
                        <div className="w-full bg-gray-200 h-3 rounded relative overflow-hidden">
                          <div
                            className="absolute left-0 top-0 h-3 bg-green-600 rounded"
                            style={{ width: `${actual}%` }}
                            title={`Actual ${actual}%`}
                          />
                          <div
                            className="absolute left-0 top-0 h-3 bg-blue-500 opacity-70 rounded"
                            style={{ width: `${expected}%` }}
                            title={`Planned ${expected}%`}
                          />
                          <div
                            className="absolute left-0 top-0 h-3 bg-yellow-500 opacity-60 rounded"
                            style={{ width: `${fin}%` }}
                            title={`Financial ${fin}%`}
                          />
                        </div>

                        <div className="flex justify-between text-[10px] mt-1">
                          <span>Actual: {actual}%</span>
                          <span>Plan: {expected}%</span>
                          <span>Fin: {fin}%</span>
                        </div>
                      </td>

                      <td className="border px-2 py-1 align-top">
                        <Link
                          href={`/project/${p.id}`}
                          className="text-blue-600 hover:underline"
                        >
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

      {/* --- EE STAGE DEFINITION CARD --- */}
      <div className="border rounded p-3 text-xs space-y-3">
        <div className="font-medium">EE – Define Stages for Packages</div>
        <p className="text-[11px] text-gray-600">
          Use this to define / refine the stage structure (name, order, weight%)
          for each package. JE will then report progress stage-wise; SDO will
          verify stage-wise.
        </p>

        {stageError && (
          <div className="bg-red-100 text-red-700 px-3 py-2 rounded text-[11px]">
            {stageError}
          </div>
        )}
        {stageMessage && (
          <div className="bg-green-100 text-green-700 px-3 py-2 rounded text-[11px]">
            {stageMessage}
          </div>
        )}

        {/* Project select for stage definition */}
        <div className="grid md:grid-cols-3 gap-2">
          <div>
            <label className="block text-[11px] font-medium mb-1">
              Project
            </label>
            <select
              className="border rounded px-2 py-1 w-full text-[11px]"
              value={stageProjectId}
              onChange={(e) => {
                setStageProjectId(e.target.value);
              }}
            >
              <option value="">
                {loading ? "Loading projects…" : "Select project"}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1">
              Package
            </label>
            <select
              className="border rounded px-2 py-1 w-full text-[11px]"
              value={stagePackageId}
              onChange={(e) => setStagePackageId(e.target.value)}
              disabled={!stageProjectId || loadingPackages}
            >
              <option value="">
                {!stageProjectId
                  ? "Select project first"
                  : loadingPackages
                  ? "Loading packages…"
                  : "Select package"}
              </option>
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} – ₹{pkg.amount.toLocaleString("en-IN")}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <div className="text-[11px] text-gray-500">
              Total stage weight:{" "}
              <span
                className={
                  totalWeight === 100
                    ? "font-semibold text-green-700"
                    : "font-semibold text-amber-700"
                }
              >
                {totalWeight}%
              </span>{" "}
              {totalWeight === 100
                ? ""
                : "(ideally should be 100%)"}
            </div>
          </div>
        </div>

        {/* Existing stages list */}
        {stageProjectId && stagePackageId && (
          <div className="border rounded p-2 text-[11px] space-y-1">
            <div className="font-medium">Existing stages</div>
            {loadingStages ? (
              <div className="text-gray-500">Loading stages…</div>
            ) : stages.length === 0 ? (
              <div className="text-gray-500">
                No stages defined yet for this package.
              </div>
            ) : (
              <table className="min-w-full border text-[11px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border px-1 py-1 text-left">Order</th>
                    <th className="border px-1 py-1 text-left">Stage</th>
                    <th className="border px-1 py-1 text-right">Weight%</th>
                    <th className="border px-1 py-1 text-right">JE %</th>
                    <th className="border px-1 py-1 text-right">SDO %</th>
                    <th className="border px-1 py-1 text-center">Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((st) => (
                    <tr key={st.id} className="hover:bg-gray-50">
                      <td className="border px-1 py-1">{st.order}</td>
                      <td className="border px-1 py-1">{st.name}</td>
                      <td className="border px-1 py-1 text-right">
                        {st.weightPercent}%
                      </td>
                      <td className="border px-1 py-1 text-right">
                        {(st.reportedProgressPercent ?? 0).toFixed(1)}%
                      </td>
                      <td className="border px-1 py-1 text-right">
                        {(st.verifiedProgressPercent ?? 0).toFixed(1)}%
                      </td>
                      <td className="border px-1 py-1 text-center">
                        {st.verificationSource === "site" && (
                          <span className="text-green-700 font-medium">
                            SDO – site
                          </span>
                        )}
                        {st.verificationSource === "office" && (
                          <span className="text-amber-700 font-medium">
                            SDO – office
                          </span>
                        )}
                        {!st.verificationSource ||
                          (st.verificationSource === "unknown" && (
                            <span className="text-gray-500">JE only</span>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Create new stage form */}
        <form
          onSubmit={handleCreateStage}
          className="grid md:grid-cols-4 gap-2 items-end"
        >
          <div>
            <label className="block text-[11px] font-medium mb-1">
              Stage name
            </label>
            <input
              className="border rounded px-2 py-1 w-full text-[11px]"
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
              placeholder="e.g. Excavation completed"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1">
              Order
            </label>
            <input
              type="number"
              className="border rounded px-2 py-1 w-full text-[11px]"
              value={stageOrder}
              onChange={(e) => setStageOrder(e.target.value)}
              placeholder="1, 2, 3…"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1">
              Weight %
            </label>
            <input
              type="number"
              className="border rounded px-2 py-1 w-full text-[11px]"
              value={stageWeight}
              onChange={(e) => setStageWeight(e.target.value)}
              placeholder="e.g. 10"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={
                savingStage ||
                !stageProjectId ||
                !stagePackageId ||
                !stageName.trim()
              }
              className="bg-green-600 text-white px-3 py-1 rounded text-[11px] w-full disabled:opacity-50"
            >
              {savingStage ? "Saving…" : "Add stage"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EEDashboard;

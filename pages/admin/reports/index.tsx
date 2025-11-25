// pages/admin/reports/index.tsx
// PRINCIPAL SECRETARY – STATE/ZONE REVIEW DASHBOARD
// - Zone filter
// - Sort control
// - High-risk / delayed / overspend blocks
// - PS Watchlist (bookmark)
// - Download PS Remarks PDF (watchlisted projects)

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/authClient";

type RiskLevel = "low" | "medium" | "high";
type RoleKey = "JE" | "SDO" | "EE" | "SE" | "CE";

interface RoleAttendance {
  totalVisits: number;
  lastVisit: number | null;
}

interface ProjectRow {
  id: string;
  name: string;
  sanctionedAmount: number;
  physicalPercent: number;
  financialPercent: number;
  expectedPhysicalPercent: number;
  agreementStartDate?: number;
  agreementEndDate?: number;
  expectedCompletionDate?: number;
  actualCompletionDate?: number;
  orgUnitPath: string;
  zoneName: string;
  attendance: Record<RoleKey, RoleAttendance>;
  gap: number;
  risk: RiskLevel;
}

type SortKey =
  | "physicalDesc"
  | "risk"
  | "gapWorst"
  | "financialDesc"
  | "sanctionDesc";

// -------------------------------------------------
// Helpers
// -------------------------------------------------
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

// orgUnitPath: "STATE / Zone X / Circle Y / Division Z"
function extractZone(path: string): string {
  if (!path) return "Unknown";
  const parts = path
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return "Unknown";
}

// PS ko reason dikhane ke liye
function getRiskReasons(p: ProjectRow): string[] {
  const r: string[] = [];

  const physical = p.physicalPercent || 0;
  const financial = p.financialPercent || 0;
  const expected = p.expectedPhysicalPercent || 0;
  const gapPF = physical - financial;

  const now = Date.now();
  const expectedDate = p.expectedCompletionDate || null;
  const isDelayed =
    expectedDate && now > expectedDate && physical < 100;

  const je = p.attendance?.JE;
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const noRecentJE =
    !je || !je.lastVisit || now - je.lastVisit > THIRTY_DAYS;

  const behindPlan = physical < expected - 10;

  if (gapPF < -5)
    r.push(`Financial ahead of physical by ${Math.abs(Math.round(gapPF))}%`);

  if (behindPlan)
    r.push(
      `Physical ${Math.round(physical)}% vs Plan ${Math.round(
        expected
      )}% (behind plan)`
    );

  if (isDelayed)
    r.push(`Past expected completion (due ${formatDate(expectedDate)})`);

  if (noRecentJE) r.push("No JE site visit in last 30 days");

  if (r.length === 0) r.push("Within normal tolerance");

  return r;
}

// -------------------------------------------------
// Main component
// -------------------------------------------------
const PSReports: React.FC = () => {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<SortKey>("physicalDesc");

  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  // Load projects
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await apiFetch("/api/admin/projects");
        const data = await res.json();

        const normalized: ProjectRow[] = (data.projects || []).map(
          (p: any) => {
            const gap = (p.physicalPercent || 0) - (p.financialPercent || 0);
            const risk: RiskLevel =
              gap < -15 ? "high" : gap < -5 ? "medium" : "low";

            const orgUnitPath: string = p.orgUnitPath || "";
            const zoneName = extractZone(orgUnitPath);

            return {
              id: p.id,
              name: p.name,
              sanctionedAmount: p.sanctionedAmount || 0,
              physicalPercent: p.physicalPercent || 0,
              financialPercent: p.financialPercent || 0,
              expectedPhysicalPercent: p.expectedPhysicalPercent || 0,
              agreementStartDate: p.agreementStartDate,
              agreementEndDate: p.agreementEndDate,
              expectedCompletionDate: p.expectedCompletionDate,
              actualCompletionDate: p.actualCompletionDate,
              orgUnitPath,
              zoneName,
              attendance: p.attendance || {},
              gap,
              risk,
            };
          }
        );

        setProjects(normalized);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load watchlist from /api/me
  useEffect(() => {
    (async () => {
      try {
        setWatchlistLoading(true);
        const res = await apiFetch("/api/me");
        const data = await res.json();
        const list: string[] =
          data.user?.psWatchlist || data.psWatchlist || [];
        setWatchlistIds(list);
      } catch (err) {
        console.error("Failed to load watchlist", err);
      } finally {
        setWatchlistLoading(false);
      }
    })();
  }, []);

  async function toggleWatch(projectId: string) {
    try {
      const isWatched = watchlistIds.includes(projectId);
      const res = await apiFetch("/api/admin/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          action: isWatched ? "remove" : "add",
        }),
      });
      const data = await res.json();
      const list: string[] =
        data.psWatchlist || data.watchlist || [];
      setWatchlistIds(list);
    } catch (err) {
      console.error("Failed to toggle watchlist", err);
    }
  }

  const zones = useMemo(() => {
    const s = new Set<string>();
    projects.forEach((p) => {
      if (p.zoneName) s.add(p.zoneName);
    });
    return Array.from(s).sort();
  }, [projects]);

  const scopedProjects = useMemo(() => {
    if (selectedZone === "ALL") return projects;
    return projects.filter((p) => p.zoneName === selectedZone);
  }, [projects, selectedZone]);

  const watchlistProjects = useMemo(
    () =>
      scopedProjects.filter((p) =>
        watchlistIds.includes(p.id)
      ),
    [scopedProjects, watchlistIds]
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-4">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    );
  }

  // --------------------------------------------------------
  // SUMMARY (based on scopedProjects = State OR Zone)
  // --------------------------------------------------------
  const totalAmount = scopedProjects.reduce(
    (s, p) => s + p.sanctionedAmount,
    0
  );

  const weightedPhysical =
    totalAmount === 0
      ? 0
      : Math.round(
          scopedProjects.reduce(
            (s, p) =>
              s +
              (p.physicalPercent * p.sanctionedAmount) / totalAmount,
            0
          )
        );

  const weightedFinancial =
    totalAmount === 0
      ? 0
      : Math.round(
          scopedProjects.reduce(
            (s, p) =>
              s +
              (p.financialPercent * p.sanctionedAmount) / totalAmount,
            0
          )
        );

  const high = scopedProjects.filter((p) => p.risk === "high");
  const medium = scopedProjects.filter((p) => p.risk === "medium");
  const low = scopedProjects.filter((p) => p.risk === "low");

  const delayed = scopedProjects.filter((p) => {
    const now = Date.now();
    return (
      p.expectedCompletionDate &&
      now > p.expectedCompletionDate &&
      p.physicalPercent < 100
    );
  });

  const overspend = scopedProjects
    .filter((p) => p.gap < -10)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 5);

  const behindPlan = scopedProjects
    .filter(
      (p) => p.physicalPercent < p.expectedPhysicalPercent - 10
    )
    .sort(
      (a, b) =>
        (a.physicalPercent - a.expectedPhysicalPercent) -
        (b.physicalPercent - b.expectedPhysicalPercent)
    )
    .slice(0, 5);

  const noJEVisit = scopedProjects
    .filter((p) => {
      const je = p.attendance?.JE;
      if (!je || !je.lastVisit) return true;
      const THIRTY = 30 * 24 * 60 * 60 * 1000;
      return Date.now() - je.lastVisit > THIRTY;
    })
    .slice(0, 5);

  const aheadProjects = scopedProjects
    .filter(
      (p) => p.physicalPercent > p.expectedPhysicalPercent + 8
    )
    .sort(
      (a, b) =>
        (b.physicalPercent - b.expectedPhysicalPercent) -
        (a.physicalPercent - a.expectedPhysicalPercent)
    )
    .slice(0, 5);

  function handleDownloadPdf() {
    // Watchlist-based PS remarks PDF
    window.open("/api/admin/ps-notes-pdf", "_blank");
  }

  // --------------------------------------------------------
  // UI
  // --------------------------------------------------------
  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      {/* HEADER + FILTERS */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            State Performance Dashboard
          </h1>
          <div className="text-[11px] text-gray-500">
            Scope:{" "}
            {selectedZone === "ALL"
              ? "All Zones"
              : `Zone – ${selectedZone}`}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {/* Zone filter */}
          <div>
            <label className="block text-[11px] text-gray-600 mb-1">
              Zone
            </label>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            >
              <option value="ALL">All zones</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>

          {/* Sort control – applies to main table */}
          <div>
            <label className="block text-[11px] text-gray-600 mb-1">
              Sort table by
            </label>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as SortKey)
              }
              className="border rounded px-2 py-1 text-xs"
            >
              <option value="physicalDesc">
                Physical % (High → Low)
              </option>
              <option value="risk">Risk (High → Low)</option>
              <option value="gapWorst">
                Gap (Worst mismatch first)
              </option>
              <option value="financialDesc">
                Financial % (High → Low)
              </option>
              <option value="sanctionDesc">
                Sanction (High → Low)
              </option>
            </select>
          </div>

          <button
            onClick={handleDownloadPdf}
            className="bg-purple-600 text-white px-3 py-1 rounded text-xs h-fit mt-5 md:mt-0"
            disabled={watchlistLoading || watchlistIds.length === 0}
            title={
              watchlistIds.length === 0
                ? "Add some projects to watchlist first"
                : "Download meeting remarks PDF for watchlisted projects"
            }
          >
            ⬇ Meeting Remarks PDF
          </button>

          <Link
            href="/"
            className="border px-2 py-1 rounded text-xs h-fit mt-5 md:mt-0"
          >
            ← Home
          </Link>
        </div>
      </div>

      {/* WATCHLIST BLOCK (only if any) */}
      {watchlistProjects.length > 0 && (
        <WatchlistBlock
          projects={watchlistProjects}
          onToggleWatch={toggleWatch}
        />
      )}

      {/* HERO SUMMARY BLOCK (Zone / State scoped) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="bg-white shadow p-4 rounded border">
          <div className="text-gray-500 text-xs">
            {selectedZone === "ALL" ? "State" : "Zone"} Physical
          </div>
          <div className="text-2xl font-semibold">
            {weightedPhysical}%
          </div>
        </div>

        <div className="bg-white shadow p-4 rounded border">
          <div className="text-gray-500 text-xs">
            {selectedZone === "ALL" ? "State" : "Zone"} Financial
          </div>
          <div className="text-2xl font-semibold">
            {weightedFinancial}%
          </div>
        </div>

        <div className="bg-white shadow p-4 rounded border">
          <div className="text-gray-500 text-xs">
            Projects in scope
          </div>
          <div className="text-2xl font-semibold">
            {scopedProjects.length}
          </div>
        </div>

        <div className="bg-white shadow p-4 rounded border">
          <div className="text-gray-500 text-xs">
            High / Medium / Low Risk
          </div>
          <div className="text-lg font-semibold">
            {high.length} / {medium.length} / {low.length}
          </div>
        </div>
      </div>

      {/* TOP 5 CASES — REVIEW MEETING BLOCK (Zone-scoped) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CaseBlock
          title="🔥 High Risk Projects"
          items={high.slice(0, 5)}
        />
        <CaseBlock
          title="⏳ Delayed Projects"
          items={delayed.slice(0, 5)}
        />
        <CaseBlock title="⚠️ Overspend (Fin > Phys)" items={overspend} />
        <CaseBlock
          title="📉 Behind Plan (>10% gap)"
          items={behindPlan}
        />
        <CaseBlock
          title="🚫 No JE Visits (30 days)"
          items={noJEVisit}
        />
        <CaseBlock
          title="🏆 Ahead of Plan"
          items={aheadProjects}
        />
      </div>

      {/* FULL TABLE (Zone-scoped + Sortable + Watch toggle) */}
      <ProjectTable
        projects={scopedProjects}
        sortBy={sortBy}
        watchlistIds={watchlistIds}
        onToggleWatch={toggleWatch}
      />
    </div>
  );
};

export default PSReports;

// ------------------------------------------------------
// SMALL COMPONENTS
// ------------------------------------------------------
const CaseBlock = ({
  title,
  items,
}: {
  title: string;
  items: ProjectRow[];
}) => {
  return (
    <div className="bg-white p-3 border rounded shadow text-xs">
      <div className="font-semibold mb-2">{title}</div>

      {items.length === 0 && (
        <div className="text-gray-400 text-[11px]">None</div>
      )}

      {items.map((p) => {
        const rs = getRiskReasons(p);
        return (
          <div
            key={p.id}
            className="border-b last:border-b-0 py-1 space-y-0.5"
          >
            <div className="font-medium text-[11px]">{p.name}</div>
            <div className="text-[10px] text-gray-600">
              Phys {p.physicalPercent}% · Fin {p.financialPercent}% ·
              Gap {Math.round(p.gap)}%
            </div>
            <div className="text-[10px] text-red-700">
              • {rs[0]}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const WatchlistBlock = ({
  projects,
  onToggleWatch,
}: {
  projects: ProjectRow[];
  onToggleWatch: (id: string) => void;
}) => {
  return (
    <div className="border rounded p-3 bg-yellow-50 text-xs">
      <div className="flex justify-between items-center mb-1">
        <div className="font-semibold">
          ⭐ Watchlist Projects (for next review)
        </div>
        <div className="text-[10px] text-gray-600">
          These will be included in the meeting Remarks PDF.
        </div>
      </div>
      {projects.map((p) => (
        <div
          key={p.id}
          className="flex justify-between items-center border-b last:border-b-0 py-1"
        >
          <div>
            <div className="font-medium text-[11px]">{p.name}</div>
            <div className="text-[10px] text-gray-600">
              Phys {p.physicalPercent}% · Fin {p.financialPercent}% ·
              Gap {Math.round(p.gap)}%
            </div>
          </div>
          <button
            onClick={() => onToggleWatch(p.id)}
            className="text-xs px-2 py-1 border rounded bg-white"
          >
            ✕ Remove
          </button>
        </div>
      ))}
    </div>
  );
};

const ProjectTable = ({
  projects,
  sortBy,
  watchlistIds,
  onToggleWatch,
}: {
  projects: ProjectRow[];
  sortBy: SortKey;
  watchlistIds: string[];
  onToggleWatch: (id: string) => void;
}) => {
  const riskColor: Record<RiskLevel, string> = {
    high: "bg-red-600 text-white",
    medium: "bg-yellow-500 text-black",
    low: "bg-green-600 text-white",
  };

  const rows = useMemo(() => {
    const arr = [...projects];
    arr.sort((a, b) => {
      switch (sortBy) {
        case "physicalDesc":
          return b.physicalPercent - a.physicalPercent;
        case "financialDesc":
          return b.financialPercent - a.financialPercent;
        case "sanctionDesc":
          return b.sanctionedAmount - a.sanctionedAmount;
        case "gapWorst":
          // biggest |gap| first, overspend (negative) thoda priority
          const aScore = Math.abs(a.gap) + (a.gap < 0 ? 5 : 0);
          const bScore = Math.abs(b.gap) + (b.gap < 0 ? 5 : 0);
          return bScore - aScore;
        case "risk":
          const order: Record<RiskLevel, number> = {
            high: 0,
            medium: 1,
            low: 2,
          };
          if (order[a.risk] !== order[b.risk]) {
            return order[a.risk] - order[b.risk];
          }
          return Math.abs(b.gap) - Math.abs(a.gap);
        default:
          return 0;
      }
    });
    return arr;
  }, [projects, sortBy]);

  return (
    <div className="border rounded p-3 text-xs">
      <div className="font-semibold mb-2">
        Projects in Scope (sorted)
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border text-[11px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="border px-2 py-1 text-left">Project</th>
              <th className="border px-2 py-1 text-left">Zone</th>
              <th className="border px-2 py-1 text-right">Sanction</th>
              <th className="border px-2 py-1 text-center">JE</th>
              <th className="border px-2 py-1 text-center">SDO</th>
              <th className="border px-2 py-1 text-center">EE</th>
              <th className="border px-2 py-1 text-center">SE</th>
              <th className="border px-2 py-1 text-center">CE</th>
              <th className="border px-2 py-1 text-center w-64">
                Progress
              </th>
              <th className="border px-2 py-1 text-center">
                Watch
              </th>
              <th className="border px-2 py-1">Open</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((p) => {
              const watched = watchlistIds.includes(p.id);
              const aJE = p.attendance?.JE;

              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  {/* NAME + RISK */}
                  <td className="border px-2 py-1 align-top">
                    <div className="font-semibold">{p.name}</div>
                    <div
                      className={`inline-block mt-1 px-2 py-[1px] rounded-full text-[10px] ${riskColor[p.risk]}`}
                    >
                      {p.risk.toUpperCase()} • Gap{" "}
                      {Math.round(p.gap)}%
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {p.orgUnitPath}
                    </div>
                  </td>

                  {/* ZONE */}
                  <td className="border px-2 py-1 align-top text-[10px] text-gray-600">
                    {p.zoneName || "-"}
                  </td>

                  {/* SANCTION */}
                  <td className="border px-2 py-1 text-right align-top">
                    ₹{p.sanctionedAmount.toLocaleString("en-IN")}
                  </td>

                  {/* ATTENDANCE */}
                  {(["JE", "SDO", "EE", "SE", "CE"] as RoleKey[]).map(
                    (rk) => {
                      const a = p.attendance?.[rk];
                      return (
                        <td
                          key={rk}
                          className="border px-2 py-1 text-center text-[10px] align-top"
                        >
                          <div>{a?.totalVisits ?? 0}</div>
                          <div className="text-gray-500">
                            {formatDateTime(a?.lastVisit)}
                          </div>
                        </td>
                      );
                    }
                  )}

                  {/* PROGRESS BARS */}
                  <td className="border px-2 py-1 align-top">
                    <div className="relative bg-gray-200 h-3 rounded w-full">
                      <div
                        className="absolute bg-green-600 h-3 rounded"
                        style={{
                          width: `${p.physicalPercent}%`,
                        }}
                      ></div>
                      <div
                        className="absolute bg-blue-600 h-3 opacity-70 rounded"
                        style={{
                          width: `${p.expectedPhysicalPercent}%`,
                        }}
                      ></div>
                      <div
                        className="absolute bg-yellow-500 h-3 opacity-70 rounded"
                        style={{
                          width: `${p.financialPercent}%`,
                        }}
                      ></div>
                    </div>
                  </td>

                  {/* WATCH */}
                  <td className="border px-2 py-1 text-center align-top">
                    <button
                      onClick={() => onToggleWatch(p.id)}
                      className="text-lg"
                      title={
                        watched
                          ? "Remove from watchlist"
                          : "Add to watchlist"
                      }
                    >
                      {watched ? "⭐" : "☆"}
                    </button>
                  </td>

                  {/* OPEN */}
                  <td className="border px-2 py-1 align-top">
                    <Link
                      href={`/project/${p.id}`}
                      className="text-blue-600 underline"
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
    </div>
  );
};
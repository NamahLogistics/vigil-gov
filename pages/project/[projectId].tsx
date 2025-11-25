// pages/project/[projectId].tsx
import { PSNotesPanel } from "@/components/PSNotesPanel";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { apiFetch } from "@/lib/authClient";

type UserRole = "JE" | "FE" | "SDO" | "EE" | "SE" | "CE" | "ADMIN";

interface Project {
  id: string;
  name: string;
  departmentId: string;
  orgUnitPath: string;
  sanctionedAmount: number;
  physicalPercent: number;
  financialPercent: number;
  riskLevel?: "low" | "medium" | "high";

  // timeline...
  dateOfStartAgreement: number | null;
  dateOfCompletionAgreement: number | null;
  expectedCompletion: number | null;
  actualCompletion: number | null;

  // location
  lat: number | null;
  lng: number | null;

  // NEW
  projectType?: "POINT" | "LINEAR";
  siteCenter?: { lat: number; lng: number } | null;
  siteRadiusMeters?: number | null;
  routePoints?: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    km?: number;
    active?: boolean;
  }[];
}


interface Package {
  id: string;
  name: string;
  amount: number;
  discipline: string;
  ownerJeId: string;
  physicalPercent: number;
  financialPercent: number;
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

interface Payment {
  id: string;
  billNo: string;
  billDate: number;
  amount: number;
  createdBy: string;
}

interface AttendanceRow {
  userId: string;
  totalVisits: number;
  verifiedVisits: number;
  lastVisitAt: number | null;
}

interface UserStub {
  id: string;
  name: string;
  role: UserRole;
  phone?: string;
}

interface ProgressEvent {
  id: string;
  eventType: string;
  projectId: string;
  packageId: string;
  stageId: string;
  createdBy: string;
  createdAt: number;
  note?: string;
  zone?: string;
  photoUrls?: string[];
  reportedProgressPercent: number;

  // AI fields
  aiDiscipline?: string;
  aiDetectedStage?: string;
  sequenceOk?: boolean;
  missingStages?: string[];
  fakePhoto?: boolean;
  realism?: number;
  riskScore?: number;
  aiSummary?: string;

  // JE comment
  jeComment?: string;
  jeCommentUpdatedAt?: number;

  // SDO verification
  sdoComment?: string;
  sdoVerifiedPercent?: number;
  sdoVerifiedAt?: number;
  sdoVerifiedBy?: string;
  verificationSource?: "site" | "office" | "unknown";
}

interface DashboardResponse {
  ok: boolean;
  project: Project;
  packages: Package[];
  stagesByPackage?: Record<string, Stage[]>;
  payments: Payment[];
  totalPaid: number;
  attendance: AttendanceRow[];
  userDetails: Record<string, UserStub>;

  events?: ProgressEvent[];
  currentUser?: UserStub;
}

function formatDate(ts: number | null | undefined) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(ts: number | null | undefined) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ----------------------------
// Child component: one package card with stage creation
// ----------------------------
interface PackageCardProps {
  pkg: Package;
  stages: Stage[];
  currentUser?: UserStub;
  projectId: string;
  onStageCreated?: () => Promise<void> | void;
  onSelectStage?: (payload: { packageId: string; stage: Stage }) => void;
}

const PackageCard: React.FC<PackageCardProps> = ({
  pkg,
  stages,
  currentUser,
  projectId,
  onStageCreated,
  onSelectStage,
}) => {
  const [newStageName, setNewStageName] = useState("");
  const [newStageWeight, setNewStageWeight] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingCreate, setLoadingCreate] = useState(false);

  const currentTotalWeight = stages.reduce(
    (acc, s) => acc + (s.weightPercent || 0),
    0
  );

  const nextOrder =
    stages.length > 0 ? Math.max(...stages.map((s) => s.order)) + 1 : 1;

  async function handleCreateStage() {
    setErrorMsg("");

    const weight = Number(newStageWeight);
    if (!newStageName.trim()) {
      setErrorMsg("Stage name is required.");
      return;
    }
    if (!weight || weight <= 0) {
      setErrorMsg("Weight must be greater than 0.");
      return;
    }

    if (currentTotalWeight + weight > 100) {
      setErrorMsg(
        `Total weight cannot exceed 100%. Current = ${currentTotalWeight}%.`
      );
      return;
    }

    try {
      setLoadingCreate(true);

      const res = await apiFetch("/api/ee/create-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          packageId: pkg.id,
          name: newStageName,
          order: nextOrder,
          weightPercent: weight,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create stage");

      // Refresh entire dashboard cleanly
      if (onStageCreated) {
        await onStageCreated();
      }

      setNewStageName("");
      setNewStageWeight("");
    } catch (err: any) {
      setErrorMsg(err.message || "Error creating stage");
    } finally {
      setLoadingCreate(false);
    }
  }

  return (
    <div
      className="border rounded p-3 mb-4 text-xs bg-white shadow-sm"
      key={pkg.id}
    >
      <div className="font-medium text-sm mb-2">
        Package: {pkg.name} (₹{pkg.amount.toLocaleString("en-IN")})
      </div>

      {/* EE-ONLY STAGE CREATION FORM */}
      {currentUser?.role === "EE" && (
        <div className="p-3 border rounded bg-gray-50 mb-3">
          <div className="font-semibold mb-2">Add Stage</div>

          {errorMsg && (
            <div className="bg-red-100 text-red-700 px-2 py-1 rounded mb-2">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block mb-1 text-[11px]">
                Stage Name (clear description)
              </label>
              <input
                className="border rounded px-2 py-1 w-full text-xs"
                placeholder="e.g. Excavation, Brickwork..."
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
              />
            </div>

            <div>
              <label className="block mb-1 text-[11px]">Order (auto)</label>
              <input
                className="border rounded px-2 py-1 w-full text-xs bg-gray-100"
                value={nextOrder}
                readOnly
              />
            </div>

            <div>
              <label className="block mb-1 text-[11px]">
                Weight (%) – must total 100
              </label>
              <input
                type="number"
                className="border rounded px-2 py-1 w-full text-xs"
                placeholder="e.g. 10"
                value={newStageWeight}
                onChange={(e) => setNewStageWeight(e.target.value)}
              />
            </div>
          </div>

          <div className="text-[10px] text-gray-600 mt-1">
            Current total: {currentTotalWeight}% &nbsp;|&nbsp; Remaining:{" "}
            {100 - currentTotalWeight}%
          </div>

          <button
            onClick={handleCreateStage}
            disabled={loadingCreate}
            className="mt-2 bg-blue-600 text-white px-3 py-1 rounded text-xs disabled:opacity-50"
          >
            {loadingCreate ? "Saving..." : "Create Stage"}
          </button>
        </div>
      )}

      {/* STAGE LIST */}
      <div className="font-semibold mb-1">Stages</div>
      <div className="overflow-x-auto">
        <table className="min-w-full border text-[11px]">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1">Order</th>
              <th className="border px-2 py-1">Name</th>
              <th className="border px-2 py-1">Weight</th>
              <th className="border px-2 py-1">Reported</th>
              <th className="border px-2 py-1">Verified</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((st) => (
              <tr
                key={st.id}
                className="cursor-pointer hover:bg-blue-50"
                onClick={() =>
                  onSelectStage && onSelectStage({ packageId: pkg.id, stage: st })
                }
              >
                <td className="border px-2 py-1">{st.order}</td>
                <td className="border px-2 py-1">{st.name}</td>
                <td className="border px-2 py-1">{st.weightPercent}%</td>
                <td className="border px-2 py-1">
                  {st.reportedProgressPercent ?? "-"}%
                </td>
                <td className="border px-2 py-1">
                  {st.verifiedProgressPercent ?? "-"}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ----------------------------
// MAIN PAGE
// ----------------------------
const ProjectPage: React.FC = () => {
  const router = useRouter();
  const { projectId } = router.query;

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stage detail
  const [selectedStage, setSelectedStage] = useState<{
    packageId: string;
    stage: Stage;
  } | null>(null);

  // Drafts for comments / verification
  const [jeCommentDrafts, setJeCommentDrafts] = useState<
    Record<string, string>
  >({});
  const [sdoCommentDrafts, setSdoCommentDrafts] = useState<
    Record<string, string>
  >({});
  const [sdoPercentDrafts, setSdoPercentDrafts] = useState<
    Record<string, string>
  >({});

  const [savingJeForEvent, setSavingJeForEvent] = useState<string | null>(null);
  const [savingSdoForEvent, setSavingSdoForEvent] = useState<string | null>(
    null
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
    // Payment form state
  const [newPayment, setNewPayment] = useState({
    packageId: "",
    billNo: "",
    billDate: "",
    amount: "",
  });
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
    if (!projectId || typeof projectId !== "string") return;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setActionError(null);
        setActionSuccess(null);

        const res = await apiFetch(
          `/api/projectDashboard?projectId=${encodeURIComponent(projectId)}`
        );
        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(body.error || "Failed to load project dashboard");
        }

        setData(body as DashboardResponse);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Error loading project");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  const project = data?.project;
  const packages = data?.packages || [];
  const stagesByPackage = data?.stagesByPackage || {};
  const payments = data?.payments || [];
  const totalPaid = data?.totalPaid || 0;
  const attendance = data?.attendance || [];
  const userDetails = data?.userDetails || {};
  const events = data?.events || [];
  const currentUser = data?.currentUser;
  const currentRole = currentUser?.role;

  const gap =
    (project?.physicalPercent || 0) - (project?.financialPercent || 0);

  let risk: "low" | "medium" | "high" = project?.riskLevel || "low";
  if (!project?.riskLevel) {
    if (gap < -20) risk = "high";
    else if (gap < -10) risk = "medium";
  }

  const paidPercent =
    project && project.sanctionedAmount > 0
      ? (totalPaid / project.sanctionedAmount) * 100
      : 0;

  const canJeComment = currentRole === "JE" || currentRole === "FE";
  const canSdoVerify = currentRole === "SDO";

  // Events for selected stage (latest first)
  const selectedStageEvents: ProgressEvent[] =
    selectedStage && events.length > 0
      ? events
          .filter(
            (e) =>
              e.packageId === selectedStage.packageId &&
              e.stageId === selectedStage.stage.id &&
              e.eventType === "progress"
          )
          .sort((a, b) => b.createdAt - a.createdAt)
      : [];

  const getUserLabel = (userId: string) => {
    const u = userDetails[userId];
    return u ? `${u.name} (${u.role})` : userId;
  };

  // ----------------------------
  // JE comment save
  // ----------------------------
  const handleSaveJeComment = async (evt: ProgressEvent, comment: string) => {
    if (!projectId || typeof projectId !== "string") return;

    try {
      setActionError(null);
      setActionSuccess(null);
      setSavingJeForEvent(evt.id);

      const res = await apiFetch("/api/je/comment-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          eventId: evt.id,
          jeComment: comment,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to save JE comment");
      }

      setData((prev) => {
        if (!prev) return prev;
        const prevEvents = prev.events || [];
        const nextEvents = prevEvents.map((e) =>
          e.id === evt.id ? { ...e, jeComment: comment } : e
        );
        return { ...prev, events: nextEvents };
      });

      setActionSuccess("JE comment saved.");
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || "Error saving JE comment");
    } finally {
      setSavingJeForEvent(null);
    }
  };

  // ----------------------------
  // SDO verify + comment save
  // ----------------------------
  const handleSaveSdoVerification = async (
    evt: ProgressEvent,
    percentStr: string,
    comment: string
  ) => {
    if (!projectId || typeof projectId !== "string") return;

    const pct = Number(percentStr);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      setActionError("Please enter a valid % between 0 and 100.");
      return;
    }

    try {
      setActionError(null);
      setActionSuccess(null);
      setSavingSdoForEvent(evt.id);

      const res = await apiFetch("/api/sdo/verify-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          packageId: evt.packageId,
          stageId: evt.stageId,
          eventId: evt.id,
          percent: pct,
          sdoComment: comment,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to verify stage");
      }

      const verificationSource =
        (body.verificationSource as ProgressEvent["verificationSource"]) ||
        evt.verificationSource ||
        "office";

      setData((prev) => {
        if (!prev) return prev;

        const prevEvents = prev.events || [];
        const nextEvents = prevEvents.map((e) =>
          e.id === evt.id
            ? {
                ...e,
                sdoVerifiedPercent: pct,
                sdoComment: comment,
                verificationSource,
                sdoVerifiedAt: Date.now(),
              }
            : e
        );

        const prevStagesByPackage = prev.stagesByPackage || {};
        const pkgStages = prevStagesByPackage[evt.packageId] || [];
        const nextPkgStages = pkgStages.map((st) =>
          st.id === evt.stageId
            ? {
                ...st,
                verifiedProgressPercent: pct,
                verificationSource,
              }
            : st
        );

        return {
          ...prev,
          events: nextEvents,
          stagesByPackage: {
            ...prevStagesByPackage,
            [evt.packageId]: nextPkgStages,
          },
        };
      });

      setActionSuccess("SDO verification saved.");
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || "Error saving SDO verification");
    } finally {
      setSavingSdoForEvent(null);
    }
  };

  // ----------------------------
  // Timeline bars
  // ----------------------------
  const start = project?.dateOfStartAgreement || 0;
  const end = project?.dateOfCompletionAgreement || 0;
  const expected = project?.expectedCompletion || 0;
  const actual = project?.actualCompletion || null;

  const totalDuration = end && start && end > start ? end - start : 1;

  const expectedPct =
    expected && start
      ? Math.min(100, Math.max(0, ((expected - start) / totalDuration) * 100))
      : 0;

  const actualPct =
    actual && start
      ? Math.min(100, Math.max(0, ((actual - start) / totalDuration) * 100))
      : null;

        // ----------------------------
  // Add Payment (EE / ADMIN only)
  // ----------------------------
  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;

    setActionError(null);
    setActionSuccess(null);

    const amountNum = Number(newPayment.amount || 0);
    if (!newPayment.billNo.trim() || !newPayment.billDate || !amountNum) {
      setActionError("Bill no, bill date & amount are required.");
      return;
    }

    try {
      setSavingPayment(true);

      const res = await apiFetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          packageId: newPayment.packageId || undefined, // optional
          billNo: newPayment.billNo,
          billDate: newPayment.billDate, // "YYYY-MM-DD" chalega
          amount: amountNum,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to add payment");
      }

      // Dashboard ko fresh data ke saath reload karo
      await reloadDashboard();

      setNewPayment({
        packageId: "",
        billNo: "",
        billDate: "",
        amount: "",
      });
      setActionSuccess("Payment added successfully.");
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || "Error adding payment");
    } finally {
      setSavingPayment(false);
    }
  }


  // ----------------------------
  // Reload dashboard (for EE stage add, etc.)
  // ----------------------------

  async function reloadDashboard() {
    if (!projectId || typeof projectId !== "string") return;

    try {
      setLoading(true);
      setError(null);
      setActionError(null);
      setActionSuccess(null);

      const res = await apiFetch(
        `/api/projectDashboard?projectId=${encodeURIComponent(projectId)}`
      );
      const body = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(body.error || "Failed to reload project");

      setData(body as DashboardResponse);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error reloading project");
    } finally {
      setLoading(false);
    }
  }

  // ----------------------------
  // RENDER
  // ----------------------------
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">
            Project Details – {project?.name || ""}
          </h1>
          {project && (
            <p className="text-xs text-gray-600">
              Dept: <span className="font-medium">{project.departmentId}</span>{" "}
              · Org: <span className="font-mono">{project.orgUnitPath}</span>
            </p>
          )}
          {project && (
  <div className="mt-1 flex flex-wrap items-center gap-2">
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-[2px] text-[10px] font-medium text-gray-700">
      {project.projectType === "LINEAR"
        ? "Linear project (route based attendance)"
        : "Point project (single site attendance)"}
    </span>

    {project.projectType === "LINEAR" &&
      typeof project.siteRadiusMeters === "number" && (
        <span className="text-[10px] text-gray-500">
          Corridor radius ≈ {project.siteRadiusMeters} m
        </span>
      )}
  </div>
)}

        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
        >
          ← Back
        </button>
      </div>

      {loading && (
        <div className="text-sm text-gray-500">Loading project…</div>
      )}
      {error && (
        <div className="bg-red-100 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}
      {!loading && !project && !error && (
        <div className="text-sm text-gray-500">Project not found.</div>
      )}

      {project && (
        <>
          {/* TIMELINE CARD */}
          <div className="border rounded p-3 text-xs space-y-2 bg-white">
            <div className="font-semibold">Project Timeline</div>

            <div className="grid sm:grid-cols-2 gap-2">
              <div>
                <div className="text-gray-500">Start (Agreement)</div>
                <div className="font-medium">
                  {formatDate(project.dateOfStartAgreement)}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Completion (Agreement)</div>
                <div className="font-medium">
                  {formatDate(project.dateOfCompletionAgreement)}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Expected by EE</div>
                <div className="font-medium">
                  {formatDate(project.expectedCompletion)}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Actual Completion</div>
                <div className="font-medium">
                  {project.actualCompletion
                    ? formatDate(project.actualCompletion)
                    : "—"}
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <div className="text-[11px] text-gray-600">
                Agreement vs Expected
              </div>
              <div className="w-full h-3 bg-gray-200 rounded relative overflow-hidden">
                <div
                  className="h-3 bg-blue-500 rounded"
                  style={{ width: `${expectedPct}%` }}
                />
              </div>

              {actualPct !== null && (
                <>
                  <div className="text-[11px] text-gray-600">
                    Actual Completion
                  </div>
                  <div className="w-full h-3 bg-gray-200 rounded relative overflow-hidden">
                    <div
                      className="h-3 bg-green-600 rounded"
                      style={{ width: `${actualPct}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Top summary cards */}
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div className="border rounded p-3">
              <div className="text-xs text-gray-500">Physical vs Financial</div>
              <div className="mt-1">
                <div className="flex justify-between">
                  <span>Physical</span>
                  <span className="font-semibold">
                    {project.physicalPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Financial</span>
                  <span className="font-semibold">
                    {project.financialPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between mt-1 text-xs">
                  <span>Gap (Phy − Fin)</span>
                  <span
                    className={
                      gap < -20
                        ? "text-red-700 font-semibold"
                        : gap < -10
                        ? "text-yellow-700 font-semibold"
                        : "text-gray-700"
                    }
                  >
                    {gap.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1 text-xs">
                  Risk:{" "}
                  <span
                    className={
                      risk === "high"
                        ? "text-red-700 font-semibold"
                        : risk === "medium"
                        ? "text-yellow-700 font-semibold"
                        : "text-green-700 font-semibold"
                    }
                  >
                    {risk.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            <div className="border rounded p-3">
              <div className="text-xs text-gray-500">Sanction & Payments</div>
              <div className="mt-1">
                <div className="flex justify-between">
                  <span>Sanctioned</span>
                  <span className="font-semibold">
                    ₹{project.sanctionedAmount.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Paid till date</span>
                  <span className="font-semibold">
                    ₹{totalPaid.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex justify-between mt-1 text-xs">
                  <span>Paid % of sanction</span>
                  <span>{paidPercent.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div className="border rounded p-3 text-xs">
              <div className="text-xs text-gray-500">Quick View</div>
              <div className="mt-2 space-y-1">
                <p>
                  JE view:{" "}
                  <Link href="/je" className="text-blue-600 hover:underline">
                    Open JE page
                  </Link>
                </p>
                <p>
                  SDO view:{" "}
                  <Link href="/sdo" className="text-blue-600 hover:underline">
                    Open SDO page
                  </Link>
                </p>
                <p className="mt-2">
                  Lat/Lng:{" "}
                  <span className="font-mono">
                    {project.lat ?? "—"}/{project.lng ?? "—"}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Global action status */}
          {(actionError || actionSuccess) && (
            <div className="text-xs mt-1">
              {actionError && (
                <div className="bg-red-100 text-red-700 px-3 py-2 rounded">
                  {actionError}
                </div>
              )}
              {actionSuccess && (
                <div className="bg-green-100 text-green-700 px-3 py-2 rounded">
                  {actionSuccess}
                </div>
              )}
            </div>
          )}

          {/* Packages & stages */}
          <div className="border rounded p-3 mt-2 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <div className="font-medium">Packages & Stages</div>
              <div className="text-gray-500">
                Click a stage row to see AI + JE + SDO details below.
              </div>
            </div>

            {packages.length === 0 && (
              <div className="text-gray-500">No packages defined.</div>
            )}

            {packages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                stages={stagesByPackage[pkg.id] || []}
                currentUser={currentUser}
                projectId={project.id}
                onStageCreated={reloadDashboard}
                onSelectStage={setSelectedStage}
              />
            ))}
          </div>

          {/* Stage Detail Panel: AI + JE + SDO */}
          {selectedStage && (
            <div className="border rounded p-3 mt-2 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium">
                    Stage Detail – {selectedStage.stage.order}.{" "}
                    {selectedStage.stage.name}
                  </div>
                  <div className="text-[11px] text-gray-600">
                    JE{" "}
                    {(selectedStage.stage.reportedProgressPercent ?? 0).toFixed(
                      1
                    )}
                    % · SDO{" "}
                    {(selectedStage.stage.verifiedProgressPercent ?? 0).toFixed(
                      1
                    )}
                    %
                  </div>
                </div>
                <button
                  type="button"
                  className="text-[11px] px-2 py-1 border rounded hover:bg-gray-50"
                  onClick={() => setSelectedStage(null)}
                >
                  Close
                </button>
              </div>

              {selectedStageEvents.length === 0 ? (
                <div className="text-gray-500">
                  No JE/SDO progress events with AI for this stage yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedStageEvents.map((evt) => {
                    const reporterLabel = getUserLabel(evt.createdBy);
                    const jeValue =
                      jeCommentDrafts[evt.id] ?? evt.jeComment ?? "";
                    const sdoValue =
                      sdoCommentDrafts[evt.id] ?? evt.sdoComment ?? "";
                    const sdoPercentValue =
                      sdoPercentDrafts[evt.id] ??
                      (typeof evt.sdoVerifiedPercent === "number"
                        ? String(evt.sdoVerifiedPercent)
                        : "");

                    const isSavingJe = savingJeForEvent === evt.id;
                    const isSavingSdo = savingSdoForEvent === evt.id;

                    return (
                      <div
                        key={evt.id}
                        className="border rounded p-2 bg-white space-y-2"
                      >
                        {/* Header */}
                        <div className="flex justify-between gap-2">
                          <div>
                            <div className="font-semibold text-[11px]">
                              Progress event by {reporterLabel}
                            </div>
                            <div className="text-[11px] text-gray-600">
                              {formatDateTime(evt.createdAt)} · JE reported{" "}
                              {evt.reportedProgressPercent.toFixed(1)}%
                            </div>
                          </div>
                          <div className="text-right text-[11px] text-gray-600">
                            {evt.sdoVerifiedPercent != null && (
                              <div>
                                SDO verified{" "}
                                <span className="font-semibold">
                                  {evt.sdoVerifiedPercent.toFixed(1)}%
                                </span>
                              </div>
                            )}
                            {evt.sdoVerifiedAt && (
                              <div>at {formatDateTime(evt.sdoVerifiedAt)}</div>
                            )}
                          </div>
                        </div>

                        {/* AI analysis card */}
                        <div className="border rounded p-2 bg-gray-50 space-y-1">
                          <div className="font-semibold text-[11px]">
                            AI Analysis
                          </div>
                          <div className="grid md:grid-cols-3 gap-1 text-[11px]">
                            <div>
                              <div>
                                Discipline:{" "}
                                <span className="font-medium">
                                  {evt.aiDiscipline || "-"}
                                </span>
                              </div>
                              <div>
                                Detected stage:{" "}
                                <span className="font-medium">
                                  {evt.aiDetectedStage || "-"}
                                </span>
                              </div>
                              <div>
                                Sequence ok:{" "}
                                <span
                                  className={
                                    evt.sequenceOk === false
                                      ? "text-red-700 font-semibold"
                                      : evt.sequenceOk === true
                                      ? "text-green-700 font-semibold"
                                      : "text-gray-700"
                                  }
                                >
                                  {evt.sequenceOk == null
                                    ? "-"
                                    : evt.sequenceOk
                                    ? "YES"
                                    : "NO"}
                                </span>
                              </div>
                            </div>
                            <div>
                              <div>
                                Missing stages:{" "}
                                {evt.missingStages && evt.missingStages.length ? (
                                  <span className="font-medium">
                                    {evt.missingStages.join(", ")}
                                  </span>
                                ) : (
                                  "-"
                                )}
                              </div>
                              <div>
                                Fake photo:{" "}
                                <span
                                  className={
                                    evt.fakePhoto
                                      ? "text-red-700 font-semibold"
                                      : "text-gray-700"
                                  }
                                >
                                  {evt.fakePhoto ? "Likely fake" : "No flag"}
                                </span>
                              </div>
                              <div>
                                Realism score:{" "}
                                <span className="font-medium">
                                  {evt.realism != null
                                    ? evt.realism.toFixed(1)
                                    : "-"}
                                </span>
                              </div>
                            </div>
                            <div>
                              <div>
                                Risk score:{" "}
                                <span
                                  className={
                                    evt.riskScore != null &&
                                    evt.riskScore >= 70
                                      ? "text-red-700 font-semibold"
                                      : evt.riskScore != null &&
                                        evt.riskScore >= 40
                                      ? "text-yellow-700 font-semibold"
                                      : "text-gray-700"
                                  }
                                >
                                  {evt.riskScore != null
                                    ? evt.riskScore.toFixed(1)
                                    : "-"}
                                </span>
                              </div>
                              <div className="mt-1">
                                <div className="text-[11px] text-gray-600">
                                  AI summary:
                                </div>
                                <div className="text-[11px]">
                                  {evt.aiSummary || "-"}
                                </div>
                              </div>
                            </div>
                          </div>

                          {evt.photoUrls && evt.photoUrls.length > 0 && (
                            <div className="mt-2">
                              <div className="text-[11px] text-gray-600 mb-1">
                                Photos
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {evt.photoUrls.map((url) => (
                                  <a
                                    key={url}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <img
                                      src={url}
                                      alt="Stage photo"
                                      className="w-16 h-16 object-cover border rounded"
                                    />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* JE comment */}
                        <div className="border rounded p-2 bg-gray-50 space-y-1">
                          <div className="flex justify-between items-center">
                            <div className="font-semibold text-[11px]">
                              JE comment on AI
                            </div>
                            {evt.jeCommentUpdatedAt && (
                              <div className="text-[10px] text-gray-500">
                                Updated at{" "}
                                {formatDateTime(evt.jeCommentUpdatedAt)}
                              </div>
                            )}
                          </div>

                          {canJeComment ? (
                            <div className="space-y-1">
                              <textarea
                                className="w-full border rounded px-2 py-1 text-[11px]"
                                rows={2}
                                placeholder="Explain your observations / agree / disagree with AI…"
                                value={jeValue}
                                onChange={(e) =>
                                  setJeCommentDrafts((prev) => ({
                                    ...prev,
                                    [evt.id]: e.target.value,
                                  }))
                                }
                              />
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSaveJeComment(evt, jeValue)
                                  }
                                  disabled={isSavingJe}
                                  className="text-[11px] px-3 py-1 border rounded bg-white hover:bg-gray-100 disabled:opacity-50"
                                >
                                  {isSavingJe ? "Saving…" : "Save JE comment"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px]">
                              {evt.jeComment || (
                                <span className="text-gray-500">
                                  No JE comment added yet.
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* SDO comment + verification */}
                        <div className="border rounded p-2 bg-gray-50 space-y-1">
                          <div className="flex justify-between items-center">
                            <div className="font-semibold text-[11px]">
                              SDO verification & comment
                            </div>
                            <div className="text-[10px] text-gray-500">
                              Mode:{" "}
                              {evt.verificationSource === "site"
                                ? "Site visit"
                                : evt.verificationSource === "office"
                                ? "Office-based"
                                : "Not verified"}
                            </div>
                          </div>

                          {canSdoVerify ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-[11px]">
                                <span>Verified %</span>
                                <input
                                  type="number"
                                  className="w-20 border rounded px-1 py-0.5 text-[11px]"
                                  min={0}
                                  max={100}
                                  value={sdoPercentValue}
                                  onChange={(e) =>
                                    setSdoPercentDrafts((prev) => ({
                                      ...prev,
                                      [evt.id]: e.target.value,
                                    }))
                                  }
                                />
                              </div>
                              <textarea
                                className="w-full border rounded px-2 py-1 text-[11px]"
                                rows={2}
                                placeholder="SDO remarks on physical progress vis-à-vis AI & JE…"
                                value={sdoValue}
                                onChange={(e) =>
                                  setSdoCommentDrafts((prev) => ({
                                    ...prev,
                                    [evt.id]: e.target.value,
                                  }))
                                }
                              />
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSaveSdoVerification(
                                      evt,
                                      sdoPercentValue,
                                      sdoValue
                                    )
                                  }
                                  disabled={isSavingSdo}
                                  className="text-[11px] px-3 py-1 border rounded bg-white hover:bg-gray-100 disabled:opacity-50"
                                >
                                  {isSavingSdo ? "Saving…" : "Save SDO verify"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1 text-[11px]">
                              <div>
                                Verified %:{" "}
                                {evt.sdoVerifiedPercent != null ? (
                                  <span className="font-semibold">
                                    {evt.sdoVerifiedPercent.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-gray-500">
                                    Not verified yet.
                                  </span>
                                )}
                              </div>
                              <div>
                                Comment:{" "}
                                {evt.sdoComment ? (
                                  <span>{evt.sdoComment}</span>
                                ) : (
                                  <span className="text-gray-500">
                                    No SDO comment yet.
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
                     {/* Add Payment form – only EE / ADMIN */}
          {(currentRole === "EE" || currentRole === "SDO") && (
            <div className="border rounded p-3 mt-2 text-xs space-y-2">
              <div className="font-medium">Add Payment (Bill)</div>

              <form onSubmit={handleAddPayment} className="space-y-2">
                <div className="grid md:grid-cols-4 gap-2">
                  <div>
                    <label className="block mb-1 text-[11px]">
                      Package (optional)
                    </label>
                    <select
                      className="w-full border rounded px-2 py-1 text-[11px]"
                      value={newPayment.packageId}
                      onChange={(e) =>
                        setNewPayment((p) => ({
                          ...p,
                          packageId: e.target.value,
                        }))
                      }
                    >
                      <option value="">Whole project / not linked</option>
                      {packages.map((pkg) => (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block mb-1 text-[11px]">Bill No</label>
                    <input
                      className="w-full border rounded px-2 py-1 text-[11px]"
                      value={newPayment.billNo}
                      onChange={(e) =>
                        setNewPayment((p) => ({ ...p, billNo: e.target.value }))
                      }
                      placeholder="e.g. 12/EE/2024-25"
                    />
                  </div>

                  <div>
                    <label className="block mb-1 text-[11px]">Bill Date</label>
                    <input
                      type="date"
                      className="w-full border rounded px-2 py-1 text-[11px]"
                      value={newPayment.billDate}
                      onChange={(e) =>
                        setNewPayment((p) => ({
                          ...p,
                          billDate: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label className="block mb-1 text-[11px]">Amount (₹)</label>
                    <input
                      type="number"
                      className="w-full border rounded px-2 py-1 text-[11px]"
                      value={newPayment.amount}
                      onChange={(e) =>
                        setNewPayment((p) => ({
                          ...p,
                          amount: e.target.value,
                        }))
                      }
                      min={0}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingPayment}
                    className="text-[11px] px-3 py-1 border rounded bg-white hover:bg-gray-100 disabled:opacity-50"
                  >
                    {savingPayment ? "Saving…" : "Save Payment"}
                  </button>
                </div>
              </form>

              <div className="text-[10px] text-gray-500">
  * Only EE and SDO can add payments. JE can only view the payments table.
</div>

            </div>
          )}

          {/* Payments table */}
          <div className="border rounded p-3 mt-2 text-xs space-y-2">
            <div className="font-medium">Payments (Bills)</div>
            {payments.length === 0 ? (
              <div className="text-gray-500">No payments recorded.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border text-[11px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="border px-2 py-1 text-left">Bill No</th>
                      <th className="border px-2 py-1 text-left">Date</th>
                      <th className="border px-2 py-1 text-right">Amount</th>
                      <th className="border px-2 py-1 text-left">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const u = userDetails[p.createdBy];
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="border px-2 py-1">{p.billNo}</td>
                          <td className="border px-2 py-1">
                            {formatDate(p.billDate)}
                          </td>
                          <td className="border px-2 py-1 text-right">
                            ₹{p.amount.toLocaleString("en-IN")}
                          </td>
                          <td className="border px-2 py-1">
                            {u ? `${u.name} (${u.role})` : p.createdBy}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
{project?.projectType === "LINEAR" &&
  project.routePoints &&
  project.routePoints.length > 0 && (
    <div className="border rounded p-3 text-xs space-y-2">
      <div className="font-medium">Route Points (for Geo Attendance)</div>
      <div className="text-[11px] text-gray-500">
        JE ka GPS in points ke aas-paas aayega to hi geo-verified visit count hoga.
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border text-[11px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="border px-2 py-1 text-left">Name</th>
              <th className="border px-2 py-1 text-right">KM</th>
              <th className="border px-2 py-1 text-left">Lat</th>
              <th className="border px-2 py-1 text-left">Lng</th>
              <th className="border px-2 py-1 text-center">Active</th>
            </tr>
          </thead>
          <tbody>
            {project.routePoints.map((rp) => (
              <tr key={rp.id} className="hover:bg-gray-50">
                <td className="border px-2 py-1">{rp.name}</td>
                <td className="border px-2 py-1 text-right">
                  {rp.km ?? "-"}
                </td>
                <td className="border px-2 py-1 text-[10px]">
                  {rp.lat.toFixed(5)}
                </td>
                <td className="border px-2 py-1 text-[10px]">
                  {rp.lng.toFixed(5)}
                </td>
                <td className="border px-2 py-1 text-center">
                  {rp.active === false ? "No" : "Yes"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )}

          {/* Attendance table */}
          <div className="border rounded p-3 mt-2 text-xs space-y-2">
            <div className="font-medium">Attendance – Visits by Role</div>
            {attendance.length === 0 ? (
              <div className="text-gray-500">No visits recorded.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border text-[11px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="border px-2 py-1 text-left">User</th>
                      <th className="border px-2 py-1 text-left">Role</th>
                      <th className="border px-2 py-1 text-left">Phone</th>
                      <th className="border px-2 py-1 text-right">
                        Total visits
                      </th>
                      <th className="border px-2 py-1 text-right">
                        Geo-verified
                      </th>
                      <th className="border px-2 py-1 text-left">
                        Last visit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((row) => {
                      const u = userDetails[row.userId];
                      return (
                        <tr key={row.userId} className="hover:bg-gray-50">
                          <td className="border px-2 py-1">
                            {u ? u.name : row.userId}
                          </td>
                          <td className="border px-2 py-1">
                            {u ? u.role : "-"}
                          </td>
                          <td className="border px-2 py-1">
                            {u?.phone || "-"}
                          </td>
                          <td className="border px-2 py-1 text-right">
                            {row.totalVisits}
                          </td>
                          <td className="border px-2 py-1 text-right">
                            {row.verifiedVisits}
                          </td>
                          <td className="border px-2 py-1">
                            {formatDateTime(row.lastVisitAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* PS / HQ notes panel */}
          <PSNotesPanel projectId={project.id} />
        </>
      )}
    </div>
  );
};

export default ProjectPage;

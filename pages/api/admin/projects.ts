// pages/api/admin/projects.ts
//
// Updated for officerCode identity system.
// No UID is used anywhere.
// PS = ADMIN only (state-wide dashboard)

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";
import type { UserRole } from "@/lib/types";

type RoleKey = "JE" | "SDO" | "EE" | "SE" | "CE";

interface RoleAttendance {
  totalVisits: number;
  lastVisit: number | null;
  lastBy: string | null;
  lastVisitType: string | null;
}

interface PsProjectsResponse {
  ok: boolean;
  projects: Array<{
    id: string;
    name: string;
    orgUnitPath: string;
    sanctionedAmount: number;
    physicalPercent: number;
    financialPercent: number;
    gap: number;
    risk: "low" | "medium" | "high";
    attendance: Record<RoleKey, RoleAttendance>;

    // timelines
    agreementStartDate: number | null;
    agreementEndDate: number | null;
    expectedCompletionDate: number | null;
    actualCompletionDate: number | null;

    expectedPhysicalPercent: number;
  }>;
}

function isPsAllowed(role: UserRole) {
  // PS = ADMIN
  return role === "ADMIN";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PsProjectsResponse | { error: string }>
) {
  try {
    // -------------------------
    // 1) AUTH → phone → officerCode
    // -------------------------
// 1) AUTH → phone OR email → users coll
const authHeader = req.headers.authorization || "";
const token = authHeader.startsWith("Bearer ")
  ? authHeader.slice(7)
  : null;

if (!token) {
  return res.status(401).json({ error: "Missing token" });
}

const decoded = await adminApp.auth().verifyIdToken(token);
const phoneNumber = decoded.phone_number as string | undefined;
const email = decoded.email as string | undefined;

let uSnap;

if (phoneNumber) {
  const local = phoneNumber.replace(/^\+91/, "");
  uSnap = await db
    .collection("users")
    .where("phone", "==", local)
    .limit(1)
    .get();
} else if (email) {
  // Admin email-password login ke liye
  uSnap = await db
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();
} else {
  return res.status(401).json({
    error: "Phone or email required on auth token",
  });
}

if (uSnap.empty) {
  return res.status(403).json({
    error: "Officer not found in hierarchy. Check users collection.",
  });
}

const userDoc = uSnap.docs[0];
const officerCode = userDoc.id;
const user = {
  id: officerCode,
  ...(userDoc.data() as any),
};


    if (!isPsAllowed(user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // -------------------------
    // 2) Load ALL projects (state-view)
    // -------------------------
    const projSnap = await db.collection("projects").get();
    const userCache: Record<string, any> = {};
    const results: PsProjectsResponse["projects"] = [];

    for (const doc of projSnap.docs) {
      const p = doc.data() as any;
      const projectId = doc.id;

      // -------------------------
      // Load visits
      // createdBy = officerCode always in new system
      // -------------------------
      const visitsSnap = await db
        .collection("projects")
        .doc(projectId)
        .collection("visits")
        .get();

      const roleStats: Record<RoleKey, RoleAttendance> = {
        JE: { totalVisits: 0, lastVisit: null, lastBy: null, lastVisitType: null },
        SDO: { totalVisits: 0, lastVisit: null, lastBy: null, lastVisitType: null },
        EE: { totalVisits: 0, lastVisit: null, lastBy: null, lastVisitType: null },
        SE: { totalVisits: 0, lastVisit: null, lastBy: null, lastVisitType: null },
        CE: { totalVisits: 0, lastVisit: null, lastBy: null, lastVisitType: null },
      };

      for (const vDoc of visitsSnap.docs) {
        const v = vDoc.data() as any;
        const officer = v.createdBy; // officerCode

        if (!officer) continue;

        let u = userCache[officer];
        if (!u) {
          const usnap = await db.collection("users").doc(officer).get();
          if (!usnap.exists) continue;
          u = { id: usnap.id, ...(usnap.data() as any) };
          userCache[officer] = u;
        }

        const role = u.role as RoleKey;

        if (!roleStats[role]) continue;

        const createdAt = v.createdAt || 0;
        const stat = roleStats[role];

        stat.totalVisits += 1;

        if (!stat.lastVisit || createdAt > stat.lastVisit) {
          stat.lastVisit = createdAt;
          stat.lastBy = u.name || officer;
          stat.lastVisitType = v.visitType || null;
        }
      }

      // -------------------------
      // Progress & Risk
      // -------------------------
      const physical = p.physicalPercent || 0;
      const financial = p.financialPercent || 0;
      const gap = physical - financial;

      let risk: "low" | "medium" | "high" = "low";
      if (gap < -20) risk = "high";
      else if (gap < -10) risk = "medium";

      const agreementStartDate = p.agreementStartDate || null;
      const agreementEndDate = p.agreementEndDate || null;
      const expectedCompletionDate = p.expectedCompletionDate || null;
      const actualCompletionDate = p.actualCompletionDate || null;

      const expectedPhysicalPercent = computeExpectedPhysicalPercent(
        agreementStartDate,
        expectedCompletionDate || agreementEndDate
      );

      results.push({
        id: projectId,
        name: p.name || "",
        orgUnitPath: p.orgUnitPath || "",
        sanctionedAmount: p.sanctionedAmount || 0,
        physicalPercent: physical,
        financialPercent: financial,
        gap,
        risk,
        attendance: roleStats,
        agreementStartDate,
        agreementEndDate,
        expectedCompletionDate,
        actualCompletionDate,
        expectedPhysicalPercent,
      });
    }

    // -------------------------
    // 3) Sort: High risk first, then lowest progress first
    // -------------------------
    results.sort((a, b) => {
      const rank = { low: 1, medium: 2, high: 3 } as const;
      if (rank[b.risk] !== rank[a.risk]) return rank[b.risk] - rank[a.risk];
      return a.physicalPercent - b.physicalPercent;
    });

    return res.status(200).json({ ok: true, projects: results });
  } catch (err: any) {
    console.error("PS Dashboard Error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Server error" });
  }
}

// -----------------------------
// HELPERS
// -----------------------------
function computeExpectedPhysicalPercent(
  startTs: number | null,
  expectedTs: number | null
): number {
  if (!startTs || !expectedTs) return 0;

  const now = Date.now();
  if (now <= startTs) return 0;
  if (now >= expectedTs) return 100;

  const total = expectedTs - startTs;
  if (total <= 0) return 100;

  const done = now - startTs;
  return Number(((done / total) * 100).toFixed(1));
}

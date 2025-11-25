// pages/api/admin/projects-by-role.ts
//
// Updated: Full officerCode system
// No UID. Uses phone_number → officerCode
// Loads CE/SE/EE/ADMIN projects using orgUnitPath
// Computes JE/SDO/EE/SE/CE attendance from visits(createdBy=officerCode)

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

interface AdminProjectsResponse {
  ok: boolean;
  projects: Array<{
    id: string;
    name: string;
    orgUnitPath: string;
    departmentId?: string;
    sanctionedAmount: number;
    physicalPercent: number;
    financialPercent: number;
    gap: number;
    risk: "low" | "medium" | "high";
    attendance: Record<RoleKey, RoleAttendance>;
    agreementStartDate: number | null;
    agreementEndDate: number | null;
    expectedCompletionDate: number | null;
    actualCompletionDate: number | null;
    expectedPhysicalPercent: number;
  }>;
}

function isOfficer(role: UserRole) {
  return ["CE", "SE", "EE", "ADMIN"].includes(role);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminProjectsResponse | { error: string }>
) {
  try {
    // ------------------------
    // AUTH → phone → officerCode
    // ------------------------
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token)
      return res.status(401).json({ error: "Missing token" });

    const decoded = await adminApp.auth().verifyIdToken(token);
    const phoneNumber = decoded.phone_number as string | undefined;

    if (!phoneNumber) {
      return res.status(401).json({
        error: "Phone login required (missing phone_number)",
      });
    }

    // Load officer
    let userSnap = await db
      .collection("users")
      .where("phone", "==", phoneNumber)
      .limit(1)
      .get();

    if (userSnap.empty && phoneNumber.startsWith("+91")) {
      const local = phoneNumber.replace(/^\+91/, "");
      userSnap = await db
        .collection("users")
        .where("phone", "==", local)
        .limit(1)
        .get();
    }

    if (userSnap.empty)
      return res.status(403).json({
        error: "Officer not found in hierarchy CSV. Check phone.",
      });

    const userDoc = userSnap.docs[0];
    const officerCode = userDoc.id;
    const user = { id: officerCode, ...(userDoc.data() as any) };

    if (!isOfficer(user.role)) {
      return res
        .status(403)
        .json({ error: "Access denied (CE/SE/EE/Admin only)" });
    }

    // ------------------------
    // PROJECT QUERY
    // ------------------------
    let projQuery: FirebaseFirestore.Query = db.collection("projects");

    if (user.role !== "ADMIN") {
      const orgPath = user.orgUnitPath || "";
      projQuery = projQuery
        .where("orgUnitPath", ">=", orgPath)
        .where("orgUnitPath", "<=", orgPath + "\uf8ff");
    }

    const projSnap = await projQuery.get();

    // Local user cache for visit lookup
    const userCache: Record<string, any> = {};

    const projects: AdminProjectsResponse["projects"] = [];

    for (const doc of projSnap.docs) {
      const p = doc.data();

      // -------- LOAD VISITS --------
      const visits = await db
        .collection("projects")
        .doc(doc.id)
        .collection("visits")
        .get();

      // Attendance buckets
      const attendance: Record<RoleKey, RoleAttendance> = {
        JE: { totalVisits: 0, lastVisit: null, lastBy: null, lastVisitType: null },
        SDO: { totalVisits: 0, lastVisit: null, lastBy: null, lastVisitType: null },
        EE: { totalVisits: 0, lastVisit: null, lastBy: null, lastVisitType: null },
        SE: { totalVisits: 0, lastVisit: null, lastBy: null, lastVisitType: null },
        CE: { totalVisits: 0, lastVisit: null, lastBy: null, lastVisitType: null },
      };

      for (const vDoc of visits.docs) {
        const v = vDoc.data();
        const createdBy = v.createdBy; // officerCode
        if (!createdBy) continue;

        // Load user from cache or Firestore
        let u = userCache[createdBy];
        if (!u) {
          const us = await db.collection("users").doc(createdBy).get();
          if (!us.exists) continue;
          u = { id: us.id, ...(us.data() as any) };
          userCache[createdBy] = u;
        }

        const role = u.role as RoleKey;
        if (!attendance[role]) continue;

        const time = v.createdAt || 0;
        const stat = attendance[role];

        stat.totalVisits += 1;

        if (!stat.lastVisit || time > stat.lastVisit) {
          stat.lastVisit = time;
          stat.lastBy = u.name || createdBy;
          stat.lastVisitType = v.visitType || null;
        }
      }

      // -------- RISK CALC --------
      const physical = p.physicalPercent || 0;
      const financial = p.financialPercent || 0;
      const gap = physical - financial;

      let risk: "low" | "medium" | "high" = "low";
      if (gap < -20) risk = "high";
      else if (gap < -10) risk = "medium";

      // -------- TIMELINE FIELDS --------
      const agreementStartDate = p.agreementStartDate || null;
      const agreementEndDate = p.agreementEndDate || null;
      const expectedCompletionDate = p.expectedCompletionDate || null;
      const actualCompletionDate = p.actualCompletionDate || null;

      // -------- EXPECTED PROGRESS --------
      const expectedPhysicalPercent = computeExpectedPhysicalPercent(
        agreementStartDate,
        expectedCompletionDate || agreementEndDate
      );

      projects.push({
        id: p.id || doc.id,
        name: p.name || "",
        orgUnitPath: p.orgUnitPath || "",
        departmentId: p.departmentId || "",
        sanctionedAmount: p.sanctionedAmount || 0,
        physicalPercent: physical,
        financialPercent: financial,
        gap,
        risk,
        attendance,
        agreementStartDate,
        agreementEndDate,
        expectedCompletionDate,
        actualCompletionDate,
        expectedPhysicalPercent,
      });
    }

    // SORT: highest risk + worst gap first
    projects.sort((a, b) => {
      const rank = { low: 1, medium: 2, high: 3 } as const;
      if (rank[b.risk] !== rank[a.risk]) return rank[b.risk] - rank[a.risk];
      return a.gap - b.gap;
    });

    return res.status(200).json({ ok: true, projects });
  } catch (err: any) {
    console.error("Error in CE/SE dashboard:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

// -------------------------
// HELPER
// -------------------------
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

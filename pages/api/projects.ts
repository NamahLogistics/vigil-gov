// pages/api/projects.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";
import type { User } from "@/lib/types";

type RiskLevel = "low" | "medium" | "high";

interface ProjectRow {
  id: string;
  name: string;
  departmentId: string;
  orgUnitPath: string;
  sanctionedAmount: number;
  physicalPercent: number;
  financialPercent: number;
  riskLevel: RiskLevel;
}

function computeRisk(
  physicalPercent: number,
  financialPercent: number
): RiskLevel {
  const gap = physicalPercent - financialPercent;
  if (gap < -20) return "high";
  if (gap < -10) return "medium";
  return "low";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    const decoded = await adminApp.auth().verifyIdToken(token);
    const phoneNumber = decoded.phone_number as string | undefined;

    if (!phoneNumber) {
      return res
        .status(401)
        .json({ error: "Phone-based login required (no phone_number in token)." });
    }

    // ----------------------------
    // Load officer from users by phone → officerCode
    // ----------------------------
    let userSnap = await db
      .collection("users")
      .where("phone", "==", phoneNumber)
      .limit(1)
      .get();

    // If CSV stored number without +91
    if (userSnap.empty && phoneNumber.startsWith("+91")) {
      const local = phoneNumber.replace(/^\+91/, "");
      userSnap = await db
        .collection("users")
        .where("phone", "==", local)
        .limit(1)
        .get();
    }

    if (userSnap.empty) {
      return res.status(403).json({
        error:
          "User not registered in hierarchy. Please ensure CSV phone matches login phone.",
      });
    }

    const userDoc = userSnap.docs[0];
    const officerCode = userDoc.id;

    const user = {
      id: officerCode, // id = officerCode
      ...(userDoc.data() as any),
    } as User & { id: string };

    const isJeLike = user.role === "JE" || user.role === "FE";
    const isOfficer = ["SDO", "EE", "SE", "CE", "ADMIN"].includes(user.role);

    if (!isJeLike && !isOfficer) {
      return res.status(403).json({ error: "Access denied" });
    }

    let projectsSnap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;

    if (isJeLike) {
      // 🔒 JE / FE: only projects where he has at least one package
      // i.e. assignedJeIds contains his officerCode
      projectsSnap = await db
        .collection("projects")
        .where("assignedJeIds", "array-contains", user.id)
        .get();
    } else {
      // Officer: all projects under their orgUnitPath
      const prefix =
        (user as any).orgUnitPath ||
        (user as any).orgLocation?.orgUnitPath ||
        "";

      if (!prefix) {
        return res.status(400).json({
          error: "User missing orgUnitPath / orgLocation",
        });
      }

      // For now, load all and filter by prefix (can be indexed later)
      const allSnap = await db.collection("projects").get();
      const filteredDocs = allSnap.docs.filter((doc) => {
        const p = doc.data() as any;
        const path = p.orgUnitPath || p.orgLocation?.orgUnitPath || "";
        return path.startsWith(prefix);
      });

      // Wrap this to behave like a QuerySnapshot-ish object
      projectsSnap = {
        docs: filteredDocs,
        empty: filteredDocs.length === 0,
        size: filteredDocs.length,
      } as any;
    }

    const projects: ProjectRow[] = [];

    for (const doc of projectsSnap.docs) {
      const p = doc.data() as any;

      const physical = Number(p.physicalPercent || 0);
      const financial = Number(p.financialPercent || 0);

      const row: ProjectRow = {
        id: doc.id,
        name: p.name || "(no name)",
        departmentId: p.departmentId || "",
        orgUnitPath: p.orgUnitPath || p.orgLocation?.orgUnitPath || "",
        sanctionedAmount: Number(p.sanctionedAmount || 0),
        physicalPercent: physical,
        financialPercent: financial,
        riskLevel: computeRisk(physical, financial),
      };

      projects.push(row);
    }

    // Optionally sort (officers might like risk ordering; JE can get simple list)
    projects.sort((a, b) => {
      const gapA = a.physicalPercent - a.financialPercent;
      const gapB = b.physicalPercent - b.financialPercent;
      const rank: Record<RiskLevel, number> = { high: 3, medium: 2, low: 1 };

      if (rank[b.riskLevel] !== rank[a.riskLevel]) {
        return rank[b.riskLevel] - rank[a.riskLevel];
      }
      return gapA - gapB;
    });

    return res.status(200).json({ ok: true, projects });
  } catch (err: any) {
    console.error("Error in /api/projects:", err);
    return res
      .status(500)
      .json({ error: err.message || "Server error" });
  }
}

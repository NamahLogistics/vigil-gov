// pages/api/admin/create-package.ts
//
// ADMIN-only package creation under a project
// Body:
//  projectId: string
//  name: string
//  amount: string | number
//  discipline: "civil" | "electrical" | "mechanical" | "mixed" | string
//  ownerJeCode: officerCode of JE (from JE search)

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";

function cleanStr(v: any): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 1) AUTH – ADMIN only (UID-based, no phone dependency)
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: "Missing token" });
    }

    const decoded = await adminApp.auth().verifyIdToken(token);
    const adminUid = decoded.uid;

    const adminSnap = await db.collection("users").doc(adminUid).get();
    if (!adminSnap.exists) {
      return res.status(403).json({ error: "Admin user not found." });
    }

    const adminUser = adminSnap.data() as any;
    if (adminUser.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Only ADMIN can create packages." });
    }

    const adminCode = adminUid; // createdBy ke liye stable ID

    // 2) BODY
    const {
      projectId,
      name,
      amount,
      discipline,
      ownerJeCode,
    } = req.body || {};

    const projId = cleanStr(projectId);
    if (!projId) return res.status(400).json({ error: "projectId required" });

    const pkgName = cleanStr(name);
    if (!pkgName) {
      return res.status(400).json({ error: "Package name required" });
    }

    const amtNum = Number(amount || 0);
    if (!amtNum || Number.isNaN(amtNum) || amtNum <= 0) {
      return res
        .status(400)
        .json({ error: "Amount must be a positive number" });
    }

    const disc = cleanStr(discipline).toLowerCase() || "mixed";

    const jeCode = cleanStr(ownerJeCode);
    if (!jeCode) {
      return res.status(400).json({ error: "ownerJeCode required" });
    }

    // 3) LOAD PROJECT
    const projRef = db.collection("projects").doc(projId);
    const projSnap = await projRef.get();
    if (!projSnap.exists) {
      return res.status(404).json({ error: "Project not found" });
    }
    const project = projSnap.data() as any;
    // (project variable abhi future use ke liye available hai)

    // 4) LOAD JE
    const jeRef = db.collection("users").doc(jeCode);
    const jeSnap = await jeRef.get();
    if (!jeSnap.exists) {
      return res.status(404).json({ error: "JE not found" });
    }

    const je = jeSnap.data() as any;
    if (je.role !== "JE" && je.role !== "FE") {
      return res.status(400).json({ error: "ownerJeCode must be JE/FE" });
    }

    const now = Date.now();

    const pkgRef = projRef.collection("packages").doc();
    const payload: any = {
      id: pkgRef.id,
      projectId: projId,
      name: pkgName,
      amount: amtNum,
      discipline: disc,
      ownerJeId: jeCode,
      ownerJeName: je.name || "",
      ownerOrgUnitPath: je.orgUnitPath || "",
      physicalPercent: 0,
      financialPercent: 0,
      createdBy: adminCode,
      createdAt: now,
    };

    await pkgRef.set(payload);

    return res.status(200).json({ ok: true, package: payload });
  } catch (err: any) {
    console.error("[ADMIN create-package] ERROR:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to create package" });
  }
}

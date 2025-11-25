// pages/api/ee/create-stage.ts
//
// Updated for officerCode-based identity
// No UID, phone_number → officerCode mapping
// EE + ADMIN create stages safely

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";
import type { User } from "@/lib/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ----------------------------
    // AUTH : token → phone → officerCode
    // ----------------------------
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) return res.status(401).json({ error: "Missing auth token" });

    const decoded = await adminApp.auth().verifyIdToken(token);
    const phoneNumber = decoded.phone_number as string | undefined;

    if (!phoneNumber) {
      return res.status(401).json({
        error: "Phone login required (no phone_number in token).",
      });
    }

    // Lookup user by phone
    let snap = await db
      .collection("users")
      .where("phone", "==", phoneNumber)
      .limit(1)
      .get();

    // If CSV stored without +91
    if (snap.empty && phoneNumber.startsWith("+91")) {
      const local = phoneNumber.replace(/^\+91/, "");
      snap = await db
        .collection("users")
        .where("phone", "==", local)
        .limit(1)
        .get();
    }

    if (snap.empty) {
      return res.status(403).json({
        error:
          "User not found in hierarchy. Ensure CSV phone matches login phone.",
      });
    }

    const userDoc = snap.docs[0];
    const officerCode = userDoc.id;

    const user = {
      id: officerCode,
      officerCode,
      ...(userDoc.data() as any),
    } as User & { officerCode: string };

    // ----------------------------
    // EE OR ADMIN ONLY
    // ----------------------------
    if (user.role !== "EE" && user.role !== "ADMIN") {
      return res.status(403).json({ error: "Access denied" });
    }

    // ----------------------------
    // BODY VALIDATION
    // ----------------------------
    const { projectId, packageId, name, order, weightPercent } = req.body || {};

    if (!projectId) return res.status(400).json({ error: "projectId required" });
    if (!packageId) return res.status(400).json({ error: "packageId required" });
    if (!name) return res.status(400).json({ error: "Stage name required" });

    const orderNum = Number(order);
    if (!Number.isFinite(orderNum) || orderNum <= 0)
      return res.status(400).json({ error: "Invalid order" });

    const weightNum = Number(weightPercent);
    if (!Number.isFinite(weightNum) || weightNum <= 0)
      return res.status(400).json({ error: "Invalid weightPercent" });

    // ----------------------------
    // PROJECT ACCESS VALIDATION
    // ----------------------------
    const projSnap = await db.collection("projects").doc(projectId).get();
    if (!projSnap.exists)
      return res.status(404).json({ error: "Project not found" });

    const proj = projSnap.data() as any;
    const projPath =
      proj.orgUnitPath || proj.orgLocation?.orgUnitPath || "";

    if (!projPath.startsWith(user.orgUnitPath || "")) {
      return res.status(403).json({ error: "Not allowed for this project" });
    }

    // ----------------------------
    // PACKAGE EXISTS?
    // ----------------------------
    const pkgRef = db
      .collection("projects")
      .doc(projectId)
      .collection("packages")
      .doc(packageId);

    const pkgSnap = await pkgRef.get();
    if (!pkgSnap.exists) {
      return res.status(404).json({ error: "Package not found" });
    }

    // ----------------------------
    // CREATE STAGE
    // ----------------------------
    const stData = {
      projectId,
      packageId,
      name,
      order: orderNum,
      weightPercent: weightNum,
      reportedProgressPercent: 0,
      verifiedProgressPercent: 0,
      verificationSource: "unknown",
      createdAt: Date.now(),
    };

    const stageRef = await pkgRef.collection("stages").add(stData);

    // ----------------------------
    // CALCULATE TOTAL STAGE WEIGHT
    // ----------------------------
    const allStagesSnap = await pkgRef.collection("stages").get();
    let totalWeight = 0;
    allStagesSnap.forEach((d) => {
      const s = d.data() as any;
      totalWeight += Number(s.weightPercent || 0);
    });

    return res.json({
      ok: true,
      stage: { id: stageRef.id, ...stData },
      totalWeightPercent: totalWeight,
    });
  } catch (err: any) {
    console.error("create-stage error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Server error" });
  }
}

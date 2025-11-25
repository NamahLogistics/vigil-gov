// pages/api/packages.ts
//
// Updated for officerCode-based hierarchy (no UID anywhere)

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ----------------------------
    // AUTH → phone_number → officerCode
    // ----------------------------
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
      return res.status(401).json({
        error: "Phone login required (phone_number missing)",
      });
    }

    // Load officer using phone → officerCode
    let snap = await db
      .collection("users")
      .where("phone", "==", phoneNumber)
      .limit(1)
      .get();

    // fallback if CSV stored without +91
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
        error: "User not registered in hierarchy (CSV).",
      });
    }

    const userDoc = snap.docs[0];
    const officerCode = userDoc.id;
    const user = { id: officerCode, ...(userDoc.data() as any) };

    // ----------------------------
    // ROLES
    // ----------------------------
    const { role } = user;
    const isJeLike = role === "JE" || role === "FE";
    const isOfficer = ["SDO", "EE", "SE", "CE", "ADMIN", "PS"].includes(role);

    // ----------------------------
    // INPUT
    // ----------------------------
    const { projectId } = req.query;
    if (!projectId || typeof projectId !== "string") {
      return res
        .status(400)
        .json({ error: "projectId is required in query" });
    }

    // ----------------------------
    // LOAD PROJECT
    // ----------------------------
    const projectRef = db.collection("projects").doc(projectId);
    const projectSnap = await projectRef.get();

    if (!projectSnap.exists) {
      return res.status(404).json({ error: "Project not found" });
    }

    const p = projectSnap.data() as any;

    const projectPath =
      p.orgUnitPath || p.orgLocation?.orgUnitPath || "";

    const assignedJeIds: string[] = p.assignedJeIds || [];

    // ----------------------------
    // ACCESS CONTROL
    // ----------------------------
    if (isJeLike) {
      // JE/FE → only assigned projects
      if (!assignedJeIds.includes(officerCode)) {
        return res.status(403).json({ error: "Access denied to this project" });
      }
    } else if (isOfficer) {
      const prefix =
        user.orgUnitPath || user.orgLocation?.orgUnitPath || "";

      if (!prefix || !projectPath.startsWith(prefix)) {
        return res
          .status(403)
          .json({ error: "Officer cannot access this project" });
      }
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    // ----------------------------
    // FETCH PACKAGES
    // ----------------------------
    const pkgSnap = await projectRef.collection("packages").get();

    let packages = pkgSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    // JE/FE → show only packages they own
    if (isJeLike) {
      packages = packages.filter(
        (pkg: any) => pkg.ownerJeId === officerCode
      );
    }

    return res.status(200).json({ ok: true, packages });
  } catch (err: any) {
    console.error("Error in /api/packages:", err);
    return res
      .status(500)
      .json({ error: err.message || "Server error" });
  }
}

// pages/api/stages.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";
import type { Project, Package, Stage, User, UserRole } from "@/lib/types";

function isOfficer(role: UserRole) {
  return (
    role === "SDO" ||
    role === "EE" ||
    role === "SE" ||
    role === "CE" ||
    role === "ADMIN"
  );
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
    // Load user by phone → officerCode
    // ----------------------------
    let userSnap = await db
      .collection("users")
      .where("phone", "==", phoneNumber)
      .limit(1)
      .get();

    // If CSV stored phone without +91
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
      id: officerCode, // 👈 important: user.id = officerCode
      ...(userDoc.data() as any),
    } as User;

    const { projectId, packageId } = req.query;
    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({ error: "projectId is required" });
    }
    if (!packageId || typeof packageId !== "string") {
      return res.status(400).json({ error: "packageId is required" });
    }

    // Load project
    const projSnap = await db.collection("projects").doc(projectId).get();
    if (!projSnap.exists) {
      return res.status(404).json({ error: "Project not found" });
    }
    const project = {
      id: projSnap.id,
      ...(projSnap.data() as any),
    } as Project;

    // ----------------------------
    // Access control
    // ----------------------------
    if (isOfficer(user.role)) {
      // Officer tree: project must be within their orgUnitPath
      if (!project.orgUnitPath.startsWith(user.orgUnitPath)) {
        return res.status(403).json({ error: "Access denied" });
      }
    } else {
      // JE / FE: either explicitly assigned OR in their org tree
      const assigned = Array.isArray(project.assignedJeIds)
        ? project.assignedJeIds.includes(user.id) // user.id = officerCode
        : false;
      const inTree = project.orgUnitPath.startsWith(user.orgUnitPath);
      if (!assigned && !inTree) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    // Optional package existence check (mainly for safety)
    const pkgRef = db
      .collection("projects")
      .doc(projectId)
      .collection("packages")
      .doc(packageId);

    const pkgSnap = await pkgRef.get();
    if (!pkgSnap.exists) {
      return res.status(404).json({ error: "Package not found" });
    }
    const _pkg = { id: pkgSnap.id, ...(pkgSnap.data() as any) } as Package;

    const stagesSnap = await pkgRef
      .collection("stages")
      .orderBy("order", "asc")
      .get();

    const stages: Stage[] = stagesSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    })) as Stage[];

    return res.status(200).json({
      ok: true,
      stages,
    });
  } catch (err: any) {
    console.error("Error in /api/stages:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}

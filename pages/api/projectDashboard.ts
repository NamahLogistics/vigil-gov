// pages/api/projectDashboard.ts
//
// Updated: FULLY officerCode-based system + projectType/routePoints
// + attendance now includes: totalVisits, verifiedVisits, lastVisitAt, lastVisitType

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";
import type { UserRole } from "@/lib/types";

interface UserLite {
  id: string;
  name: string;
  role: UserRole;
  phone?: string;
}

export const config = {
  api: { bodyParser: true },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ----------------------------------------------------
    // 1. Query param
    // ----------------------------------------------------
    const { projectId } = req.query;
    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({ error: "projectId is required" });
    }

    // ----------------------------------------------------
    // 2. AUTH → phone (field roles) OR uid (ADMIN/email login)
    // ----------------------------------------------------
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) return res.status(401).json({ error: "Missing token" });

    const decoded = await adminApp.auth().verifyIdToken(token);
    const uid = decoded.uid as string;
    const phoneNumber = decoded.phone_number as string | undefined;

    let userDocSnap: FirebaseFirestore.DocumentSnapshot | null = null;

    // 2A) Try phone-based lookup (JE / SDO / EE / SE / CE etc.)
    if (phoneNumber) {
      let snap = await db
        .collection("users")
        .where("phone", "==", phoneNumber)
        .limit(1)
        .get();

      if (snap.empty && phoneNumber.startsWith("+91")) {
        const local = phoneNumber.replace(/^\+91/, "");
        snap = await db
          .collection("users")
          .where("phone", "==", local)
          .limit(1)
          .get();
      }

      if (!snap.empty) {
        userDocSnap = snap.docs[0];
      }
    }

    // 2B) Fallback: uid-based lookup (ADMIN / email-password users)
    if (!userDocSnap) {
      const byUid = await db.collection("users").doc(uid).get();
      if (byUid.exists) {
        userDocSnap = byUid;
      }
    }

    // Still nothing → user not mapped in hierarchy/users
    if (!userDocSnap) {
      return res.status(403).json({
        error:
          "User not found in hierarchy/users mapping. Ensure ADMIN or officer is created in users collection.",
      });
    }

    const officerCode = userDocSnap.id;
    const currentUser = {
      id: officerCode,
      ...(userDocSnap.data() as any),
    };

    if (!currentUser.role) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // ----------------------------------------------------
    // 3. Load project
    // ----------------------------------------------------
    const projSnap = await db.collection("projects").doc(projectId).get();
    if (!projSnap.exists)
      return res.status(404).json({ error: "Project not found" });

    const rawProject = projSnap.data() as any;

    // Normalized extras for POINT + LINEAR
    const projectType =
      (rawProject.projectType as "POINT" | "LINEAR" | undefined) || "POINT";

    const siteCenter =
      rawProject.siteCenter && typeof rawProject.siteCenter.lat === "number"
        ? rawProject.siteCenter
        : typeof rawProject.lat === "number" &&
          typeof rawProject.lng === "number"
        ? { lat: rawProject.lat, lng: rawProject.lng }
        : null;

    const siteRadiusMeters =
      typeof rawProject.siteRadiusMeters === "number"
        ? rawProject.siteRadiusMeters
        : typeof rawProject.radiusMeters === "number"
        ? rawProject.radiusMeters
        : null;

    const routePoints = Array.isArray(rawProject.routePoints)
      ? rawProject.routePoints
      : [];

    // ----------------------------------------------------
    // 4. LOAD PACKAGES
    // ----------------------------------------------------
    const pkgSnap = await db
      .collection("projects")
      .doc(projectId)
      .collection("packages")
      .orderBy("name")
      .get();

    const packages = pkgSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    // ----------------------------------------------------
    // 5. LOAD STAGES per PACKAGE
    // ----------------------------------------------------
    const stagesByPackage: Record<string, any[]> = {};

    for (const pkg of packages) {
      const stSnap = await db
        .collection("projects")
        .doc(projectId)
        .collection("packages")
        .doc(pkg.id)
        .collection("stages")
        .orderBy("order")
        .get();

      stagesByPackage[pkg.id] = stSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
    }

    // ----------------------------------------------------
    // 6. PAYMENTS
    // ----------------------------------------------------
    const paySnap = await db
      .collection("projects")
      .doc(projectId)
      .collection("payments")
      .orderBy("billDate", "desc")
      .get();

    const payments = paySnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    const totalPaid = payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    // ----------------------------------------------------
    // 7. ATTENDANCE — derived from VISITS
    // ----------------------------------------------------
    const visitSnap = await db
      .collection("projects")
      .doc(projectId)
      .collection("visits")
      .orderBy("createdAt", "desc")
      .get();

    const attendanceMap: Record<string, any> = {};

    visitSnap.docs.forEach((doc) => {
      const v = doc.data() as any;
      const createdBy = v.createdBy;
      if (!createdBy) return;

      if (!attendanceMap[createdBy]) {
        attendanceMap[createdBy] = {
          userId: createdBy,
          totalVisits: 0,
          verifiedVisits: 0,
          lastVisitAt: null as number | null,
          lastVisitType: null as string | null,
        };
      }

      attendanceMap[createdBy].totalVisits += 1;

      if (v.geoVerified === true) {
        attendanceMap[createdBy].verifiedVisits += 1;
      }

      if (
        typeof v.createdAt === "number" &&
        (!attendanceMap[createdBy].lastVisitAt ||
          v.createdAt > attendanceMap[createdBy].lastVisitAt)
      ) {
        attendanceMap[createdBy].lastVisitAt = v.createdAt;
        attendanceMap[createdBy].lastVisitType = v.visitType || null;
      }
    });

    const attendance = Object.values(attendanceMap);

    // ----------------------------------------------------
    // 8. EVENTS (progress)
    // ----------------------------------------------------
    const evtSnap = await db
      .collection("projects")
      .doc(projectId)
      .collection("events")
      .orderBy("createdAt", "desc")
      .get();

    const events = evtSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    // ----------------------------------------------------
    // 9. LOAD ALL USERS involved
    // ----------------------------------------------------
    const userDetails: Record<string, UserLite> = {};
    const userIds = new Set<string>();

    attendance.forEach((a: any) => userIds.add(a.userId));
    events.forEach((e: any) => userIds.add(e.createdBy));
    userIds.add(currentUser.id);

    for (const uidKey of Array.from(userIds)) {
      const snapU = await db.collection("users").doc(uidKey).get();
      if (snapU.exists) {
        const u = snapU.data() as any;
        userDetails[uidKey] = {
          id: uidKey,
          name: u.name || "",
          role: u.role,
          phone: u.phone || "",
        };
      }
    }

    // ----------------------------------------------------
    // 10. FINAL RESPONSE
    // ----------------------------------------------------
    return res.json({
      ok: true,
      project: {
        id: projSnap.id,
        ...rawProject,

        // timeline fallback support
        dateOfStartAgreement:
          rawProject.dateOfStartAgreement ??
          rawProject.agreementStartDate ??
          null,
        dateOfCompletionAgreement:
          rawProject.dateOfCompletionAgreement ??
          rawProject.agreementEndDate ??
          null,
        expectedCompletion:
          rawProject.expectedCompletion ??
          rawProject.expectedCompletionDate ??
          null,
        actualCompletion:
          rawProject.actualCompletion ??
          rawProject.actualCompletionDate ??
          null,

        // location fallback support
        lat: rawProject.lat ?? rawProject.siteCenter?.lat ?? null,
        lng: rawProject.lng ?? rawProject.siteCenter?.lng ?? null,

        // type + geo model for POINT / LINEAR
        projectType,
        siteCenter,
        siteRadiusMeters,
        routePoints,
      },

      packages,
      stagesByPackage,
      payments,
      totalPaid,
      attendance,
      events,
      userDetails,
      currentUser,
    });
  } catch (err: any) {
    console.error("PROJECT DASHBOARD ERROR:", err);
    return res.status(500).json({
      error: err.message || "Internal server error",
    });
  }
}

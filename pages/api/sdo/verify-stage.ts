// pages/api/sdo/verify-stage.ts
//
// Updated: UID removed, officerCode-based user identity
// Face-verified visit check now uses createdBy = officerCode

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";
import type { UserRole, VerificationSource } from "@/lib/types";

function isSDO(role: UserRole) {
  return role === "SDO";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });

    // ----------------------------
    // 1. AUTH
    // ----------------------------
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: "Missing token" });
    }

    const decoded = await adminApp.auth().verifyIdToken(token);
    const phoneNumber = decoded.phone_number as string | undefined;

    if (!phoneNumber) {
      return res
        .status(401)
        .json({ error: "Phone login required (no phone_number in token)" });
    }

    // ----------------------------
    // 2. LOAD OFFICER (phone → officerCode)
    // ----------------------------
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
        error: "Officer not found in hierarchy. Ensure CSV phone is correct.",
      });
    }

    const userDoc = snap.docs[0];
    const officerCode = userDoc.id; // 🔥 REAL ID
    const user = {
      id: officerCode,
      officerCode,
      ...(userDoc.data() as any),
    };

    if (!isSDO(user.role)) {
      return res.status(403).json({ error: "SDO only" });
    }

    // ----------------------------
    // 3. READ BODY
    // ----------------------------
    const {
      projectId,
      packageId,
      stageId,
      eventId,
      percent,
      sdoComment,
    } = req.body || {};

    if (!projectId || !packageId || !stageId || !eventId) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const verifiedPercent = Number(percent);
    if (
      Number.isNaN(verifiedPercent) ||
      verifiedPercent < 0 ||
      verifiedPercent > 100
    ) {
      return res.status(400).json({ error: "Invalid percent" });
    }

    // ----------------------------
    // 4. FACE-VERIFIED VISIT WITHIN 24H (createdBy = officerCode)
    // ----------------------------
    const visitsSnap = await db
      .collection("projects")
      .doc(projectId)
      .collection("visits")
      .where("createdBy", "==", officerCode) // changed from uid → officerCode
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (visitsSnap.empty) {
      return res
        .status(403)
        .json({ error: "No recent visit found (SDO must visit within 24h)" });
    }

    const lastVisit = visitsSnap.docs[0].data();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    const createdAtValue =
      typeof lastVisit.createdAt === "number"
        ? lastVisit.createdAt
        : lastVisit.createdAt?.toMillis
        ? lastVisit.createdAt.toMillis()
        : 0;

    if (
      lastVisit.faceVerified !== true ||
      Date.now() - createdAtValue > ONE_DAY
    ) {
      return res.status(403).json({
        error: "A face-verified visit within 24h is required.",
      });
    }

    const verificationSource: VerificationSource =
      lastVisit.visitType === "site" && lastVisit.geoVerified
        ? "site"
        : "office";

    // ----------------------------
    // 5. UPDATE EVENT
    // ----------------------------
    const eventRef = db
      .collection("projects")
      .doc(projectId)
      .collection("events")
      .doc(eventId);

    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }

    const evt = eventSnap.data() as any;
    if (evt.packageId !== packageId || evt.stageId !== stageId) {
      return res
        .status(400)
        .json({ error: "Event does not match provided stage/package" });
    }

    const now = Date.now();

    await eventRef.update({
      sdoVerifiedPercent: verifiedPercent,
      sdoVerifiedAt: now,
      sdoComment: sdoComment || "",
      sdoVerifiedBy: officerCode,
      verificationSource,
    });

    // ----------------------------
    // 6. MIRROR TO STAGE
    // ----------------------------
    const stageRef = db
      .collection("projects")
      .doc(projectId)
      .collection("packages")
      .doc(packageId)
      .collection("stages")
      .doc(stageId);

    await stageRef.update({
      verifiedProgressPercent: verifiedPercent,
      verificationSource,
      lastVerifiedBy: officerCode,
      lastVerifiedAt: now,
    });

    return res.json({
      ok: true,
      eventId,
      verifiedPercent,
      verificationSource,
    });
  } catch (err: any) {
    console.error("SDO VERIFY ERROR:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal error" });
  }
}

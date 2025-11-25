// pages/api/admin/create-project.ts
//
// ADMIN-only project creation
// Body:
//  name: string
//  sanctionedAmount: string | number
//  agreementStartDate, agreementEndDate,
//  expectedCompletionDate, actualCompletionDate: string (YYYY-MM-DD)
//  siteLat, siteLng: string (optional but recommended)
//  siteRadiusMeters: string | number (optional)
//  projectType: "POINT" | "LINEAR" (optional, defaults to "POINT")
//
// Uses admin's departmentCode + orgUnitPath as project orgUnitPath.

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

    // ---------------- AUTH (phone OR email → officer) ----------------
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) return res.status(401).json({ error: "Missing token" });

    const decoded = await adminApp.auth().verifyIdToken(token);
    const phoneNumber = decoded.phone_number as string | undefined;
    const email = decoded.email as string | undefined;

    let snap;

    if (phoneNumber) {
      // First try exact phone
      snap = await db
        .collection("users")
        .where("phone", "==", phoneNumber)
        .limit(1)
        .get();

      // Fallback: strip +91 for local stored format
      if (snap.empty && phoneNumber.startsWith("+91")) {
        const local = phoneNumber.replace(/^\+91/, "");
        snap = await db
          .collection("users")
          .where("phone", "==", local)
          .limit(1)
          .get();
      }
    } else if (email) {
      // Email-password admin login
      snap = await db
        .collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();
    } else {
      return res.status(401).json({
        error: "Phone or email required on auth token",
      });
    }

    if (!snap || snap.empty) {
      return res.status(403).json({ error: "Admin officer not found." });
    }

    const userDoc = snap.docs[0];
    const officerCode = userDoc.id;
    const user = userDoc.data() as any;

    if (user.role !== "ADMIN") {
      return res.status(403).json({ error: "Only ADMIN can create projects." });
    }

    // ---------------- PAYLOAD ----------------
    const {
      name,
      sanctionedAmount,
      agreementStartDate,
      agreementEndDate,
      expectedCompletionDate,
      actualCompletionDate,
      siteLat,
      siteLng,
      siteRadiusMeters,
      projectType, // 👈 new field from frontend (POINT / LINEAR)
    } = req.body || {};

    const projName = cleanStr(name);
    if (!projName) {
      return res.status(400).json({ error: "Project name is required" });
    }

    const sanctionNum = Number(sanctionedAmount || 0);
    if (!sanctionNum || Number.isNaN(sanctionNum) || sanctionNum <= 0) {
      return res
        .status(400)
        .json({ error: "Sanctioned amount must be a positive number" });
    }

    const siteLatN =
      siteLat != null && siteLat !== "" ? Number(siteLat) : undefined;
    const siteLngN =
      siteLng != null && siteLng !== "" ? Number(siteLng) : undefined;
    const radiusN =
      siteRadiusMeters != null && siteRadiusMeters !== ""
        ? Number(siteRadiusMeters)
        : undefined;

    // ---------- PROJECT TYPE (POINT / LINEAR) ----------
    const rawType = cleanStr(projectType);
    const normalizedType =
      rawType.toUpperCase() === "LINEAR" ? "LINEAR" : "POINT"; // default POINT

    const now = Date.now();

    const projRef = db.collection("projects").doc();
    const payload: any = {
      id: projRef.id,
      name: projName,
      sanctionedAmount: sanctionNum,
      createdAt: now,
      createdBy: officerCode,
      departmentId: user.departmentCode || "",
      orgUnitPath: user.orgUnitPath || "",
      physicalPercent: 0,
      financialPercent: 0,
      expectedPhysicalPercent: 0,

      agreementStartDate: cleanStr(agreementStartDate) || null,
      agreementEndDate: cleanStr(agreementEndDate) || null,
      expectedCompletionDate: cleanStr(expectedCompletionDate) || null,
      actualCompletionDate: cleanStr(actualCompletionDate) || null,

      projectType: normalizedType, // 👈 stored in Firestore
    };

    if (
      siteLatN !== undefined &&
      siteLngN !== undefined &&
      !Number.isNaN(siteLatN) &&
      !Number.isNaN(siteLngN)
    ) {
      payload.siteCenter = {
        lat: siteLatN,
        lng: siteLngN,
      };
    }

    if (radiusN !== undefined && !Number.isNaN(radiusN)) {
      payload.siteRadiusMeters = radiusN;
    }

    await projRef.set(payload);

    return res.status(200).json({ ok: true, project: payload });
  } catch (err: any) {
    console.error("[ADMIN create-project] ERROR:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to create project" });
  }
}

// pages/api/admin/je-search.ts
//
// ADMIN JE search for package owner selection.
// Query:
//   discipline?: string   (CIVIL / ELECTRICAL / MECHANICAL etc, case-insensitive)
//   q?: string            (search in officerCode, name, phone)
//
// Returns small list of JEs with org info.

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
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // AUTH – only ADMIN (UID-based, no phone dependency)
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) return res.status(401).json({ error: "Missing token" });

    const decoded = await adminApp.auth().verifyIdToken(token);
    const adminUid = decoded.uid;

    const adminSnap = await db.collection("users").doc(adminUid).get();
    if (!adminSnap.exists) {
      return res.status(403).json({ error: "Officer not found." });
    }

    const adminUser = adminSnap.data() as any;
    if (adminUser.role !== "ADMIN") {
      return res.status(403).json({ error: "Only ADMIN allowed." });
    }

    const { discipline, q } = req.query;

    let ref: FirebaseFirestore.Query = db
      .collection("users")
      .where("role", "in", ["JE", "FE"])
      .where("active", "==", true);

    const disc = cleanStr(discipline);
    if (disc) {
      ref = ref.where("discipline", "==", disc.toUpperCase());
    }

    const snap = await ref.limit(100).get();
    const qStr = cleanStr(q).toLowerCase();

    const jes = snap.docs
      .map((d) => {
        const u = d.data() as any;
        return {
          officerCode: d.id,
          name: u.name || "",
          phone: u.phone || "",
          email: u.email || "",
          discipline: u.discipline || "",
          orgUnitPath: u.orgUnitPath || "",
          zoneCode: u.zoneCode || "",
          circleCode: u.circleCode || "",
          divisionCode: u.divisionCode || "",
          subdivisionCode: u.subdivisionCode || "",
          sectionCode: u.sectionCode || "",
        };
      })
      .filter((je) => {
        if (!qStr) return true;
        const hay = (
          je.officerCode +
          " " +
          je.name +
          " " +
          (je.phone || "")
        ).toLowerCase();
        return hay.includes(qStr);
      });

    return res.status(200).json({ ok: true, jes });
  } catch (err: any) {
    console.error("[ADMIN je-search] ERROR:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to search JEs" });
  }
}

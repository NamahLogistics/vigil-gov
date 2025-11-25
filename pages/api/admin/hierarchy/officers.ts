// pages/api/admin/hierarchy/officers.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/firebaseAdmin";

function toBool(v: any): boolean | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { role, active, search, limit } = req.query;

    let ref: FirebaseFirestore.Query = db.collection("users");
    const max = Math.min(Number(limit || 300), 1000);

    // ---- role filter ----
    if (role) {
      const r = String(role).toUpperCase();
      ref = ref.where("role", "==", r);
    }

    // ---- active filter ----
    const activeBool = toBool(active);
    if (activeBool !== null) {
      ref = ref.where("active", "==", activeBool);
    }

    const snap = await ref.limit(max).get();

    const officers = snap.docs.map((doc) => {
      const data = doc.data() as any;

      return {
        id: doc.id,
        officerCode: data.officerCode || doc.id,
        name: data.name || "",
        phone: data.phone || "",
        email: data.email || "",
        role: data.role || "",
        departmentCode: data.departmentCode || "",
        departmentName: data.departmentName || "",
        discipline: data.discipline || "", // 👈 IMPORTANT
        zoneCode: data.zoneCode || "",
        zoneName: data.zoneName || "",
        circleCode: data.circleCode || "",
        circleName: data.circleName || "",
        divisionCode: data.divisionCode || "",
        divisionName: data.divisionName || "",
        subdivisionCode: data.subdivisionCode || "",
        subdivisionName: data.subdivisionName || "",
        sectionCode: data.sectionCode || "",
        sectionName: data.sectionName || "",
        orgUnitPath: data.orgUnitPath || "",
        photoUrl: data.photoUrl || null,
        masterFaceUrl: data.masterFaceUrl || null,
        active: data.active === true,
      };
    });

    // ---- search filter (in-memory) ----
    let filtered = officers;
    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      filtered = officers.filter((o) => {
        return (
          String(o.officerCode).toLowerCase().includes(q) ||
          String(o.name).toLowerCase().includes(q) ||
          String(o.phone).toLowerCase().includes(q) ||
          String(o.email).toLowerCase().includes(q)
        );
      });
    }

    return res.status(200).json({ officers: filtered });
  } catch (err: any) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to load officers" });
  }
}

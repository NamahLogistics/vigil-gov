// pages/api/admin/hierarchy/update-officer.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/firebaseAdmin";

function clean(v: any): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function normalizeBoolMaybe(v: any): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).trim().toLowerCase();
  if (!s) return undefined;
  return ["true", "1", "yes", "y"].includes(s);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const {
      officerCode,
      name,
      phone,
      email,
      role,
      departmentCode,
      departmentName,
      zoneCode,
      zoneName,
      circleCode,
      circleName,
      divisionCode,
      divisionName,
      subdivisionCode,
      subdivisionName,
      sectionCode,
      sectionName,
      active,
      discipline,
    } = req.body || {};

    if (!officerCode) {
      return res.status(400).json({ error: "officerCode is required" });
    }

    const userRef = db.collection("users").doc(String(officerCode));
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ error: "Officer not found" });
    }

    const existing = userSnap.data() as any;

    const update: any = {};
    const now = new Date();

    // ---- BASIC PERSONAL FIELDS ----
    const nameC = clean(name);
    const phoneC = clean(phone);
    const emailC = clean(email);

    if (nameC !== undefined) update.name = nameC;
    if (phoneC !== undefined) update.phone = phoneC;
    if (emailC !== undefined) update.email = emailC;

    // ---- ROLE ----
    const roleClean = clean(role);
    if (roleClean) {
      const allowedRoles = ["JE", "FE", "SDO", "EE", "SE", "CE", "ADMIN"];
      const upper = roleClean.toUpperCase();
      if (!allowedRoles.includes(upper)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      update.role = upper;
    }

    // ---- BASIC FIELDS (dept + org codes) ----
    const depC = clean(departmentCode);
    const depN = clean(departmentName);
    const zC = clean(zoneCode);
    const zN = clean(zoneName);
    const cirC = clean(circleCode);
    const cirN = clean(circleName);
    const divC = clean(divisionCode);
    const divN = clean(divisionName);
    const subC = clean(subdivisionCode);
    const subN = clean(subdivisionName);
    const secC = clean(sectionCode);
    const secN = clean(sectionName);

    if (depC !== undefined) update.departmentCode = depC;
    if (depN !== undefined) update.departmentName = depN;
    if (zC !== undefined) update.zoneCode = zC;
    if (zN !== undefined) update.zoneName = zN;
    if (cirC !== undefined) update.circleCode = cirC;
    if (cirN !== undefined) update.circleName = cirN;
    if (divC !== undefined) update.divisionCode = divC;
    if (divN !== undefined) update.divisionName = divN;
    if (subC !== undefined) update.subdivisionCode = subC;
    if (subN !== undefined) update.subdivisionName = subN;
    if (secC !== undefined) update.sectionCode = secC;
    if (secN !== undefined) update.sectionName = secN;

    // ---- ACTIVE FLAG ----
    const activeMaybe = normalizeBoolMaybe(active);
    if (activeMaybe !== undefined) {
      update.active = activeMaybe;
    }

    // ---- DISCIPLINE (preserve existing, optionally allow override) ----
    let finalDiscipline: string =
      clean(discipline)?.toUpperCase() ||
      (existing.discipline ? String(existing.discipline).toUpperCase() : "");

    if (!finalDiscipline) {
      finalDiscipline = "GENERAL";
    }

    update.discipline = finalDiscipline;

    // ---- FINAL ORG CODES (fall back to existing if not provided) ----
    const finalDeptC = depC ?? existing.departmentCode ?? "";
    const finalZoneC = zC ?? existing.zoneCode ?? "";
    const finalCircleC = cirC ?? existing.circleCode ?? "";
    const finalDivC = divC ?? existing.divisionCode ?? "";
    const finalSubC = subC ?? existing.subdivisionCode ?? "";
    const finalSecC = secC ?? existing.sectionCode ?? "";

    const finalDeptCode = String(finalDeptC || "").trim();

    // ---- ORG UNIT PATH WITH DISCIPLINE ----
    // /departmentCode/discipline/zone/circle/division/subdivision/section
    update.orgUnitPath = [
      finalDeptCode,
      finalDiscipline,
      finalZoneC,
      finalCircleC,
      finalDivC,
      finalSubC,
      finalSecC,
    ]
      .filter(Boolean)
      .join("/");

    update.updatedAt = now;

    await userRef.set(update, { merge: true });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to update officer" });
  }
}

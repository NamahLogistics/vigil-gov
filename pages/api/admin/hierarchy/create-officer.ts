// pages/api/admin/hierarchy/create-officer.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/firebaseAdmin";

function clean(v: any): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function normalizeBool(v: any, fallback: boolean): boolean {
  if (v === undefined || v === null || v === "") return fallback;
  const s = String(v).trim().toLowerCase();
  if (!s) return fallback;
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return fallback;
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
      discipline,
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
    } = req.body || {};

    const code = clean(officerCode);
    if (!code) {
      return res.status(400).json({ error: "officerCode is required" });
    }

    const userRef = db.collection("users").doc(code);
    const existingSnap = await userRef.get();
    if (existingSnap.exists) {
      return res.status(400).json({
        error: "Officer with this code already exists. Use Edit instead.",
      });
    }

    const nameC = clean(name);
    const phoneC = clean(phone);
    const emailC = clean(email);
    const roleC = clean(role)?.toUpperCase();
    const depC = clean(departmentCode);
    const depN = clean(departmentName);
    const discC = (clean(discipline) || "GENERAL")!.toUpperCase();
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

    if (!nameC || !phoneC || !roleC) {
      return res.status(400).json({
        error: "name, phone and role are required for new officer",
      });
    }

    const allowedRoles = ["JE", "FE", "SDO", "EE", "SE", "CE", "ADMIN"];
    if (!allowedRoles.includes(roleC)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const isActive = normalizeBool(active, true);

    const orgUnitPath = [
      depC,
      discC,
      zC,
      cirC,
      divC,
      subC,
      secC,
    ]
      .filter(Boolean)
      .join("/");

    const now = new Date();

    const payload: any = {
      officerCode: code,
      name: nameC,
      phone: phoneC,
      email: emailC || "",
      role: roleC,
      departmentCode: depC || "",
      departmentName: depN || "",
      discipline: discC,
      zoneCode: zC || "",
      zoneName: zN || "",
      circleCode: cirC || "",
      circleName: cirN || "",
      divisionCode: divC || "",
      divisionName: divN || "",
      subdivisionCode: subC || "",
      subdivisionName: subN || "",
      sectionCode: secC || "",
      sectionName: secN || "",
      orgUnitPath,
      active: isActive,
      createdAt: now,
      updatedAt: now,
    };

    await userRef.set(payload);

    return res.status(200).json({ success: true, officer: payload });
  } catch (err: any) {
    console.error("[create-officer] ERROR", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to create officer" });
  }
}

// pages/api/admin/hierarchy/import-csv.ts
//
// CSV → users collection
// - officerCode is doc ID
// - discipline (CIVIL / ELECTRICAL / MECHANICAL / ...) supported
// - orgUnitPath = departmentCode/discipline/zone/circle/division/subdivision/section

import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/firebaseAdmin";

// We are handling multipart/form-data (file upload)
export const config = {
  api: {
    bodyParser: false,
  },
};

interface CsvRow {
  officerCode?: string;
  officercode?: string;

  name?: string;
  phone?: string;
  email?: string;

  role?: string;

  departmentCode?: string;
  departmentName?: string;

  discipline?: string; // 👈 NEW

  zoneCode?: string;
  zoneName?: string;

  circleCode?: string;
  circleName?: string;

  divisionCode?: string;
  divisionName?: string;

  subdivisionCode?: string;
  subdivisionName?: string;

  sectionCode?: string;
  sectionName?: string;

  // photoUrl hata diya
  active?: string;
}

function normalizeBool(v: any): boolean {
  if (v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  if (!s) return false;
  return ["true", "1", "yes", "y"].includes(s);
}

function cleanStr(v: any): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

async function parseForm(
  req: NextApiRequest
): Promise<{ file: formidable.File }> {
  const form = formidable({ multiples: false });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, _fields, files) => {
      if (err) return reject(err);

      const file = files.file;
      if (!file) {
        return reject(new Error("No 'file' field in form-data"));
      }

      // formidable v2/v3 difference handling
      const actualFile = Array.isArray(file) ? file[0] : file;

      resolve({ file: actualFile });
    });
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 1) Parse multipart form to get CSV file
    const { file } = await parseForm(req);

    // @ts-ignore – formidable File type differs by version
    const filepath: string = (file.filepath || file.path) as string;
    if (!filepath) {
      return res
        .status(400)
        .json({ error: "Upload failed: no file path found" });
    }

    // 2) Read CSV content
    const buffer = await fs.promises.readFile(filepath);
    const text = buffer.toString("utf8");

    // 3) Parse CSV into records
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRow[];

    let created = 0;
    let updated = 0;
    let errors = 0;

    const batch = db.batch();
    const usersCol = db.collection("users");

    for (const row of records) {
      try {
        // officerCode is mandatory (acts as doc ID)
        const officerCode =
          cleanStr(row.officerCode) || cleanStr((row as any).officercode);

        if (!officerCode) {
          errors++;
          continue;
        }

        const name = cleanStr(row.name);
        const phone = cleanStr(row.phone);
        const email = cleanStr(row.email);

        let role = cleanStr(row.role).toUpperCase() as
          | "JE"
          | "FE"
          | "SDO"
          | "EE"
          | "SE"
          | "CE"
          | "ADMIN"
          | "";

        // Basic role validation (FE added)
        const allowedRoles = ["JE", "FE", "SDO", "EE", "SE", "CE", "ADMIN"];
        if (!allowedRoles.includes(role)) {
          console.warn("Invalid role for officerCode:", officerCode, role);
          errors++;
          continue;
        }

        const departmentCode = cleanStr(row.departmentCode);
        const departmentName = cleanStr(row.departmentName);

        // NEW: discipline
        const disciplineRaw = cleanStr((row as any).discipline);
        // Normalise: CIVIL / ELECTRICAL / MECHANICAL / OTHER...
        const discipline =
          disciplineRaw.toUpperCase() || "GENERAL"; // fallback if empty

        const zoneCode = cleanStr(row.zoneCode);
        const zoneName = cleanStr(row.zoneName);

        const circleCode = cleanStr(row.circleCode);
        const circleName = cleanStr(row.circleName);

        const divisionCode = cleanStr(row.divisionCode);
        const divisionName = cleanStr(row.divisionName);

        const subdivisionCode = cleanStr(row.subdivisionCode);
        const subdivisionName = cleanStr(row.subdivisionName);

        const sectionCode = cleanStr(row.sectionCode);
        const sectionName = cleanStr(row.sectionName);

        const active = normalizeBool(row.active);

        // orgUnitPath with discipline segment:
        // /WRD/CIVIL/Z-IND/CIR-01/DIV-02/SUB-03/SEC-01
        const orgUnitPath = [
          departmentCode,
          discipline,
          zoneCode,
          circleCode,
          divisionCode,
          subdivisionCode,
          sectionCode,
        ]
          .filter(Boolean)
          .join("/");

        const userRef = usersCol.doc(officerCode);
        const snap = await userRef.get();

        const now = new Date();

        const payload: any = {
          officerCode,
          name,
          phone,
          email,
          role,
          departmentCode,
          departmentName,
          discipline, // 👈 store discipline for filters
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
          orgUnitPath,
          active,
          updatedAt: now,
        };

        if (!snap.exists) {
          payload.createdAt = now;
          created++;
        } else {
          updated++;
        }

        batch.set(userRef, payload, { merge: true });
      } catch (e) {
        console.error("Row import error:", e);
        errors++;
      }
    }

    await batch.commit();

    return res.status(200).json({
      created,
      updated,
      errors,
      total: records.length,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({
      error: err.message || "Failed to import hierarchy CSV",
    });
  }
}

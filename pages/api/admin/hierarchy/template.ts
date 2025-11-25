// pages/api/admin/hierarchy/template.ts

import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  const header = [
    "officerCode",
    "name",
    "phone",
    "email",
    "role",
    "departmentCode",
    "departmentName",
    "discipline",       // 👈 NEW: CIVIL / ELECTRICAL / MECHANICAL / ...
    "zoneCode",
    "zoneName",
    "circleCode",
    "circleName",
    "divisionCode",
    "divisionName",
    "subdivisionCode",
    "subdivisionName",
    "sectionCode",
    "sectionName",
    "active",           // last column stays active
  ].join(",");

  const sample = [
    "WRD-001",
    "Ramesh Kumar",
    "9876543210",
    "ramesh@example.com",
    "JE",
    "WRD",
    "Water Resources Dept",
    "CIVIL",            // 👈 discipline example
    "Z-IND",
    "Indore Zone",
    "CIR-01",
    "Indore Circle-1",
    "DIV-02",
    "Indore Division-2",
    "SUB-03",
    "Sub-Division-3",
    "SEC-01",
    "Section-1",
    "TRUE",             // active
  ].join(",");

  const csv = header + "\r\n" + sample + "\r\n";

  res.setHeader(
    "Content-Disposition",
    'attachment; filename="officers-template.csv"'
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");

  res.status(200).send(csv);
}

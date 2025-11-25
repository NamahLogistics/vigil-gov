// pages/api/admin/ps-notes-pdf.ts
//
// Generates a PDF of PS remarks for all watchlisted projects
// Used by: PS dashboard "⬇ PS Remarks PDF" button

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";
const PDFDocument = require("pdfkit");

export const config = {
  api: {
    bodyParser: false, // we stream PDF
  },
};

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
      return res.status(401).json({ error: "Missing token" });
    }

    const decoded = await adminApp.auth().verifyIdToken(token);
    const userId = decoded.uid;

    const userSnap = await db.collection("users").doc(userId).get();
    if (!userSnap.exists) {
      return res.status(403).json({ error: "User not found" });
    }

    const user = userSnap.data() || {};
    const role = user.role || "";

    if (role !== "ADMIN" && role !== "PS") {
      return res.status(403).json({ error: "Not allowed" });
    }

    const watchlist: string[] = Array.isArray(user.psWatchlist)
      ? user.psWatchlist
      : [];

    if (watchlist.length === 0) {
      return res
        .status(400)
        .json({ error: "No watchlist projects found." });
    }

    // Prepare response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="ps-remarks.pdf"'
    );

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res as any);

    const today = new Date();
    const dateStr = today.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    doc.fontSize(16).text("Meeting Remarks", {
      align: "center",
    });
    doc.moveDown(0.3);
    doc.fontSize(10).text(`Date: ${dateStr}`, { align: "center" });
    doc.moveDown(1);

    for (const projectId of watchlist) {
      const projSnap = await db
        .collection("projects")
        .doc(projectId)
        .get();
      if (!projSnap.exists) continue;
      const p = projSnap.data() as any;

      const notesSnap = await db
        .collection("projects")
        .doc(projectId)
        .collection("psNotes")
        .orderBy("createdAt", "asc")
        .get();

      const notes = notesSnap.docs.map((d) => d.data() as any);

      // Skip if no notes for this project
      if (!notes.length) continue;

      // Project header
      doc
        .fontSize(12)
        .text(p.name || `Project ${projectId}`, { underline: true });
      doc.moveDown(0.2);

      if (p.orgUnitPath) {
        doc
          .fontSize(9)
          .fillColor("gray")
          .text(p.orgUnitPath);
        doc.fillColor("black");
      }

      if (typeof p.sanctionedAmount === "number") {
        doc
          .fontSize(9)
          .text(
            `Sanctioned: ₹${p.sanctionedAmount.toLocaleString("en-IN")}`
          );
      }

      if (
        typeof p.physicalPercent === "number" ||
        typeof p.financialPercent === "number"
      ) {
        doc
          .fontSize(9)
          .text(
            `Physical: ${p.physicalPercent || 0}%  |  Financial: ${
              p.financialPercent || 0
            }%`
          );
      }

      doc.moveDown(0.4);
      doc.fontSize(10).text("PS Remarks:", { underline: true });
      doc.moveDown(0.2);

      notes.forEach((n: any, idx: number) => {
       const d =
  n.createdAt && typeof n.createdAt.toDate === "function"
    ? n.createdAt.toDate()
    : n.createdAt
    ? new Date(n.createdAt)
    : null;

        const dStr = d
          ? d.toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "";

        const prefix = `${idx + 1}. `;
        const meta = [];

        if (n.createdByName) meta.push(n.createdByName);
        if (dStr) meta.push(dStr);

        const metaStr = meta.length ? ` (${meta.join(" · ")})` : "";

        doc
          .fontSize(10)
          .text(`${prefix}${n.text || ""}${metaStr}`, {
            indent: 10,
          });
        doc.moveDown(0.1);
      });

      doc.moveDown(0.8);
    }

    doc.end();
  } catch (err: any) {
    console.error("PS-NOTES-PDF ERROR", err);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: err.message || "Internal error" });
    }
  }
}
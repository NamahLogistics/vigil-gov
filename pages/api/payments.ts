// pages/api/payments.ts
//
// Updated: Fully officerCode-based (no UID anywhere)
// EE + ADMIN can add payments
// createdBy = officerCode

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";
import type { Payment, Project, Package } from "@/lib/types";

// ---------- LOCAL HELPERS (remove import from "@/lib/progress") ----------

function computeProjectFinancialPercent(
  sanctionedAmount: number,
  payments: Payment[]
): number {
  const totalPaid = payments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );
  if (!sanctionedAmount || sanctionedAmount <= 0) return 0;
  const pct = (totalPaid / sanctionedAmount) * 100;
  return Math.max(0, Math.min(100, Number(pct.toFixed(2))));
}

function computePackageFinancialPercent(
  packageAmount: number,
  payments: Payment[]
): number {
  const totalPaid = payments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );
  if (!packageAmount || packageAmount <= 0) return 0;
  const pct = (totalPaid / packageAmount) * 100;
  return Math.max(0, Math.min(100, Number(pct.toFixed(2))));
}

// ------------------------------------------------------------------------

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ----------------------------
  // AUTH → phone_number → officerCode
  // ----------------------------
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  let phoneNumber: string | undefined;
  try {
    const decoded = await adminApp.auth().verifyIdToken(token);
    phoneNumber = decoded.phone_number as string | undefined;
  } catch (err) {
    console.error("verifyIdToken error:", err);
    return res.status(401).json({ error: "Invalid auth token" });
  }

  if (!phoneNumber) {
    return res.status(401).json({
      error: "Phone login required (phone_number missing)",
    });
  }

  // Load officer using phone → officerCode
  let snap = await db
    .collection("users")
    .where("phone", "==", phoneNumber)
    .limit(1)
    .get();

  // fallback for CSV without +91
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
      error: "User not registered in hierarchy (CSV).",
    });
  }

  const userDoc = snap.docs[0];
  const officerCode = userDoc.id;
  const user = { id: officerCode, ...(userDoc.data() as any) };

  if (!(user.role === "EE" || user.role === "ADMIN")) {
    return res.status(403).json({
      error: "Only EE/ADMIN can add payments",
    });
  }

  try {
    const { projectId, packageId, billNo, billDate, amount } = req.body || {};

    if (!projectId || !billNo || !billDate || !amount) {
      return res.status(400).json({
        error: "projectId, billNo, billDate, amount are required",
      });
    }

    // ----------------------------
    // LOAD PROJECT
    // ----------------------------
    const projectSnap = await db.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) {
      return res.status(404).json({ error: "Project not found" });
    }

    const project = {
      id: projectSnap.id,
      ...(projectSnap.data() as any),
    } as Project;

    const now = Date.now();

    // ----------------------------
    // CREATE PAYMENT ENTRY
    // ----------------------------
    const paymentRef = db
      .collection("projects")
      .doc(projectId)
      .collection("payments")
      .doc();

    const payment: Payment = {
      id: paymentRef.id,
      projectId,
      packageId: packageId || undefined,
      billNo: String(billNo),
      billDate: new Date(billDate).getTime(),
      amount: Number(amount),
      createdBy: officerCode, // <-- FIXED
      createdAt: now,
    };

    await paymentRef.set(payment);

    // ----------------------------
    // RECOMPUTE PROJECT FINANCIAL %
    // ----------------------------
    const paymentsSnap = await db
      .collection("projects")
      .doc(projectId)
      .collection("payments")
      .get();

    const payments = paymentsSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    })) as Payment[];

    const newProjectFinancial = computeProjectFinancialPercent(
      project.sanctionedAmount,
      payments
    );

    await projectSnap.ref.update({
      financialPercent: newProjectFinancial,
    });

    // ----------------------------
    // RECOMPUTE PACKAGE FINANCIAL %
    // ----------------------------
    let newPackageFinancial: number | null = null;

    if (packageId) {
      const pkgSnap = await db
        .collection("projects")
        .doc(projectId)
        .collection("packages")
        .doc(String(packageId))
        .get();

      if (pkgSnap.exists) {
        const pkg = {
          id: pkgSnap.id,
          ...(pkgSnap.data() as any),
        } as Package;

        const pkgPayments = payments.filter(
          (p) => p.packageId === pkg.id
        );

        newPackageFinancial = computePackageFinancialPercent(
          pkg.amount,
          pkgPayments
        );

        await pkgSnap.ref.update({
          financialPercent: newPackageFinancial,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      payment,
      projectFinancialPercent: newProjectFinancial,
      packageFinancialPercent: newPackageFinancial,
    });
  } catch (err: any) {
    console.error("Error in /api/payments:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

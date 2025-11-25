// lib/progress.ts
//
// Pure rule-based progress calculation based on stage weights.
// Now uses JE-reported and SDO-verified percentages on stages.
// This file recalculates package + project physicalPercent.

import { Firestore } from "firebase-admin/firestore";
import type { Stage } from "./types";

export async function markStageCompleted(
  db: Firestore,
  projectId: string,
  packageId: string,
  stageId: string
): Promise<void> {
  const stageRef = db
    .collection("projects")
    .doc(projectId)
    .collection("packages")
    .doc(packageId)
    .collection("stages")
    .doc(stageId);

  const snap = await stageRef.get();
  if (!snap.exists) {
    throw new Error("Stage not found");
  }

  const data = snap.data() || {};

  // Legacy: still support "completed" flag if something else is calling this.
  if (data.completed) return;

  await stageRef.update({
    completed: true,
    completedAt: Date.now(),
  });
}

/**
 * Helper to clamp any numeric value into 0–100 range.
 */
function clampPercent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

/**
 * Determine effective progress for a stage:
 * - Prefer SDO-verified percent if present
 * - Otherwise fall back to JE-reported percent
 * - Otherwise 0
 */
function getStageEffectiveProgress(stage: Stage | any): number {
  if (typeof stage.verifiedProgressPercent === "number") {
    return clampPercent(stage.verifiedProgressPercent);
  }
  if (typeof stage.reportedProgressPercent === "number") {
    return clampPercent(stage.reportedProgressPercent);
  }
  return 0;
}

/**
 * Recompute physicalPercent for a single package based on its stages.
 *
 * Each stage:
 *  - has weightPercent (sum per package should be ~100)
 *  - contributes weightPercent * (effectiveProgress / 100)
 *
 * Package physicalPercent is the sum of those contributions,
 * normalised by total weight if needed.
 */
export async function recomputePackagePhysical(
  db: Firestore,
  projectId: string,
  packageId: string
): Promise<number> {
  const stagesSnap = await db
    .collection("projects")
    .doc(projectId)
    .collection("packages")
    .doc(packageId)
    .collection("stages")
    .get();

  if (stagesSnap.empty) {
    await db
      .collection("projects")
      .doc(projectId)
      .collection("packages")
      .doc(packageId)
      .update({ physicalPercent: 0 });
    return 0;
  }

  let totalWeight = 0;
  let weightedProgress = 0;

  stagesSnap.forEach((doc) => {
    const st = doc.data() as Stage & { weightPercent?: number };
    const w = Number(st.weightPercent || 0);
    if (!w) return;

    const progress = getStageEffectiveProgress(st); // 0–100

    totalWeight += w;
    weightedProgress += w * (progress / 100); // this is in "weight points"
  });

  // If weights sum to 100, weightedProgress is already a %.
  // If not, normalise by totalWeight.
  const physicalPercent =
    totalWeight > 0 ? clampPercent((weightedProgress / totalWeight) * 100) : 0;

  await db
    .collection("projects")
    .doc(projectId)
    .collection("packages")
    .doc(packageId)
    .update({
      physicalPercent,
    });

  return physicalPercent;
}

/**
 * Recompute project-level physicalPercent from its packages.
 *
 * Uses package.amount (₹) as weight:
 *   projectPhysical = Σ(pkg.amount * pkg.physical%) / Σ(pkg.amount)
 */
export async function recomputeProjectPhysicalFromPackages(
  db: Firestore,
  projectId: string
): Promise<number> {
  const pkgSnap = await db
    .collection("projects")
    .doc(projectId)
    .collection("packages")
    .get();

  if (pkgSnap.empty) {
    await db.collection("projects").doc(projectId).update({
      physicalPercent: 0,
    });
    return 0;
  }

  let totalAmount = 0;
  let weighted = 0;

  pkgSnap.forEach((doc) => {
    const pkg = doc.data() as any;
    const amt = Number(pkg.amount || 0);
    const phy = Number(pkg.physicalPercent || 0);
    if (amt <= 0) return;

    totalAmount += amt;
    weighted += amt * phy;
  });

  const projectPhysicalPercent =
    totalAmount > 0 ? weighted / totalAmount : 0;

  await db.collection("projects").doc(projectId).update({
    physicalPercent: projectPhysicalPercent,
  });

  return projectPhysicalPercent;
}
// lib/progress.ts (append at bottom)



interface PackageForProgress {
  id: string;
  amount: number;   // package value in rupees
  stages: Stage[];
}

export interface ProjectProgressBreakdown {
  physicalPercent: number;         // overall physical progress 0–100
  greenVerifiedPercent: number;    // SDO-verified contribution
  jeOnlyPercent: number;           // only JE-reported
  offsiteVerifiedPercent: number;  // reserved for future (geo-based)
}

export function computeProjectProgressBreakdown(
  packages: PackageForProgress[]
): ProjectProgressBreakdown {
  if (!packages || packages.length === 0) {
    return {
      physicalPercent: 0,
      greenVerifiedPercent: 0,
      jeOnlyPercent: 0,
      offsiteVerifiedPercent: 0,
    };
  }

  // total ₹ for weighting
  let totalAmount = 0;
  for (const pkg of packages) {
    totalAmount += pkg.amount || 0;
  }
  if (totalAmount <= 0) {
    totalAmount = packages.length;
    for (const pkg of packages) {
      if (!pkg.amount || pkg.amount <= 0) {
        pkg.amount = 1;
      }
    }
  }

  let weightedPhysical = 0;
  let greenWeighted = 0;
  let jeOnlyWeighted = 0;
  let offsiteWeighted = 0; // will be filled later with geo logic

  for (const pkg of packages) {
    const pkgAmount = pkg.amount || 0;
    if (pkgAmount <= 0) continue;

    const stages = pkg.stages || [];
    if (!stages.length) continue;

    // package physical (like recomputePackagePhysical, but pure)
    let totalWeight = 0;
    let weightedStageProgress = 0;

    let pkgGreen = 0;
    let pkgJeOnly = 0;
    let pkgOffsite = 0; // 0 for now

    for (const st of stages as any as Stage[]) {
      const w = Number(st.weightPercent || 0);
      if (!w) continue;

      const reported = clampPercent(st.reportedProgressPercent ?? 0);
      const verified = clampPercent(st.verifiedProgressPercent ?? 0);
      const effective = verified || reported;

      totalWeight += w;
      weightedStageProgress += w * (effective / 100);

      if (verified > 0) {
        // currently all verified treated as green, offsite later
        pkgGreen += w * (verified / 100);
      } else if (reported > 0) {
        pkgJeOnly += w * (reported / 100);
      }
    }

    const pkgPhysical =
      totalWeight > 0
        ? clampPercent((weightedStageProgress / totalWeight) * 100)
        : 0;

    const pkgWeight = pkgAmount / totalAmount; // 0–1

    weightedPhysical += pkgPhysical * pkgWeight;
    greenWeighted += clampPercent(pkgGreen) * pkgWeight;
    jeOnlyWeighted += clampPercent(pkgJeOnly) * pkgWeight;
    offsiteWeighted += clampPercent(pkgOffsite) * pkgWeight;
  }

  return {
    physicalPercent: clampPercent(weightedPhysical),
    greenVerifiedPercent: clampPercent(greenWeighted),
    jeOnlyPercent: clampPercent(jeOnlyWeighted),
    offsiteVerifiedPercent: clampPercent(offsiteWeighted),
  };
}

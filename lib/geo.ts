// lib/geo.ts

import type { GpsPoint, Project } from "./types";

/**
 * Compute distance between two GPS points in meters using haversine formula.
 */
export function distanceMeters(a: GpsPoint, b: GpsPoint): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return R * c;
}

/**
 * Check if a point is inside a project's allowed radius.
 */
export function isInsideProjectRadius(
  project: Project,
  point: GpsPoint,
  marginMeters = 50
): boolean {
  if (!project.siteCenter || !project.siteRadiusMeters) return false;

  const center: GpsPoint = {
    lat: project.siteCenter.lat,
    lng: project.siteCenter.lng,
  };

  const d = distanceMeters(center, point);
  return d <= project.siteRadiusMeters + marginMeters;
}

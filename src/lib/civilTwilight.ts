/**
 * Civil Twilight Calculator
 * Uses NOAA solar position formulas to calculate civil twilight times.
 * Civil twilight = sun at -6° below horizon.
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function julianDay(date: Date): number {
  return dayOfYear(date) + 2451545 - 1 + (date.getFullYear() - 2000) * 365.25;
}

/**
 * Calculate civil twilight times (dawn and dusk) for a given date and location.
 * Civil twilight: sun center is at -6° below the horizon.
 *
 * @returns { dawn: Date, dusk: Date } in UTC, or null if no twilight (polar day/night)
 */
export function getCivilTwilightTimes(
  date: Date,
  lat: number,
  lng: number
): { dawn: Date; dusk: Date } | null {
  const doy = dayOfYear(date);
  const year = date.getFullYear();

  // Fractional year (radians)
  const gamma = ((2 * Math.PI) / 365) * (doy - 1);

  // Equation of time (minutes)
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.04089 * Math.sin(2 * gamma));

  // Solar declination (radians)
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  // Hour angle for civil twilight (sun at -6°)
  const zenith = 96; // 90 + 6 degrees
  const latRad = lat * DEG_TO_RAD;

  const cosHA =
    (Math.cos(zenith * DEG_TO_RAD) - Math.sin(latRad) * Math.sin(decl)) /
    (Math.cos(latRad) * Math.cos(decl));

  // No civil twilight (polar conditions)
  if (cosHA > 1 || cosHA < -1) {
    return null;
  }

  const ha = Math.acos(cosHA) * RAD_TO_DEG;

  // Dawn (sunrise side) — minutes from midnight UTC
  const dawnMinutes = 720 - 4 * (lng + ha) - eqTime;
  // Dusk (sunset side)
  const duskMinutes = 720 - 4 * (lng - ha) - eqTime;

  const baseDate = new Date(year, date.getMonth(), date.getDate());

  const dawn = new Date(baseDate.getTime() + dawnMinutes * 60 * 1000);
  const dusk = new Date(baseDate.getTime() + duskMinutes * 60 * 1000);

  return { dawn, dusk };
}

/**
 * Format a UTC date as HH:MM local Norwegian time (Europe/Oslo).
 */
export function formatTimeNorwegian(date: Date): string {
  return date.toLocaleTimeString("no-NO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  });
}

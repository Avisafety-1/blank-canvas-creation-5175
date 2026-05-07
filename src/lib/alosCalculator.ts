// Calculates ALOS (Attitude Line of Sight) — the maximum VLOS distance.
// Avisafe-policy: bruk multirotor-formelen for ALLE droner i systemet
// (også FlyCart 100 og lignende), siden vi ikke opererer fastvinget.
//
// ALOS = 327 × CD + 20 m

export type AlosResult = {
  alosMaxM: number;
  alosCalculation: string;
  formula: 'multirotor';
};

export function calculateAlos(
  characteristicDimensionM?: number | null,
  _droneModel?: string | null,
): AlosResult | null {
  if (
    typeof characteristicDimensionM !== 'number' ||
    !Number.isFinite(characteristicDimensionM) ||
    characteristicDimensionM <= 0
  ) {
    return null;
  }
  const multiplier = 327;
  const offset = 20;
  const alosMaxM = Math.round(multiplier * characteristicDimensionM + offset);
  return {
    alosMaxM,
    alosCalculation: `${multiplier} × ${characteristicDimensionM}m + ${offset}m = ${alosMaxM}m`,
    formula: 'multirotor',
  };
}

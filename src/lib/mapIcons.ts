import dotSvg from "@/assets/safesky-icons/dot.svg";
import gliderSvg from "@/assets/safesky-icons/glider.svg";
import aircraftSvg from "@/assets/safesky-icons/aircraft.svg";
import lightAircraftSvg from "@/assets/safesky-icons/light_aircraft.svg";
import heavyAircraftSvg from "@/assets/safesky-icons/heavy_aircraft.svg";
import helicopterSvg from "@/assets/safesky-icons/helicopter.svg";
import heliAnim0 from "@/assets/safesky-icons/helicopter-anim_0.svg";
import heliAnim1 from "@/assets/safesky-icons/helicopter-anim_1.svg";
import heliAnim2 from "@/assets/safesky-icons/helicopter-anim_2.svg";
import heliAnim3 from "@/assets/safesky-icons/helicopter-anim_3.svg";
import droneAnimatedIcon from "@/assets/drone-animated.gif";

export const HELI_ANIM_FRAMES = [heliAnim0, heliAnim1, heliAnim2, heliAnim3];

export { droneAnimatedIcon };

// Map SafeSky beacon_type string to SVG icon URL
export function getBeaconSvgUrl(beaconType: string): string {
  switch (beaconType) {
    case 'MOTORPLANE': return aircraftSvg;
    case 'THREE_AXES_LIGHT_PLANE': return lightAircraftSvg;
    case 'JET': return heavyAircraftSvg;
    case 'GLIDER': return gliderSvg;
    case 'HELICOPTER': return heliAnim0;
    case 'GYROCOPTER': return helicopterSvg;
    case 'MILITARY': return aircraftSvg;
    case 'UAV': return droneAnimatedIcon;
    case 'UNKNOWN':
    case 'STATIC_OBJECT':
    case 'PARA_GLIDER':
    case 'HAND_GLIDER':
    case 'PARA_MOTOR':
    case 'PARACHUTE':
    case 'FLEX_WING_TRIKES':
    case 'AIRSHIP':
    case 'BALLOON':
    case 'PAV':
    default: return dotSvg;
  }
}

export function isAnimatedType(beaconType: string): boolean {
  return beaconType === 'HELICOPTER';
}

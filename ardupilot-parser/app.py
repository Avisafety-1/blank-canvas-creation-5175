"""
ArduPilot .bin log parser — Fly.io microservice.
Receives a .bin file via POST /parse, returns structured JSON
using pymavlink.
"""

import datetime
import io
import json
import math as _math
import math
import os
import tempfile

from flask import Flask, Response, jsonify, request

app = Flask(__name__)

PARSER_SECRET = os.environ.get("ARDUPILOT_PARSER_SECRET", "")

# ── GPS epoch for UTC conversion ──
GPS_EPOCH = datetime.datetime(1980, 1, 6, tzinfo=datetime.timezone.utc)
GPS_LEAP_SECONDS = 18  # GPS is ahead of UTC by this many seconds (as of 2024)

# ── Flight mode maps per vehicle type ──

COPTER_MODES = {
    0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD", 3: "AUTO",
    4: "GUIDED", 5: "LOITER", 6: "RTL", 7: "CIRCLE",
    8: "POSITION", 9: "LAND", 10: "OF_LOITER", 11: "DRIFT",
    13: "SPORT", 14: "FLIP", 15: "AUTOTUNE", 16: "POSHOLD",
    17: "BRAKE", 18: "THROW", 19: "AVOID_ADSB", 20: "GUIDED_NOGPS",
    21: "SMART_RTL", 22: "FLOWHOLD", 23: "FOLLOW", 24: "ZIGZAG",
    25: "SYSTEMID", 26: "AUTOROTATE", 27: "AUTO_RTL",
}

PLANE_MODES = {
    0: "MANUAL", 1: "CIRCLE", 2: "STABILIZE", 3: "TRAINING",
    4: "ACRO", 5: "FLY_BY_WIRE_A", 6: "FLY_BY_WIRE_B",
    7: "CRUISE", 8: "AUTOTUNE", 10: "AUTO", 11: "RTL",
    12: "LOITER", 14: "AVOID_ADSB", 15: "GUIDED",
    17: "QSTABILIZE", 18: "QHOVER", 19: "QLOITER",
    20: "QLAND", 21: "QRTL", 22: "QAUTOTUNE", 23: "QACRO",
    24: "THERMAL",
}

ROVER_MODES = {
    0: "MANUAL", 1: "ACRO", 3: "STEERING", 4: "HOLD",
    5: "LOITER", 6: "FOLLOW", 7: "SIMPLE", 10: "AUTO",
    11: "RTL", 12: "SMART_RTL", 15: "GUIDED",
}

SUB_MODES = {
    0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD", 3: "AUTO",
    4: "GUIDED", 7: "CIRCLE", 9: "SURFACE", 16: "POSHOLD",
    19: "MANUAL",
}

VEHICLE_MODE_MAPS = {
    "ArduCopter": COPTER_MODES,
    "ArduPlane": PLANE_MODES,
    "ArduRover": ROVER_MODES,
    "ArduSub": SUB_MODES,
}

# ArduPilot ERR subsystem names
ERR_SUBSYS = {
    1: "MAIN", 2: "RADIO", 3: "COMPASS", 4: "OPTFLOW",
    5: "FAILSAFE_RADIO", 6: "FAILSAFE_BATT", 7: "FAILSAFE_GPS",
    8: "FAILSAFE_GCS", 9: "FAILSAFE_FENCE", 10: "FLIGHT_MODE",
    11: "GPS", 12: "CRASH_CHECK", 13: "FLIP", 14: "AUTOTUNE",
    15: "PARACHUTE", 16: "EKF_CHECK", 17: "FAILSAFE_EKF",
    18: "BARO", 19: "CPU", 20: "FAILSAFE_ADSB",
    21: "TERRAIN", 22: "NAVIGATION", 23: "FAILSAFE_TERRAIN",
    24: "EKF_PRIMARY", 25: "THRUST_LOSS", 26: "FAILSAFE_SENSOR",
    27: "FAILSAFE_LEAK", 28: "PILOT_INPUT",
}

# ArduPilot EV event IDs
EV_NAMES = {
    7: "AP_STATE_SAVE_TRIM", 8: "AP_STATE_SAVE_EEPROM",
    10: "ARMED", 11: "DISARMED", 15: "AUTO_ARMED",
    17: "LAND_COMPLETE_MAYBE", 18: "LAND_COMPLETE",
    21: "NOT_LANDED", 25: "SET_HOME",
    28: "NOT_LANDED", 30: "FLIP_START", 31: "FLIP_END",
    41: "SET_SIMPLE_ON", 42: "SET_SIMPLE_OFF",
    43: "SET_SUPERSIMPLE_ON", 44: "LOST_GPS",
    49: "EKF_ALT_RESET", 50: "EKF_YAW_RESET",
    56: "SURFACED", 57: "NOT_SURFACED",
    58: "BOTTOMED", 59: "NOT_BOTTOMED",
}

# Message prefixes to skip for UI (raw messages still kept in messages_all)
SKIP_MSG_PREFIXES = [
    "gimbal ", "fmuv", "chibios", "u-blox",
    "frame:", "rcout:", "barometer", "compass", "imu", "ins",
    "terrain:", "rally", "fence", "param ",
]


def _json_default(obj):
    """Handle non-serializable types for json.dumps."""
    if isinstance(obj, float) and (_math.isnan(obj) or _math.isinf(obj)):
        return None
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _safe_float(val):
    """Return None for NaN/Inf, otherwise the float."""
    if val is None:
        return None
    if isinstance(val, float) and (_math.isnan(val) or _math.isinf(val)):
        return None
    return val


def _gps_to_utc_iso(gps_week, gps_ms):
    """Convert GPS week number + milliseconds to ISO 8601 UTC string."""
    if gps_week is None or gps_ms is None:
        return None
    if gps_week <= 0 or gps_ms < 0:
        return None
    try:
        dt = (
            GPS_EPOCH
            + datetime.timedelta(weeks=int(gps_week), milliseconds=int(gps_ms))
            - datetime.timedelta(seconds=GPS_LEAP_SECONDS)
        )
        return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    except (OverflowError, ValueError):
        return None


def _haversine(lat1, lon1, lat2, lon2):
    """Calculate distance in meters between two GPS points."""
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "ok", "service": "ardupilot-parser"})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/parse", methods=["POST"])
def parse():
    # ── Auth ──
    if PARSER_SECRET:
        token = request.headers.get("X-Parser-Secret", "")
        if token != PARSER_SECRET:
            return jsonify({"error": "Unauthorized"}), 401

    # ── File ──
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    uploaded = request.files["file"]
    if not uploaded.filename:
        return jsonify({"error": "Empty filename"}), 400

    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        uploaded.save(tmp)
        tmp_path = tmp.name

    try:
        result = _parse_bin(tmp_path)
        return Response(
            json.dumps(result, ensure_ascii=False, allow_nan=False, default=_json_default),
            mimetype="application/json",
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        os.unlink(tmp_path)


def _should_skip_message(text: str) -> bool:
    """Return True if this MSG should be filtered out for UI display."""
    lower = text.lower().strip()
    for prefix in SKIP_MSG_PREFIXES:
        if lower.startswith(prefix):
            return True
    return False


def _detect_vehicle_type(path: str) -> tuple:
    """Pass 1: scan MSG messages to detect vehicle type and firmware version."""
    from pymavlink import mavutil

    mlog = mavutil.mavlink_connection(path, dialect="ardupilotmega")
    vehicle_type = "ArduPilot"
    firmware_version = None

    while True:
        msg = mlog.recv_match(type="MSG", blocking=False)
        if msg is None:
            break
        try:
            text = msg.Message
            txt_lower = text.lower()
            for tag, vtype in [
                ("arducopter", "ArduCopter"),
                ("arduplane", "ArduPlane"),
                ("ardurover", "ArduRover"),
                ("ardusub", "ArduSub"),
            ]:
                if tag in txt_lower:
                    vehicle_type = vtype
                    firmware_version = text.strip()
                    return vehicle_type, firmware_version
        except Exception:
            pass

    return vehicle_type, firmware_version


def _parse_bin(path: str) -> dict:
    from pymavlink import mavutil

    # ── Pass 1: detect vehicle type ──
    vehicle_type, firmware_version = _detect_vehicle_type(path)

    # Choose mode map based on vehicle type
    mode_map = VEHICLE_MODE_MAPS.get(vehicle_type, COPTER_MODES)

    # ── Pass 2: full parse ──
    mlog = mavutil.mavlink_connection(path, dialect="ardupilotmega")

    gps_list = []
    battery_list = []
    attitude_list = []
    modes_list = []
    messages_list = []
    messages_all_list = []
    vibe_list = []
    err_list = []
    ev_list = []
    ctun_list = []
    rcin_list = []
    params = {}

    while True:
        msg = mlog.recv_match(blocking=False)
        if msg is None:
            break

        msg_type = msg.get_type()

        if msg_type == "GPS":
            try:
                gps_list.append({
                    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                    "lat": msg.Lat,
                    "lng": msg.Lng,
                    "alt": msg.Alt,
                    "spd": msg.Spd,
                    "nSat": getattr(msg, "NSats", getattr(msg, "nSat", 0)),
                    "gps_week": getattr(msg, "GWk", None),
                    "gps_ms": getattr(msg, "GMS", None),
                })
            except Exception:
                pass

        elif msg_type in ("BAT", "BATT"):
            try:
                battery_list.append({
                    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                    "volt": msg.Volt,
                    "curr": getattr(msg, "Curr", None),
                    "remaining": getattr(msg, "Rem", None),
                    "curr_tot": getattr(msg, "CurrTot", None),
                    "temp": getattr(msg, "Temp", None),
                    "instance": getattr(msg, "Instance", 0),
                })
            except Exception:
                pass

        elif msg_type == "ATT":
            try:
                attitude_list.append({
                    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                    "pitch": msg.Pitch,
                    "roll": msg.Roll,
                    "yaw": msg.Yaw,
                })
            except Exception:
                pass

        elif msg_type == "MODE":
            try:
                mode_num = getattr(msg, "ModeNum", None)
                mode_name = getattr(msg, "Mode", None)

                if mode_num is not None:
                    resolved = mode_map.get(mode_num)
                    if resolved:
                        mode_name = resolved
                    elif mode_name is None:
                        mode_name = f"MODE_{mode_num}"

                if mode_name is None:
                    mode_name = "UNKNOWN"

                modes_list.append({
                    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                    "mode": str(mode_name),
                    "mode_num": mode_num,
                })
            except Exception:
                pass

        elif msg_type == "MSG":
            try:
                text = msg.Message
                # Always keep in raw list
                messages_all_list.append({
                    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                    "text": text,
                })
                # Filtered list for UI
                if not _should_skip_message(text):
                    messages_list.append({
                        "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                        "text": text,
                    })
            except Exception:
                pass

        elif msg_type == "VIBE":
            try:
                vibe_list.append({
                    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                    "vibe_x": getattr(msg, "VibeX", 0),
                    "vibe_y": getattr(msg, "VibeY", 0),
                    "vibe_z": getattr(msg, "VibeZ", 0),
                    "clip0": getattr(msg, "Clip0", 0),
                    "clip1": getattr(msg, "Clip1", 0),
                    "clip2": getattr(msg, "Clip2", 0),
                })
            except Exception:
                pass

        elif msg_type == "ERR":
            try:
                subsys = getattr(msg, "Subsys", 0)
                ecode = getattr(msg, "ECode", 0)
                err_list.append({
                    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                    "subsys": subsys,
                    "subsys_name": ERR_SUBSYS.get(subsys, f"UNKNOWN_{subsys}"),
                    "ecode": ecode,
                })
            except Exception:
                pass

        elif msg_type == "EV":
            try:
                ev_id = getattr(msg, "Id", 0)
                ev_list.append({
                    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                    "id": ev_id,
                    "name": EV_NAMES.get(ev_id, f"EVENT_{ev_id}"),
                })
            except Exception:
                pass

        elif msg_type == "CTUN":
            try:
                ctun_list.append({
                    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                    "alt": _safe_float(getattr(msg, "Alt", 0)),
                    "dalt": _safe_float(getattr(msg, "DAlt", 0)),
                    "thi": _safe_float(getattr(msg, "ThI", 0)),
                    "tho": _safe_float(getattr(msg, "ThO", 0)),
                    "crt": _safe_float(getattr(msg, "CRt", 0)),
                    "dsalt": _safe_float(getattr(msg, "DSAlt", 0)),
                })
            except Exception:
                pass

        elif msg_type == "RCIN":
            try:
                rcin_list.append({
                    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                    "c1": getattr(msg, "C1", 1500),
                    "c2": getattr(msg, "C2", 1500),
                    "c3": getattr(msg, "C3", 1000),
                    "c4": getattr(msg, "C4", 1500),
                })
            except Exception:
                pass

        elif msg_type == "PARM":
            try:
                params[msg.Name] = msg.Value
            except Exception:
                pass

    # ── Compute UTC timestamps from GPS week/ms ──
    start_utc = None
    end_utc = None
    for g in gps_list:
        utc = _gps_to_utc_iso(g.get("gps_week"), g.get("gps_ms"))
        if utc:
            if start_utc is None:
                start_utc = utc
            end_utc = utc

    # ── Build summary ──
    summary = _build_summary(gps_list, battery_list, err_list, ev_list, vibe_list, start_utc, end_utc)

    return {
        "gps": gps_list,
        "battery": battery_list,
        "attitude": attitude_list,
        "modes": modes_list,
        "messages": messages_list,
        "messages_all": messages_all_list,
        "vibe": vibe_list,
        "errors": err_list,
        "events": ev_list,
        "ctun": ctun_list,
        "rcin": rcin_list,
        "params": params,
        "vehicle_type": vehicle_type,
        "firmware_version": firmware_version,
        "start_utc": start_utc,
        "end_utc": end_utc,
        "summary": summary,
    }


def _build_summary(gps_list, battery_list, err_list, ev_list, vibe_list, start_utc, end_utc):
    """Compute a summary block from parsed data."""
    # Duration
    duration_s = 0
    if start_utc and end_utc:
        try:
            fmt = "%Y-%m-%dT%H:%M:%S.%fZ"
            t0 = datetime.datetime.strptime(start_utc, fmt)
            t1 = datetime.datetime.strptime(end_utc, fmt)
            duration_s = max(0, (t1 - t0).total_seconds())
        except Exception:
            pass

    # Max altitude, max speed, total distance from GPS
    max_alt = 0
    max_speed = 0
    total_distance = 0
    prev_lat = None
    prev_lng = None
    for g in gps_list:
        alt = g.get("alt", 0) or 0
        spd = g.get("spd", 0) or 0
        if alt > max_alt:
            max_alt = alt
        if spd > max_speed:
            max_speed = spd
        lat = g.get("lat", 0)
        lng = g.get("lng", 0)
        if prev_lat is not None and lat != 0 and lng != 0:
            total_distance += _haversine(prev_lat, prev_lng, lat, lng)
        if lat != 0 and lng != 0:
            prev_lat = lat
            prev_lng = lng

    # Battery summary (instance 0)
    batt0 = [b for b in battery_list if (b.get("instance") or 0) == 0]
    battery_start_v = batt0[0]["volt"] if batt0 else None
    battery_end_v = batt0[-1]["volt"] if batt0 else None
    battery_min_v = min((b["volt"] for b in batt0 if b.get("volt") is not None), default=None)

    # Vibration warning count
    warning_count = 0
    for v in vibe_list:
        if any((v.get(k, 0) or 0) > 0 for k in ("clip0", "clip1", "clip2")):
            warning_count += 1

    return {
        "duration_s": round(duration_s, 1),
        "max_alt_m": round(max_alt, 1),
        "max_speed_mps": round(max_speed, 1),
        "distance_m": round(total_distance, 1),
        "battery_start_v": round(battery_start_v, 2) if battery_start_v is not None else None,
        "battery_end_v": round(battery_end_v, 2) if battery_end_v is not None else None,
        "battery_min_v": round(battery_min_v, 2) if battery_min_v is not None else None,
        "error_count": len(err_list),
        "event_count": len(ev_list),
        "warning_count": warning_count,
    }


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)

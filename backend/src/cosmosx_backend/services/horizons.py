import json
import math
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
from urllib.request import Request, urlopen

HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"

# JPL Horizons major body / spacecraft NAIF IDs
HORIZONS_COMMAND_IDS: dict[str, str] = {
    "sun": "10",
    "mercury": "199",
    "venus": "299",
    "earth": "399",
    "moon": "301",
    "mars": "499",
    "jupiter": "599",
    "saturn": "699",
    "uranus": "799",
    "neptune": "899",
    "voyager-1": "-31",
    "voyager-2": "-32",
    "new-horizons": "-98",
    "parker-solar-probe": "-96",
}


@dataclass(frozen=True)
class StateVector:
    epoch_utc: datetime
    position_x_km: float
    position_y_km: float
    position_z_km: float
    velocity_kms: float | None
    source: str


def parse_horizons_vectors(result_text: str, fallback_epoch: datetime) -> StateVector | None:
    soe_match = re.search(r"\$\$SOE(.*?)\$\$EOE", result_text, flags=re.DOTALL)
    if not soe_match:
        return None

    block = soe_match.group(1)
    epoch_match = re.search(r"A\.D\.\s+(\d{4}-[A-Za-z]{3}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)", block)
    parsed_epoch = fallback_epoch
    if epoch_match:
        try:
            dt = datetime.strptime(epoch_match.group(1), "%Y-%b-%d %H:%M:%S.%f")
            parsed_epoch = dt.replace(tzinfo=None)
        except ValueError:
            parsed_epoch = fallback_epoch

    x_match = re.search(r"\bX\s*=\s*([+-]?\d+\.\d+E[+-]?\d+)", block, flags=re.IGNORECASE)
    y_match = re.search(r"\bY\s*=\s*([+-]?\d+\.\d+E[+-]?\d+)", block, flags=re.IGNORECASE)
    z_match = re.search(r"\bZ\s*=\s*([+-]?\d+\.\d+E[+-]?\d+)", block, flags=re.IGNORECASE)
    if not (x_match and y_match and z_match):
        return None

    x_km = float(x_match.group(1))
    y_km = float(y_match.group(1))
    z_km = float(z_match.group(1))

    vx_match = re.search(r"\bVX\s*=\s*([+-]?\d+\.\d+E[+-]?\d+)", block, flags=re.IGNORECASE)
    vy_match = re.search(r"\bVY\s*=\s*([+-]?\d+\.\d+E[+-]?\d+)", block, flags=re.IGNORECASE)
    vz_match = re.search(r"\bVZ\s*=\s*([+-]?\d+\.\d+E[+-]?\d+)", block, flags=re.IGNORECASE)

    speed_kms: float | None = None
    if vx_match and vy_match and vz_match:
        vx = float(vx_match.group(1))
        vy = float(vy_match.group(1))
        vz = float(vz_match.group(1))
        speed_kms = math.sqrt(vx * vx + vy * vy + vz * vz)

    return StateVector(
        epoch_utc=parsed_epoch,
        position_x_km=x_km,
        position_y_km=y_km,
        position_z_km=z_km,
        velocity_kms=speed_kms,
        source="jpl-horizons",
    )


def fetch_horizons_state_vector(
    slug: str,
    epoch_utc: datetime | None = None,
    *,
    timeout_s: float = 20.0,
) -> StateVector | None:
    command_id = HORIZONS_COMMAND_IDS.get(slug)
    if not command_id:
        return None

    target_dt = (
        epoch_utc.astimezone(UTC).replace(tzinfo=None)
        if epoch_utc is not None and epoch_utc.tzinfo is not None
        else (epoch_utc if epoch_utc is not None else datetime.now(UTC).replace(tzinfo=None))
    )
    stop_dt = target_dt + timedelta(hours=1)
    if slug == "moon":
        center = "500@399"
    elif slug == "sun":
        center = "500@0"
    else:
        center = "500@10"

    params = {
        "format": "json",
        "EPHEM_TYPE": "VECTORS",
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "COMMAND": f"'{command_id}'",
        "CENTER": f"'{center}'",
        "START_TIME": f"'{target_dt.strftime('%Y-%m-%d %H:%M')}'",
        "STOP_TIME": f"'{stop_dt.strftime('%Y-%m-%d %H:%M')}'",
        "STEP_SIZE": "'1 h'",
        "OUT_UNITS": "KM-S",
        "REF_PLANE": "ECLIPTIC",
    }
    url = f"{HORIZONS_API_URL}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": "COSMOS-X/0.3"})
    with urlopen(req, timeout=timeout_s) as resp:  # nosec B310
        raw = resp.read().decode("utf-8", errors="replace")

    payload = json.loads(raw)
    result_text = payload.get("result")
    if not isinstance(result_text, str):
        return None
    return parse_horizons_vectors(result_text, target_dt)

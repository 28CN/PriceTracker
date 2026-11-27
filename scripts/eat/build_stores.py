"""Build public/eat/stores-perth.json: fast-food stores in Perth for /eat.

Stores come from All the Places (https://www.alltheplaces.xyz, CC-0), one
GeoJSON per brand spider from a weekly run, plus a few brands it lacks, read
from their official store locators (Jesters) or geocoded from the addresses
on them (NeNe Chicken, via OpenStreetMap Nominatim).

Run by hand now and then (not in CI):
    python scripts/eat/build_stores.py <dir with the .geojson files> [jesters.json] [nene.json]
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

# Perth metro, Two Rocks to Mandurah, the coast to the hills.
LAT = (-32.65, -31.45)
LON = (115.55, 116.25)

SPIDERS = {
    "kfc_au": "kfc",
    "mcdonalds": "mcdonalds",
    "hungry_jacks": "hungryjacks",
    "subway_au": "subway",
    "dominos_pizza_au": "dominos",
    "pizza_hut_au": "pizzahut",
    "red_rooster_au": "redrooster",
    "chicken_treat_au": "chickentreat",
    "guzmany_gomez": "gyg",
    "oporto_au": "oporto",
    "nandos": "nandos",
    "grilld_au": "grilld",
    "zambrero_au": "zambrero",
    "taco_bell_au": "tacobell",
    "mad_mex_au": "madmex",
    "schnitz_au": "schnitz",
    "rolld_au": "rolld",
    "sushi_sushi_au": "sushisushi",
}


def in_perth(lat: float, lon: float) -> bool:
    return LAT[0] <= lat <= LAT[1] and LON[0] <= lon <= LON[1]


def _title(text: str) -> str:
    return " ".join(w.capitalize() if w.isupper() or w.islower() else w for w in text.strip().split())


def suburb_of(props: dict, known: set[str]) -> str:
    """addr:city when the spider has it, else a known suburb named in the full address."""
    city = props.get("addr:city")
    if city:
        return _title(city)[:40]
    full = (props.get("addr:full") or "").lower()
    full = re.split(r"\b(?:wa|western australia)\b", full)[0]
    best = ""
    for name in known:
        if re.search(r"(?<![a-z])" + re.escape(name.lower()) + r"(?![a-z])", full) and len(name) > len(best):
            best = name
    return best


def short_address(props: dict) -> str:
    street = props.get("addr:street_address") or " ".join(
        x for x in (props.get("addr:housenumber"), props.get("addr:street")) if x
    )
    text = street or props.get("addr:full") or ""
    text = re.sub(r",?\s*(WA|Western Australia)\s*\d{4}.*$", "", text).strip(" ,")
    return text[:90]


def main() -> int:
    src = Path(sys.argv[1])
    stores: list[list] = []
    seen: set[tuple] = set()
    run = None
    known = {
        _title(f["properties"]["addr:city"])
        for path in src.glob("*.geojson")
        for f in json.loads(path.read_text()).get("features", [])
        if (f.get("properties") or {}).get("addr:city")
        and f.get("geometry")
        and in_perth(f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0])
    }
    for path in sorted(src.glob("*.geojson")):
        spider = path.stem
        chain = SPIDERS.get(spider)
        if not chain:
            continue
        data = json.loads(path.read_text())
        run = run or data.get("dataset_attributes", {}).get("spider:collection_time", "")[:10]
        for feature in data.get("features", []):
            geom = feature.get("geometry") or {}
            props = feature.get("properties") or {}
            if geom.get("type") != "Point":
                continue
            lon, lat = geom["coordinates"][:2]
            if not in_perth(lat, lon):
                continue
            # McDonald's lists its McCafé counters as separate places.
            if chain == "mcdonalds" and props.get("brand") != "McDonald's":
                continue
            suburb = suburb_of(props, known)
            branch = props.get("branch") or suburb
            key = (chain, round(lat, 4), round(lon, 4))
            if key in seen:
                continue
            seen.add(key)
            stores.append([chain, branch[:60], short_address(props), suburb, round(lat, 5), round(lon, 5)])

    extras = []
    if len(sys.argv) > 2:
        for m in json.loads(Path(sys.argv[2]).read_text()):
            lat, lon = float(m["lat"]), float(m["lng"])
            if in_perth(lat, lon):
                addr = m["address"].replace("&amp;", "&")
                sub = re.sub(r"\s+WA.*$", "", addr.split(",")[-2] if addr.count(",") >= 2 else addr).strip()
                extras.append(["jesters", m["title"], re.sub(r",\s*[^,]*WA.*$", "", addr), sub, round(lat, 5), round(lon, 5)])
    if len(sys.argv) > 3:
        for name, addr, lat, lon in json.loads(Path(sys.argv[3]).read_text()):
            if lat:
                sub = re.sub(r"\s+WA.*$", "", addr.split(",")[-1]).strip()
                extras.append(["nene", name, addr.split(",")[0], sub, round(float(lat), 5), round(float(lon), 5)])
    stores.extend(extras)
    stores.sort(key=lambda s: (s[0], s[3], s[1]))

    # Suburbs that have a store, for "pick a suburb" when location is off.
    aliases = {
        "Bullcreek": "Bull Creek", "Canningvale": "Canning Vale", "Mt Lawley": "Mount Lawley",
        "Westminister": "Westminster", "Beaconsfield Wa": "Beaconsfield", "South Lakes": "South Lake",
        "Perth International Airport": "Perth Airport", "Byford City": "Byford",
        "Kwinana Town Centre": "Kwinana", "Hillarys Boat Harbour": "Hillarys", "Gnangara Rd": "",
    }
    acc: dict[str, list[float]] = {}
    for s in stores:
        name = re.sub(r"\s*\((wa|WA)\)$|\s+(Ii|Iii|Central|Dt|Dtr|Fc|Sc)$", "", s[3]).strip()
        name = aliases.get(name, name)
        if name and re.fullmatch(r"[A-Za-z' -]{3,30}", name):
            a = acc.setdefault(name, [0.0, 0.0, 0])
            a[0] += s[4]
            a[1] += s[5]
            a[2] += 1
    suburbs = sorted([name, round(a[0] / a[2], 4), round(a[1] / a[2], 4)] for name, a in acc.items())

    out = {
        "generated": date.today().isoformat(),
        "source": "All the Places (alltheplaces.xyz), CC-0, run of " + (run or "?")
        + "; Jesters and NeNe Chicken from their store locators",
        "fields": ["chain", "name", "address", "suburb", "lat", "lon"],
        "stores": stores,
        "suburbs": suburbs,
    }
    target = Path(__file__).resolve().parents[2] / "public" / "eat" / "stores-perth.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    counts: dict[str, int] = {}
    for s in stores:
        counts[s[0]] = counts.get(s[0], 0) + 1
    print(f"{len(stores)} stores, {len(suburbs)} suburbs -> {target}")
    print(counts)
    return 0


if __name__ == "__main__":
    sys.exit(main())

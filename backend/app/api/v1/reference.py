"""Reference data: infrastructure types, districts."""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import District, InfrastructureType
from app.schemas import MessageResponse

router = APIRouter(prefix="/reference", tags=["reference"])


@router.get("/infrastructure-types")
def list_infrastructure_types(db: Session = Depends(get_db)):
    rows = db.execute(select(InfrastructureType).order_by(InfrastructureType.name)).scalars().all()
    return [
        {
            "id": r.id, "name": r.name, "code": r.code,
            "description": r.description,
            "default_priority_weight": r.default_priority_weight,
            "icon": r.icon,
        }
        for r in rows
    ]


@router.get("/states", response_model=List[str])
def list_states(db: Session = Depends(get_db)):
    """List all available States and Union Territories."""
    from app.data.indian_districts import get_all_states
    db_states = db.execute(
        select(District.state).distinct().where(District.state.is_not(None)).order_by(District.state)
    ).scalars().all()
    filtered = [s for s in db_states if s and s.strip()]
    if filtered:
        return filtered
    return get_all_states()


@router.get("/districts")
def list_districts(
    state: Optional[str] = Query(None, description="Filter districts by state name"),
    db: Session = Depends(get_db)
):
    query = select(District)
    if state and state.strip():
        query = query.where(District.state == state.strip())
    rows = db.execute(query.order_by(District.name)).scalars().all()
    return [
        {
            "id": r.id, "name": r.name, "code": r.code,
            "state": r.state, "population": r.population,
            "area_sq_km": r.area_sq_km,
        }
        for r in rows
    ]


@router.get("/reverse-geocode")
def reverse_geocode(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    db: Session = Depends(get_db),
):
    """Reverse geocode coordinates to extract address, state, district, and matched district_id."""
    import httpx
    from app.data.indian_districts import find_matching_state_and_district

    address_text = ""
    detected_state = ""
    detected_district = ""

    # 1. Try Nominatim via backend (with User-Agent)
    try:
        url = (
            f"https://nominatim.openstreetmap.org/reverse?format=json"
            f"&lat={latitude}&lon={longitude}&zoom=18&addressdetails=1&accept-language=en"
        )
        headers = {"User-Agent": "InfraGuard/1.0 (https://infraguard.gov)"}
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                address_text = data.get("display_name", "")
                addr = data.get("address", {})
                raw_state = addr.get("state", "")
                raw_dist = (
                    addr.get("state_district")
                    or addr.get("county")
                    or addr.get("city")
                    or addr.get("town")
                    or addr.get("district")
                    or ""
                )
                detected_state, detected_district = find_matching_state_and_district(
                    f"{raw_dist} {raw_state} {address_text}"
                )
    except Exception:
        pass

    # 2. Fallback to Photon if needed
    if not detected_district:
        try:
            p_url = f"https://photon.komoot.io/reverse?lat={latitude}&lon={longitude}"
            with httpx.Client(timeout=3.0) as client:
                resp = client.get(p_url)
                if resp.status_code == 200:
                    features = resp.json().get("features", [])
                    if features:
                        props = features[0].get("properties", {})
                        if not address_text:
                            parts = [props.get(k) for k in ["name", "street", "city", "state", "country"] if props.get(k)]
                            address_text = ", ".join(parts)
                        search_str = " ".join([str(v) for v in props.values() if isinstance(v, str)])
                        detected_state, detected_district = find_matching_state_and_district(search_str)
        except Exception:
            pass

    # 3. Match against database District record
    district_id = None
    district_name = None
    if detected_district:
        clean_name = detected_district.split("(")[0].strip()
        matched = db.execute(
            select(District).where(
                District.name.ilike(f"%{clean_name}%")
            )
        ).scalars().all()

        if matched:
            if detected_state:
                state_matched = [m for m in matched if m.state == detected_state]
                chosen = state_matched[0] if state_matched else matched[0]
            else:
                chosen = matched[0]
            district_id = chosen.id
            district_name = chosen.name
            if not detected_state and chosen.state:
                detected_state = chosen.state

    return {
        "address": address_text,
        "state": detected_state,
        "district": district_name or detected_district,
        "district_id": district_id,
    }



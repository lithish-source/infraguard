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


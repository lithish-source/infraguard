"""Admin-only routes: dashboard, analytics, report management."""
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.models import User
from app.schemas import (
    AssignTeam,
    DashboardSummary,
    DistrictAnalyticsItem,
    CategoryDistributionItem,
    MonthlyTrendItem,
    ReportOut,
    ReportStatusUpdate,
    SeverityDistributionItem,
    SeverityUpdate,
)
from app.services import analytics_service, report_service, priority_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    return analytics_service.dashboard_summary(db)


@router.get("/analytics/severity", response_model=List[SeverityDistributionItem])
def severity_dist(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    return analytics_service.severity_distribution(db)


@router.get("/analytics/category", response_model=List[CategoryDistributionItem])
def category_dist(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    return analytics_service.category_distribution(db)


@router.get("/analytics/monthly", response_model=List[MonthlyTrendItem])
def monthly_trend(
    months: int = Query(6, ge=1, le=24),
    db: Session = Depends(get_db), _=Depends(get_current_admin),
):
    return analytics_service.monthly_trend(db, months=months)


@router.get("/analytics/districts", response_model=List[DistrictAnalyticsItem])
def district_analytics(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    return analytics_service.district_analytics(db)


@router.get("/analytics/response-time")
def response_time(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    return analytics_service.response_time_analytics(db)


@router.get("/analytics/repeat-incidents")
def repeat_incidents(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    return {"clusters": analytics_service.repeat_incidents(db)}


@router.get("/analytics/participation")
def participation(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    return analytics_service.citizen_participation(db)


@router.post("/reports/{report_id}/status")
def update_status(
    report_id: int,
    payload: ReportStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    return report_service.update_status(
        db,
        report_id,
        admin,
        payload.status,
        payload.notes,
        payload.assigned_team,
        delete_on_resolved=payload.delete_on_resolved if payload.delete_on_resolved is not None else True,
    )


@router.delete("/reports/{report_id}")
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    return report_service.delete_report(db, report_id, admin)


@router.post("/reports/{report_id}/severity", response_model=ReportOut)
def update_severity(
    report_id: int,
    payload: SeverityUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    return report_service.update_severity(
        db, report_id, admin, payload.severity, payload.notes,
    )


@router.post("/reports/{report_id}/assign", response_model=ReportOut)
def assign_team(
    report_id: int,
    payload: AssignTeam,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    return report_service.assign_team(db, report_id, admin, payload.team, payload.notes)


@router.post("/priority/recompute")
def recompute_priorities(
    db: Session = Depends(get_db), _=Depends(get_current_admin),
):
    count = priority_service.recompute_all_priorities(db)
    return {"message": f"Recomputed priorities for {count} open reports.", "count": count}

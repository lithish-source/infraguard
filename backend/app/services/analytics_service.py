"""Analytics service for the admin dashboard & analytics page."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    District,
    Image,
    InfrastructureType,
    PriorityScore,
    Report,
    User,
    Verification,
    SEVERITY_CRITICAL,
    SEVERITY_HIGH,
    SEVERITY_LOW,
    SEVERITY_MODERATE,
    STATUS_REPORTED,
    STATUS_VERIFIED,
    STATUS_RESOLVED,
)
from app.schemas import (
    CategoryDistributionItem,
    DashboardSummary,
    DistrictAnalyticsItem,
    MonthlyTrendItem,
    SeverityDistributionItem,
)


SEVERITY_ORDER = [SEVERITY_LOW, SEVERITY_MODERATE, SEVERITY_HIGH, SEVERITY_CRITICAL]


def _parse_dt(val) -> Optional[datetime]:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        # Strip trailing fraction/tz if needed
        clean = str(val).replace("Z", "").split("+")[0]
        if "." in clean:
            clean = clean.split(".")[0]
        return datetime.fromisoformat(clean)
    except Exception:
        return None


def dashboard_summary(db: Session) -> DashboardSummary:
    total = db.execute(select(func.count(Report.id))).scalar_one()
    pending = db.execute(select(func.count(Report.id)).where(Report.status == STATUS_REPORTED)).scalar_one()
    verified = db.execute(select(func.count(Report.id)).where(Report.status == STATUS_VERIFIED)).scalar_one()
    resolved = db.execute(select(func.count(Report.id)).where(Report.status == STATUS_RESOLVED)).scalar_one()
    critical = db.execute(
        select(func.count(Report.id)).where(
            (Report.ai_severity == SEVERITY_CRITICAL) | (Report.final_severity == SEVERITY_CRITICAL)
        )
    ).scalar_one()
    users = db.execute(select(func.count(User.id))).scalar_one()
    verifications = db.execute(select(func.count(Verification.id))).scalar_one()

    # Avg response time (hours) = resolved_at - created_at for resolved reports
    resolved_reports = db.execute(
        select(Report.created_at, Report.resolved_at)
        .where(Report.status == STATUS_RESOLVED, Report.resolved_at.isnot(None))
    ).all()
    durations = []
    for c_at_raw, r_at_raw in resolved_reports:
        c_at = _parse_dt(c_at_raw)
        r_at = _parse_dt(r_at_raw)
        if c_at and r_at and r_at >= c_at:
            durations.append((r_at - c_at).total_seconds() / 3600.0)
    avg_response = (sum(durations) / len(durations)) if durations else None
    response_rate = (resolved / total * 100.0) if total else 0.0

    return DashboardSummary(
        total_reports=total,
        pending_reports=pending,
        verified_reports=verified,
        resolved_reports=resolved,
        critical_incidents=critical,
        total_users=users,
        total_verifications=verifications,
        avg_response_time_hours=round(avg_response, 2) if avg_response else None,
        response_rate=round(response_rate, 2),
    )


def severity_distribution(db: Session) -> List[SeverityDistributionItem]:
    rows = db.execute(
        select(Report.ai_severity, func.count(Report.id)).group_by(Report.ai_severity)
    ).all()
    counts = {r[0] or "Unassessed": r[1] for r in rows}
    total = sum(counts.values()) or 1
    items = []
    for sev in SEVERITY_ORDER + ["Unassessed"]:
        c = counts.get(sev, 0)
        items.append(SeverityDistributionItem(
            severity=sev, count=c, percentage=round(c / total * 100.0, 2)
        ))
    return items


def category_distribution(db: Session) -> List[CategoryDistributionItem]:
    categories = db.execute(select(InfrastructureType)).scalars().all()
    items = []
    for cat in categories:
        reports = db.execute(
            select(Report).where(Report.infrastructure_type_id == cat.id)
        ).scalars().all()
        critical_count = sum(
            1 for r in reports
            if (r.ai_severity == SEVERITY_CRITICAL or r.final_severity == SEVERITY_CRITICAL)
        )
        items.append(CategoryDistributionItem(
            category=cat.name,
            count=len(reports),
            critical_count=critical_count,
        ))
    return items


def monthly_trend(db: Session, months: int = 6) -> List[MonthlyTrendItem]:
    since = datetime.utcnow() - timedelta(days=months * 30)
    reports = db.execute(select(Report.created_at, Report.status)).all()
    data = defaultdict(lambda: {"reports": 0, "resolved": 0})
    for created_at_raw, status in reports:
        dt = _parse_dt(created_at_raw)
        if dt and dt >= since:
            m = dt.strftime("%Y-%m")
            data[m]["reports"] += 1
            if status == STATUS_RESOLVED:
                data[m]["resolved"] += 1
    items = [
        MonthlyTrendItem(month=m, reports=counts["reports"], resolved=counts["resolved"])
        for m, counts in sorted(data.items())
    ]
    return items


def district_analytics(db: Session) -> List[DistrictAnalyticsItem]:
    active_district_ids = db.execute(
        select(Report.district_id).where(Report.district_id.is_not(None)).distinct()
    ).scalars().all()

    if active_district_ids:
        districts = db.execute(
            select(District).where(District.id.in_(active_district_ids)).order_by(District.name)
        ).scalars().all()
    else:
        districts = db.execute(select(District).order_by(District.name).limit(10)).scalars().all()

    items = []
    for d in districts:
        reports = db.execute(
            select(Report).where(Report.district_id == d.id)
        ).scalars().all()
        critical_count = sum(
            1 for r in reports
            if (r.ai_severity == SEVERITY_CRITICAL or r.final_severity == SEVERITY_CRITICAL)
        )
        resolved_count = sum(1 for r in reports if r.status == STATUS_RESOLVED)
        scores = []
        for r in reports:
            ps = db.execute(
                select(PriorityScore)
                .where(PriorityScore.report_id == r.id)
                .order_by(PriorityScore.created_at.desc())
                .limit(1)
            ).scalar_one_or_none()
            if ps and ps.score is not None:
                scores.append(ps.score)
        avg_priority = round(sum(scores) / len(scores), 2) if scores else 0.0
        items.append(DistrictAnalyticsItem(
            district=d.name,
            reports=len(reports),
            critical=critical_count,
            resolved=resolved_count,
            avg_priority=avg_priority,
        ))
    return items


def response_time_analytics(db: Session) -> dict:
    resolved_reports = db.execute(
        select(Report.created_at, Report.resolved_at)
        .where(Report.status == STATUS_RESOLVED, Report.resolved_at.isnot(None))
    ).all()
    durations = [
        (r_at - c_at).total_seconds() / 3600.0
        for c_at, r_at in resolved_reports
        if c_at and r_at and r_at >= c_at
    ]
    if not durations:
        return {"avg_hours": None, "min_hours": None, "max_hours": None}
    return {
        "avg_hours": round(sum(durations) / len(durations), 2),
        "min_hours": round(min(durations), 2),
        "max_hours": round(max(durations), 2),
    }


def repeat_incidents(db: Session, threshold_km: float = 0.5) -> List[dict]:
    """Detect reports within threshold_km of each other for the same infra type."""
    reports = db.execute(
        select(Report).where(Report.status != "Rejected")
    ).scalars().all()
    clusters = []
    used = set()
    for i, r1 in enumerate(reports):
        if r1.id in used:
            continue
        group = [r1]
        for r2 in reports[i + 1:]:
            if r2.id in used or r2.infrastructure_type_id != r1.infrastructure_type_id:
                continue
            # Haversine approx
            d = _haversine(r1.latitude, r1.longitude, r2.latitude, r2.longitude)
            if d <= threshold_km:
                group.append(r2)
                used.add(r2.id)
        if len(group) > 1:
            clusters.append({
                "infrastructure_type_id": r1.infrastructure_type_id,
                "center": {"lat": r1.latitude, "lng": r1.longitude},
                "count": len(group),
                "report_ids": [r.id for r in group],
            })
            used.add(r1.id)
    return clusters


def _haversine(lat1, lon1, lat2, lon2) -> float:
    import math
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def citizen_participation(db: Session) -> dict:
    total_users = db.execute(select(func.count(User.id))).scalar_one()
    active_users = db.execute(
        select(func.count(func.distinct(Report.user_id)))
    ).scalar_one()
    verifiers = db.execute(select(func.count(func.distinct(Verification.user_id)))).scalar_one()
    avg_verifications_per_report = db.execute(
        select(func.avg(Report.verification_count))
    ).scalar_one()
    return {
        "total_citizens": total_users,
        "citizens_who_reported": active_users,
        "citizens_who_verified": verifiers,
        "avg_verifications_per_report": round(float(avg_verifications_per_report), 2)
        if avg_verifications_per_report else 0.0,
    }

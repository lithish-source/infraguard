"""Database seeding: default admin, districts, infrastructure types, demo reports."""
from __future__ import annotations

import os
import random
from datetime import datetime, timedelta
from typing import List

from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import (
    AdminAction,
    District,
    Image,
    InfrastructureType,
    Notification,
    PriorityScore,
    Report,
    User,
    Verification,
    ROLE_ADMIN,
    ROLE_CITIZEN,
    SEVERITY_LOW,
    SEVERITY_MODERATE,
    SEVERITY_HIGH,
    SEVERITY_CRITICAL,
    STATUS_REPORTED,
    STATUS_VERIFIED,
    STATUS_ASSIGNED,
    STATUS_IN_PROGRESS,
    STATUS_RESOLVED,
)


INFRA_TYPES = [
    ("Road", "ROAD", "Surface roads including potholes, cracks, subsidence", 7.0, "🛣️"),
    ("Bridge", "BRIDGE", "Bridges, overpasses, flyovers", 9.5, "🌉"),
    ("Drainage System", "DRAINAGE", "Storm drains, culverts, canals", 6.0, "💧"),
    ("Streetlight", "STREETLIGHT", "Public street lighting", 4.0, "💡"),
    ("Water Pipeline", "WATER", "Public water supply pipelines", 8.5, "🚰"),
    ("Public Building", "BUILDING", "Government offices, schools, hospitals", 7.5, "🏛️"),
    ("Traffic Signal", "TRAFFIC", "Traffic lights and signaling", 8.0, "🚦"),
    ("Footpath", "FOOTPATH", "Pedestrian walkways", 3.5, "🚶"),
    ("Public Toilet", "TOILET", "Sanitation facilities", 3.0, "🚻"),
    ("Park Equipment", "PARK", "Benches, playground equipment", 2.5, "🌳"),
]

from app.data.indian_districts import get_all_districts


def _seed_infrastructure_types(db) -> None:
    if db.execute(select(InfrastructureType)).first():
        return
    for name, code, desc, weight, icon in INFRA_TYPES:
        db.add(InfrastructureType(
            name=name, code=code, description=desc,
            default_priority_weight=weight, icon=icon,
        ))
    db.commit()


def _seed_districts(db) -> None:
    """Seed comprehensive list of Indian States and Districts.

    Also migrates any legacy placeholder districts (Central, North, South, East, West)
    to representative Indian districts so that foreign key references stay intact.
    """
    dummy_replacements = {
        "Central District": ("Pune", "MH-PUNE", "Maharashtra"),
        "North District": ("Mumbai Suburban", "MH-MUMB", "Maharashtra"),
        "South District": ("Thane", "MH-THAN", "Maharashtra"),
        "East District": ("Nagpur", "MH-NAGP", "Maharashtra"),
        "West District": ("Nashik", "MH-NASH", "Maharashtra"),
    }

    # Clean up or convert any legacy dummy districts
    for dummy_name, (rep_name, rep_code, rep_state) in dummy_replacements.items():
        legacy = db.execute(select(District).where(District.name == dummy_name)).scalar_one_or_none()
        if legacy:
            legacy.name = rep_name
            legacy.code = rep_code
            legacy.state = rep_state
    db.commit()

    # Query currently present districts
    existing_names = set(db.execute(select(District.name)).scalars().all())

    # Add all remaining Indian districts
    to_add = []
    for name, state, code in get_all_districts():
        if name not in existing_names:
            to_add.append(District(
                name=name,
                code=code,
                state=state,
                population=None,
                area_sq_km=None,
            ))
            existing_names.add(name)

    if to_add:
        db.add_all(to_add)
        db.commit()



def _seed_admin(db) -> None:
    """Seed or UPDATE the default admin user.

    IMPORTANT: database/seed.sql inserts a placeholder admin with a fake
    password hash on Postgres init. We must UPDATE that row's password_hash
    (and role, is_active) instead of skipping — otherwise login fails because
    the placeholder hash can never match any real password.
    """
    existing = db.execute(
        select(User).where(User.email == settings.DEFAULT_ADMIN_EMAIL)
    ).scalar_one_or_none()

    correct_hash = hash_password(settings.DEFAULT_ADMIN_PASSWORD)

    if existing:
        # Update the placeholder admin with a real password hash
        existing.full_name = settings.DEFAULT_ADMIN_NAME
        existing.password_hash = correct_hash
        existing.role = ROLE_ADMIN
        existing.is_active = True
        db.commit()
        return

    # No admin row at all — create one
    db.add(User(
        full_name=settings.DEFAULT_ADMIN_NAME,
        email=settings.DEFAULT_ADMIN_EMAIL,
        password_hash=correct_hash,
        role=ROLE_ADMIN,
        is_active=True,
    ))
    db.commit()


def _seed_demo_citizens(db, n: int = 8) -> List[User]:
    """Create demo citizen accounts with predictable emails.

    The first citizen is ALWAYS 'aarav.sharma0@example.com' so that the
    frontend's "Quick demo logins" button works reliably.
    """
    existing = db.execute(select(User).where(User.role == ROLE_CITIZEN)).scalars().all()
    if len(existing) >= n:
        return existing[:n]

    # Deterministic list — index 0 must match the frontend's Login.jsx fillCitizen()
    fixed_citizens = [
        ("Aarav", "Sharma"),
        ("Diya", "Patel"),
        ("Vihaan", "Reddy"),
        ("Ananya", "Iyer"),
        ("Arjun", "Nair"),
        ("Ishaan", "Kapoor"),
        ("Saanvi", "Singh"),
        ("Kabir", "Mehta"),
        ("Riya", "Sharma"),
        ("Rohan", "Patel"),
        ("Meera", "Kapoor"),
        ("Vivaan", "Reddy"),
    ]

    citizens = []
    for i in range(n - len(existing)):
        fn, ln = fixed_citizens[i % len(fixed_citizens)]
        email = f"{fn.lower()}.{ln.lower()}{i}@example.com"
        if db.execute(select(User).where(User.email == email)).first():
            continue
        u = User(
            full_name=f"{fn} {ln}",
            email=email,
            phone=f"+9198765{43210 - i:05d}",
            password_hash=hash_password("Citizen@12345"),
            role=ROLE_CITIZEN,
            district_id=(i % 5) + 1,
        )
        db.add(u)
        citizens.append(u)
    db.commit()
    return citizens


def _seed_demo_reports(db, citizens: List[User], n: int = 60) -> None:
    """Create demo reports with images, verifications, priorities."""
    if db.execute(select(Report)).first():
        return
    infra_types = db.execute(select(InfrastructureType)).scalars().all()
    districts = db.execute(select(District)).scalars().all()

    titles = [
        "Large pothole causing traffic jams",
        "Crack on bridge support pillar",
        "Waterlogged road after rain",
        "Broken streetlight on main avenue",
        "Burst water pipeline flooding street",
        "Traffic signal malfunction at intersection",
        "Damaged footpath with exposed wires",
        "Crumbling compound wall of public school",
        "Clogged drain causing overflow",
        "Fallen tree branch on park equipment",
        "Subsidence near bus stop",
        "Corroded railing on pedestrian bridge",
        "Open manhole on residential street",
        "Damaged road divider after accident",
        "Leaking fire hydrant",
    ]
    severities = [SEVERITY_LOW, SEVERITY_MODERATE, SEVERITY_HIGH, SEVERITY_CRITICAL]
    statuses = [STATUS_REPORTED, STATUS_VERIFIED, STATUS_ASSIGNED,
                STATUS_IN_PROGRESS, STATUS_RESOLVED, STATUS_RESOLVED]

    from ai.severity_classifier import SeverityAnalyzer
    from app.services.priority_service import compute_and_save_priority
    analyzer = SeverityAnalyzer(use_ml=False)

    # Try to use sample images if available
    sample_images_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "sample_data", "images",
    )
    sample_image_files = []
    if os.path.isdir(sample_images_dir):
        sample_image_files = [
            os.path.join(sample_images_dir, f)
            for f in os.listdir(sample_images_dir)
            if f.lower().endswith((".jpg", ".jpeg", ".png"))
        ]

    for i in range(n):
        author = random.choice(citizens)
        infra = random.choice(infra_types)
        district = random.choice(districts)
        sev = random.choice(severities)
        status = random.choice(statuses)

        # Coordinates near district centroid with random offset
        lat = 18.5204 + random.uniform(-0.08, 0.08)
        lng = 73.8567 + random.uniform(-0.08, 0.08)

        title = random.choice(titles)
        days_ago = random.randint(0, 60)
        created = datetime.utcnow() - timedelta(days=days_ago, hours=random.randint(0, 23))

        report = Report(
            reference_code=f"RPT-DEMO-{i+1:04d}",
            user_id=author.id,
            district_id=district.id,
            infrastructure_type_id=infra.id,
            title=title,
            description=f"{title}. Located near {district.name}. "
                        f"Observed {infra.name.lower()} damage. Requires inspection and repair.",
            address=f"Near {district.name} center, {district.state}",
            latitude=lat,
            longitude=lng,
            geom=f"{lng},{lat}",
            ai_severity=sev,
            ai_confidence=round(random.uniform(0.62, 0.94), 3),
            ai_damage_type=random.choice([
                "Surface Crack", "Pothole", "Water Logging",
                "Structural Damage", "Corrosion", "Broken Component",
            ]),
            final_severity=sev if status in (STATUS_ASSIGNED, STATUS_IN_PROGRESS, STATUS_RESOLVED) else None,
            status=status,
            credibility_score=round(random.uniform(1.0, 8.0), 2),
            verification_count=random.randint(0, 12),
            upvote_count=random.randint(0, 10),
            downvote_count=random.randint(0, 2),
            created_at=created,
            updated_at=created,
            resolved_at=(created + timedelta(hours=random.randint(2, 120)))
            if status == STATUS_RESOLVED else None,
            resolution_notes="Repaired by municipal team." if status == STATUS_RESOLVED else None,
            assigned_team=random.choice(["Team Alpha", "Team Bravo", "Team Charlie", "Team Delta"])
            if status in (STATUS_ASSIGNED, STATUS_IN_PROGRESS, STATUS_RESOLVED) else None,
        )
        db.add(report)
        db.flush()

        # Primary image
        if sample_image_files:
            src = random.choice(sample_image_files)
            ext = os.path.splitext(src)[1]
            new_name = f"rpt{report.id}_{i}{ext}"
            dst_dir = settings.UPLOAD_DIR
            os.makedirs(dst_dir, exist_ok=True)
            dst = os.path.join(dst_dir, new_name)
            try:
                import shutil
                shutil.copy(src, dst)
                db.add(Image(
                    report_id=report.id, user_id=author.id,
                    file_path=dst, file_url=f"/uploads/{new_name}",
                    is_primary=True,
                ))
            except Exception as e:
                print(f"[seed] Could not copy image: {e}")
        else:
            category_fallbacks = {
                "Water Pipeline": "https://images.unsplash.com/photo-1547683905-f686c993aae5?w=800&auto=format&fit=crop&q=80",
                "Bridge": "https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=800&auto=format&fit=crop&q=80",
                "Streetlight": "https://images.unsplash.com/photo-1509390144018-eeaf65052242?w=800&auto=format&fit=crop&q=80",
            }
            fb_url = category_fallbacks.get(infra.name, "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800&auto=format&fit=crop&q=80")
            db.add(Image(
                report_id=report.id, user_id=author.id,
                file_path="", file_url=fb_url,
                is_primary=True,
            ))

        # Verifications
        n_verif = min(report.verification_count, len(citizens) - 1)
        verifiers = random.sample([c for c in citizens if c.id != author.id], n_verif)
        for v_user in verifiers:
            db.add(Verification(
                report_id=report.id, user_id=v_user.id,
                severity_vote=random.choice(severities),
                comment="Confirmed visible damage.",
                is_confirmed=True,
                created_at=created + timedelta(hours=random.randint(1, 48)),
            ))

        # Priority — skip Overpass during seeding (uses fallback path)
        # Real reports submitted via the API will use Overpass for real distances.
        compute_and_save_priority(db, report, skip_overpass=True)

        # Notification
        db.add(Notification(
            user_id=author.id, report_id=report.id,
            title="Report submitted",
            message=f"Your report {report.reference_code} has been received.",
            type="success",
            is_read=random.random() > 0.5,
            created_at=created,
        ))

    db.commit()


def run_seed() -> None:
    """Top-level seed entry point (idempotent)."""
    db = SessionLocal()
    try:
        _seed_infrastructure_types(db)
        _seed_districts(db)
        _seed_admin(db)
        citizens = _seed_demo_citizens(db, n=8)
        _seed_demo_reports(db, citizens, n=60)
        print(f"[seed] Seeding complete. ({settings.APP_ENV})")
    except Exception as e:
        print(f"[seed] Error during seeding: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    # Allow running directly: `python -m app.seed`
    # Also create tables first
    from app.core.database import Base, engine
    Base.metadata.create_all(bind=engine)
    run_seed()

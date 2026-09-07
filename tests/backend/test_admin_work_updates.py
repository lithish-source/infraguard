import pytest
from app.models import User, Report, InfrastructureType, District, STATUS_REPORTED, STATUS_IN_PROGRESS, STATUS_RESOLVED
from app.core.security import hash_password, create_access_token


@pytest.fixture
def admin_user(db_session):
    admin = User(
        email="admin_test@infraguard.gov",
        password_hash=hash_password("Admin@12345"),
        full_name="Admin User",
        role="admin",
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)
    return admin


@pytest.fixture
def citizen_user(db_session):
    citizen = User(
        email="citizen_test@example.com",
        password_hash=hash_password("Citizen@12345"),
        full_name="Citizen User",
        role="citizen",
        is_active=True,
    )
    db_session.add(citizen)
    db_session.commit()
    db_session.refresh(citizen)
    return citizen


@pytest.fixture
def sample_report(db_session, citizen_user):
    infra = InfrastructureType(
        name="Bridge",
        code="BRIDGE_TEST",
        default_priority_weight=5.0,
    )
    dist = District(name="Test District", state="Tamil Nadu")
    db_session.add(infra)
    db_session.add(dist)
    db_session.commit()
    db_session.refresh(infra)
    db_session.refresh(dist)

    report = Report(
        user_id=citizen_user.id,
        infrastructure_type_id=infra.id,
        district_id=dist.id,
        title="Cracked bridge pillar",
        description="Pillar cracked near river bank",
        latitude=11.5,
        longitude=77.5,
        status=STATUS_REPORTED,
        ai_severity="High",
        final_severity="High",
        reference_code="RPT-20260908-TEST01",
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)
    return report


def test_admin_update_status_to_in_progress(client, admin_user, sample_report):
    token = create_access_token(user_id=admin_user.id, role=admin_user.role)
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post(
        f"/api/v1/admin/reports/{sample_report.id}/status",
        json={"status": "In Progress", "notes": "Repair team dispatched with cement mix"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "In Progress"
    assert data["deleted"] is False


def test_admin_work_done_resolves_and_deletes_report(client, admin_user, sample_report, db_session):
    token = create_access_token(user_id=admin_user.id, role=admin_user.role)
    headers = {"Authorization": f"Bearer {token}"}

    report_id = sample_report.id

    # Admin marks work as done (Resolved)
    res = client.post(
        f"/api/v1/admin/reports/{report_id}/status",
        json={"status": "Resolved", "notes": "Work completed. Bridge reinforced.", "delete_on_resolved": True},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["deleted"] is True
    assert data["status"] == "Resolved"
    assert "Work is done" in data["message"]

    # Verify report is deleted from DB and not findable
    deleted_report = db_session.get(Report, report_id)
    assert deleted_report is None

    # Verify report vanishes from public /reports query
    get_res = client.get(f"/api/v1/reports/{report_id}")
    assert get_res.status_code == 404


def test_admin_explicit_delete_report(client, admin_user, sample_report, db_session):
    token = create_access_token(user_id=admin_user.id, role=admin_user.role)
    headers = {"Authorization": f"Bearer {token}"}

    report_id = sample_report.id

    res = client.delete(
        f"/api/v1/admin/reports/{report_id}",
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["deleted"] is True

    # Verify deleted in DB
    assert db_session.get(Report, report_id) is None


def test_non_admin_cannot_delete_or_update(client, citizen_user, sample_report):
    token = create_access_token(user_id=citizen_user.id, role=citizen_user.role)
    headers = {"Authorization": f"Bearer {token}"}

    res = client.delete(
        f"/api/v1/admin/reports/{sample_report.id}",
        headers=headers,
    )
    assert res.status_code == 403

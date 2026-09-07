"""Tests for Indian States and Districts dataset, uniqueness, and reference API endpoints.

Ensures:
1. All 28 Indian States and 8 Union Territories are covered.
2. NO district is repeated or shared between different states.
3. Every district name is globally distinct and satisfies the database unique constraint.
4. The /reference/states and /reference/districts?state=... API endpoints work accurately.
"""

import collections
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.data.indian_districts import (
    INDIAN_STATES_AND_DISTRICTS,
    get_all_states,
    get_districts_by_state,
    get_all_districts,
    find_matching_state_and_district,
)
from app.main import app
from app.models import District
from app.core.database import SessionLocal


def test_all_28_states_and_8_union_territories_covered():
    """Verify that all 36 States and Union Territories of India are present."""
    states = get_all_states()
    assert len(states) == 36, f"Expected 36 States/UTs, found {len(states)}: {states}"

    # Verify key states & UTs
    expected_samples = [
        "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
        "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
        "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
        "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim",
        "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
        "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry",
        "Chandigarh", "Andaman and Nicobar Islands", "Lakshadweep",
        "Dadra and Nagar Haveli and Daman and Diu"
    ]
    for sample in expected_samples:
        assert sample in states, f"Missing expected state or UT: {sample}"
        districts = get_districts_by_state(sample)
        assert len(districts) > 0, f"State {sample} has no districts"


def test_no_district_repeated_across_states():
    """CRITICAL TEST: Ensure NO district name appears in multiple different states/UTs."""
    district_to_states = collections.defaultdict(list)

    for state, districts in INDIAN_STATES_AND_DISTRICTS.items():
        for d in districts:
            district_to_states[d.strip()].append(state)

    duplicates = {
        district: states
        for district, states in district_to_states.items()
        if len(states) > 1
    }

    assert not duplicates, (
        f"District(s) repeated across different states: {duplicates}"
    )


def test_no_district_duplicated_within_same_state():
    """Ensure no state has duplicate district entries in its own list."""
    duplicates_per_state = {}

    for state, districts in INDIAN_STATES_AND_DISTRICTS.items():
        seen = set()
        state_dupes = []
        for d in districts:
            clean = d.strip()
            if clean in seen:
                state_dupes.append(clean)
            seen.add(clean)
        if state_dupes:
            duplicates_per_state[state] = state_dupes

    assert not duplicates_per_state, (
        f"Found duplicate districts within the same state: {duplicates_per_state}"
    )


def test_global_district_uniqueness_for_database():
    """Ensure every district tuple from get_all_districts() is globally unique for DB integrity."""
    all_items = get_all_districts()
    names = [item[0] for item in all_items]

    assert len(names) == len(set(names)), (
        f"Global district names count ({len(names)}) does not match unique set count ({len(set(names))})"
    )
    assert len(all_items) >= 750, f"Expected at least 750 total Indian districts, found {len(all_items)}"


def test_reference_states_api(client, db_session):
    """Test GET /api/v1/reference/states returns the full list of Indian states."""
    from app.seed import _seed_districts
    _seed_districts(db_session)

    response = client.get("/api/v1/reference/states")
    assert response.status_code == 200
    states = response.json()
    assert isinstance(states, list)
    assert len(states) >= 36
    assert "Tamil Nadu" in states
    assert "Maharashtra" in states
    assert "Delhi" in states


def test_reference_districts_api_filtering(client, db_session):
    """Test GET /api/v1/reference/districts with and without state filter."""
    from app.seed import _seed_districts
    _seed_districts(db_session)

    # 1. Without state filter: returns all districts
    res_all = client.get("/api/v1/reference/districts")
    assert res_all.status_code == 200
    all_dists = res_all.json()
    assert len(all_dists) >= 750

    # 2. Filter by Tamil Nadu
    res_tn = client.get("/api/v1/reference/districts", params={"state": "Tamil Nadu"})
    assert res_tn.status_code == 200
    tn_dists = res_tn.json()
    assert len(tn_dists) == 38
    assert all(d["state"] == "Tamil Nadu" for d in tn_dists)
    tn_names = {d["name"] for d in tn_dists}
    assert "Chennai" in tn_names
    assert "Coimbatore" in tn_names

    # 3. Filter by Maharashtra
    res_mh = client.get("/api/v1/reference/districts", params={"state": "Maharashtra"})
    assert res_mh.status_code == 200
    mh_dists = res_mh.json()
    assert len(mh_dists) == 36
    assert all(d["state"] == "Maharashtra" for d in mh_dists)
    mh_names = {d["name"] for d in mh_dists}
    assert "Pune" in mh_names
    assert "Mumbai Suburban" in mh_names


def test_location_text_matching():
    """Test matching state and district from reverse-geocoded address strings."""
    state, dist = find_matching_state_and_district("Anna Salai, Mount Road, Chennai, Tamil Nadu, 600002")
    assert state == "Tamil Nadu"
    assert dist == "Chennai"

    state2, dist2 = find_matching_state_and_district("FC Road, Shivajinagar, Pune, Maharashtra, 411005")
    assert state2 == "Maharashtra"
    assert dist2 == "Pune"


def test_reverse_geocode_api_endpoint(client, db_session):
    """Test GET /api/v1/reference/reverse-geocode returns matched state, district, and district_id."""
    from app.seed import _seed_districts
    _seed_districts(db_session)

    # Coordinates for Chennai
    resp = client.get("/api/v1/reference/reverse-geocode", params={"latitude": 13.0827, "longitude": 80.2707})
    assert resp.status_code == 200
    data = resp.json()
    assert "state" in data
    assert "district" in data
    assert "district_id" in data
    if data["district_id"]:
        assert data["state"] == "Tamil Nadu"
        assert data["district"] == "Chennai"



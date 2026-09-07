"""Pydantic v2 schemas (request/response models)."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ---------- Auth ----------
class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=20)
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="citizen")

    @field_validator("role")
    @classmethod
    def _validate_role(cls, v: str) -> str:
        v = (v or "citizen").lower()
        if v not in ("citizen", "official"):
            raise ValueError("Role must be 'citizen' or 'official' (admins are seeded).")
        return v

    @field_validator("password")
    @classmethod
    def _validate_password(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit.")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: EmailStr
    phone: Optional[str]
    role: str
    is_active: bool
    created_at: datetime


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


# ---------- Reports ----------
class ReportCreate(BaseModel):
    title: str = Field(min_length=5, max_length=255)
    description: str = Field(min_length=10, max_length=5000)
    category_id: int = Field(alias="category_id")
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: Optional[str] = Field(default=None, max_length=500)
    district_id: Optional[int] = None


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    file_url: str
    is_primary: bool
    caption: Optional[str]
    width: Optional[int]
    height: Optional[int]
    created_at: datetime


class PriorityScoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    score: float
    rank: Optional[int]
    severity_component: float
    verification_component: float
    population_component: float
    road_importance_component: float
    hospital_proximity_component: float
    school_proximity_component: float
    utility_importance_component: float
    time_urgency_component: float
    verification_status_component: float
    recommended_response_time: Optional[str]
    resource_urgency: Optional[str]
    created_at: datetime


class VerificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    report_id: int
    user_id: Optional[int]
    severity_vote: Optional[str]
    comment: Optional[str]
    is_confirmed: bool
    created_at: datetime


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reference_code: str
    title: str
    description: str
    address: Optional[str]
    latitude: float
    longitude: float
    category_id: int
    category_name: Optional[str] = None
    district_id: Optional[int]
    district_name: Optional[str] = None
    ai_severity: Optional[str]
    ai_confidence: Optional[float]
    ai_damage_type: Optional[str]
    final_severity: Optional[str]
    status: str
    credibility_score: float
    verification_count: int
    upvote_count: int
    downvote_count: int
    assigned_team: Optional[str]
    resolution_notes: Optional[str]
    resolved_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]
    user_id: int
    user_name: Optional[str] = None
    images: List[ImageOut] = []
    priority: Optional[PriorityScoreOut] = None
    verifications: List[VerificationOut] = []
    nearby_facilities: Optional[List[Dict[str, Any]]] = Field(default_factory=list)


class ReportListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reference_code: str
    title: str
    latitude: float
    longitude: float
    ai_severity: Optional[str]
    final_severity: Optional[str]
    status: str
    category_name: Optional[str]
    district_name: Optional[str]
    verification_count: int
    credibility_score: float
    created_at: datetime
    priority_score: Optional[float] = None
    priority_rank: Optional[int] = None
    image_url: Optional[str] = None


class ReportListResponse(BaseModel):
    items: List[ReportListItem]
    total: int
    page: int
    page_size: int


class VerificationCreate(BaseModel):
    severity_vote: Optional[str] = Field(default=None)
    comment: Optional[str] = Field(default=None, max_length=1000)
    is_confirmed: bool = True

    @field_validator("severity_vote")
    @classmethod
    def _validate_severity(cls, v):
        if v is None:
            return v
        allowed = ("Low", "Moderate", "High", "Critical")
        if v not in allowed:
            raise ValueError(f"severity_vote must be one of {allowed}")
        return v


# ---------- Map ----------
class MapFeature(BaseModel):
    type: str = "Feature"
    geometry: dict
    properties: dict


class MapFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[MapFeature]


# ---------- Analytics ----------
class DashboardSummary(BaseModel):
    total_reports: int
    pending_reports: int
    verified_reports: int
    resolved_reports: int
    critical_incidents: int
    total_users: int
    total_verifications: int
    avg_response_time_hours: Optional[float]
    response_rate: float


class CategoryDistributionItem(BaseModel):
    category: str
    count: int
    critical_count: int


class SeverityDistributionItem(BaseModel):
    severity: str
    count: int
    percentage: float


class MonthlyTrendItem(BaseModel):
    month: str
    reports: int
    resolved: int


class DistrictAnalyticsItem(BaseModel):
    district: str
    reports: int
    critical: int
    resolved: int
    avg_priority: float


# ---------- Admin ----------
class AdminActionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    admin_id: Optional[int]
    report_id: int
    action: str
    previous_value: Optional[str]
    new_value: Optional[str]
    notes: Optional[str]
    created_at: datetime


class ReportStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None
    assigned_team: Optional[str] = None
    delete_on_resolved: Optional[bool] = True


class SeverityUpdate(BaseModel):
    severity: str
    notes: Optional[str] = None

    @field_validator("severity")
    @classmethod
    def _v(cls, v):
        allowed = ("Low", "Moderate", "High", "Critical")
        if v not in allowed:
            raise ValueError(f"severity must be one of {allowed}")
        return v


class AssignTeam(BaseModel):
    team: str = Field(min_length=2, max_length=150)
    notes: Optional[str] = None


# ---------- Notifications ----------
class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    message: str
    type: str
    is_read: bool
    report_id: Optional[int]
    created_at: datetime


# ---------- Generic ----------
class MessageResponse(BaseModel):
    message: str
    detail: Optional[str] = None


class ErrorResponse(BaseModel):
    detail: str
    code: Optional[str] = None

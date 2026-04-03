from pydantic import BaseModel, EmailStr


class ContactInfo(BaseModel):
    email: str | None
    phone: str | None
    linkedin: str | None
    github: str | None
    portfolio: str | None
    location: str | None


class Education(BaseModel):
    institution: str
    degree: str
    field_of_study: str | None
    start_year: int | None
    end_year: int | None
    grade: str | None


class Experience(BaseModel):
    company: str
    role: str
    location: str | None
    start_date: str | None
    end_date: str | None        # None = current job
    description: str | None
    responsibilities: list[str]
    technologies_used: list[str]


class Project(BaseModel):
    name: str
    description: str | None
    technologies: list[str]
    url: str | None
    highlights: list[str]


class Certification(BaseModel):
    name: str
    issuer: str | None
    issued_date: str | None
    expiry_date: str | None
    credential_url: str | None


class Publication(BaseModel):
    title: str
    publisher: str | None
    date: str | None
    url: str | None


class Language(BaseModel):
    language: str
    proficiency: str | None     # e.g. Native, Fluent, Intermediate


class ResumeData(BaseModel):
    # ── Personal ─────────────────────────────────────────────
    full_name: str | None
    headline: str | None        # e.g. "Senior Backend Engineer"
    summary: str | None
    contact: ContactInfo | None

    # ── Core sections ─────────────────────────────────────────
    education: list[Education]
    experience: list[Experience]
    projects: list[Project]
    certifications: list[Certification]

    # ── Skills ────────────────────────────────────────────────
    technical_skills: list[str]
    soft_skills: list[str]
    tools: list[str]
    languages: list[Language]

    # ── Extras ────────────────────────────────────────────────
    publications: list[Publication]
    awards: list[str]
    volunteer_work: list[str]
    interests: list[str]
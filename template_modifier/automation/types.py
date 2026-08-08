from pydantic import BaseModel
from typing import List, Optional

class PersonalDetails(BaseModel):
    name: str
    title: str
    location: str
    phone: str
    email: str
    linkedin: str
    github: str

class CoverLetter(BaseModel):
    salutation: str
    objective: str

class Experience(BaseModel):
    role: str
    company: str
    location: str
    dates: str
    highlights: List[str]

class Project(BaseModel):
    name: str
    tech_stack: str
    highlights: List[str]

class Skill(BaseModel):
    category: str
    items: List[str]

class Education(BaseModel):
    degree: str
    institution: str
    dates: str

# Root Model mapping the entire JSON structure
class ResumeSchema(BaseModel):
    personal_details: PersonalDetails
    cover_letter: CoverLetter
    experience: List[Experience]
    projects: List[Project]
    skills: List[Skill]
    education: List[Education]
    # Defaulting to a list of strings since the JSON array is empty
    certifications: Optional[List[str]] = []
    message_to_user_for_improvement: list[str]
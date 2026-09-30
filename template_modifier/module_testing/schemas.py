from typing import List
from pydantic import BaseModel, Field

class PersonalDetailsSchema(BaseModel):
    name: str = Field(..., description="Full name of the candidate")
    title: str = Field(..., description="Professional title")
    location: str = Field(..., description="Candidate's current location")
    phone: str = Field(..., description="Phone number")
    email: str = Field(..., description="Email address")
    linkedin: str = Field(..., description="LinkedIn profile URL")
    github: str = Field(..., description="GitHub profile URL")
    points_to_user: str = Field(..., description="According to modified data, explain user where he should be improving the skills to match the Job Description")

class CoverLetterSchema(BaseModel):
    salutation: str = Field(..., description="Salutation used in the cover letter")
    objective: str = Field(..., description="Objective or summary statement of the candidate")

class ExperienceItemSchema(BaseModel):
    role: str = Field(..., description="Job role or title")
    company: str = Field(..., description="Company or organization name")
    location: str = Field(..., description="Location of employment")
    dates: str = Field(..., description="Dates of employment")
    highlights: List[str] = Field(..., description="List of key responsibilities and achievements")

class ProjectItemSchema(BaseModel):
    name: str = Field(..., description="Name of the project")
    tech_stack: str = Field(..., description="Technologies used in the project")
    highlights: List[str] = Field(..., description="Key highlights and details of the project")

class SkillItemSchema(BaseModel):
    category: str = Field(..., description="Category of the skill")
    items: List[str] = Field(..., description="List of skills in this category")

class EducationItemSchema(BaseModel):
    degree: str = Field(..., description="Degree or qualification obtained")
    institution: str = Field(..., description="Name of the educational institution")
    dates: str = Field(..., description="Dates of attendance")

class UserDataSchema(BaseModel):
    personal_details: PersonalDetailsSchema = Field(..., description="Personal details of the candidate")
    cover_letter: CoverLetterSchema = Field(..., description="Cover letter details")
    experience: List[ExperienceItemSchema] = Field(..., description="Professional work experiences")
    projects: List[ProjectItemSchema] = Field(..., description="Key technical projects")
    skills: List[SkillItemSchema] = Field(..., description="Core skills categorized by area")
    education: List[EducationItemSchema] = Field(..., description="Educational history")
    certifications: List[str] = Field(default_factory=list, description="List of professional certifications")

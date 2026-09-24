from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.connection import get_db

router = APIRouter()

@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    """
    Check API and MySQL database connectivity.
    """
    try:
        result = db.execute(text("SELECT VERSION();")).fetchone()
        version = result[0] if result else "Unknown"
        return {
            "status": "healthy",
            "database": "connected",
            "message": "Successfully connected to MySQL database",
            "mysql_version": str(version)
        }
    except Exception as e:
        return {
            "status": "degraded",
            "database": "disconnected",
            "message": f"MySQL connection error: {str(e)}",
            "mysql_version": None
        }

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.db.connection import get_db

router = APIRouter()

@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    """
    Check API and MySQL database connectivity.
    """
    try:
        status_val = db.scalar(select(1))
        return {
            "status": "healthy" if status_val == 1 else "degraded",
            "database": "connected",
            "message": "Successfully connected to database"
        }
    except Exception as e:
        return {
            "status": "degraded",
            "database": "disconnected",
            "message": f"Database connection error: {str(e)}"
        }

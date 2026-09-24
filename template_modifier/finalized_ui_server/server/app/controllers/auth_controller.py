from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.db.connection import get_db
from app.schemas.user_schema import UserRegisterRequest, UserLoginRequest, UserResponse, TokenResponse
from app.services.user_service import user_service
from app.controllers.deps import get_current_user
from app.models.user_model import User

router = APIRouter()

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserRegisterRequest, db: Session = Depends(get_db)):
    """
    Register new user with name, email, and password.
    """
    return user_service.register_user(db=db, user_in=user_in)

@router.post("/login", response_model=TokenResponse)
def login(user_in: UserLoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate user using email and password, returning JWT access token.
    """
    return user_service.login_user(db=db, user_in=user_in)

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """
    Fetch current authenticated user profile.
    """
    return user_service.get_current_user_profile(user=current_user)

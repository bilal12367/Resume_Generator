from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.repositories.user_repository import user_repository
from app.schemas.user_schema import UserRegisterRequest, UserLoginRequest, TokenResponse, UserResponse
from app.core.security import verify_password, create_access_token
from app.models.user_model import User

class UserService:
    def register_user(self, db: Session, user_in: UserRegisterRequest) -> UserResponse:
        existing_user = user_repository.get_by_email(db, email=user_in.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists."
            )
        user = user_repository.create(db, user_in=user_in)
        return UserResponse.model_validate(user)

    def login_user(self, db: Session, user_in: UserLoginRequest) -> TokenResponse:
        user = user_repository.get_by_email(db, email=user_in.email)
        if not user or not verify_password(user_in.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"}
            )
        token = create_access_token(subject=user.id)
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user=UserResponse.model_validate(user)
        )

    def get_current_user_profile(self, user: User) -> UserResponse:
        return UserResponse.model_validate(user)

user_service = UserService()

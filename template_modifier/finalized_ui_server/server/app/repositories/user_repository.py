from sqlalchemy.orm import Session
from typing import Optional
from app.models.user_model import User
from app.schemas.user_schema import UserRegisterRequest
from app.core.security import get_password_hash

class UserRepository:
    def get_by_email(self, db: Session, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()

    def get_by_id(self, db: Session, user_id: int) -> Optional[User]:
        return db.query(User).filter(User.id == user_id).first()

    def create(self, db: Session, user_in: UserRegisterRequest) -> User:
        db_user = User(
            name=user_in.name,
            email=user_in.email,
            hashed_password=get_password_hash(user_in.password)
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

user_repository = UserRepository()

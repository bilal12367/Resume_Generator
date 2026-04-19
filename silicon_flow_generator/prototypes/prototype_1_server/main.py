# from prompts.inputs import one_shot_prompt
# # from db.connection import engine, get_db
# from sqlalchemy.orm import DeclarativeBase, sessionmaker
# from config.jpa_repository import JpaRepository
# from sqlalchemy import create_engine, Column, UUID, Integer, String
# from db.connection import Base, get_db, engine
# from service.log_svc import LoggingService
# from sqlalchemy.orm import sessionmaker, declarative_base
# from workflow_agent.agent_workflow import main
# import asyncio as aio
## Example JPA Usage
from workflow_agent.agent_workflow_2 import main
import asyncio
# from service.logging_svc import LoggerService
asyncio.run(main())
# class Base(DeclarativeBase):
#     pass

# class User(Base):
#     __tablename__ = 'test_users'
#     id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
#     name: str = Column(String)
#     email: str = Column(String)

    
#     def __repr__(self):
#         return f"<User id={self.id} name={self.name!r} email={self.email!r}>"
# Base.metadata.create_all(engine)


# class UserRepository(JpaRepository[User]):
#     pass

# session = sessionmaker(bind=engine)()

# user_repo = UserRepository(User,session )
# bilal = user_repo.save(User(name='bilal', email='test1@gmail.com'))

# print(f"Created User: {bilal}")





from typing import Generic, TypeVar, Type, Optional, List, Any, Dict
from sqlalchemy.orm import Session
from sqlalchemy import inspect

T = TypeVar("T")


class JpaRepository(Generic[T]):
    """
    A generic Spring Boot-style JpaRepository for SQLAlchemy.

    Usage:
        class UserRepository(JpaRepository[User]):
            pass

        repo = UserRepository(User, db_session)
        user = repo.find_by_id(1)
    """

    def __init__(self, model: Type[T], session: Session):
        self._model = model
        self._session = session

    # ------------------------------------------------------------------ #
    #  Save / Update                                                       #
    # ------------------------------------------------------------------ #

    def save(self, entity: T) -> T:
        """Persist a new entity or update an existing one (merge)."""
        merged = self._session.merge(entity)
        self._session.commit()
        self._session.refresh(merged)
        return merged

    def save_all(self, entities: List[T]) -> List[T]:
        """Persist a list of entities in a single transaction."""
        merged = [self._session.merge(e) for e in entities]
        self._session.commit()
        for e in merged:
            self._session.refresh(e)
        return merged

    # ------------------------------------------------------------------ #
    #  Read                                                                #
    # ------------------------------------------------------------------ #

    def find_by_id(self, pk: Any) -> Optional[T]:
        """Find a single entity by primary key. Returns None if not found."""
        return self._session.get(self._model, pk)

    def find_by_id_or_raise(self, pk: Any) -> T:
        """Find by primary key or raise ValueError if not found."""
        entity = self.find_by_id(pk)
        if entity is None:
            raise ValueError(f"{self._model.__name__} with id={pk!r} not found.")
        return entity

    def find_all(self) -> List[T]:
        """Return every row in the table."""
        return self._session.query(self._model).all()

    def find_all_by_ids(self, pks: List[Any]) -> List[T]:
        """Return entities whose primary key is in the given list."""
        pk_col = self._get_pk_column()
        return self._session.query(self._model).filter(pk_col.in_(pks)).all()

    def find_by(self, **filters) -> List[T]:
        """
        Simple equality filter on one or more columns.

        Example:
            repo.find_by(email="alice@example.com", is_active=True)
        """
        return self._session.query(self._model).filter_by(**filters).all()

    def find_one_by(self, **filters) -> Optional[T]:
        """Like find_by but returns the first match (or None)."""
        return self._session.query(self._model).filter_by(**filters).first()

    def count(self) -> int:
        """Return the total number of rows."""
        return self._session.query(self._model).count()

    def exists_by_id(self, pk: Any) -> bool:
        """Return True if an entity with the given primary key exists."""
        return self.find_by_id(pk) is not None

    def exists_by(self, **filters) -> bool:
        """Return True if at least one row matches the given filters."""
        return self._session.query(self._model).filter_by(**filters).first() is not None

    # ------------------------------------------------------------------ #
    #  Delete                                                              #
    # ------------------------------------------------------------------ #

    def delete(self, entity: T) -> None:
        """Delete a managed entity."""
        self._session.delete(entity)
        self._session.commit()

    def delete_by_id(self, pk: Any) -> None:
        """Delete by primary key. Raises ValueError if not found."""
        entity = self.find_by_id_or_raise(pk)
        self.delete(entity)

    def delete_all(self, entities: List[T]) -> None:
        """Delete a list of entities in a single transaction."""
        for entity in entities:
            self._session.delete(entity)
        self._session.commit()

    def delete_all_entries(self) -> None:
        """⚠️  Delete EVERY row in the table. Use with caution."""
        self._session.query(self._model).delete()
        self._session.commit()

    # ------------------------------------------------------------------ #
    #  Pagination                                                          #
    # ------------------------------------------------------------------ #

    def find_all_paginated(self, page: int = 0, page_size: int = 20) -> List[T]:
        """
        Return a page of results (zero-based page index).

        Example:
            first_page  = repo.find_all_paginated(page=0, page_size=10)
            second_page = repo.find_all_paginated(page=1, page_size=10)
        """
        return (
            self._session.query(self._model)
            .offset(page * page_size)
            .limit(page_size)
            .all()
        )

    # ------------------------------------------------------------------ #
    #  Session access (escape hatch)                                       #
    # ------------------------------------------------------------------ #

    @property
    def session(self) -> Session:
        """Expose the raw session for complex custom queries."""
        return self._session

    # ------------------------------------------------------------------ #
    #  Private helpers                                                     #
    # ------------------------------------------------------------------ #

    def _get_pk_column(self):
        mapper = inspect(self._model)
        pk_cols = mapper.mapper.primary_key
        if len(pk_cols) != 1:
            raise NotImplementedError(
                "find_all_by_ids() only supports single-column primary keys."
            )
        return pk_cols[0]
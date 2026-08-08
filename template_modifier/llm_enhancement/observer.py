from __future__ import annotations

from typing import Any, Callable, Set


class Observer:
    """Wraps a callback function to act as an observer in the Observer design pattern."""

    def __init__(self, func: Callable[[Any], Any]):
        self.func = func

    def update(self, obj: Any) -> None:
        self.func(obj)


class Subject:
    """Base class for subject entities in the Observer design pattern."""

    def __init__(self) -> None:
        self.observers: Set[Observer] = set()

    def add_observer(self, observer: Observer) -> None:
        self.observers.add(observer)

    def remove_observer(self, observer: Observer) -> None:
        self.observers.remove(observer)

    def notify_all(self, obj: Any) -> None:
        for observer in self.observers:
            observer.update(obj)

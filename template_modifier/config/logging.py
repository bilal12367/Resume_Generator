import logging
import sys
from typing import cast


# Custom SUCCESS level (between INFO and WARNING)
SUCCESS = 25
logging.addLevelName(SUCCESS, "SUCCESS")


class ColorFormatter(logging.Formatter):
    """Formatter that adds ANSI color codes to log output."""

    COLORS = {
        logging.DEBUG:    "\033[36m",    # Cyan
        logging.INFO:     "\033[34m",    # Blue
        SUCCESS:          "\033[32m",    # Green
        logging.WARNING:  "\033[33m",    # Yellow
        logging.ERROR:    "\033[31m",    # Red
        logging.CRITICAL: "\033[1;31m",  # Bold Red
    }
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"

    def format(self, record):
        color = self.COLORS.get(record.levelno, self.RESET)
        levelname = record.levelname
        timestamp = self.formatTime(record, self.datefmt)

        formatted = (
            f"{self.DIM}{timestamp}{self.RESET} "
            f"{color}{self.BOLD}{levelname:<8}{self.RESET} "
            f"{self.DIM}{record.name}{self.RESET} "
            f"{color}│{self.RESET} {record.getMessage()}"
        )
        return formatted


class AppLogger(logging.Logger):
    """Custom logger with a success() method."""

    def success(self, msg, *args, **kwargs):
        if self.isEnabledFor(SUCCESS):
            self._log(SUCCESS, msg, args, **kwargs)


logging.setLoggerClass(AppLogger)


def get_logger(name: str = "app", level: int = logging.DEBUG) -> AppLogger:
    """Create and return a colorful console logger.

    Args:
        name:  Logger name (appears in output).
        level: Minimum log level to display.

    Returns:
        An AppLogger instance with color formatting.
    """
    logger = cast(AppLogger, logging.getLogger(name))

    if logger.handlers:
        return logger

    logger.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    handler.setFormatter(ColorFormatter(datefmt="%H:%M:%S"))

    logger.addHandler(handler)
    logger.propagate = False

    return logger

# app/core/logging_config.py

import logging
import logging.config
from pathlib import Path

def setup_logging(file_name: str = "objects.jsonl"):
    Path("logs").mkdir(exist_ok=True)

    LOGGING_CONFIG = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "console": {
                "format": "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                "datefmt": "%H:%M:%S",
            },
            "json": {
                "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
                "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "console",
                "level": "DEBUG",
            },
            "json_file": {
                "class": "logging.handlers.RotatingFileHandler",
                "formatter": "json",
                "filename": f"logs/{file_name}" if file_name.endswith(".jsonl") else f"logs/{file_name}.jsonl",
                "maxBytes": 10_000_000,   # 10MB
                "backupCount": 3,
                "level": "DEBUG",
            },
        },
        "loggers": {
            "app": {
                "level": "DEBUG",
                "handlers": ["console"],      # normal logs → terminal only
                "propagate": False,
            },
            "app.objects": {
                "level": "DEBUG",
                "handlers": ["json_file"],    # big objects → file only
                "propagate": False,
            },
        },
    }
    logging.config.dictConfig(LOGGING_CONFIG)
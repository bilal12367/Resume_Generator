from datetime import datetime
import json

def log_to_jsonl( level, message):
    file_path='test_log.log'
    """Appends a single JSON log entry to a .jsonl file."""
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "level": level.upper(),
        "message": message,
        # **extra_fields  # Allows passing arbitrary data
    }
    
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry) + "\n")

# log_to_jsonl('info', {'test_key': 'test_message'})
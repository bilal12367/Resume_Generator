from datetime import datetime
import json
from sqlalchemy.orm.session import Session
from config.jpa_repository import JpaRepository as JP
from db.workflow_run import WorkflowRun, WorkflowSession
import uuid
from db.connection import get_db
from pathlib import Path

def log_to_jsonl( level, message, file_path = 'test.log'):
    # path = Path(file_path)
    # path.mkdir(parents=True, exist_ok=True)
    """Appends a single JSON log entry to a .jsonl file."""
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "level": level.upper(),
        "message": message,
        # **extra_fields  # Allows passing arbitrary data
    }
    # f = path.open('w')
    # f.write(json.dumps(log_entry)+"\n")
    # f.close()
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry) + "\n")

class LoggingService:
    def __init__(self, db: Session):
        self.workflow_run_repo: JP = JP(WorkflowRun,db)
        self.workflow_session_repo: JP = JP(WorkflowSession,db)
        pass

    def log_workflow_event(self, session_id: str, message: str, model_input: str, status: str = "START", is_error = False, total_tokens = None, prompt_tokens = None, completion_tokens = None):
        workflow_session = None
        if session_id == None:
            
            workflow_session = self.workflow_session_repo.save(WorkflowSession(run_ids=[], start_time=datetime.now()))
        else:
            workflow_session = self.workflow_session_repo.find_by_id(session_id)
        return self.workflow_run_repo.save(WorkflowRun(run_id=str(uuid.uuid4()),session_id=workflow_session.id,message=message, status=status,is_error=is_error))
    
    def log_workflow_object(self, session_id: str, run_id: str, output: dict, is_error: bool, prompt_tokens = None, completion_tokens = None, total_tokens = None):
        log_to_jsonl("DEBUG", {'session_id':session_id, 'run_id':run_id, 'output':output, 'is_error':is_error, 'prompt_tokens':prompt_tokens, 'completion_tokens':completion_tokens, 'total_tokens':total_tokens}, 'test.log')

svc = LoggingService(None)


    






# log_to_jsonl('info', {'test_key': 'test_message'})
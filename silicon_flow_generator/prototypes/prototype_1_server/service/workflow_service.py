
from sqlalchemy.orm import Session
from config.jpa_repository import JpaRepository as JP
from db.workflow_run import WorkflowRun
from workflow_agent.agent_workflow_3 import MyWorkflow as WF, LogEvent
from service.logging_svc import LoggerService


class WorkflowService:
    def __init__(self, db: Session):
        self.repo: JP = JP(WorkflowRun, db)
        pass
    
    async def start_workflow(self, user_data: dict, color_custom_input: str = '', layout_custom_input: str = ''):
        wf = WF(timeout=None, verbose=True)
        wf_rec = self.repo.save(WorkflowRun(
            total_tokens=0,
            time_taken=0,
            is_error=False,
            final_output='',
            run_details={}
        ))
        run_id = wf_rec.id
        
        # Initialize the logger with the application tag and workflow run_id
        logger = LoggerService(id=str(run_id), app_name='resume_generator', name='workflow_stream')
        
        handler = wf.run(
            run_id=str(run_id),
            user_data=str(user_data),
            color_user_input=color_custom_input,
            layout_user_input=layout_custom_input
        )
        
        total_tokens = 0
        total_time = 0.0
        
        async for ev in handler.stream_events():
            if isinstance(ev, LogEvent):
                log_payload = {
                    "message": ev.message,
                    "error": ev.error,
                    "details": ev.details
                }
                logger.log(log_payload)
                
                if ev.error:
                    wf_rec.is_error = True
                
                if ev.details and ev.details.get("metrics"):
                    metrics = ev.details["metrics"]
                    total_tokens += metrics.get("total_tokens", 0)
                    exec_time_str = metrics.get("execution_time", "0")
                    if isinstance(exec_time_str, str):
                        try:
                            # execution_time format: "0.12345 seconds"
                            time_val = float(exec_time_str.split()[0])
                            total_time += time_val
                        except (ValueError, IndexError):
                            pass
            
        final_result = await handler
        
        wf_rec.total_tokens = total_tokens
        wf_rec.time_taken = total_time
        if final_result and "resume" in final_result:
            wf_rec.final_output = final_result["resume"]
            
        self.repo.save(wf_rec)
        
        return final_result
        
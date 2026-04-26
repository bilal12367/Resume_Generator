from workflows import Context, Workflow, step
from workflows.events import StartEvent, StopEvent, Event
import asyncio
from .llm import LLM
from .inputs import inputs
import logging
import dotenv, os
from service.prompt_svc import PromptService

import json, secrets
from datetime import datetime
from pathlib import Path
from uuid import uuid4 as uid

logging.basicConfig(level=logging.INFO)
dotenv.load_dotenv()

# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

class LogEvent(Event):
    """
    Standardized event for streaming logs, metrics, and full data payloads.
    """
    message: str
    error: bool = False
    details: dict = None 

class ColorGenerateEvent(Event):
    pass

class LayoutGenerateEvent(Event):
    pass

class ColorDoneEvent(Event):
    colors: str

class LayoutDoneEvent(Event):
    layout: str

class GenerateResumeEvent(Event):
    colors: str
    layout: str

class ResumeDoneEvent(Event):
    html: str

# ---------------------------------------------------------------------------
# Workflow
# ---------------------------------------------------------------------------

class MyWorkflow(Workflow):
    
    # ------------------------------------------------------------------
    # Node 1 — start
    # ------------------------------------------------------------------
    @step
    async def start(self, ctx: Context, ev: StartEvent) -> ColorGenerateEvent | LayoutGenerateEvent:
        await asyncio.sleep(1)
        prompt_svc = PromptService()
        
        # Load all prompts
        color_prompt = prompt_svc.get_prompt('color_generation')
        layout_prompt = prompt_svc.get_prompt('layout_generation')
        resume_prompt = prompt_svc.get_prompt('resume_generation')
        
        user_data = ev.get("user_data")
        layout_user_input = ev.get('layout_user_input')
        color_user_input = ev.get('color_user_input')
        run_id = ev.get("run_id", str(uid()))
        
        if user_data is None:
            ctx.write_event_to_stream(LogEvent(message="Validation Failed: Missing user_data", error=True))
            raise ValueError("StartEvent is missing 'user_data'.")

        # Persistence
        await ctx.store.set('color_prompt', color_prompt)
        await ctx.store.set('color_user_input', color_user_input)
        await ctx.store.set('layout_user_input', layout_user_input)
        await ctx.store.set('layout_prompt', layout_prompt)
        await ctx.store.set('resume_prompt', resume_prompt)
        await ctx.store.set("user_data", user_data)

        # Log everything about the initialization
        ctx.write_event_to_stream(LogEvent(
            message="Workflow Started", 
            details={
                "run_id": run_id,
                "input_params": {
                    "color_input": color_user_input,
                    "layout_input": layout_user_input
                }
            }
        ))

        ctx.send_event(ColorGenerateEvent())
        ctx.send_event(LayoutGenerateEvent())

    # ------------------------------------------------------------------
    # Node 2a — color generator
    # ------------------------------------------------------------------
    @step
    async def color_generator(self, ctx: Context, ev: ColorGenerateEvent) -> ColorDoneEvent:
        try:
            color_prompt = await ctx.store.get("color_prompt")
            color_input = await ctx.store.get('color_user_input')

            llm = LLM()
            response = llm.call(
                system_prompt=color_prompt,
                user_prompt=color_input,
                max_tokens=512
            )
            
            # Log Full Response: Metrics + Output
            ctx.write_event_to_stream(LogEvent(
                message="Color Generation Complete",
                details={
                    "node": "color_generator",
                    "metrics": response.get('metrics'),
                    "full_output": response.get('output')
                }
            ))

            return ColorDoneEvent(colors=response['output'])

        except Exception as e:
            ctx.write_event_to_stream(LogEvent(message=f"Color Gen Failed: {str(e)}", error=True))
            raise

    # ------------------------------------------------------------------
    # Node 2b — layout generator
    # ------------------------------------------------------------------
    @step
    async def layout_generator(self, ctx: Context, ev: LayoutGenerateEvent) -> LayoutDoneEvent:
        try:
            layout_prompt = await ctx.store.get("layout_prompt")
            
            llm = LLM()
            response = llm.call(user_prompt=layout_prompt, max_tokens=4096)
            
            # Log Full Response: Metrics + Output
            ctx.write_event_to_stream(LogEvent(
                message="Layout Generation Complete",
                details={
                    "node": "layout_generator",
                    "metrics": response.get('metrics'),
                    "full_output": response.get('output')
                }
            ))

            return LayoutDoneEvent(layout=response['output'])

        except Exception as e:
            ctx.write_event_to_stream(LogEvent(message=f"Layout Gen Failed: {str(e)}", error=True))
            raise

    # ------------------------------------------------------------------
    # Node 3 — collector (No LLM here, just state transition)
    # ------------------------------------------------------------------
    @step
    async def collector(self, ctx: Context, ev: ColorDoneEvent | LayoutDoneEvent) -> GenerateResumeEvent:
        collected = ctx.collect_events(ev, [ColorDoneEvent, LayoutDoneEvent])
        if collected is None:
            return None

        ctx.write_event_to_stream(LogEvent(message="Prerequisites met. Initializing Resume Assembler."))
        ctx.send_event(GenerateResumeEvent(colors=collected[0].colors, layout=collected[1].layout))

    # ------------------------------------------------------------------
    # Node 4 — resume generator
    # ------------------------------------------------------------------
    @step
    async def resume_generator(self, ctx: Context, ev: GenerateResumeEvent) -> ResumeDoneEvent:
        try:
            resume_prompt = await ctx.store.get("resume_prompt")
            user_data = await ctx.store.get("user_data")

            filled_prompt = (
                resume_prompt
                .replace("{{colors}}", ev.colors)
                .replace("{{layout}}", ev.layout)
                .replace("{{user_data}}", str(user_data))
            )

            llm = LLM()
            response = llm.call(user_prompt=filled_prompt, max_tokens=10000)
            
            # Log Full Response: Metrics + Output (HTML)
            ctx.write_event_to_stream(LogEvent(
                message="Resume HTML Generation Complete",
                details={
                    "node": "resume_generator",
                    "metrics": response.get('metrics'),
                    "full_output": response.get('output') 
                }
            ))

            return ResumeDoneEvent(html=response['output'])

        except Exception as e:
            ctx.write_event_to_stream(LogEvent(message=f"Resume Gen Failed: {str(e)}", error=True))
            raise

    # ------------------------------------------------------------------
    # Node 5 — final collector
    # ------------------------------------------------------------------
    @step
    async def final_collector(self, ctx: Context, ev: ResumeDoneEvent) -> StopEvent:
        html = ev.html
        svc = PromptService()
        final_html = svc.get_prompt('html_template', {'final_html': html}).replace('\n', '')
        
        file_name = f"res_{secrets.token_hex(4)}.html"
        path = f'html/{file_name}'
        
        with open(path, 'w', encoding='utf-8') as f:
            f.write(final_html)
            
        ctx.write_event_to_stream(LogEvent(
            message="Workflow Finalized",
            details={
                "node": "final_collector",
                "file_generated": path,
                "final_length": len(final_html)
            }
        ))
        
        return StopEvent(result={"resume": final_html})

# ---------------------------------------------------------------------------
# Consumer Implementation
# ---------------------------------------------------------------------------

# async def main():
#     wf = MyWorkflow(timeout=None, verbose=False)
#     handler = wf.run(
#         user_data=inputs['user_data'], 
#         color_user_input="Professional Slate Grey and Gold",
#         layout_user_input="Modern Sidebar"
#     )

#     async for ev in handler.stream_events():
#         if isinstance(ev, LogEvent):
#             # You can now see the 'full_output' in your console/logs
#             print(f"--- [{ev.message}] ---")
#             if ev.details:
#                 # Be careful: printing huge HTML strings might flood your terminal
#                 print(json.dumps(ev.details, indent=2))
#             print("-" * 30)

#     await handler

# if __name__ == "__main__":
#     asyncio.run(main())
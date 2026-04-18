from workflows import Context, Workflow, step
from workflows.events import StartEvent, StopEvent, Event
import asyncio
from .llm import LLM
from .inputs import inputs
import logging
import dotenv, os
from .log_test import log_to_jsonl



logging.basicConfig(level=logging.INFO)
dotenv.load_dotenv()


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

class LogEvent(Event):
    error: bool = False
    message: str
    object: any = None

# Fan-out — both fired in parallel from start
class ColorGenerateEvent(Event):
    pass

class LayoutGenerateEvent(Event):
    pass

# Fan-in — each parallel node emits one of these, collector waits for both
class ColorDoneEvent(Event):
    colors: str

class LayoutDoneEvent(Event):
    layout: str

# Fan-out again — collector fires both section generators in parallel
class GenerateHeaderEvent(Event):
    colors: str
    layout: str

class GenerateExperienceEvent(Event):
    colors: str
    layout: str

class GenerateProjectsEvent(Event):
    colors: str
    layout: str

class GenerateResumeEvent(Event):
    colors: str
    layout: str

# Fan-in — each section emits one of these, collector waits for both
class HeaderDoneEvent(Event):
    html: str

class ExperienceDoneEvent(Event):
    html: str

class ProjectsDoneEvent(Event):
    html: str

class ResumeDoneEvent(Event):
    html: str



# ---------------------------------------------------------------------------
# Workflow
# ---------------------------------------------------------------------------

class MyWorkflow(Workflow):

    # ------------------------------------------------------------------
    # Node 1 — start: validates inputs, fires color + layout in parallel
    # ------------------------------------------------------------------
    @step
    async def start(self, ctx: Context, ev: StartEvent) -> ColorGenerateEvent | LayoutGenerateEvent:
        await asyncio.sleep(1)

        # prompts: dict   = ev.get("prompts")
        color_prompt: str = ev.get('color_prompt')
        color_user_input: str = ev.get('color_user_input')
        layout_user_input: str = ev.get('layout_user_input')
        layout_prompt: str = ev.get('layout_prompt')
        resume_prompt: str = ev.get('resume_generation_prompt')
        
        user_data: dict = ev.get("user_data")

        # if prompts is None:
        #     raise ValueError("StartEvent is missing 'prompts' (dict).")
        if user_data is None:
            raise ValueError("StartEvent is missing 'user_data' (dict).")

        # await ctx.store.set("prompts",   prompts)
        await ctx.store.set('color_prompt', color_prompt)
        await ctx.store.set('color_user_input', color_user_input)
        await ctx.store.set('layout_user_input', layout_user_input)
        await ctx.store.set('layout_prompt', layout_prompt)
        await ctx.store.set('resume_prompt', resume_prompt)
        await ctx.store.set("user_data", user_data)

        ctx.write_event_to_stream(LogEvent(message="[start] Firing color_generator and layout_generator in parallel."))

        # Fire both in parallel — workflow picks them up concurrently
        ctx.send_event(ColorGenerateEvent())
        ctx.send_event(LayoutGenerateEvent())

    # ------------------------------------------------------------------
    # Node 2a — color generator (parallel)
    # ------------------------------------------------------------------
    @step
    async def color_generator(self, ctx: Context, ev: ColorGenerateEvent) -> ColorDoneEvent:
        try:
            color_prompt: str = await ctx.store.get("color_prompt")
            color_input: str = await ctx.store.get('color_user_input')

            
            if not color_prompt:
                raise ValueError("Missing 'color_generation' prompt.")

            llm = LLM()
            result = llm.call(
                system_prompt=color_prompt,
                user_prompt=color_input,
                # user_prompt="Need a emerald green kind of set of colours for professional color set",
                max_tokens=512
            )

            ctx.write_event_to_stream(LogEvent(
                message="[color_generator] Done.",
                object={"colors": result}
            ))

            return ColorDoneEvent(colors=result)

        except Exception as e:
            ctx.write_event_to_stream(LogEvent(error=True, message=f"[color_generator] Error: {e}"))
            raise

    # ------------------------------------------------------------------
    # Node 2b — layout generator (parallel)
    # ------------------------------------------------------------------
    @step
    async def layout_generator(self, ctx: Context, ev: LayoutGenerateEvent) -> LayoutDoneEvent:
        try:
            layout_prompt: dict   = await ctx.store.get("layout_prompt")
            # user_data: dict = await ctx.store.get("user_data")

            
            if not layout_prompt:
                raise ValueError("prompts dict is missing 'layout_prompt' key.")

            llm = LLM()
            result = llm.call(
                user_prompt=layout_prompt,
                max_tokens=4096
            )

            ctx.write_event_to_stream(LogEvent(
                message="[layout_generator] Done.",
                object={"layout": result}
            ))

            return LayoutDoneEvent(layout=result)

        except Exception as e:
            ctx.write_event_to_stream(LogEvent(error=True, message=f"[layout_generator] Error: {e}"))
            raise

    # ------------------------------------------------------------------
    # Node 3 — collector: waits for BOTH color + layout, then fans out again
    # ------------------------------------------------------------------
    @step
    async def collector(self, ctx: Context, ev: ColorDoneEvent | LayoutDoneEvent) -> GenerateResumeEvent:
        # Returns None until both events have arrived
        collected = ctx.collect_events(ev, [ColorDoneEvent, LayoutDoneEvent])
        if collected is None:
            return None

        colors_ev, layout_ev = collected[0], collected[1]
        colors  = colors_ev.colors
        layout  = layout_ev.layout

        ctx.write_event_to_stream(LogEvent(
            message="[collector] Both color and layout ready — firing header and experience generators in parallel."
        ))

        # Fan-out second wave — header and experience in parallel
        ctx.send_event(GenerateResumeEvent(colors=colors, layout=layout))
        # ctx.send_event(GenerateExperienceEvent(colors=colors, layout=layout))
        # ctx.send_event(GenerateProjectsEvent(colors=colors, layout=layout))   # ← new


    # ------------------------------------------------------------------
    # Node 4a — header generator (parallel)
    # ------------------------------------------------------------------
    @step
    async def resume_generator(self, ctx: Context, ev: GenerateResumeEvent) -> ResumeDoneEvent:
        try:
            resume_prompt: str   = await ctx.store.get("resume_prompt")
            user_data: dict = await ctx.store.get("user_data")

            # header_prompt: str = prompts.get("resume_generation")
            if not resume_prompt:
                raise ValueError("prompts dict is missing 'resume_generation' key.")

            filled_prompt = (
                resume_prompt
                .replace("{{colors}}",    ev.colors)
                .replace("{{layout}}",    ev.layout)
                .replace("{{user_data}}", str(user_data))
            )

            llm    = LLM()
            result = llm.call(user_prompt=filled_prompt, max_tokens=10000)

            ctx.write_event_to_stream(LogEvent(
                message="[resume_generator] Done.",
                object={"header_html": result}
            ))

            return ResumeDoneEvent(html=result)

        except Exception as e:
            ctx.write_event_to_stream(LogEvent(message=f"[resume_generator] Error: {e}"))
            raise

    
    # ------------------------------------------------------------------
    # Node 5 — final collector: waits for header + experience, returns both
    # ------------------------------------------------------------------
    @step
    async def final_collector(self, ctx: Context, ev: ResumeDoneEvent) -> StopEvent:
        

        ctx.write_event_to_stream(LogEvent(
            message="[final_collector] All sections ready.",
            object=ev.html
        ))

        return StopEvent(result={
            "resume": ev.html
        })
import json
from datetime import datetime
from pathlib import Path
def save_output(data: dict, output_dir: str = "outputs", mode: str = "json"):
    """
    Save workflow result to file.
 
    Args:
        data       : the result dict from StopEvent
        output_dir : folder to save into (created if missing)
        mode       : "json"  → one pretty-printed file per run
                     "jsonl" → appends one line per run to a shared file
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
 
    payload = {
        "timestamp": timestamp,
        **data,
    }
 
    if mode == "jsonl":
        path = Path(output_dir) / "results.jsonl"
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    else:
        path = Path(output_dir) / f"result_{timestamp}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
 
    logging.info(f"[save_output] Saved → {path}")
    return path

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def main():
    wf      = MyWorkflow(timeout=None, verbose=True)
    # color_prompt: str = ev.get('color_prompt')
    # color_user_input: str = ev.get('color_user_input')
    # layout_user_input: str = ev.get('layout_user_input')
    # layout_prompt: str = ev.get('layout_prompt')
    # resume_prompt: str = ev.get('resume_generation_prompt')
    
    # user_data: dict = ev.get("user_data")
    handler = wf.run(
        user_data=inputs['user_data'], 
        color_prompt=inputs['prompts']['color_prompt'],
        layout_prompt=inputs['prompts']['layout_prompt'],
        resume_generation_prompt=inputs['prompts']['resume_generation'],
        color_user_input="Need a navy blue, professional color set, with contrast colours",
        layout_user_input=""
    )

    async for ev in handler.stream_events():
        log_to_jsonl("Event", ev.__dict__)

    final_result = await handler
    html = str(final_result.get('resume', '')).replace('\n', '')
    

    logging.info(f"[main] resume preview    → {str(final_result.get('resume', ''))}")
    # logging.info(f"[main] header preview    → {str(final_result.get('header', ''))}")
    # logging.info(f"[main] experience preview → {str(final_result.get('experience', ''))}")

    final_html_template = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    {{final_html}}
</body>
</html>'''

    final_html = final_html_template.replace('{{final_html}}', html)
    with open('index.html','w', encoding='utf-8') as f:
        f.write(final_html)
    save_output(final_result, output_dir="outputs", mode="json")



# asyncio.run(main())
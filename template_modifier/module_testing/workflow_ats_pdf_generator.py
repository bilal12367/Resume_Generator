from llama_index.core.workflow import StartEvent, StopEvent, Workflow, step
import asyncio as aio


class AtsResumeWorkflow(Workflow):

    @step()
    async def start(self, evt: StartEvent) -> StopEvent:
        print(evt.get("test"))
        return StopEvent(state='finish')



async def start():
    wf = AtsResumeWorkflow()

    result = await wf.run(test='value')
    print(result)



aio.run(start())
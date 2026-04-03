


import pytest

from llama_graph.resume_generator_graph import ResumeGeneratorWorkflow
from llama_index.core.workflow import StartEvent

def invoke_graph():
    wf = ResumeGeneratorWorkflow()

    resp = wf.run(StartEvent(user_data={'msg': 'test-data'}))

    assert resp is not None


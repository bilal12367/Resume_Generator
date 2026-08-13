Executing and Managing the HITL StateTo use the workflow above in a production API or application frontend, manage the session state using Context.to_dict() and Context.from_dict():python# Initialize Workflow
llm = OpenAI(model="gpt-4o")
agent_workflow = HumanInTheLoopAgent(llm=llm, tools=[transfer_tool], timeout=120)

# 1. Start execution
handler = agent_workflow.run(input="Transfer $500 to Alice.")

# 2. Listen for events
async for event in handler.stream_events():
    if isinstance(event, InputRequiredEvent):
        print(f"[HITL Intercept]: {event.tool_name} with parameters {event.tool_kwargs}")
        
        # Serialize state and store it in your DB while waiting for the user
        saved_ctx_state = handler.ctx.to_dict() 
        break

# ... Time passes while user reviews the action in UI ...

# 3. Resume execution from external event
new_ctx = Context.from_dict(saved_ctx_state)
handler_resume = agent_workflow.run(
    HumanResponseEvent(approved=True, feedback="Looks good to go!"), 
    ctx=new_ctx
)
result = await handler_resume
print("Final Agent Response:", result)
Use code with caution.To help tailor this design to your specific system, let me know:What specific tool or action in your agent loop requires human intervention (e.g., executing a database write, sending an email, or approving a budget limit)?What is your application architecture (e.g., a synchronous CLI script, a streaming FastAPI backend, or a stateful frontend like React)?
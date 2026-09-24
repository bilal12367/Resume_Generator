import sys
import asyncio
import logging
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)

from app.llm.job_search_agent import ask_user_to_select_jobs, current_session_id_var
from app.llm.agent import AgentDatabase

async def main():
    test_session_id = "test_hitl_session_999"
    current_session_id_var.set(test_session_id)

    job_ids = [
        "4470686663", "4468636103", "4467858290", "4468591455", "4456391473", "4465573060", "4466549329", "4465556787", "4470687710", "4450338721", "4419661514", "4457916431", "4446985752", "4457606232", "4457493374", "4457653068", "4424303071", "4424287925", "4440248036"
    ]

    print(f"\n--- 1. Calling ask_user_to_select_jobs with {len(job_ids)} Job IDs ---")
    result = ask_user_to_select_jobs(job_ids)
    print(f"Returned result: '{result}' (Non-blocking HITL prompt returned instantly!)\n")

    print("--- 2. Waiting 15 seconds for background bulk job fetching & DB saving to progress... ---")
    await asyncio.sleep(15)

    print("\n--- 3. Checking MySQL DB for cached job descriptions ---")
    db = AgentDatabase()
    for jid in job_ids:
        cached = db.get_cached_job_description(jid)
        if cached:
            print(f"  ✅ Job ID {jid}: Title='{cached.get('title')}', Company='{cached.get('company_name')}', Location='{cached.get('location')}'")
        else:
            print(f"  ⏳ Job ID {jid}: Still fetching or pending...")

if __name__ == "__main__":
    asyncio.run(main())



## SETUP
- To start this server you have to follow the instructions below.
- Do uv sync in root directory and also npm i in the job_scraper_ui.
- Do docker compose up -f centrifugo.yaml in dev_containers.

#### 3 - Main parts

1. **Frontend**: `job_scraper_ui` - npm run dev
2. **MCP Server**: `mcps/linkedin_platform.py` - do ./start_mcps.sh - it will start mcps
3. **Job Scraper Server**: `module_testing.job_scraper` - uv run -m module_testing.job_scraper


Navigate to ui, which is on 5173 and enjoy crafting resumes.


### Extension

- Have to work on extending MCP to naukri platform
- Another mcp for google, microsoft, nvidia jobs FAANG
- Take out job scraper out of module_testing and implement as server.


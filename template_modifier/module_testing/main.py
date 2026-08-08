

from llm_enhancement.mcp_agent import MCPAgent
from llm_enhancement.config import AgentConfig
from llm_enhancement.observer import Observer

from config.logging import get_logger


def observer(event):
    logger = get_logger('research_agent')
    logger.debug(event)


try:
    agent_config = AgentConfig()
    prompt = '''
    '''

    (agent_config
        .set_db_uri('sqlite:///agent_conversation.db')
        .set_provider_type('SILICONFLOW')
        .set_table_name('conversation')
        .set_prompt(prompt))
    mcp_agent = MCPAgent(agent_config=agent_config, mcp_urls=[])
    mcp_agent.add_observer(observer=Observer(observer))


except Exception as e:
    print(f"An error occurred: {e}")

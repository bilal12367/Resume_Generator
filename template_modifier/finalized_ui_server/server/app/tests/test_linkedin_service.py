import asyncio, pytest, json
from app.services.linkedin_service import LinkedInService

@pytest.fixture
def anyio_backend():
    return "asyncio"

@pytest.mark.anyio
async def test_search_jobs():
    svc = LinkedInService()
    try:
        jobs = await svc.search_jobs(
            keywords='AI Engineer Deloitte PwC KPMG IBM',
            locations=['Hyderabad'],
            experience_level='mid senior',
            posted_within='7d',
            offset=3,
            limit=30
        )
        print(json.dumps(jobs, indent=5))
        assert len(jobs) != 0
    except Exception as e:
        print(e)
        assert 0
    finally:
        await svc.close()
    
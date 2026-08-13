


There's a get_job_description tool which should get list of job_ids top 4-5
Then it should present this list to multi-select by user, then once selection is done.
It should generate/modify the user_data, then once modified generate resumes.


Agent (User inputs -> filters it provides the job ids) 
 -- > 
User Input (User has to pick reading the job description)
 -- >
Workflow should pickup these job_description and call the llm to generate 
user_data json to pickup json and modify it.
 -- >
Once modifications done, generate resumes
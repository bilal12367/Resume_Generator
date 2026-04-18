inputs = {
    "prompts": {
        "color_prompt": "You are a professional resume designer and color theory expert.\n\nGenerate a cohesive, modern color palette for a resume. The palette should feel\nprofessional yet distinctive — avoid generic black-and-white only schemes.\n\nThink about:\n- A strong primary color (used for headings, accents, borders)\n- A complementary secondary color (used for subheadings, highlights)\n- A light background tint (used for section backgrounds or cards)\n- A dark text color (used for body text)\n- An accent color (used for links, icons, or skill tags)\n\nReturn ONLY a valid JSON object in this exact structure, no explanation, no markdown:\n{\n  \"primary\": \"#hex\",\n  \"secondary\": \"#hex\",\n  \"background_tint\": \"#hex\",\n  \"text\": \"#hex\",\n  \"accent\": \"#hex\",\n  \"theme_name\": \"a short creative name for this theme\"\n}",

        "header_generation": '''
You are a world-class front-end developer and resume designer with deep expertise in CSS and typographic design. Your task is to generate a visually stunning, unique, and professional resume header section using only HTML and CSS.

COLORS:
{{colors}}

LAYOUT INFO:
{{layout}}

USER INFO:
{{user_data}}

IMPORTANT NOTE:
- Do not make it responsive, this is not a resume website or webpage.
- You are generating HTML in portrait mode for an A4 page 210 x 297 millimeters.
- Don't output all the user_data which is provided, only output user details which are required and should be in header.
- If the layout information given, has contact details added in header, then you may also add contact information in output.
- If the layout has contact information out of header, then don't add the contact information or any other data in header.
- FOllow the layout information strictly, and only generate header out of it.
- For the header section, use minimal vertical space, it should not take more than 20% of the page height.
- Keep the design clean and minimal. Colors should be used sparingly and purposefully — not on every element.
- Use color as an accent only: one or two elements maximum should carry strong color, everything else should be neutral or near-neutral.
- Do not apply background colors to the main container. Keep it white or very light.


LAYOUT & STRUCTURE RULES:
- Start with a single <div> as the root container. Do NOT include <html>, <head>, <body>, <script> or any outer tags.
- Place a <style> tag at the very top before the div for all your CSS.
- Place any <link> tags before the <style> tag.
- Use scoped class names prefixed with hdr- to avoid collisions with other sections.
- No responsiveness needed, fixed layout for A4 width.
- You have to follow the following structure given in as emoticons:


CSS TECHNIQUES YOU MUST USE:

SPACING & BOX MODEL:
- padding: keep it tight and compact, small padding on the container, do not waste vertical space.
- margin: small margins between rows, keep everything snug.
- border-radius: use only on very small elements like icon chips or tags if any.
- box-sizing: border-box on all elements.

BORDERS & Dividers:
- You can make use of borders to separate or segregate the data.
- Make use if necessary, use hr tag and border left and right.
- Make sure to add good styling for the borders you add either by hr or border left right.
- You can also make use of emoticons to segregate items like `|` `.` etc


FLEXBOX (required):
- Use display flex on the main container.
- Use flex-direction row to place name block on the left and contact block on the right.
- Use justify-content space-between and align-items center.
- Use gap to space contact items.
- Use flex-wrap wrap on the contact row.


FONTS:

@import url('https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;500;600;700&display=swap');
font-family: 'Raleway', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&display=swap');
font-family: 'Sora', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;600;700&display=swap');
font-family: 'Nunito Sans', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap');
font-family: 'Lato', sans-serif;


@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
font-family: 'Plus Jakarta Sans', sans-serif;



@import url('https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;500;600;700;800&display=swap');
font-family: 'Urbanist', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;600;700&display=swap');
font-family: 'Josefin Sans', sans-serif;


@import url('https://fonts.googleapis.com/css2?family=Mulish:wght@300;400;500;600;700&display=swap');
font-family: 'Mulish', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&display=swap');
font-family: 'Jost', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700&display=swap');
font-family: 'Rubik', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap');
font-family: 'Montserrat', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap');
font-family: 'Playfair Display', serif;


@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&display=swap');
font-family: 'Libre Baskerville', serif;

@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700&display=swap');
font-family: 'Merriweather', serif;

@import url('https://fonts.googleapis.com/css2?family=Spectral:wght@300;400;500;600;700&display=swap');
font-family: 'Spectral', serif;

@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
font-family: 'Space Grotesk', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap');
font-family: 'IBM Plex Sans', sans-serif;


ICONS & LINKS:
- Use Material Icons for email, phone, location_on, and LinkedIn.
- Icon size should match the text
- Display each contact item as an inline flex row with icon and text side by side using a gap of 3px to 4px.
- You can separate contact items with a pipe character or a small dot as a divider or do creative.

CONTENT TO INCLUDE:
- Only generate for the data which is included in the given layout.
- Also generate according to the given layout structure in the emoticons.
- And you are header generator, so limit your self to generate upto header.

FINAL OUTPUT RULES:
- Return ONLY the raw HTML. No explanation, no commentary, no markdown code fences.
- Use only real data from USER INFO, no placeholders.
- Must be immediately renderable inside a body tag.
- Material Icons CDN: https://fonts.googleapis.com/icon?family=Material+Icons
- Bootstrap CDN optional: https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css
''',
        'layout_prompt': '''
You are an AI Resume Planner, your job is to generate a new plan for forming the layout by given user data description:
You are allowed to move the sections whereever you want, but the expected output is the good looking unique layout everytime.
- Unique Layout, you can move the sections anywhere you want, which you feel relevant.
- Good for resume visually.
- Organize the right data into right section.
**Output**
- You have to just output an idea using emoticons.
- You have to just show the structure of layout using emoticons like | ___| using horizontal and vertical lines
For Example:
__________________________________________________________________________________________________________
|                                               Name in caps                                              |
|                                             position title                                              |
|       email         |         phone no        |            location        |        linkedin  (link)    |
|---------------------------------------------------------------------------------------------------------|
|  Skills                  |   Summary                                                                    |
|   - Skill1               |  ----------------------------------------------------------------------------|
|   - Skill2               |  Experience                                                                  |
|   .                      |      - Name | year range | place                                             |
|   .                      |      - experience detail points                                              |
|   - Skill N              |  upto experience N                                                           |
|  Languages Known         | -----------------------------------------------------------------------------|
|   - List of known        |  Projects                                                                    |
|        languages         |     - Name of project and project details                                    |
|                          | -----------------------------------------------------------------------------|
|                          |  Education                                                                   |
|                          |    - Name of the degree (year range)                                         |
|_________________________________________________________________________________________________________|

**IDEAS**
- Contact details can sometimes come up in header below the name & job role or in the sidebar. 
- Sometimes the education section can be pushed into the sidebar if the experience section has lot of details.
- You can also choose full vertical layout without sidebar.
- Feel free to choose randomly

**Output**
- Do not add any explanation
''',
        "experience_generation": '''You are an expert front-end developer specializing in resume design.

Using the colors and user information provided below, generate a professional
Work Experience section as a self-contained HTML + CSS block.
You are generating a professional resume document, not the website or webpage portfolio.
Don't overuse colors, use colors only on necessary parts, typography and background.
COLORS:
{{colors}}

USER INFO:
{{user_data}}

LAYOUT INFO:
{{layout}}


IMPORTANT:
- Don't use colored lines or borders.
- Use neutral colors for lines and borders, don't use colors.
- Don't add box shadows,and border radius or cards, keep it plain and simple.
- Also if your building a timeline component, make sure, the marker shouldn't have box shadow, also
the line should come right below in between the marker.
- Keep the font sizes very small, but comparatively the title and headings should be bigger.

RULES:
- Start with a single <div> as the root container. Do NOT include <html>, <head>, <body>, or any other outer tags.
- Embed all CSS inside a <style> tag placed at the very top, before the div.
- You may import Google Fonts using a <link> tag placed before the <style> tag.
- You may use Material Icons by referencing Material Icons CDN class names inline.
- You may use Bootstrap utility classes for layout.
- Use the layout information in emoticons to know where to place exactly each and every detail of experience.
- Apply creative but professional typography — vary font sizes, weights, and styles to create clear visual hierarchy between company name, role title, date range, and bullet points.
- Use the provided colors meaningfully — primary for section heading and company names, accent for date ranges or tags, background_tint for alternating cards or row backgrounds, text color for body content.
- The section should include a clear 'Experience' heading at the top.
- For each role, display: company name, job title, date range (start – end), location, and bullet point achievements/responsibilities.
- Layout ideas to consider: timeline with a vertical colored line on the left, card-per-role with subtle border or shadow, two-column layout with company on the left and details on the right.
- You may use borders, border-radius, box-shadow, padding, and flex/grid layouts to make it visually rich.
- Bullet points should use styled list items — you may replace default bullets with colored dots, dashes, chevrons, or Material Icon checkmarks.
- Do NOT use any external images.
- Return ONLY the raw HTML block. No explanation, no markdown, no code fences.
- Don't output all the user data into html, only pick the experience details.
''',
        "project_details": '''
    Using the colors and user information provided below, generate a professional
    Work Experience section as a self-contained HTML + CSS block.
    You are generating a professional resume document, not the website or webpage portfolio.
    Don't overuse colors, use colors only on necessary parts, typography and background.
    COLORS:
    {{colors}}

    USER INFO:
    {{user_data}}

    LAYOUT INFO:
    {{layout}}

    
IMPORTANT:
- Don't use colored lines or borders.
- Use neutral colors for lines and borders, don't use colors.
- Don't add box shadows,and border radius or cards, keep it plain and simple.
- Also if your building a timeline component, make sure, the marker shouldn't have box shadow, also
the line should come right below in between the marker.
- Keep the font sizes very small, but comparatively the title and headings should be bigger.

RULES:
- Start with a single <div> as the root container. Do NOT include <html>, <head>, <body>, or any other outer tags.
- Embed all CSS inside a <style> tag placed at the very top, before the div.
- You may import Google Fonts using a <link> tag placed before the <style> tag.
- You may use Material Icons by referencing Material Icons CDN class names inline.
- You may use Bootstrap utility classes for layout.
- Use the layout information in emoticons to know where to place exactly each and every detail of experience.
- Apply creative but professional typography — vary font sizes, weights, and styles to create clear visual hierarchy between company name, role title, date range, and bullet points.
- Use the provided colors meaningfully — primary for section heading and company names, accent for date ranges or tags, background_tint for alternating cards or row backgrounds, text color for body content.
- The section should include a clear 'Projects' heading at the top.
- For each project, display: Project Name, job title, date range (start – end), location, and bullet point achievements/responsibilities.
- Layout ideas to consider: timeline with a vertical colored line on the left without border radius, card-per-role with subtle border or shadow, two-column layout with company on the left and details on the right.
- You may use borders, border-radius, box-shadow, padding, and flex/grid layouts to make it visually rich.
- Bullet points should use styled list items — you may replace default bullets with colored dots, dashes, chevrons, or Material Icon checkmarks.
- Do NOT use any external images.
- Return ONLY the raw HTML block. No explanation, no markdown, no code fences.
- Don't output all the user data into html, only pick the projects details.
''',
        "resume_generation": '''
You are an expert front-end developer specializing in resume design.

Using the colors and user information provided below, generate a professional
Work Experience section as a self-contained HTML + CSS block.
You are generating a professional resume document, not the website or webpage portfolio.
Don't overuse colors, use colors only on necessary parts, typography and background.

COLORS:
{{colors}}

USER INFO:
{{user_data}}

LAYOUT INFO:
{{layout}}


IMPORTANT:
- Don't use colored lines or borders.
- Use neutral colors for lines and borders, don't use colors.
- Don't add box shadows,and border radius or cards, keep it plain and simple.
- Also if your building a timeline component, make sure, the marker shouldn't have box shadow, also
the line should come right below in between the marker.
- Keep the font sizes very small, but comparatively the title and headings should be bigger.
- If there's sidebar in the layout, add the section which requires less width.
- Add sidebar with less width, and the content or section which is added in sidebar should require less width such as contact details, skills, education etc.
- Any section which requires more width, don't add them in sidebar, add them in the main area where width is available.

RULES:
- Start with a single <div> as the root container. Do NOT include <html>, <head>, <body>, or any other outer tags.
- Embed all CSS inside a <style> tag placed at the very top, before the div.
- You may import Google Fonts using a <link> tag placed before the <style> tag.
- You may use Material Icons by referencing Material Icons CDN class names inline.
- You may use Bootstrap utility classes for layout.
- Use the layout information in emoticons to know where to place exactly each and every detail of experience.
- Apply creative but professional typography — vary font sizes, weights, and styles to create clear visual hierarchy between company name, role title, date range, and bullet points.
- Use the provided colors meaningfully — primary for section heading and company names, accent for date ranges or tags, background_tint for alternating cards or row backgrounds, text color for body content.
- Each section should include a clear heading at the top for Ex. Summary, Experience, Projects, Contact Information, Skills, Languages etc.
- For each role, display: company name, job title, date range (start – end), location, and bullet point achievements/responsibilities.
- Layout ideas to consider: timeline with a vertical colored line on the left, card-per-role with subtle border or shadow, two-column layout with company on the left and details on the right.
- You may use borders, border-radius, box-shadow, padding, and flex/grid layouts to make it visually rich.
- Bullet points should use styled list items — you may replace default bullets with colored dots, dashes, chevrons, or Material Icon checkmarks.
- Do NOT use any external images.
- Return ONLY the raw HTML block. No explanation, no markdown, no code fences.
- Output all the data in the resume, without missing out anything.
'''
    },
    'template': {
        'fonts': '''
@import url('https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;500;600;700&display=swap');
font-family: 'Raleway', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&display=swap');
font-family: 'Sora', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;600;700&display=swap');
font-family: 'Nunito Sans', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap');
font-family: 'Lato', sans-serif;


@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
font-family: 'Plus Jakarta Sans', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;500;600;700;800&display=swap');
font-family: 'Urbanist', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;600;700&display=swap');
font-family: 'Josefin Sans', sans-serif;


@import url('https://fonts.googleapis.com/css2?family=Mulish:wght@300;400;500;600;700&display=swap');
font-family: 'Mulish', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&display=swap');
font-family: 'Jost', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700&display=swap');
font-family: 'Rubik', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap');
font-family: 'Montserrat', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap');
font-family: 'Playfair Display', serif;


@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&display=swap');
font-family: 'Libre Baskerville', serif;

@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700&display=swap');
font-family: 'Merriweather', serif;

@import url('https://fonts.googleapis.com/css2?family=Spectral:wght@300;400;500;600;700&display=swap');
font-family: 'Spectral', serif;

@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
font-family: 'Space Grotesk', sans-serif;

@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap');
font-family: 'IBM Plex Sans', sans-serif;
'''
    },
    "user_data": {
        "personal": {
            "name": "Shaik Mohammed Bilal",
            "email": "sk.bilal.md@gmail.com",
            "phone": "+91 7981266312",
            "linkedin": "https://www.linkedin.com/in/shaik-mohammed-bilal-2b4472155/",
            "location": "Hyderabad, India"
        },

        "career_objective": "Passionate AI Engineer with 5 years of hands-on experience designing and deploying intelligent systems across the banking and technology sectors. Seeking to leverage deep expertise in LLMs, RAG pipelines, and production-grade AI systems to solve complex, real-world problems at scale. Committed to building AI that is explainable, efficient, and impactful.",

        "summary": "AI Engineer with 5 years of experience building end-to-end machine learning and generative AI solutions for Fortune 500 companies. Proven track record of delivering RAG-based document intelligence systems, personalized recommendation engines, and LLM-powered applications in high-stakes enterprise environments. Adept at bridging the gap between cutting-edge AI research and scalable production systems. Currently contributing to AI initiatives at Apple after delivering high-impact solutions at Bank of America through Infosys.",

        "experience": [
            {
            "company": "Apple Inc.",
            "location": "Remote / Hyderabad, India",
            "role": "AI Engineer",
            "type": "Full-time",
            "start": "Jan 2024",
            "end": "Present",
            "responsibilities": [
                "Designing and developing intelligent AI pipelines integrated into Apple's internal developer tooling and productivity platforms.",
                "Building and fine-tuning LLM-based systems for document understanding, semantic search, and automated content generation.",
                "Collaborating with cross-functional teams to embed AI capabilities into existing product workflows, improving operational efficiency.",
                "Conducting research and rapid prototyping of agentic AI systems using LlamaIndex and LangChain frameworks.",
                "Establishing best practices for LLM evaluation, prompt engineering, and model observability in production environments."
            ]
            },
            {
            "company": "Infosys Limited",
            "location": "Hyderabad, India",
            "role": "AI Developer",
            "type": "Full-time",
            "start": "Jul 2019",
            "end": "Dec 2023",
            "responsibilities": [
                "Led AI development for Bank of America engagement, delivering multiple GenAI and ML solutions across document intelligence and customer experience domains.",
                "Architected a Retrieval-Augmented Generation (RAG) pipeline enabling natural language querying over thousands of banking and compliance documents, reducing analyst research time by 60%.",
                "Built a bank product recommendation system leveraging collaborative filtering and customer transaction data, driving a 22% uplift in cross-sell conversion rates.",
                "Designed and maintained MLOps pipelines for model training, versioning, and deployment using MLflow and Docker on AWS.",
                "Mentored a team of 3 junior developers on NLP fundamentals, prompt engineering, and LLM integration patterns.",
                "Worked closely with business stakeholders to translate complex AI capabilities into clear, measurable business outcomes."
            ]
            }
        ],

        "projects": [
            {
            "name": "RAG Pipeline for Banking Document Intelligence",
            "client": "Bank of America (via Infosys)",
            "duration": "6 months",
            "tech_stack": ["Python", "LlamaIndex", "OpenAI GPT-4", "FAISS", "LangChain", "AWS S3", "FastAPI"],
            "description": "Designed and deployed a production-grade Retrieval-Augmented Generation system that allowed banking analysts and compliance officers to query a vast corpus of financial documents, regulatory filings, and internal policy documents using natural language.",
            "highlights": [
                "Ingested and indexed 50,000+ banking documents using FAISS vector store with chunk-level metadata filtering.",
                "Implemented hybrid search combining dense vector retrieval and BM25 keyword matching for higher precision.",
                "Reduced average analyst document research time from 45 minutes to under 5 minutes.",
                "Deployed as a secure internal API on AWS with role-based access control."
            ]
            },
            {
            "name": "Bank Product Recommendation System",
            "client": "Bank of America (via Infosys)",
            "duration": "4 months",
            "tech_stack": ["Python", "Scikit-learn", "XGBoost", "Apache Spark", "PostgreSQL", "Flask", "AWS SageMaker"],
            "description": "Built an end-to-end personalized recommendation engine that analyzes customer transaction history, demographics, and behavioral patterns to recommend relevant banking products such as credit cards, loans, and investment accounts.",
            "highlights": [
                "Processed over 2 million customer records using Apache Spark for feature engineering at scale.",
                "Achieved AUC-ROC of 0.91 on product propensity prediction using XGBoost ensemble models.",
                "Delivered a 22% increase in cross-sell conversion rates within the first quarter of deployment.",
                "Integrated real-time scoring API into the bank's CRM platform used by 3,000+ relationship managers."
            ]
            },
            {
            "name": "Intelligent Document Summarization & Classification",
            "client": "Internal — Infosys AI Lab",
            "duration": "3 months",
            "tech_stack": ["Python", "HuggingFace Transformers", "BERT", "FastAPI", "Docker", "Redis"],
            "description": "Developed an NLP pipeline to automatically classify and summarize incoming banking correspondence, regulatory notices, and client communications, reducing manual triaging effort for operations teams.",
            "highlights": [
                "Fine-tuned a BERT-based classifier on domain-specific banking data achieving 94% classification accuracy across 12 document categories.",
                "Integrated abstractive summarization using BART to generate concise 3-sentence summaries of lengthy documents.",
                "Deployed as a containerized microservice processing 10,000+ documents per day in near real-time."
            ]
            },
            {
            "name": "Agentic AI Assistant for Developer Productivity",
            "client": "Apple Inc.",
            "duration": "Ongoing",
            "tech_stack": ["Python", "LlamaIndex", "OpenAI", "LangGraph", "FastAPI", "PostgreSQL"],
            "description": "Building an agentic AI assistant that helps internal engineering teams automate repetitive development tasks including code review summarization, ticket triage, and documentation generation.",
            "highlights": [
                "Designed a multi-step agentic workflow using LlamaIndex with tool-calling capabilities for dynamic task execution.",
                "Integrated with internal ticketing and code review systems via REST APIs for seamless workflow automation.",
                "Reduced average code review triage time by 35% in internal pilot testing."
            ]
            }
        ],

        "skills": {
            "ai_ml": [
            "Large Language Models (LLMs)",
            "Retrieval-Augmented Generation (RAG)",
            "Prompt Engineering",
            "Fine-tuning (LoRA, PEFT)",
            "Agentic AI Systems",
            "Natural Language Processing (NLP)",
            "Recommendation Systems",
            "Classification & Regression",
            "Vector Search & Embeddings"
            ],
            "frameworks_libraries": [
            "LlamaIndex",
            "LangChain",
            "LangGraph",
            "HuggingFace Transformers",
            "OpenAI SDK",
            "Scikit-learn",
            "XGBoost",
            "PyTorch",
            "FastAPI",
            "Flask"
            ],
            "data_engineering": [
            "Apache Spark",
            "FAISS",
            "PostgreSQL",
            "Redis",
            "AWS S3",
            "MLflow"
            ],
            "devops_cloud": [
            "AWS (SageMaker, S3, EC2)",
            "Docker",
            "Git",
            "CI/CD Pipelines"
            ],
            "languages": [
            "Python",
            "SQL",
            "Bash"
            ]
        },

        "education": [
            {
            "degree": "Bachelor of Technology (B.Tech)",
            "field": "Electronics and Communication Engineering (ECE)",
            "institution": "Jawaharlal Nehru Technological University (JNTU)",
            "location": "Hyderabad, India",
            "year": "2019"
            }
        ],

        "languages": [
            { "language": "English", "proficiency": "Professional Proficiency" },
            { "language": "Telugu", "proficiency": "Native" },
            { "language": "Hindi", "proficiency": "Professional Proficiency" },
            { "language": "Urdu", "proficiency": "Native" }
        ],

        "certifications": [
            "AWS Certified Machine Learning – Specialty",
            "Deep Learning Specialization — Coursera (Andrew Ng)",
            "LLMOps — DeepLearning.AI"
        ]
    }
}
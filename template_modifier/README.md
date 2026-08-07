# Template Modifier

This module helps you generate a professional PDF resume from an HTML template and a JSON file.

It is designed for beginners, so the workflow is simple:

1. Put your resume information in JSON format
2. Choose a template from the template folder
3. Run the generator script to create a PDF

---

## Requirements

- Python 3.12 or newer
- pip
- A browser engine for PDF generation (Chromium/Chrome is recommended)

---

## 1. Install Python

If you do not already have Python installed, install it first.

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv
```

### Verify installation

```bash
python3 --version
pip3 --version
```

You should see Python 3.12 or newer.

---

## 2. Open the project folder

Go to the module folder:

```bash
cd /home/bilal/Workspace/Resume_Generator/template_modifier
```

---

## 3. Create a virtual environment (recommended)

```bash
python3 -m venv .venv
source .venv/bin/activate
```

---

## 4. Install the project packages from pyproject.toml

This installs the required Python packages:

```bash
python3 -m pip install --upgrade pip
python3 -m pip install -e .
```

The package dependencies include:
- jinja2
- pyppeteer

---

## 5. Install a browser for PDF rendering

The script uses a browser to render the PDF. On Linux, Chromium is usually enough.

### Ubuntu / Debian

```bash
sudo apt install -y chromium-browser
```

If Chromium is not available, install Chromium via your package manager or use a Chrome installation.

---

## 6. How to run the project

You can run the generator in two ways:

### Option A: Run with specific files

```bash
python3 generate_resume.py -t resume_template.html -d my_resume.json -o output/my_resume.pdf
```

### Option B: Use the interactive menu

```bash
python3 generate_resume.py
```

This will let you choose a template and a JSON data file interactively.

---

## 7. Where to put your user data

Place your JSON resume data files inside the user_data folder:

```bash
template_modifier/user_data/
```

Example:

```bash
template_modifier/user_data/my_resume.json
```

When you run the script, you can reference the file like this:

```bash
python3 generate_resume.py -d my_resume.json
```

The script will automatically look in the user_data directory for that file.

---

## 8. JSON format rules

Your user data file must be valid JSON.

Important rules:
- Use double quotes for all keys and string values
- Do not use comments
- Do not leave trailing commas
- Keep the structure exactly as shown below
- Use arrays for repeated data such as experience, projects, skills, and education

### Example JSON structure

```json
{
  "personal_details": {
    "name": "Your Name",
    "title": "Your Job Title",
    "location": "City, Country",
    "phone": "+1 234 567 890",
    "email": "you@example.com",
    "linkedin": "https://linkedin.com/in/yourname",
    "github": "https://github.com/yourname"
  },
  "cover_letter": {
    "salutation": "Dear Hiring Manager,",
    "objective": "Short summary of your experience and goals"
  },
  "experience": [
    {
      "role": "Software Engineer",
      "company": "Company Name",
      "location": "Remote",
      "dates": "2022 - Present",
      "highlights": [
        "Achievement one",
        "Achievement two"
      ]
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "tech_stack": "Python, React",
      "highlights": [
        "Project highlight one",
        "Project highlight two"
      ]
    }
  ],
  "skills": [
    {
      "category": "Languages",
      "items": ["Python", "JavaScript"]
    }
  ],
  "education": [
    {
      "degree": "B.Tech in Computer Science",
      "institution": "University Name",
      "dates": "2018 - 2022"
    }
  ],
  "certifications": [
    {
      "name": "AWS Certified Cloud Practitioner",
      "issuer": "Amazon Web Services",
      "dates": "2024"
    }
  ]
}
```

---

## 9. Recommended templates

Templates are stored in the template folder:

```bash
template_modifier/template/
```

Available template files include:
- resume_template.html
- modern_minimal_template.html
- professional_thin_template.html
- colored_accent_template.html

Example:

```bash
python3 generate_resume.py -t modern_minimal_template.html -d my_resume.json
```

---

## 10. Create your JSON with ChatGPT or Gemini

You can use ChatGPT, Gemini, or any other AI assistant to generate your JSON resume data.

### Example prompt

```text
Create a strict JSON object for a resume generator.
Use this structure exactly:
{
  "personal_details": {...},
  "cover_letter": {...},
  "experience": [...],
  "projects": [...],
  "skills": [...],
  "education": [...],
  "certifications": [...]
}

Use my real information.
Return only valid JSON and do not add any explanation or markdown.
```

### Important tip

Ask the AI to:
- return only JSON
- keep the format strict
- use double quotes everywhere
- avoid comments
- keep arrays and objects properly nested

---

## 11. Example command

If you want to generate a PDF immediately from the sample data:

```bash
python3 generate_resume.py -t resume_template.html -d bilal_resume_data_ai.json -o output/final_resume.pdf
```

The generated PDF will be saved in the output folder.

---

## Troubleshooting

If the script fails:
- make sure Python 3.12+ is installed
- make sure the packages were installed with pip
- make sure Chromium/Chrome is available
- check that your JSON file is valid and uses correct syntax

If you want, you can also open the sample file in the user_data folder and copy its structure as a starting point.

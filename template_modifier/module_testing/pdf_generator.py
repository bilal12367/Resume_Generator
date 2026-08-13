
import json
import asyncio
from datetime import datetime
from pathlib import Path
from jinja2 import Template
from playwright.async_api import async_playwright

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / 'user_data' / 'bilal_resume_data_ai.json'

class PDFGenerator:
    """Handles rendering of HTML templates with JSON data and saving as PDF."""

    def __init__(self):
        self.format = 'A4'
        self.print_background = True
        self.margin = {
            'top': '15mm',
            'right': '15mm',
            'bottom': '15mm',
            'left': '15mm'
        }

    async def generate_pdfs_for_all_templates(self, data: dict, filename: str) -> None:
        """
        Scans the templates directory, renders all templates using the data,
        and saves the resulting PDFs in a new generation folder named after the filename inside output/.
        """
        # Resolve templates and output base directory internally
        base_dir = Path(__file__).resolve().parent.parent
        templates_dir = base_dir / 'template'
        output_base_dir = base_dir / 'output'

        # Create the generation folder
        generation_dir = output_base_dir / filename
        generation_dir.mkdir(parents=True, exist_ok=True)

        # Find all HTML files in templates_dir
        template_files = list(templates_dir.glob("*.html"))
        if not template_files:
            print(f"No HTML templates found in {templates_dir}")
            return

        # Start Playwright once to render all pages efficiently
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            try:
                page = await browser.new_page()
                for template_path in template_files:
                    # Read template content
                    with open(template_path, 'r', encoding='utf-8') as f:
                        template_content = f.read()

                    # Render HTML using Jinja2
                    template = Template(template_content)
                    rendered_html = template.render(data)

                    # Determine output PDF path using the filename prefix
                    output_pdf_path = generation_dir / f"{filename}_{template_path.stem}.pdf"

                    # Generate PDF using Playwright
                    await page.set_content(rendered_html)
                    await page.pdf(
                        path=str(output_pdf_path),
                        format=self.format,
                        print_background=self.print_background,
                        margin=self.margin
                    )
                    print(f"Generated PDF for template '{template_path.name}' -> {output_pdf_path}")
            finally:
                await browser.close()

# async def main():
#     try:
#         # Load user data
#         with open(DATA_PATH, 'r') as f:
#             data = json.load(f)

#         # Instantiate and run PDFGenerator for all templates
#         generator = PDFGenerator()
#         await generator.generate_pdfs_for_all_templates(data=data)
#         print("All PDFs successfully generated!")
            
#     except Exception as e:
#         print(f"An error occurred: {e}")

# if __name__ == "__main__":
#     asyncio.run(main())

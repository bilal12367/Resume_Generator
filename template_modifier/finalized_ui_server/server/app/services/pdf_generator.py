import json
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from jinja2 import Template
from playwright.async_api import async_playwright

logger = logging.getLogger("PDFGenerator")

def get_project_root() -> Path:
    """Dynamically resolves the project root directory containing template/ and output/."""
    current = Path(__file__).resolve()
    for parent in [current] + list(current.parents):
        if (parent / "template").exists() or (parent / "module_testing").exists():
            return parent
    return Path(__file__).resolve().parents[4]


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
        project_root = get_project_root()
        templates_dir = project_root / 'template'
        output_base_dir = project_root / 'output'

        # Ensure output base directory and generation directory exist locally
        output_base_dir.mkdir(parents=True, exist_ok=True)
        generation_dir = output_base_dir / filename
        generation_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"[PDFGenerator] Project Root: {project_root}")
        logger.info(f"[PDFGenerator] Templates Dir: {templates_dir}")
        logger.info(f"[PDFGenerator] Output Dir: {generation_dir}")

        # Find all HTML files in templates_dir
        template_files = list(templates_dir.glob("*.html"))
        if not template_files:
            logger.warning(f"[PDFGenerator] No HTML templates found in {templates_dir}")
            return

        logger.info(f"[PDFGenerator] Found {len(template_files)} HTML template(s) to render...")

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
                    if isinstance(data, dict):
                        rendered_html = template.render(data=data, **data)
                    else:
                        rendered_html = template.render(data=data)

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
                    logger.info(f"[PDFGenerator] Generated PDF for template '{template_path.name}' -> {output_pdf_path}")
            finally:
                await browser.close()

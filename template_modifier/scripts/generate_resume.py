#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
import sys

def main():
    parser = argparse.ArgumentParser(description="Generate PDF Resumes from HTML templates and JSON data.")
    parser.add_argument("-t", "--template", help="Name or path of template file in template/ directory (optional: to run a single template)")
    parser.add_argument("-d", "--data", help="Name or path of data file in user_data/ directory")
    parser.add_argument("-o", "--output", help="Parent output directory path (default: output/)")
    parser.add_argument("-p", "--prefix", help="Prefix name for folder and PDFs")
    parser.add_argument("-y", "--yes", action="store_true", help="Non-interactive mode (auto-select defaults)")
    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    template_dir = os.path.join(base_dir, "template")
    user_data_dir = os.path.join(base_dir, "user_data")
    output_dir = os.path.join(base_dir, "output")

    # Ask for Prefix
    prefix = ""
    if args.prefix:
        prefix = args.prefix.strip()
    elif args.yes:
        prefix = "resume"
    else:
        while not prefix:
            try:
                prefix = input("Enter prefix name for folder and PDFs: ").strip()
                if not prefix:
                    print("Prefix cannot be empty. Please enter a valid prefix.")
            except (KeyboardInterrupt, EOFError):
                print("\nOperation cancelled.")
                sys.exit(0)

    # Select Data JSON
    if args.data:
        if os.path.isabs(args.data) or os.path.exists(args.data):
            json_file = args.data
        else:
            json_file = os.path.join(user_data_dir, args.data)
    else:
        json_file = select_file(user_data_dir, ".json", "JSON Data File", auto_select=args.yes)

    # Check input data file exists
    if not os.path.exists(json_file):
        print(f"Error: JSON data file not found at {json_file}")
        sys.exit(1)

    # Find templates to process
    if args.template:
        if os.path.isabs(args.template) or os.path.exists(args.template):
            template_files = [args.template]
        else:
            template_files = [os.path.join(template_dir, args.template)]
    else:
        if not os.path.exists(template_dir):
            print(f"Error: Template directory '{template_dir}' does not exist.")
            sys.exit(1)
        templates = sorted([f for f in os.listdir(template_dir) if f.endswith(".html") and not f.startswith(".")])
        if not templates:
            print(f"Error: No HTML templates found in '{template_dir}'.")
            sys.exit(1)
        template_files = [os.path.join(template_dir, f) for f in templates]

    # Target directory path
    if args.output:
        parent_out_dir = args.output
    else:
        parent_out_dir = output_dir

    target_dir = os.path.join(parent_out_dir, prefix)
    os.makedirs(target_dir, exist_ok=True)

    # Remove legacy HTML file if present in output_dir
    legacy_html = os.path.join(output_dir, "index.html")
    if os.path.exists(legacy_html):
        try:
            os.remove(legacy_html)
        except Exception:
            pass

    print(f"\n--- Processing Templates ---")
    print(f"Data File:        {os.path.basename(json_file)}")
    print(f"Target Directory: {target_dir}\n")

    # Load JSON data
    with open(json_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    success_count = 0
    total_count = len(template_files)

    for template_file in template_files:
        if not os.path.exists(template_file):
            print(f"Warning: HTML template file not found at {template_file}. Skipping.")
            continue

        template_basename = os.path.basename(template_file)
        template_name, _ = os.path.splitext(template_basename)
        
        output_pdf = os.path.join(target_dir, f"{prefix}_{template_name}.pdf")
        temp_html = os.path.join(target_dir, f"_temp_{prefix}_{template_name}.html")

        print(f"Processing Template: {template_basename}")

        # Read template HTML
        with open(template_file, "r", encoding="utf-8") as f:
            template_content = f.read()

        # Try Jinja2 rendering first
        try:
            from jinja2 import Template
            template = Template(template_content)
            rendered_html = template.render(**data)
        except ImportError:
            rendered_html = render_simple_template(template_content, data)

        # Write temporary HTML file for renderer
        with open(temp_html, "w", encoding="utf-8") as f:
            f.write(rendered_html)

        # Render PDF into output directory
        pdf_success = generate_pdf(temp_html, output_pdf)

        # Clean up temporary HTML file
        if os.path.exists(temp_html):
            try:
                os.remove(temp_html)
            except Exception:
                pass

        if pdf_success:
            print(f"  ✓ Successfully generated PDF resume at:\n    -> {output_pdf}")
            success_count += 1
        else:
            print(f"  ✗ Failed to generate PDF resume for template: {template_basename}")

    print(f"\n--- Summary ---")
    print(f"Generated {success_count} of {total_count} PDF resumes successfully.")
    print(f"Outputs are stored in: {target_dir}\n")

    if success_count == 0:
        sys.exit(1)


def select_file(directory, extension, file_type_name, auto_select=False):
    """
    Interactive arrow-key file selector with highlighted current option.
    Uses raw terminal input for up/down arrow navigation, Enter to confirm.
    Falls back to numbered prompt if terminal raw mode is unavailable.
    """
    if not os.path.exists(directory):
        print(f"Error: Directory '{directory}' does not exist.")
        sys.exit(1)

    files = sorted([f for f in os.listdir(directory) if f.endswith(extension) and not f.startswith(".")])
    if not files:
        print(f"Error: No {extension} files found in '{directory}'.")
        sys.exit(1)

    if auto_select or not sys.stdin.isatty():
        print(f"Auto-selected {file_type_name}: {files[0]}")
        return os.path.join(directory, files[0])

    # Try interactive arrow-key selector
    try:
        selected_file = _interactive_select(files, file_type_name)
    except Exception:
        # Fallback to basic numbered prompt
        selected_file = _fallback_select(files, file_type_name)

    print(f"\n✓ Selected {file_type_name}: {selected_file}")
    return os.path.join(directory, selected_file)


def _interactive_select(files, file_type_name):
    """
    Arrow-key driven interactive selector with highlighted row.
    """
    import tty
    import termios

    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)

    # ANSI codes
    RESET = "\033[0m"
    HIGHLIGHT = "\033[7m"       # Inverse (white bg, dark text)
    DIM = "\033[2m"
    BOLD = "\033[1m"
    CLEAR_LINE = "\033[2K"
    HIDE_CURSOR = "\033[?25l"
    SHOW_CURSOR = "\033[?25h"

    cursor = 0
    total = len(files)

    def render():
        # Move cursor up to overwrite previous render (except first time)
        sys.stdout.write(f"\r{CLEAR_LINE}")
        sys.stdout.write(f"{BOLD}Select {file_type_name}{RESET} {DIM}(↑↓ navigate, Enter select){RESET}\n")
        for i, fname in enumerate(files):
            sys.stdout.write(CLEAR_LINE)
            if i == cursor:
                sys.stdout.write(f"  {HIGHLIGHT}  ▸ {fname}  {RESET}\n")
            else:
                sys.stdout.write(f"    {DIM}  {fname}{RESET}\n")
        sys.stdout.flush()

    def clear_menu():
        # Move up and clear all menu lines
        lines_to_clear = total + 1  # files + header
        for _ in range(lines_to_clear):
            sys.stdout.write(f"\033[A{CLEAR_LINE}")
        sys.stdout.write("\r")
        sys.stdout.flush()

    try:
        sys.stdout.write(HIDE_CURSOR)
        sys.stdout.write("\n")  # blank line before menu
        render()
        tty.setraw(fd)

        while True:
            ch = sys.stdin.read(1)
            if ch == "\r" or ch == "\n":
                break
            elif ch == "\x1b":
                seq = sys.stdin.read(2)
                if seq == "[A":   # Up arrow
                    cursor = (cursor - 1) % total
                elif seq == "[B": # Down arrow
                    cursor = (cursor + 1) % total
            elif ch == "k":       # Vim up
                cursor = (cursor - 1) % total
            elif ch == "j":       # Vim down
                cursor = (cursor + 1) % total
            elif ch == "\x03":    # Ctrl+C
                raise KeyboardInterrupt

            # Re-render
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
            clear_menu()
            render()
            tty.setraw(fd)

    except KeyboardInterrupt:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        sys.stdout.write(SHOW_CURSOR)
        print("\nOperation cancelled.")
        sys.exit(0)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        sys.stdout.write(SHOW_CURSOR)
        clear_menu()

    return files[cursor]


def _fallback_select(files, file_type_name):
    """
    Basic numbered prompt fallback if terminal raw mode is unavailable.
    """
    print(f"\nAvailable {file_type_name}s:")
    for idx, fname in enumerate(files, 1):
        print(f"  [{idx}] {fname}")

    while True:
        try:
            user_input = input(f"Select [1-{len(files)}] (default 1): ").strip()
            if not user_input:
                return files[0]
            choice = int(user_input)
            if 1 <= choice <= len(files):
                return files[choice - 1]
            else:
                print(f"Invalid. Enter 1-{len(files)}.")
        except ValueError:
            print("Invalid input.")
        except (EOFError, KeyboardInterrupt):
            print("\nOperation cancelled.")
            sys.exit(0)


def generate_pdf(html_path, pdf_path):
    """
    Renders HTML to PDF using available browser engines or Python PDF libraries with proper margins.
    """
    # 1. Try Pyppeteer with proper page margins
    try:
        import asyncio
        from pyppeteer import launch
        async def render_pyppeteer():
            browser = await launch(headless=True, args=['--no-sandbox'])
            try:
                page = await browser.newPage()
                await page.goto(f"file://{html_path}", {'waitUntil': 'networkidle0'})
                await page.pdf({
                    'path': pdf_path,
                    'format': 'A4',
                    'printBackground': True,
                    'margin': {
                        'top': '15mm',
                        'right': '15mm',
                        'bottom': '15mm',
                        'left': '15mm'
                    }
                })
            finally:
                await browser.close()
        # Use get_event_loop() instead of asyncio.run() to avoid closing the
        # loop before pyppeteer's atexit callback can clean up Chrome.
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(render_pyppeteer())
        finally:
            # Do NOT close the loop here — pyppeteer's atexit handler needs it.
            pass
        if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
            return True
    except Exception:
        pass

    # 2. Try Chrome/Chromium headless CLI
    browsers = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]
    for browser in browsers:
        browser_path = shutil.which(browser)
        if browser_path:
            try:
                cmd = [
                    browser_path,
                    "--headless",
                    "--disable-gpu",
                    "--no-sandbox",
                    "--no-pdf-header-footer",
                    f"--print-to-pdf={pdf_path}",
                    f"file://{html_path}"
                ]
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
                if res.returncode == 0 and os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
                    return True
            except Exception:
                pass

    # 3. Try Playwright
    try:
        # pyrefly: ignore [missing-import]
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(f"file://{html_path}", wait_until="networkidle")
            page.pdf(path=pdf_path, format="A4", print_background=True, margin={"top": "15mm", "right": "15mm", "bottom": "15mm", "left": "15mm"})
            browser.close()
        if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
            return True
    except Exception:
        pass

    # 4. Try WeasyPrint
    try:
        # pyrefly: ignore [missing-import]
        from weasyprint import HTML
        HTML(html_path).write_pdf(pdf_path)
        if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
            return True
    except Exception:
        pass

    return False


def render_simple_template(template_str, data):
    """
    Fallback Jinja2-like parser for simple tag replacements if jinja2 package is unavailable.
    """
    import re
    
    # Render Personal Details
    pd = data.get("personal_details", {})
    t = template_str
    t = t.replace("{{ personal_details.name }}", pd.get("name", ""))
    
    if pd.get("title"):
        t = re.sub(r'\{%\s*if personal_details\.title\s*%\}(.*?)\{%\s*endif\s*\%}', r'\1', t, flags=re.DOTALL)
        t = t.replace("{{ personal_details.title }}", pd.get("title", ""))
    else:
        t = re.sub(r'\{%\s*if personal_details\.title\s*%\}.*?\{%\s*endif\s*\%}', '', t, flags=re.DOTALL)

    for field in ["location", "phone", "email", "linkedin", "github", "website"]:
        val = pd.get(field)
        pattern = rf'\{{%\s*if personal_details\.{field}\s*%\}}(.*?)\{{%\s*endif\s*%\}}'
        if val:
            def repl(m):
                content = m.group(1)
                return content.replace(f"{{{{ personal_details.{field} }}}}", str(val))
            t = re.sub(pattern, repl, t, flags=re.DOTALL)
        else:
            t = re.sub(pattern, '', t, flags=re.DOTALL)

    # Render Cover Letter
    cl = data.get("cover_letter", {})
    if cl and (cl.get("salutation") or cl.get("objective")):
        def cl_repl(m):
            block = m.group(1)
            sal = cl.get("salutation")
            if sal:
                block = re.sub(r'\{%\s*if cover_letter\.salutation\s*%\}(.*?)\{%\s*endif\s*\%}', lambda sm: sm.group(1).replace("{{ cover_letter.salutation }}", sal), block, flags=re.DOTALL)
            else:
                block = re.sub(r'\{%\s*if cover_letter\.salutation\s*%\}.*?\{%\s*endif\s*\%}', '', block, flags=re.DOTALL)
            block = block.replace("{{ cover_letter.objective }}", cl.get("objective", ""))
            return block
        t = re.sub(r'\{%\s*if cover_letter.*?\%\}(.*?)\{%\s*endif\s*\%}', cl_repl, t, flags=re.DOTALL)
    else:
        t = re.sub(r'\{%\s*if cover_letter.*?\%\}.*?\{%\s*endif\s*\%}', '', t, flags=re.DOTALL)

    # Render Experience Section
    exp = data.get("experience", [])
    if exp:
        def exp_block(m):
            section_content = m.group(1)
            for_match = re.search(r'\{%\s*for job in experience\s*%\}(.*?)\{%\s*endfor\s*\%}', section_content, flags=re.DOTALL)
            if not for_match:
                return section_content
            job_template = for_match.group(1)
            jobs_html = []
            for job in exp:
                j_html = job_template
                j_html = j_html.replace("{{ job.role }}", job.get("role", ""))
                if job.get("company"):
                    j_html = re.sub(r'\{%\s*if job\.company\s*%\}(.*?)\{%\s*endif\s*\%}', lambda cm: cm.group(1).replace("{{ job.company }}", job.get("company")), j_html, flags=re.DOTALL)
                else:
                    j_html = re.sub(r'\{%\s*if job\.company\s*%\}.*?\{%\s*endif\s*\%}', '', j_html, flags=re.DOTALL)

                for field in ["location", "dates"]:
                    val = job.get(field)
                    pat = rf'\{{%\s*if job\.{field}\s*%\}}(.*?)\{{%\s*endif\s*%\}}'
                    if val:
                        j_html = re.sub(pat, lambda lm: lm.group(1).replace(f"{{{{ job.{field} }}}}", str(val)), j_html, flags=re.DOTALL)
                    else:
                        j_html = re.sub(pat, '', j_html, flags=re.DOTALL)

                if job.get("location") and job.get("dates"):
                    j_html = re.sub(r'\{%\s*if job\.location and job\.dates\s*%\}(.*?)\{%\s*endif\s*\%}', r'\1', j_html, flags=re.DOTALL)
                else:
                    j_html = re.sub(r'\{%\s*if job\.location and job\.dates\s*%\}.*?\{%\s*endif\s*\%}', '', j_html, flags=re.DOTALL)

                highlights = job.get("highlights", [])
                if highlights:
                    def hl_repl(hm):
                        hl_block = hm.group(1)
                        li_match = re.search(r'\{%\s*for item in job\.highlights\s*%\}(.*?)\{%\s*endfor\s*\%}', hl_block, flags=re.DOTALL)
                        if not li_match: return hl_block
                        li_template = li_match.group(1)
                        lis = [li_template.replace("{{ item }}", item) for item in highlights]
                        return re.sub(r'\{%\s*for item in job\.highlights\s*%\}.*?\{%\s*endfor\s*\%}', "".join(lis), hl_block, flags=re.DOTALL)
                    j_html = re.sub(r'\{%\s*if job\.highlights\s*%\}(.*?)\{%\s*endif\s*\%}', hl_repl, j_html, flags=re.DOTALL)
                else:
                    j_html = re.sub(r'\{%\s*if job\.highlights\s*%\}.*?\{%\s*endif\s*\%}', '', j_html, flags=re.DOTALL)
                jobs_html.append(j_html)
            return re.sub(r'\{%\s*for job in experience\s*%\}.*?\{%\s*endfor\s*\%}', "".join(jobs_html), section_content, flags=re.DOTALL)
        t = re.sub(r'\{%\s*if experience.*?\%\}(.*?)\{%\s*endif\s*\%}', exp_block, t, flags=re.DOTALL)
    else:
        t = re.sub(r'\{%\s*if experience.*?\%\}.*?\{%\s*endif\s*\%}', '', t, flags=re.DOTALL)

    # Render Projects Section
    projects = data.get("projects", [])
    if projects:
        def proj_block(m):
            section_content = m.group(1)
            for_match = re.search(r'\{%\s*for project in projects\s*%\}(.*?)\{%\s*endfor\s*\%}', section_content, flags=re.DOTALL)
            if not for_match: return section_content
            proj_template = for_match.group(1)
            projs_html = []
            for proj in projects:
                p_html = proj_template
                p_html = p_html.replace("{{ project.name }}", proj.get("name", ""))
                if proj.get("tech_stack"):
                    p_html = re.sub(r'\{%\s*if project\.tech_stack\s*%\}(.*?)\{%\s*endif\s*\%}', lambda cm: cm.group(1).replace("{{ project.tech_stack }}", proj.get("tech_stack")), p_html, flags=re.DOTALL)
                else:
                    p_html = re.sub(r'\{%\s*if project\.tech_stack\s*%\}.*?\{%\s*endif\s*\%}', '', p_html, flags=re.DOTALL)

                highlights = proj.get("highlights", [])
                if highlights:
                    def hl_repl(hm):
                        hl_block = hm.group(1)
                        li_match = re.search(r'\{%\s*for item in project\.highlights\s*%\}(.*?)\{%\s*endfor\s*\%}', hl_block, flags=re.DOTALL)
                        if not li_match: return hl_block
                        li_template = li_match.group(1)
                        lis = [li_template.replace("{{ item }}", item) for item in highlights]
                        return re.sub(r'\{%\s*for item in project\.highlights\s*%\}.*?\{%\s*endfor\s*\%}', "".join(lis), hl_block, flags=re.DOTALL)
                    p_html = re.sub(r'\{%\s*if project\.highlights\s*%\}(.*?)\{%\s*endif\s*\%}', hl_repl, p_html, flags=re.DOTALL)
                else:
                    p_html = re.sub(r'\{%\s*if project\.highlights\s*%\}.*?\{%\s*endif\s*\%}', '', p_html, flags=re.DOTALL)
                projs_html.append(p_html)
            return re.sub(r'\{%\s*for project in projects\s*%\}.*?\{%\s*endfor\s*\%}', "".join(projs_html), section_content, flags=re.DOTALL)
        t = re.sub(r'\{%\s*if projects.*?\%\}(.*?)\{%\s*endif\s*\%}', proj_block, t, flags=re.DOTALL)
    else:
        t = re.sub(r'\{%\s*if projects.*?\%\}.*?\{%\s*endif\s*\%}', '', t, flags=re.DOTALL)

    # Render Skills Section
    skills = data.get("skills", [])
    if skills:
        def skills_block(m):
            section_content = m.group(1)
            for_match = re.search(r'\{%\s*for skill in skills\s*%\}(.*?)\{%\s*endfor\s*\}', section_content, flags=re.DOTALL)
            if not for_match: return section_content
            skill_template = for_match.group(1)
            skills_html = []
            for skill in skills:
                s_html = skill_template
                s_html = s_html.replace("{{ skill.category }}", skill.get("category", ""))
                items_val = skill.get("items", [])
                if isinstance(items_val, list):
                    items_str = ", ".join(items_val)
                else:
                    items_str = str(items_val)
                s_html = re.sub(r'\{\{\s*skill\[[\'"]items[\'"]\].*?\}\}', items_str, s_html)
                s_html = s_html.replace("{{ skill.items }}", items_str)
                skills_html.append(s_html)
            return re.sub(r'\{%\s*for skill in skills\s*%\}.*?\{%\s*endfor\s*\%}', "".join(skills_html), section_content, flags=re.DOTALL)
        t = re.sub(r'\{%\s*if skills.*?\%\}(.*?)\{%\s*endif\s*\%}', skills_block, t, flags=re.DOTALL)
    else:
        t = re.sub(r'\{%\s*if skills.*?\%\}.*?\{%\s*endif\s*\%}', '', t, flags=re.DOTALL)

    # Render Education & Certifications
    edu_list = data.get("education", [])
    cert_list = data.get("certifications", [])

    if edu_list or cert_list:
        def edu_cert_block(m):
            sec = m.group(1)
            # Replace header
            if edu_list and cert_list:
                header_title = "Education & Certifications"
            elif edu_list:
                header_title = "Education"
            else:
                header_title = "Certifications"
            sec = re.sub(r'\{%\s*if \([^)]+\) and \([^)]+\)\s*%\}.*?\{%\s*endif\s*\%}', header_title, sec, flags=re.DOTALL)

            if edu_list:
                def edu_repl(em):
                    eb = em.group(1)
                    fm = re.search(r'\{%\s*for edu in education\s*%\}(.*?)\{%\s*endfor\s*\%}', eb, flags=re.DOTALL)
                    if not fm: return eb
                    tmpl = fm.group(1)
                    res = []
                    for edu in edu_list:
                        item_h = tmpl.replace("{{ edu.degree }}", edu.get("degree", ""))
                        if edu.get("institution"):
                            item_h = re.sub(r'\{%\s*if edu\.institution\s*%\}(.*?)\{%\s*endif\s*\%}', lambda cm: cm.group(1).replace("{{ edu.institution }}", edu.get("institution")), item_h, flags=re.DOTALL)
                        else:
                            item_h = re.sub(r'\{%\s*if edu\.institution\s*%\}.*?\{%\s*endif\s*\%}', '', item_h, flags=re.DOTALL)
                        if edu.get("dates"):
                            item_h = re.sub(r'\{%\s*if edu\.dates\s*%\}(.*?)\{%\s*endif\s*\%}', lambda dm: dm.group(1).replace("{{ edu.dates }}", edu.get("dates")), item_h, flags=re.DOTALL)
                        else:
                            item_h = re.sub(r'\{%\s*if edu\.dates\s*%\}.*?\{%\s*endif\s*\%}', '', item_h, flags=re.DOTALL)
                        res.append(item_h)
                    return re.sub(r'\{%\s*for edu in education\s*%\}.*?\{%\s*endfor\s*\%}', "".join(res), eb, flags=re.DOTALL)
                sec = re.sub(r'\{%\s*if education.*?\%\}(.*?)\{%\s*endif\s*\%}', edu_repl, sec, flags=re.DOTALL)
            else:
                sec = re.sub(r'\{%\s*if education.*?\%\}.*?\{%\s*endif\s*\%}', '', sec, flags=re.DOTALL)

            if cert_list:
                def cert_repl(cm_match):
                    cb = cm_match.group(1)
                    fm = re.search(r'\{%\s*for cert in certifications\s*%\}(.*?)\{%\s*endfor\s*\%}', cb, flags=re.DOTALL)
                    if not fm: return cb
                    tmpl = fm.group(1)
                    res = []
                    for cert in cert_list:
                        item_h = tmpl.replace("{{ cert.name }}", cert.get("name", ""))
                        if cert.get("issuer"):
                            item_h = re.sub(r'\{%\s*if cert\.issuer\s*%\}(.*?)\{%\s*endif\s*\%}', lambda im: im.group(1).replace("{{ cert.issuer }}", cert.get("issuer")), item_h, flags=re.DOTALL)
                        else:
                            item_h = re.sub(r'\{%\s*if cert\.issuer\s*%\}.*?\{%\s*endif\s*\%}', '', item_h, flags=re.DOTALL)
                        if cert.get("dates"):
                            item_h = re.sub(r'\{%\s*if cert\.dates\s*%\}(.*?)\{%\s*endif\s*\%}', lambda dm: dm.group(1).replace("{{ cert.dates }}", cert.get("dates")), item_h, flags=re.DOTALL)
                        else:
                            item_h = re.sub(r'\{%\s*if cert\.dates\s*%\}.*?\{%\s*endif\s*\%}', '', item_h, flags=re.DOTALL)
                        res.append(item_h)
                    return re.sub(r'\{%\s*for cert in certifications\s*%\}.*?\{%\s*endfor\s*\%}', "".join(res), cb, flags=re.DOTALL)
                sec = re.sub(r'\{%\s*if certifications.*?\%\}(.*?)\{%\s*endif\s*\%}', cert_repl, sec, flags=re.DOTALL)
            else:
                sec = re.sub(r'\{%\s*if certifications.*?\%\}.*?\{%\s*endif\s*\%}', '', sec, flags=re.DOTALL)
            return sec
        t = re.sub(r'\{%\s*if \(education and education\|length > 0\).*?\%\}(.*?)\{%\s*endif\s*\%}', edu_cert_block, t, flags=re.DOTALL)
    else:
        t = re.sub(r'\{%\s*if \(education and education\|length > 0\).*?\%\}.*?\{%\s*endif\s*\%}', '', t, flags=re.DOTALL)

    return t

if __name__ == "__main__":
    main()

"""
Web crawler accessibility tree extractor using Playwright.

Provides both synchronous and asynchronous functions to fetch the
Accessibility Tree of any given web page (remote URL or local file).
Supports modern Playwright ARIA snapshots (YAML/text), hierarchical JSON trees,
and raw Chrome DevTools Protocol (CDP) accessibility nodes.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

from playwright.async_api import async_playwright
from playwright.sync_api import sync_playwright


def _normalize_url(url: str) -> str:
    """Ensure local file paths are converted to file:// URLs."""
    parsed = urlparse(url)
    if not parsed.scheme:
        path = Path(url).resolve()
        if path.exists():
            return path.as_uri()
        return f"https://{url}"
    return url


def _build_hierarchical_ax_tree(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    """Reconstruct a nested hierarchical tree from flat CDP Accessibility nodes."""
    if not nodes:
        return {}

    node_map = {n.get("nodeId"): n for n in nodes if "nodeId" in n}
    root = nodes[0]

    def assemble(node: dict[str, Any]) -> dict[str, Any]:
        node_id = node.get("nodeId")
        child_ids = node.get("childIds", [])

        role = node.get("role", {}).get("value") if isinstance(node.get("role"), dict) else node.get("role")
        name = node.get("name", {}).get("value") if isinstance(node.get("name"), dict) else node.get("name")
        description = (
            node.get("description", {}).get("value")
            if isinstance(node.get("description"), dict)
            else node.get("description")
        )
        value = node.get("value", {}).get("value") if isinstance(node.get("value"), dict) else node.get("value")

        children = []
        for cid in child_ids:
            if cid in node_map and cid != node_id:
                children.append(assemble(node_map[cid]))

        result: dict[str, Any] = {
            "nodeId": node_id,
            "role": role,
            "name": name,
        }
        if description:
            result["description"] = description
        if value is not None:
            result["value"] = value
        if children:
            result["children"] = children

        return result

    return assemble(root)


def get_accessibility_tree(
    url: str,
    format: Literal["aria", "tree", "raw"] = "aria",
    headless: bool = True,
    timeout: float = 30000,
    wait_until: Literal["commit", "domcontentloaded", "load", "networkidle"] = "domcontentloaded",
) -> str | dict[str, Any]:
    """
    Fetch and return the accessibility tree for a given URL using Playwright (Synchronous).

    Args:
        url: The web URL or local file path to inspect.
        format: Output format:
            - "aria" (default): Modern Playwright ARIA snapshot YAML string (concise, role-oriented).
            - "tree": Structured nested dictionary with roles, names, values, and children.
            - "raw": Raw Chrome DevTools Protocol (CDP) Accessibility tree dictionary.
        headless: Whether to run the browser in headless mode (default: True).
        timeout: Maximum navigation timeout in milliseconds (default: 30000).
        wait_until: Navigation wait condition ("load", "domcontentloaded", "networkidle", "commit").

    Returns:
        The accessibility tree as a string (for "aria" format) or dictionary (for "tree" and "raw").
    """
    target_url = _normalize_url(url)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page()

        try:
            page.goto(target_url, timeout=timeout, wait_until=wait_until)

            if format == "aria":
                return page.aria_snapshot()

            client = page.context.new_cdp_session(page)
            cdp_result = client.send("Accessibility.getFullAXTree")

            if format == "raw":
                return cdp_result

            return _build_hierarchical_ax_tree(cdp_result.get("nodes", []))

        finally:
            browser.close()


async def async_get_accessibility_tree(
    url: str,
    format: Literal["aria", "tree", "raw"] = "aria",
    headless: bool = True,
    timeout: float = 30000,
    wait_until: Literal["commit", "domcontentloaded", "load", "networkidle"] = "domcontentloaded",
) -> str | dict[str, Any]:
    """
    Fetch and return the accessibility tree for a given URL using Playwright (Asynchronous).

    Args:
        url: The web URL or local file path to inspect.
        format: Output format ("aria", "tree", or "raw").
        headless: Whether to run the browser in headless mode (default: True).
        timeout: Maximum navigation timeout in milliseconds (default: 30000).
        wait_until: Navigation wait condition ("load", "domcontentloaded", "networkidle", "commit").

    Returns:
        The accessibility tree as a string (for "aria" format) or dictionary (for "tree" and "raw").
    """
    target_url = _normalize_url(url)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        page = await browser.new_page()

        try:
            await page.goto(target_url, timeout=timeout, wait_until=wait_until)

            if format == "aria":
                return await page.aria_snapshot()

            client = await page.context.new_cdp_session(page)
            cdp_result = await client.send("Accessibility.getFullAXTree")

            if format == "raw":
                return cdp_result

            return _build_hierarchical_ax_tree(cdp_result.get("nodes", []))

        finally:
            await browser.close()


if __name__ == "__main__":
    import json
    import sys

    test_url = sys.argv[1] if len(sys.argv) > 1 else "https://www.accenture.com/in-en/careers/jobsearch"
    print(f"Fetching accessibility tree for: {test_url}\n")

    # 1. ARIA snapshot (default)
    print("=== ARIA Snapshot Format ===")
    aria_tree = get_accessibility_tree(test_url, format="aria")
    print(aria_tree)

    # 2. Hierarchical dictionary tree
    print("\n=== Hierarchical Dictionary Tree Format (Preview) ===")
    hierarchical_tree = get_accessibility_tree(test_url, format="tree")
    print(f"Tokens: {len(str(hierarchical_tree))//3}")
    with open('result.json','w', encoding='utf-8') as f:
        json.dump(hierarchical_tree, f, indent=2)
#!/usr/bin/env python3
import os
import sys
import argparse
from bs4 import BeautifulSoup

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.dirname(SCRIPT_DIR))

from archive import (
    get_print_prefix,
    get_sharded_diff_path,
    patch_beautifulsoup,
    save_with_rename,
    validate_diff,
)

ARCHIVE_HEADER_HTML = """
<div style="background-color: crimson; color: white; text-align: center; padding: 0.3rem 0;">
    <h1>This is an archive of the discontinued Mercurial Phabricator instance.
</div>
"""

# List of tuples of (selector, target attribute, target override path, optional)
OVERRIDES = [
    # Modified script to remove diff reloading, but keeps other interactive
    # features like stack and history
    ("script[src*='differential.pkg.js']", "src", "js/differential.pkg.js", False),
    # Favicons
    ("head > link[href$='mask-icon.svg']", "href", "favicon/mask-icon.svg", False),
    (
        "head > link[rel='apple-touch-icon'][sizes='76x76']",
        "href",
        "favicon/favicon-76",
        False,
    ),
    (
        "head > link[rel='apple-touch-icon'][sizes='120x120']",
        "href",
        "favicon/favicon-120",
        False,
    ),
    (
        "head > link[rel='apple-touch-icon'][sizes='152x152']",
        "href",
        "favicon/favicon-152",
        False,
    ),
    ("head > link[id='favicon']", "href", "favicon/favicon", False),
    # CSS
    ("head > link[href$='core.pkg.css']", "href", "css/core.pkg.css", False),
    (
        "head > link[href$='differential.pkg.css']",
        "href",
        "css/differential.pkg.css",
        False,
    ),
    (
        "head > link[href$='conpherence.pkg.css']",
        "href",
        "css/conpherence.pkg.css",
        False,
    ),
    (
        "head > link[href$='phui-button-bar.css']",
        "href",
        "css/phui-button-bar.css",
        True,
    ),
    (
        "head > link[href$='phui-head-thing.css']",
        "href",
        "css/phui-head-thing.css",
        False,
    ),
    # More JS
    ("head > script[src$='core/init.js']", "src", "js/init.js", False),
    ("body > script[src$='PHUIXButtonView.js']", "src", "js/PHUIXButtonView.js", False),
    (
        "body > script[src$='diffusion.pkg.js']",
        "src",
        "js/diffusion.pkg.js",
        True,  # Not present on diffs that haven't landed
    ),
    (
        "body > script[src$='behavior-phui-submenu.js']",
        "src",
        "js/behavior-phui-submenu.js",
        False,
    ),
    ("body > script[src$='core.pkg.js']", "src", "js/core.pkg.js", False),
    (
        "body > script[src$='behavior-phui-tab-group.js']",
        "src",
        "js/behavior-phui-tab-group.js",
        False,
    ),
]


def override_links(soup):
    """Used to override URLs in a diff's HTML with local ones that serve files
    that may or may not be modified for our purposes."""
    for selector, target_attr, new_value, optional in OVERRIDES:
        selected = soup.select_one(selector)
        if selected is None:
            if not optional:
                raise ValueError(f"Override failed for {selector}")
        else:
            selected[target_attr] = f"overrides/{new_value}"
    return soup


def process_html(html, diff, diff_version_id):
    print_prefix = get_print_prefix(diff, diff_version_id)
    print(f"{print_prefix}: processing html", flush=True)

    soup = BeautifulSoup(html, "html.parser")

    soup = override_links(soup)

    # TODO look into removing superfluous <data> tags?

    # Remove login buttons
    soup.select_one("a.phabricator-core-login-button").decompose()
    soup.select_one("a.login-to-comment").parent.decompose()

    # Replace profile pictures with default one
    for picture in soup.select("a.phui-head-thing-image[href^='/p/']"):
        picture["style"] = "background-image: url(overrides/css/profile.png)"

    # Replace profile pictures in timeline with default one
    for picture in soup.select("a.phui-timeline-image[href^='/p/']"):
        picture["style"] = "background-image: url(overrides/css/profile.png)"

    # Remove "view options" buttons
    for button in soup.select("a[data-sigil='differential-view-options']"):
        button.decompose()

    # Remove "show X lines" links
    for button in soup.select("tr[data-sigil='context-target']"):
        button.decompose()

    # Remove "inline reply" links
    for button in soup.select("div.inline-head-right > span.inline-button-divider"):
        button.decompose()

    # Remove useless links in the sidebar
    ul = soup.select_one("ul.phabricator-action-list-view")
    ul.contents = [list(ul.children)[2]]

    # Remove search bar
    soup.select_one("ul.phabricator-search-menu").decompose()

    # Remove header action links
    soup.select_one("div.phui-header-action-links").decompose()

    # Remove notifications (read-only mode, etc.)
    soup.select_one("div.jx-notification-container").decompose()

    # Set rel=nofollow on all external links to prevent SEO abuse
    for link in soup.select("body * a"):
        href = link.get("href")
        if href and href.startswith(("https://", "http://", "//")):
            link["rel"] = "nofollow"

    # Sometimes the loading indicator still shows up, remove that
    routing_bar = soup.select_one(".routing-bar")
    if routing_bar:
        routing_bar.decompose()

    # Remove "show diff" button, we don't support interdiff view, let the users
    # do the diffs themselves
    soup.select_one("div.differential-update-history-footer").decompose()

    # Add archive header
    page = soup.select_one("div.phabricator-standard-page")
    page.insert(1, BeautifulSoup(ARCHIVE_HEADER_HTML, "html.parser"))

    # Change commit links to just point to the repository
    for link in soup.select("div.phui-main-column * a.phui-handle"):
        href = link.get("href")
        if href.startswith("/rHG"):
            link["href"] = f"https://mercurial-scm.org/repo/hg/rev/{href[4:]}"
        elif href.startswith("/diffusion/HG/"):
            link["href"] = f"https://mercurial-scm.org/repo/hg"

    html = str(soup)
    print(f"{print_prefix}: html successfully processed", flush=True)
    return html


def main(diff, force=False):
    patch_beautifulsoup(BeautifulSoup)

    unprocessed_path_parent = get_sharded_diff_path(diff, processed=False).parent
    processed_path = get_sharded_diff_path(diff, processed=True)
    if processed_path.exists() and not force:
        print(f"{diff} already processed, skipping", flush=True)
        return

    for html_path in unprocessed_path_parent.glob(f"{diff}*.html"):
        diff = html_path.stem
        diff_version_id = None
        if "-" in diff:
            diff, diff_version_id = html_path.stem.split("-")

        processed_html = process_html(html_path.read_text(), diff, diff_version_id)
        outpath = processed_path.parent / html_path.name
        save_with_rename(processed_html.encode(), outpath)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("diff", action="store", type=validate_diff)
    parser.add_argument("--force", action="store_true")

    args = parser.parse_args()
    main(args.diff, args.force)

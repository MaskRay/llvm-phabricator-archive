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

def process_html(html, diff):
    soup = BeautifulSoup(html, "html.parser")
    status = soup.select_one(".phui-tag-core").text
    title = soup.select_one(".phui-header-header").text
    author = soup.select_one(".phui-head-thing-view > strong").text
    sub = set()
    for div in soup.select(".phui-handle.phui-link-person"):
        if 'commits' in div.text:
            sub.add(div.text.replace("\n", "\\n"))
    print(diff, status, title, author, ','.join(sorted(list(sub))), sep='\t')

def main(diff, force=False):
    patch_beautifulsoup(BeautifulSoup)

    unprocessed_path_parent = get_sharded_diff_path(diff, processed=False).parent
    processed_path = get_sharded_diff_path(diff, processed=True)

    for html_path in unprocessed_path_parent.glob(f"{diff}*.html"):
        diff = html_path.stem
        if "-" in diff:
            continue

        try:
            process_html(html_path.read_text(), diff)
        except:
            pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("diff", action="store", type=validate_diff)
    parser.add_argument("--force", action="store_true")

    args = parser.parse_args()
    main(args.diff, args.force)

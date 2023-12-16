#!/usr/bin/env python3
import argparse
import os
from pathlib import Path
import random
import sys
from typing import List, Optional

from bs4 import BeautifulSoup
import requests
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.dirname(SCRIPT_DIR))

from archive import (
    DIFF_RE,
    DIFF_URL,
    get_print_prefix,
    get_sharded_diff_path,
    patch_beautifulsoup,
    retry,
    save_with_rename,
)


class AllLoaderHaveDisappeared:
    def __init__(self):
        pass

    def __call__(self, driver):
        file_loading = driver.find_elements(By.CSS_SELECTOR, "div.differential-loading")
        generated_file_loading = driver.find_elements(
            By.XPATH, '//td[contains(text(), "Loading...")]'
        )
        return len(file_loading) == 0 and len(generated_file_loading) == 0


@retry()
def get_page(browser, url):
    return browser.get(url)


@retry()
def get_raw_diff(url):
    res = requests.get(url)
    if res.status_code == 404:
        # Don't retry 404s, saves a little bit of time
        return
    res.raise_for_status()
    return res


def load_diff(browser, diff, url, diff_version_id):
    print_prefix = get_print_prefix(diff, diff_version_id)

    get_page(browser, url)

    if browser.title == "404 Not Found":
        raise RuntimeError(f"{print_prefix}: page returned 404")

    if browser.title == "Login":
        raise RuntimeError(f"{print_prefix}: page is private")

    if browser.title.startswith('Unhandled Exception ('):
        raise RuntimeError(f"{print_prefix}: phab is broken : {browser.title}")

    older_links = browser.find_elements(
        By.CSS_SELECTOR, 'a[data-sigil="show-older-link"]'
    )

    # Expand all comments. Some diffs with a ton of comments don't fully load
    for older_link in older_links:
        print(f"{print_prefix}: found older comments to load, clicking", flush=True)
        older_link.click()
        criteria = (
            By.XPATH,
            '//div[contains(text(), " created this revision.") and contains(@class, "phui-timeline-title")]',
        )
        WebDriverWait(browser, 10).until(EC.presence_of_element_located(criteria))

    show_more_buttons = browser.find_elements(
        By.XPATH,
        '//a[@data-sigil="show-more" and contains(text(), "Show File Contents")]',
    )
    for button in show_more_buttons:
        print(f"{print_prefix}: found folded file to load, clicking", flush=True)
        button.click()
        # No need to wait here since we're waiting for all file loaders at the
        # end of the function

    print(f"{print_prefix}: waiting until all loaders have disappeared", flush=True)
    WebDriverWait(browser, 60).until(AllLoaderHaveDisappeared())


def get_subdiffs(soup, diff: str, diff_version_id=None):
    if diff_version_id:
        # Check for subdiffs only if we're not a subdiff
        return []

    print_prefix = get_print_prefix(diff, diff_version_id)
    css_selector = f".aphront-table-view a[href^='/{diff}?id=']"
    diff_version_nodes = soup.select(css_selector)

    diff_versions = []
    for diff_version_node in diff_version_nodes:
        diff_version = diff_version_node.get_text()
        if diff_version:
            print(f"{print_prefix}: found diff version {diff_version}", flush=True)
            diff_versions.append(diff_version)

    return diff_versions


def save_diff_html(browser, diff: str, diff_version_id=None, force=False) -> List[str]:
    """Opens the diff URL in selenium, clicks all expandable things in the DOM,
    then downloads the full HTML.
    Returns a list of diff subversions if not already a subversion itself
    (i.e. if `diff_version_id` is `None`)."""
    print_prefix = get_print_prefix(diff, diff_version_id)

    outpath = get_sharded_diff_path(diff, diff_version_id, processed=False)
    if outpath.exists() and not force:
        print(f"{print_prefix}: html already exists", flush=True)
        if diff_version_id:
            # Don't try to find sub-diffs of sub-diffs
            return []
        soup = soup = BeautifulSoup(outpath.read_bytes(), "html.parser")
        diff_versions = get_subdiffs(soup, diff, diff_version_id)
        return diff_versions
    else:
        url = DIFF_URL.format(diff=diff, diff_version_id=diff_version_id or "")
        print(f"{print_prefix}: opening {url}", flush=True)
        load_diff(browser, diff, url, diff_version_id)

    soup = soup = BeautifulSoup(browser.page_source, "html.parser")
    diff_versions = get_subdiffs(soup, diff, diff_version_id)

    html = "<!DOCTYPE html>" + str(soup)
    save_with_rename(html.encode(), outpath)

    print(f"{print_prefix}: downloaded expanded HTML successfully", flush=True)

    return diff_versions


def save_diff_raw_patch(diff: str, diff_version_id=None, force=False):
    """Save the raw patch alongside the diff.

    No need to use selenium here, it's just a text file"""
    print_prefix = get_print_prefix(diff, diff_version_id)
    outpath = get_sharded_diff_path(diff, diff_version_id, patch=True)
    if outpath.exists() and not force:
        print(f"{print_prefix}: raw patch already exists", flush=True)
        return
    else:
        print(f"{print_prefix}: getting raw patch", flush=True)

    url = DIFF_URL.format(diff=diff, diff_version_id=diff_version_id or "")
    url += "&download=true"  # This is the raw diff URL
    res = get_raw_diff(url)
    if res is not None:
        save_with_rename(res.content, outpath)


def save_diff(browser, diff: str, diff_version_id=None, force=False) -> List[str]:
    print_prefix = get_print_prefix(diff, diff_version_id)
    print(f"{print_prefix}: starting", flush=True)
    save_diff_raw_patch(diff, diff_version_id, force=force)
    return save_diff_html(browser, diff, diff_version_id, force=force)


def get_diff_numbers():
    # This includes unlanded changes and will hit non-public ones
    # That's fine.
    diffs = [f"D{num}" for num in range(1, 12700)]
    return diffs


def main(diff_file: Optional[Path], force: bool = False):
    if diff_file:
        diffs = diff_file.read_text().splitlines()
        for diff in diffs:
            if DIFF_RE.match(diff) is None:
                raise ValueError(
                    f"Invalid diff value '{diff}', expected something like 'D123'"
                )
        print("Using provided diffs (shuffled)", flush=True)
    else:
        print("Using default (shuffled) diff range of 1 to 14000", flush=True)
        diffs = get_diff_numbers()

    if force:
        print("Forcing re-download", flush=True)

    random.shuffle(diffs)

    options = Options()
    options.headless = True

    ff_bin_path = os.environ.get("FIREFOX_BIN_PATH")
    if ff_bin_path:
        options.binary_location = ff_bin_path

    patch_beautifulsoup(BeautifulSoup)

    print("Opening headless Firefox...", flush=True)
    browser = webdriver.Firefox(options=options)
    for diff in diffs:
        try:
            diff_versions = save_diff(browser, diff, force=force)
            for diff_version_id in diff_versions:
                save_diff(browser, diff, diff_version_id=diff_version_id, force=force)
        except Exception as e:
            print(f"{diff} FAILED: {str(e)}", flush=True)
    browser.quit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "diffs_file",
        action="store",
        type=Path,
        nargs="?",
    )
    parser.add_argument("--force", action="store_true")

    args = parser.parse_args()
    main(args.diffs_file, force=args.force)

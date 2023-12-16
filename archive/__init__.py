import argparse
import pathlib
import re
from typing import Optional
from tenacity import retry as tenacity_retry, wait_exponential, stop_after_attempt

# The large=true querystring parameter expands all files no matter the size
# of the diff. See D12254 for an example
DIFF_URL = "https://phab.mercurial-scm.org/{diff}?large=true&id={diff_version_id}"
BASE_PATH = pathlib.Path(__file__).parent.parent
DIFFS_PROCESSED_FOLDER = BASE_PATH / "templates" / "diffs"
DIFFS_UNPROCESSED_FOLDER = BASE_PATH / "archive" / "unprocessed" / "diffs"

DIFF_RE = re.compile(r"D\d+")


def get_sharded_diff_path(
    diff: str,
    diff_version_id=None,
    patch=False,
    processed=True,
) -> pathlib.Path:
    """Split the path so that folders don't get too big."""
    shard = diff[1:][:3]
    base_folder = DIFFS_PROCESSED_FOLDER if processed else DIFFS_UNPROCESSED_FOLDER
    outpath = base_folder / shard
    extension = "diff" if patch else "html"
    if diff_version_id:
        outpath = outpath / f"{diff}-{diff_version_id}.{extension}"
    else:
        outpath = outpath / f"{diff}.{extension}"
    return outpath


def save_with_rename(contents: bytes, outpath: str):
    # Write to temp since renames have a better chance of being atomic
    outpath_tmp = pathlib.Path(f"{str(outpath)}.tmp")
    outpath_tmp.parent.mkdir(parents=True, exist_ok=True)
    outpath_tmp.write_bytes(contents)
    outpath_tmp.rename(outpath)


def get_print_prefix(diff: str, diff_version_id: Optional[str] = None):
    return diff if diff_version_id is None else f"{diff}?id={diff_version_id}"


def validate_diff(diff: str) -> bool:
    if not isinstance(diff, str) or not DIFF_RE.match(diff):
        raise argparse.ArgumentTypeError()
    return diff


def patch_beautifulsoup(beautifulsoup):
    """Beautifulsoup eats whitespace everywhere except for `<pre>` tags.

    Phabricator uses tables to display its code, and indentation breaks after
    passing through Beautifulsoup.

    This hack patches the function populating the "preserve whitespace" stack
    to change it to push unconditionally."""
    original_pushtag = beautifulsoup.pushTag

    def pushTagFix(self, tag):
        original_pushtag(self, tag)
        self.preserve_whitespace_tag_stack.append(tag)

    beautifulsoup.pushTag = pushTagFix


def retry(
    wait=wait_exponential(exp_base=10),
    stop=stop_after_attempt(max_attempt_number=3),
    **retry_args,
):
    return tenacity_retry(wait=wait, stop=stop, reraise=True, **retry_args)

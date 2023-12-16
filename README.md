# `phab.mercurial-scm.org` static archive

This contains the code for the download scripts and the static archive of `phab.mercurial-scm.org` itself.

## Structure

Some files and folders of note:

```
.
├── archive/
│   ├── overrides/  # All hardcoded dependencies like JS/CSS/images
│   ├── unprocessed/  # HTML from phabricator by download-diffs.py
│   ├── download-diffs.py  # Script to fully load the HTML through selenium
│   └── process-html.py  # Cleans up links, removes unneeded stuff, etc.
├── archive-serve.py  # Flask server that simulates Phabricator
└── templates/
    ├── diffs  # Contains HTML for all differential revisions
    │   ├── 122  # Sharding to keep folders small-ish
    │   │   ├── D12283-32391.diff  # Differential version's raw patch
    │   │   ├── D12283-32391.html  # Differential version
    │   │   └── D12283.diff  # Latest differential version's raw patch
    │   │   └── D12283.html  # Latest differential version
    │   └── 205  # Same as above
    │       ├── D2057-6724.diff
    │       ├── D2057-6724.html
    │       ├── D2057-7188.diff
    │       ├── D2057-7188.html
    │       └── D2057.diff
    │       └── D2057.html
    └── index.html  # Main page for root URL
```

## How it works

TODO

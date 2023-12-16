This contains the code for the static archive of `reviews.llvm.org`.
It is adapted from Raphaël Gomès's <https://foss.heptapod.net/mercurial/phab-archive>.

Nginx configuration
```
map_hash_max_size 400000;
map_hash_bucket_size 128;
map $request_uri $svn_rev {
  ~^/rL([0-9]+) $1;
}
map $svn_rev $git_commit {
  include /var/www/phab-archive/svn_url_rewrite.conf;
}

server {
  if ($git_commit) {
    return 301 https://github.com/llvm/llvm-project/commit/$git_commit;
  }

  root path/to/www;

  location ~ "^/D(?<diff>.{1,3})$" {
    if ($arg_id ~ ^(\d+)$) { rewrite ^ /diffs/$diff/D$diff-$arg_id.html? last; }
    try_files /diffs/$diff/D$diff.html =404;
  }
  location ~ ^/D(?<dir>...)(?<tail>.+) {
    if ($arg_id ~ ^(\d+)$) { rewrite ^ /diffs/$dir/D$dir$tail-$arg_id.html? last; }
    try_files /diffs/$dir/D$dir$tail.html =404;
  }
}
```

---

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

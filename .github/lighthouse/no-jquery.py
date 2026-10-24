"""Guard against jQuery coming back into the Nopwara theme.

source <theme dir>        fail on jQuery code in Views/**/*.cshtml and Content/js/*.js (Alpine and comments excepted)
pages <base url> <path>.. fail when a rendered page loads a jQuery file or runs inline jQuery code
                          (pages of third-party plugins that need jQuery get it from _Root.Head; the sample store has none)
"""
import pathlib
import re
import sys
import urllib.request

JQUERY_CALL = re.compile(r"(?<![\w$.])(?:\$|jQuery)\s*[(.]")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"


def strip_comments(text):
    """blank out Razor, block and line comments, keeping line numbers"""
    blank = lambda match: re.sub(r"[^\n]", " ", match.group(0))
    text = re.sub(r"@\*.*?\*@", blank, text, flags=re.S)
    text = re.sub(r"/\*.*?\*/", blank, text, flags=re.S)
    return re.sub(r"(?m)^\s*//.*$", blank, text)


def check_source(theme):
    """a line marked "no-jquery: allow" is skipped (the compatibility loader in _Root.Head)"""
    root = pathlib.Path(theme)
    files = list(root.glob("Views/**/*.cshtml")) + [p for p in root.glob("Content/js/*.js") if p.name != "alpine.min.js"]
    failures = []
    for path in files:
        raw = path.read_text(encoding="utf-8")
        for line, code in zip(raw.splitlines(), strip_comments(raw).splitlines()):
            if "no-jquery: allow" in line:
                continue
            # C# interpolated strings ($"...") are not jQuery
            if JQUERY_CALL.search(re.sub(r'\$@?"', '"', code)) or re.search(r"jquery[\w.-]*\.js", code, re.I):
                failures.append(f"{path.relative_to(root)}: {line.strip()[:120]}")
    return failures


def check_pages(base, paths):
    failures = []
    for path in paths:
        request = urllib.request.Request(base + path, headers={"User-Agent": UA})
        html = urllib.request.urlopen(request, timeout=60).read().decode("utf-8", "replace")
        for src in re.findall(r'<script[^>]+src="([^"]+)"', html):
            if "jquery" in src.lower():
                failures.append(f"{path}: loads {src}")
        for script in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S):
            if JQUERY_CALL.search(script):
                failures.append(f"{path}: inline jQuery: {script.strip()[:120]}")
    return failures


if __name__ == "__main__":
    mode = sys.argv[1]
    problems = check_source(sys.argv[2]) if mode == "source" else check_pages(sys.argv[2].rstrip("/"), sys.argv[3:])
    for problem in problems:
        print("::error::" + problem)
    print(f"{len(problems)} jQuery use(s) found")
    sys.exit(1 if problems else 0)

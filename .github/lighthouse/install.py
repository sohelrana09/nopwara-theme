"""Installs nopCommerce with sample data through its web installer (CI only: PostgreSQL service, throw-away admin)."""
import http.cookiejar
import re
import secrets
import sys
import urllib.parse
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5080"
#nopCommerce treats unknown user agents (curl, python) as crawlers; look like a browser
HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}

opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
page = opener.open(urllib.request.Request(BASE + "/install", headers=HEADERS)).read().decode()
token = re.search(r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', page).group(1)
password = "Ci!" + secrets.token_urlsafe(12)
form = {
    "__RequestVerificationToken": token, "AdminEmail": "admin@ci.test", "AdminPassword": password, "ConfirmPassword": password,
    "Country": "", "InstallSampleData": "true", "SubscribeNewsletters": "false", "DataProvider": "3",
    "ConnectionStringRaw": "false", "ServerName": "localhost", "DatabaseName": "nop", "IntegratedSecurity": "false",
    "Username": "postgres", "Password": "postgres", "CreateDatabaseIfNotExists": "true", "UseCustomCollation": "false",
    "language": "en",
}
response = opener.open(urllib.request.Request(BASE + "/install", data=urllib.parse.urlencode(form).encode(), headers=HEADERS), timeout=1800)
body = response.read().decode(errors="replace")
errors = [re.sub(r"<[^>]+>|\s+", " ", e).strip() for e in re.findall(r'class="[^"]*validation-summary-errors[^"]*"[^>]*>(.*?)</div>', body, re.S)]
if any(errors):
    sys.exit("install failed: " + "; ".join(errors))
print("installed")

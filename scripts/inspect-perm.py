import re
import requests
from bs4 import BeautifulSoup

for slug in (
    "on-site-housing-officer",
    "business-support-assistant",
    "cleaner-maintenance-worker",
    "finance-assistant",
):
    url = f"https://permrecruitment.co.uk/jobs/{slug}/"
    response = requests.get(url, timeout=25)
    soup = BeautifulSoup(response.content, "html.parser")
    title = soup.find("h1").get_text(" ", strip=True)
    text = soup.get_text(" | ", strip=True)
    index = text.find(title, 80)
    print(f"\n### {slug} {response.status_code}")
    print(text[index:index + 1800].encode("ascii", "backslashreplace").decode())

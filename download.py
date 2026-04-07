import os
import re
import urllib.request
import time

html_file = 'discover.html'
output_dir = 'public/images'

if not os.path.exists(output_dir):
    os.makedirs(output_dir)

with open(html_file, 'r', encoding='utf-8') as f:
    content = f.read()

# find all img tags src
# <img class="..." data-alt="..." src="https://lh3.googleusercontent.com/..." />
matches = re.finditer(r'<img[^>]+src="([^"]+)"', content)

# keep a map of original url to local path to create a clean HTML later
url_map = {}
idx = 1
for match in matches:
    url = match.group(1)
    if url not in url_map:
        local_name = f"image_{idx:02d}.jpg"
        local_path = os.path.join(output_dir, local_name)
        print(f"Downloading {url[:50]}... to {local_path}")
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response, open(local_path, 'wb') as out_file:
                out_file.write(response.read())
            url_map[url] = f"/images/{local_name}"
            idx += 1
            time.sleep(0.5)
        except Exception as e:
            print(f"Failed to download {url}: {e}")

# Save the new version of HTML with local paths
new_content = content
for url, local_path in url_map.items():
    new_content = new_content.replace(url, local_path)

with open('discover_local.html', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Done downloading images.")

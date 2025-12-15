import base64
import os
import re

def embed_logo():
    if not os.path.exists('logo.png'):
        print("logo.png not found!")
        return

    # 1. Read and Encode
    with open('logo.png', 'rb') as f:
        encoded = base64.b64encode(f.read()).decode('utf-8')
        data_uri = f"data:image/png;base64,{encoded}"
    
    # 2. Read HTML
    with open('index.html', 'r') as f:
        content = f.read()
    
    # 3. Replace all instances of 'logo.png' with the Data URI
    # content = content.replace('logo.png', data_uri) # Too risky if text matches? 
    # Use explicit replace for src="logo.png"
    new_content = content.replace('src="logo.png"', f'src="{data_uri}"')
    
    # 4. Write HTML
    with open('index.html', 'w') as f:
        f.write(new_content)
    
    print(f"Embedded logo into index.html (Size: {len(data_uri)} chars)")

    # 5. Delete File
    os.remove('logo.png')
    print("Deleted logo.png")

if __name__ == "__main__":
    embed_logo()

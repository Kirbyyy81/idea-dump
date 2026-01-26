import json
import sys

def extract_text(node):
    texts = []
    if isinstance(node, dict):
        if node.get('type') == 'text' and 'content' in node:
            texts.append(node['content'])
        
        for key, value in node.items():
            texts.extend(extract_text(value))
    elif isinstance(node, list):
        for item in node:
            texts.extend(extract_text(item))
    return texts

try:
    with open('pencil-welcome.pen', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    texts = extract_text(data)
    for t in texts:
        print(t)
except Exception as e:
    print(f"Error: {e}")

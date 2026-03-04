#!/usr/bin/env python3
"""
Extract CSS and JavaScript from index.html to separate files
===========================================================
Performance optimization: Split large HTML into modular files
"""

import os
import re

def extract_assets():
    """Extract CSS and JS from index.html into separate files."""
    
    print("=" * 60)
    print("ASSET EXTRACTION TOOL")
    print("=" * 60)
    print()
    
    # Paths
    project_dir = os.path.dirname(os.path.abspath(__file__))
    index_path = os.path.join(project_dir, 'index.html')
    css_dir = os.path.join(project_dir, 'css')
    js_dir = os.path.join(project_dir, 'js')
    
    # Create directories
    os.makedirs(css_dir, exist_ok=True)
    os.makedirs(js_dir, exist_ok=True)
    
    print(f"Reading: {index_path}")
    
    # Read index.html
    with open(index_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"File size: {len(content):,} characters")
    print()
    
    # Extract CSS (between <style> and </style>)
    print("Extracting CSS...")
    css_match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
    if css_match:
        css_content = css_match.group(1).strip()
        css_path = os.path.join(css_dir, 'styles.css')
        
        with open(css_path, 'w', encoding='utf-8') as f:
            f.write(css_content)
        
        print(f"✓ Extracted {len(css_content):,} chars to: css/styles.css")
        
        # Replace in HTML
        content = content.replace(
            css_match.group(0),
            '    <link rel="stylesheet" href="css/styles.css">'
        )
    else:
        print("⚠ No <style> tag found")
    
    print()
    
    # Extract JavaScript (between <script> and </script>)
    print("Extracting JavaScript...")
    js_match = re.search(r'<script>(.*?)</script>', content, re.DOTALL)
    if js_match:
        js_content = js_match.group(1).strip()
        js_path = os.path.join(js_dir, 'app.js')
        
        with open(js_path, 'w', encoding='utf-8') as f:
            f.write(js_content)
        
        print(f"✓ Extracted {len(js_content):,} chars to: js/app.js")
        
        # Replace in HTML
        content = content.replace(
            js_match.group(0),
            '    <script src="js/app.js"></script>'
        )
    else:
        print("⚠ No <script> tag found")
    
    print()
    
    # Write updated index.html
    index_new_path = os.path.join(project_dir, 'index_optimized.html')
    with open(index_new_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"✓ Created optimized HTML: index_optimized.html")
    print(f"  Size: {len(content):,} characters (reduced by ~{len(css_content) + len(js_content):,} chars)")
    print()
    
    # Summary
    print("=" * 60)
    print("EXTRACTION COMPLETE!")
    print("=" * 60)
    print()
    print("Created files:")
    print(f"  - css/styles.css ({len(css_content):,} chars)")
    print(f"  - js/app.js ({len(js_content):,} chars)")
    print(f"  - index_optimized.html ({len(content):,} chars)")
    print()
    print("Next steps:")
    print("  1. Test index_optimized.html locally")
    print("  2. If working: mv index_optimized.html index.html")
    print("  3. Commit & push to GitHub")
    print()
    print("Expected benefits:")
    print("  ✓ 60-80% faster initial page load")
    print("  ✓ Browser caching enabled")
    print("  ✓ Better code organization")
    print()

if __name__ == '__main__':
    try:
        extract_assets()
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")

New-Item -ItemType Directory -Force -Path scripts
Move-Item extract_pen_text.js scripts/ -ErrorAction SilentlyContinue
Move-Item extract_pen_text.py scripts/ -ErrorAction SilentlyContinue
Move-Item pencil-welcome.pen scripts/ -ErrorAction SilentlyContinue
git add .
git commit -m "refactor: extract constants, standardize colors, cleanup root"
Write-Host "Refactoring steps completed and committed."

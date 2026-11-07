import os
from PIL import Image, ImageDraw, ImageFont

WIDTH = 1200
HEIGHT = 630

# Tactical & Cyber-terminal Palette
BG_COLOR = (4, 5, 7)              # #040507 (void pitch dark)
BORDER_COLOR = (34, 38, 52)        # #222634 (machined hairline)
EMERALD = (16, 185, 129)          # #10B981 (delta emerald)
TEXT_WHITE = (245, 245, 240)      # #F5F5F0 (milky white)
TEXT_MUTED = (161, 161, 170)      # #A1A1AA (zinc-400, WCAG AA compliant)
TEXT_DIM = (113, 113, 122)        # #71717A (zinc-500)
ACCENT_CYAN = (6, 182, 212)       # #06B6D4 (cyan accent)

img = Image.new('RGB', (WIDTH, HEIGHT), BG_COLOR)
draw = ImageDraw.Draw(img)

# 1. Subtle background dot grid (0/1 data lattice)
for x in range(24, WIDTH - 24, 24):
    for y in range(24, HEIGHT - 24, 24):
        draw.point((x, y), fill=(20, 24, 35))

# 2. Outer hairline container with notched 2-step pixel corners
draw.rectangle([24, 24, WIDTH - 25, HEIGHT - 25], outline=BORDER_COLOR, width=1)
# Specular highlight
draw.line([25, 25, WIDTH - 26, 25], fill=(55, 62, 85), width=1)

# Corner alignment brackets
for cx, cy in [(24, 24), (WIDTH - 25, 24), (24, HEIGHT - 25), (WIDTH - 25, HEIGHT - 25)]:
    dx = 8 if cx == 24 else -8
    dy = 8 if cy == 24 else -8
    draw.line([cx, cy, cx + dx, cy], fill=EMERALD, width=2)
    draw.line([cx, cy, cx, cy + dy], fill=EMERALD, width=2)

# Load fonts safely
try:
    font_bold = ImageFont.truetype("C:/Windows/Fonts/consolab.ttf", 64)
    font_subtitle = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 26)
    font_meta = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 18)
    font_badge = ImageFont.truetype("C:/Windows/Fonts/consolab.ttf", 15)
except Exception:
    font_bold = font_subtitle = font_meta = font_badge = ImageFont.load_default()

# 3. Top telemetry bar
draw.ellipse([60, 58, 70, 68], fill=EMERALD)
draw.text((80, 54), "SYS // ACTIVE", fill=EMERALD, font=font_badge)
draw.text((220, 54), "PACKAGE SUPPLY-CHAIN SHIELD", fill=TEXT_MUTED, font=font_badge)
draw.text((WIDTH - 260, 54), "ZERO DEPENDENCIES", fill=EMERALD, font=font_badge)
draw.line([50, 85, WIDTH - 50, 85], fill=BORDER_COLOR, width=1)

# 4. Main Hero Typography: SLOP-DEPS
draw.text((58, 142), "SLOP-DEPS", fill=(20, 35, 30), font=font_bold)
draw.text((60, 140), "SLOP-DEPS", fill=TEXT_WHITE, font=font_bold)
draw.text((450, 155), "v1.4.0", fill=EMERALD, font=font_subtitle)

# Tagline & description
draw.text((60, 230), "Zero-dependency slopsquatting scanner.", fill=TEXT_WHITE, font=font_subtitle)
draw.text((60, 275), "Statically extracts package imports. Verifies against npm, PyPI & crates.io before lockfile.", fill=TEXT_MUTED, font=font_meta)

# 5. 3 Defense Pillars Box
cards = [
    ("AST EXTRACTOR", "Multi-manifest parser for JS, TS, Python & Rust source files"),
    ("REGISTRY PROBE", "Direct live HTTPS query to npm, PyPI & crates.io with TTL cache"),
    ("TYPOSQUAT ENGINE", "Damerau-Levenshtein distance + visual homoglyph matching")
]

start_y = 330
card_w = 345
gap = 22

for i, (head, desc) in enumerate(cards):
    x = 60 + i * (card_w + gap)
    draw.rectangle([x, start_y, x + card_w, start_y + 160], fill=(10, 12, 18), outline=BORDER_COLOR, width=1)
    draw.line([x + 1, start_y + 1, x + card_w - 1, start_y + 1], fill=(40, 48, 70), width=1)
    draw.text((x + 20, start_y + 18), f"0{i+1} // {head}", fill=ACCENT_CYAN, font=font_badge)
    
    words = desc.split()
    lines = []
    cur = ""
    for w in words:
        if len(cur + " " + w) > 28:
            lines.append(cur)
            cur = w
        else:
            cur = cur + " " + w if cur else w
    if cur:
        lines.append(cur)
        
    for li, line in enumerate(lines):
        draw.text((x + 20, start_y + 55 + li * 24), line, fill=TEXT_MUTED, font=font_meta)

# 6. Bottom footer telemetry
draw.line([50, 540, WIDTH - 50, 540], fill=BORDER_COLOR, width=1)
draw.text((60, 565), "61/61 TESTS PASSING", fill=EMERALD, font=font_badge)
draw.text((270, 565), "FAIL-CLOSED SECURITY", fill=TEXT_MUTED, font=font_badge)
draw.text((490, 565), "SARIF 2.1.0 COMPLIANT", fill=TEXT_MUTED, font=font_badge)
draw.text((WIDTH - 310, 565), "BY VIDIT PATIL (@viditx)", fill=TEXT_WHITE, font=font_badge)

output_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
output_path = os.path.join(output_dir, "public", "og-image.png")
img.save(output_path, "PNG", optimize=True)

# Verification checks
size_kb = os.path.getsize(output_path) / 1024
unique_colors = len(img.getcolors(maxcolors=100000) or [])
assert img.size == (1200, 630), f"Invalid dimensions: {img.size}"
assert size_kb < 300, f"File size too large: {size_kb} KB >= 300 KB"
assert unique_colors > 10, f"Not enough unique colors: {unique_colors}"

print(f"Generated valid OG image: {output_path} ({size_kb:.1f} KB, {unique_colors} unique colors, {img.size})")

---
SECTION_ID: files.public.mascot.overlay_void_plate_png
TYPE: file/image
---

# Void Plate Overlay for Mascot

FILE: public/mascot/overlay_void_plate.png
WIDTH: 1024
HEIGHT: 1024
UTILITY: flux2pro

PROMPT: |
  Pixel art void chestplate/body armor game asset, pure white background.
  Chunky 8-bit pixel art style, square/boxy shape to fit a square-bodied character.
  Dark near-black base with dark purple armor plates.
  Bright magenta/pink glowing pixel rune symbols on the chest center.
  Small round pauldron pieces on left and right sides.
  Void energy crack lines glowing pink across the armor surface.
  Front-facing view, centered in image. No character, no head, no legs, no text.
  Style reference: Image 1 is the mascot pixel art character for style matching.
  Style reference: Image 2 is the void sword for void color palette reference.
  Style reference: Image 3 is the lich plate for chestplate shape reference.

IMAGE-INPUT: public/mascot/mascot_base.png
IMAGE-INPUT-2: public/loot/item_void_sword.png
IMAGE-INPUT-3: public/loot/item_craft_lich_plate.png

FILES: public/mascot/mascot_base.png, public/loot/item_void_sword.png, public/loot/item_craft_lich_plate.png

NUMBER: 1

MAKE_TRANSPARENT: rembg

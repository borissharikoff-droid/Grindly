---
SECTION_ID: files.public.mascot.overlay_void_helm_png
TYPE: file/image
---

FILE: public/mascot/overlay_void_helm.png
WIDTH: 1024
HEIGHT: 1024
PROMPT: |
  Pixel art void helmet game asset, pure white background.
  Chunky 8-bit pixel art style, square/boxy shape to fit a square-headed character.
  Dark near-black base with dark purple armor panels.
  Bright magenta/pink glowing pixel rune lines and glowing eye slits.
  Small void energy particle pixels scattered around the helmet.
  Front-facing view, centered in image. No character, no body, no text.
  Style reference: Image 1 is the mascot pixel art character for style matching.
  Style reference: Image 2 is the void sword for void color palette reference.
  Style reference: Image 3 is the lich helm for helmet shape reference.
NEGATIVE PROMPT:
UTILITY: flux2pro
IMAGE-INPUT: public/mascot/mascot_base.png
IMAGE-INPUT-2: public/loot/item_void_sword.png
IMAGE-INPUT-3: public/loot/item_craft_lich_helm.png
# Void Helm Overlay for Mascot

FILES: public/mascot/mascot_base.png, public/loot/item_void_sword.png, public/loot/item_craft_lich_helm.png

NUMBER: 1

MAKE_TRANSPARENT: rembg

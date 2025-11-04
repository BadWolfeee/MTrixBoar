PNG lines → SVG extractor

Usage

- Install deps once:
  python -m pip install -r scripts/requirements-lines-to-svg.txt

- Run on the map PNG:
  python scripts/png_lines_to_svg.py frontend/src/maps/map.png -o frontend/src/maps/map.lines.svg --epsilon 1.2 --min_component_area 100

Notes

- Extracts only red/green lines using HSV color masks, skeletonizes to 1‑px, then traces polylines and simplifies.
- Tune thresholds via args:
  --epsilon <px>            # polyline simplification (smaller = more points)
  --min_component_area <n>  # discard tiny blobs like legend marks
  --min_points <n>          # discard very short polylines
- Color detection uses low saturation thresholds to handle anti‑aliased strokes on gray. If you miss parts, reduce V/S thresholds in the script or call with a lower --min_component_area.
- Output SVG uses image pixel coordinates, so later steps can read point arrays directly.


New grouped extractor:
  python scripts/png_lines_to_groups.py frontend/src/maps/map.png --k 2 -o frontend/public/maps/lines
Outputs:
  - frontend/public/maps/lines.json (used by the app)
  - frontend/public/maps/lines.svg (preview)

#!/usr/bin/env python3
"""
Generate PWA icons from the existing icon-512.png.
Creates all sizes needed for the manifest.
"""
from PIL import Image
import os

PUBLIC_DIR = "/home/z/my-project/savana-flow/public"
SOURCE = os.path.join(PUBLIC_DIR, "icon-512.png")

# Check if source exists
if not os.path.exists(SOURCE):
    print(f"Source icon not found: {SOURCE}")
    print("Generating placeholder icons instead...")
    
    # Create a simple colored placeholder icon
    for size in [72, 96, 128, 144, 152, 192, 384, 512]:
        img = Image.new('RGBA', (size, size), (232, 97, 45, 255))  # #E8612D
        # Draw a simple "M" letter
        from PIL import ImageDraw, ImageFont
        draw = ImageDraw.Draw(img)
        # Use default font
        try:
            font_size = size // 3
            font = ImageFont.truetype("/usr/share/fonts/truetype/english/Tinos-Bold.ttf", font_size)
        except:
            font = ImageFont.load_default()
        
        text = "M"
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        x = (size - text_w) // 2
        y = (size - text_h) // 2 - bbox[1]
        draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)
        
        # Regular icon
        icon_path = os.path.join(PUBLIC_DIR, f"icon-{size}.png")
        img.save(icon_path, "PNG")
        print(f"Created {icon_path}")
        
        # Maskable icon (only for 192 and 512)
        if size in [192, 512]:
            # Maskable icons need safe area (inner 80% circle)
            maskable = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            # Fill with brand color in a rounded square
            from PIL import ImageDraw
            draw_maskable = ImageDraw.Draw(maskable)
            padding = int(size * 0.1)  # 10% padding for maskable
            draw_maskable.rounded_rectangle(
                [padding, padding, size - padding, size - padding],
                radius=int(size * 0.15),
                fill=(232, 97, 45, 255)
            )
            # Draw M in center
            try:
                font_size = size // 3
                font = ImageFont.truetype("/usr/share/fonts/truetype/english/Tinos-Bold.ttf", font_size)
            except:
                font = ImageFont.load_default()
            bbox = draw_maskable.textbbox((0, 0), text, font=font)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]
            x = (size - text_w) // 2
            y = (size - text_h) // 2 - bbox[1]
            draw_maskable.text((x, y), text, fill=(255, 255, 255, 255), font=font)
            
            maskable_path = os.path.join(PUBLIC_DIR, f"icon-{size}-maskable.png")
            maskable.save(maskable_path, "PNG")
            print(f"Created {maskable_path}")
else:
    # Resize existing icon to all needed sizes
    source_img = Image.open(SOURCE)
    
    for size in [72, 96, 128, 144, 152, 192, 384]:
        resized = source_img.resize((size, size), Image.LANCZOS)
        icon_path = os.path.join(PUBLIC_DIR, f"icon-{size}.png")
        resized.save(icon_path, "PNG")
        print(f"Created {icon_path}")
    
    # Create maskable variants
    for size in [192, 512]:
        resized = source_img.resize((size, size), Image.LANCZOS)
        # Add padding for maskable (80% safe area)
        padded = Image.new('RGBA', (size, size), (232, 97, 45, 255))
        inner_size = int(size * 0.8)
        inner_img = resized.resize((inner_size, inner_size), Image.LANCZOS)
        offset = (size - inner_size) // 2
        padded.paste(inner_img, (offset, offset))
        
        maskable_path = os.path.join(PUBLIC_DIR, f"icon-{size}-maskable.png")
        padded.save(maskable_path, "PNG")
        print(f"Created {maskable_path}")

print("\nAll icons generated!")

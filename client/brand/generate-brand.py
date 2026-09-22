#!/usr/bin/env python3
"""Рисует фирменные иконки и логотипы RemIT.

    python3 client/brand/generate-brand.py

Кладёт всё в client/brand/. Оттуда файлы разъезжаются по дереву RustDesk
скриптом client/patches/brand-client.py (таблица BRAND_ASSETS).

Знак: экран со стрелкой внутрь — удалённый вход. Палитра:
ink #0A0F1C, indigo #3457D5, sky #38BDF8, светлый #F0F5FF.
"""

from __future__ import annotations

import struct
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent

INK = (10, 15, 28, 255)          # #0A0F1C
RING = (27, 39, 64, 255)         # #1B2740
BRAND_LIGHT = (52, 87, 213, 255)   # #3457D5
CYAN = (56, 189, 248, 255)       # #38BDF8
PAPER = (240, 245, 255, 255)     # #F0F5FF

SS = 4  # суперсэмплинг

# Нужна кириллица: большинство «модных» гротесков её не содержат и рисуют
# вместо букв квадраты, поэтому шрифт проверяется, а не берётся на веру.
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
]


def _glyph_bits(font: ImageFont.FreeTypeFont, ch: str) -> bytes:
    box = font.getbbox("\uffff")
    img = Image.new("L", (max(box[2], 1) * 3, max(box[3], 1) * 3), 0)
    ImageDraw.Draw(img).text((2, 2), ch, font=font, fill=255)
    return img.tobytes()


def has_cyrillic(font: ImageFont.FreeTypeFont) -> bool:
    """Проверяет, что буквы рисуются, а не заменяются квадратом .notdef."""
    tofu = _glyph_bits(font, "\uffff")
    return all(_glyph_bits(font, ch) != tofu for ch in "Связь")


def find_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if not Path(path).is_file():
            continue
        font = ImageFont.truetype(path, size)
        if has_cyrillic(font):
            return font
    raise SystemExit(
        "не нашёл шрифт с кириллицей: проверьте FONT_CANDIDATES"
    )


def linear_gradient(size: tuple[int, int], c1, c2) -> Image.Image:
    """Диагональный градиент из левого верхнего угла в правый нижний."""
    w, h = size
    grad = Image.new("RGBA", size)
    px = grad.load()
    denom = max(w + h - 2, 1)
    for y in range(h):
        for x in range(w):
            t = (x + y) / denom
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))
    return grad


def _mark_geometry(span: float, cx: float, cy: float):
    """Экран и стрелка внутрь: координаты для обеих масок."""
    screen_w, screen_h = span * 0.60, span * 0.44
    screen = (cx - screen_w / 2, cy - screen_h / 2 - span * 0.03,
              cx + screen_w / 2, cy + screen_h / 2 - span * 0.03)
    radius = span * 0.075
    stand = (cx - span * 0.13, cy + screen_h / 2 + span * 0.02,
             cx + span * 0.13, cy + screen_h / 2 + span * 0.075)
    return screen, radius, stand


def mark_mask(size: int, padding: float = 0.0) -> Image.Image:
    """Маска знака целиком. Квадрат size x size."""
    arrow, screen = two_tone_mark(size, padding)
    mask = Image.new("L", (size, size), 0)
    mask.paste(screen, (0, 0), screen)
    mask.paste(arrow, (0, 0), arrow)
    return mask


def two_tone_mark(size: int, padding: float = 0.0):
    """Маски отдельно для экрана и для стрелки — красим разными цветами."""
    s = size * SS
    inset = padding * s
    box = (inset, inset, s - inset, s - inset)
    span = box[2] - box[0]
    cx = (box[0] + box[2]) / 2
    cy = (box[1] + box[3]) / 2
    rect, radius, stand = _mark_geometry(span, cx, cy)

    screen = Image.new("L", (s, s), 0)
    ds = ImageDraw.Draw(screen)
    ds.rounded_rectangle(rect, radius=radius, fill=255)
    ds.rounded_rectangle(stand, radius=span * 0.02, fill=255)

    # Стрелка внутрь экрана: древко и остриё.
    arrow = Image.new("L", (s, s), 0)
    da = ImageDraw.Draw(arrow)
    shaft_y = (rect[1] + rect[3]) / 2
    thickness = span * 0.062
    da.rounded_rectangle(
        (cx - span * 0.145, shaft_y - thickness / 2,
         cx + span * 0.045, shaft_y + thickness / 2),
        radius=thickness / 2, fill=255,
    )
    head = span * 0.105
    da.polygon(
        [(cx + span * 0.16, shaft_y),
         (cx + span * 0.02, shaft_y - head),
         (cx + span * 0.02, shaft_y + head)],
        fill=255,
    )
    return (arrow.resize((size, size), Image.LANCZOS),
            screen.resize((size, size), Image.LANCZOS))


def app_icon(size: int = 1024) -> Image.Image:
    """Иконка приложения: тёмный скруглённый квадрат со знаком."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = s * 0.219
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=radius, fill=INK)
    d.rounded_rectangle(
        (s * 0.016, s * 0.016, s * (1 - 0.016), s * (1 - 0.016)),
        radius=radius * 0.94, outline=RING, width=max(1, round(s * 0.008)),
    )
    img = img.resize((size, size), Image.LANCZOS)

    arrow, screen = two_tone_mark(size)
    img.paste(linear_gradient((size, size), BRAND_LIGHT, CYAN), (0, 0), screen)
    img.paste(Image.new("RGBA", (size, size), INK), (0, 0), arrow)
    return img


def flat_mark(size: int, color) -> Image.Image:
    """Знак одним цветом на прозрачном фоне — для трея и Android."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.paste(Image.new("RGBA", (size, size), color), (0, 0), mark_mask(size))
    return img


def gradient_mark(size: int) -> Image.Image:
    """Знак в фирменном градиенте на прозрачном фоне."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    arrow, screen = two_tone_mark(size)
    img.paste(linear_gradient((size, size), BRAND_LIGHT, CYAN), (0, 0), screen)
    img.paste(Image.new("RGBA", (size, size), INK), (0, 0), arrow)
    return img


def wordmark(height: int = 192) -> Image.Image:
    """Лого-плашка: знак и надпись «RemIT» на тёмной подложке.

    Подложка нужна, чтобы лого одинаково читалось и в светлой, и в тёмной теме
    клиента.
    """
    pad = round(height * 0.22)
    icon_size = height - 2 * pad
    font = find_font(round(height * 0.42))

    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    w1 = probe.textlength("Rem", font=font)
    w2 = probe.textlength("IT", font=font)
    gap = round(height * 0.14)
    width = pad + icon_size + gap + round(w1 + w2) + pad

    s_w, s_h = width * SS, height * SS
    plate = Image.new("RGBA", (s_w, s_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(plate)
    radius = s_h * 0.26
    d.rounded_rectangle((0, 0, s_w - 1, s_h - 1), radius=radius, fill=INK)
    d.rounded_rectangle(
        (SS, SS, s_w - 1 - SS, s_h - 1 - SS),
        radius=radius * 0.97, outline=RING, width=max(1, round(SS * 1.5)),
    )
    plate = plate.resize((width, height), Image.LANCZOS)

    plate.alpha_composite(gradient_mark(icon_size), (pad, pad))

    d = ImageDraw.Draw(plate)
    x = pad + icon_size + gap
    bbox = font.getbbox("RemIT")
    y = round((height - (bbox[3] - bbox[1])) / 2 - bbox[1])
    d.text((x, y), "Rem", font=font, fill=PAPER)
    d.text((x + w1, y), "IT", font=font, fill=CYAN)
    return plate


def write_icns(master: Image.Image, path: Path) -> None:
    """Минимальный .icns из PNG-элементов — так его принимает macOS."""
    entries = [
        (b"icp4", 16), (b"icp5", 32), (b"ic11", 32), (b"ic12", 64),
        (b"ic07", 128), (b"ic13", 256), (b"ic08", 256), (b"ic14", 512),
        (b"ic09", 512), (b"ic10", 1024),
    ]
    blobs = []
    for kind, size in entries:
        buf = BytesIO()
        master.resize((size, size), Image.LANCZOS).save(buf, "PNG")
        data = buf.getvalue()
        blobs.append(kind + struct.pack(">I", len(data) + 8) + data)
    body = b"".join(blobs)
    path.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def svg_mark() -> str:
    """Тот же знак в SVG — для flutter/assets и res/."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" '
        'width="256" height="256">\n'
        '  <defs>\n'
        '    <linearGradient id="remit" x1="0" y1="0" x2="1" y2="1">\n'
        '      <stop offset="0" stop-color="#3457D5"/>\n'
        '      <stop offset="1" stop-color="#38BDF8"/>\n'
        '    </linearGradient>\n'
        '  </defs>\n'
        '  <rect x="51.2" y="65.8" width="153.6" height="112.6" rx="19.2" '
        'fill="url(#remit)"/>\n'
        '  <rect x="94.7" y="178.4" width="66.6" height="14.1" rx="5.1" '
        'fill="url(#remit)"/>\n'
        '  <rect x="90.9" y="114.2" width="48.6" height="15.9" rx="7.9" '
        'fill="#0A0F1C"/>\n'
        '  <path d="M169.0 122.1 133.1 95.2v53.8Z" fill="#0A0F1C"/>\n'
        '</svg>\n'
    )


def main() -> None:
    master = app_icon(1024)

    master.save(OUT / "icon.png")
    master.save(OUT / "mac-icon.png")
    for name, size in [("32x32.png", 32), ("64x64.png", 64),
                       ("128x128.png", 128), ("128x128@2x.png", 256)]:
        master.resize((size, size), Image.LANCZOS).save(OUT / name)

    # bitmap_format="bmp" обязателен: по умолчанию Pillow пакует все размеры в
    # PNG, а Windows ждёт классический DIB для мелких. С PNG-элементами иконка
    # приложения не отрисовывается — ни в проводнике, ни в заголовке окна.
    master.save(OUT / "icon.ico", bitmap_format="bmp",
                sizes=[(16, 16), (24, 24), (32, 32), (48, 48),
                       (64, 64), (128, 128), (256, 256)])
    master.save(OUT / "tray-icon.ico", bitmap_format="bmp",
                sizes=[(16, 16), (24, 24), (32, 32), (48, 48)])

    write_icns(master, OUT / "AppIcon.icns")

    flat_mark(60, (255, 255, 255, 255)).save(OUT / "mac-tray-dark-x2.png")
    flat_mark(48, (0, 0, 0, 255)).save(OUT / "mac-tray-light-x2.png")

    wordmark(192).save(OUT / "logo.png")

    (OUT / "icon.svg").write_text(svg_mark(), encoding="utf-8")
    (OUT / "logo.svg").write_text(svg_mark(), encoding="utf-8")
    (OUT / "scalable.svg").write_text(svg_mark(), encoding="utf-8")

    # Android: сама иконка, круглая версия и передний план адаптивной иконки
    android = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for dpi, size in android.items():
        folder = OUT / "android" / f"mipmap-{dpi}"
        folder.mkdir(parents=True, exist_ok=True)
        master.resize((size, size), Image.LANCZOS).save(folder / "ic_launcher.png")

        round_icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        circle = Image.new("L", (size * SS, size * SS), 0)
        ImageDraw.Draw(circle).ellipse((0, 0, size * SS - 1, size * SS - 1), fill=255)
        round_icon.paste(master.resize((size, size), Image.LANCZOS), (0, 0),
                         circle.resize((size, size), Image.LANCZOS))
        round_icon.save(folder / "ic_launcher_round.png")

        # передний план адаптивной иконки: знак в безопасной зоне (66 %)
        fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        inner = round(size * 0.62)
        fg.alpha_composite(gradient_mark(inner),
                           ((size - inner) // 2, (size - inner) // 2))
        fg.save(folder / "ic_launcher_foreground.png")

    print("Готово. Файлы в", OUT)


if __name__ == "__main__":
    main()

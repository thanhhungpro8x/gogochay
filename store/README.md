# Hồ sơ nộp store: GoGoChay 1.0.0

| Store | File hướng dẫn | Phí | Xét duyệt |
|---|---|---|---|
| Chrome Web Store (Chrome, Edge, Brave, Vivaldi…) | [chrome-web-store.md](chrome-web-store.md) | 5 USD một lần | thường vài ngày |
| Firefox Add-ons (Firefox máy tính và Android) | [firefox-amo.md](firefox-amo.md) | miễn phí | vài ngày đến vài tuần |

## Ảnh (đã tạo sẵn trong `assets/out/`)
| File | Kích thước | Dùng cho |
|---|---|---|
| `icon-128.png` | 128×128 | icon trên store |
| `en/`, `vi/`, `fr/` › `1-tray.png` … `5-privacy.png` | 1280×800 | ảnh chụp (Chrome: mỗi ngôn ngữ một bộ; Firefox: bộ `en`) |
| `promo-small-440x280.png` | 440×280 | Chrome: small promo tile |
| `promo-marquee-1400x560.png` | 1400×560 | Chrome: marquee (tùy chọn) |

Ảnh được chụp từ **chính extension đang chạy** trên các trang demo giả lập (`assets/demo/`), không dùng trang hay thương hiệu thật. Muốn tạo lại sau khi sửa giao diện thì chạy:
```bash
npm run store:assets      # cần Chrome / Chrome for Testing (CHROME_PATH)
```

## Thứ tự nộp
1. `npm ci && npm test && npm run verify`
2. **Chrome:** `npm run package` → upload `dist/gogochay-chrome.zip`, rồi điền theo `chrome-web-store.md`.
3. **Firefox:** `npm run lint:firefox` → upload `dist/gogochay-firefox.zip`. Khi được hỏi có nộp mã nguồn không, chọn **Yes**: chạy `npm run package:source` rồi upload `dist/gogochay-source.zip`. Điền theo `firefox-amo.md`.
4. Mỗi lần ra bản mới: tăng `version` trong `extension/manifest.json` và `package.json`, rồi lặp lại các bước trên.

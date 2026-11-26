# Chrome Web Store: submission kit (GoGoChay 1.0.0)

Developer Dashboard: https://chrome.google.com/webstore/devconsole. One-time registration fee: 5 USD.

## 1. Package
```bash
npm ci && npm test && npm run verify
npm run package            # → dist/gogochay-chrome.zip  (upload this)
```

## 2. Store listing tab

| Field | Value |
|---|---|
| Name / summary | Come from `manifest.json` (`extName`, `extDescription` in `_locales/en`, `vi`, `fr`) |
| Category | **Privacy & Security** |
| Language | English (default), plus Vietnamese and French via "Localize" |
| Store icon (128x128) | `store/assets/out/icon-128.png` |
| Screenshots (1280x800, up to 5) | `store/assets/out/en/1-tray.png` … `5-privacy.png`. For each locale, upload `out/vi/*` and `out/fr/*` in "Localized screenshots". |
| Small promo tile (440x280) | `store/assets/out/promo-small-440x280.png` |
| Marquee (1400x560, optional) | `store/assets/out/promo-marquee-1400x560.png` |
| Homepage URL | https://github.com/thanhhungpro8x/gogochay |
| Support URL | https://github.com/thanhhungpro8x/gogochay/issues |

### Detailed description: English
```
GoGoChay blocks ads, shows you what it hid, and warns you when a web address only pretends to be a site you know. Everything runs on your device: no data is ever sent anywhere.

🚫 AD BLOCKING
• Blocks ad requests with EasyList, Liste FR (French sites) and ABPVN (Vietnamese sites). The browser does the blocking itself, so GoGoChay never sees your traffic.
• Hides banners, "Sponsored" blocks and empty ad placeholders as the page loads.
• Optional aggressive blocking (off by default) also hides boxes that look like ads on sites no list covers. It can be turned off per site.

🗂 THE TRAY
• Hidden ads are collected in a tray instead of vanishing: see where each one came from, and bring one back if a page breaks.
• "Hide an element…": click (or tap) anything the lists missed. It stays hidden on that site, and "Undo" removes it.
• Pause GoGoChay on any site with one switch. Open the tray in Chrome's side panel.

🛡 FAKE WEB ADDRESS WARNINGS
GoGoChay checks the address of the page you actually land on, even after a redirect from a social network, an e-mail or a chat.
• Red bar: the name mixes alphabets (e.g. a Cyrillic "а" in "pаypal.com"), uses rare letters that only look like a–z, or imitates a well-known site's name.
• Yellow note: the name contains characters outside a–z, and you are about to type a password or card number.
The bar highlights the suspicious letters and states the name of the site you are really on.
These warnings are automatic and based only on the characters of the address. They can be wrong: a warning does not prove a site is fraudulent, and no warning does not mean a site is safe. Keep your browser's own phishing protection on.

🔒 PRIVACY
• No network requests, no analytics, no remote code, no remote updates.
• Only your own settings are stored, locally.
• Open source (MIT): https://github.com/thanhhungpro8x/gogochay

Interface in English, Vietnamese and French, following your browser's language.
Brand names are used only for comparison; GoGoChay is not affiliated with their owners.
```

### Detailed description: Tiếng Việt
```
GoGoChay chặn quảng cáo, cho bạn xem nó đã ẩn những gì, và cảnh báo khi một địa chỉ trang chỉ đang giả làm một trang bạn quen. Mọi thứ chạy ngay trên máy bạn, không gửi dữ liệu đi đâu cả.

🚫 CHẶN QUẢNG CÁO
• Chặn request quảng cáo bằng EasyList, Liste FR (trang Pháp) và ABPVN (trang Việt). Việc chặn do chính trình duyệt làm, nên GoGoChay không bao giờ thấy dữ liệu duyệt web của bạn.
• Ẩn banner, khối "Sponsored" và ô giữ chỗ quảng cáo rỗng ngay khi trang tải.
• Chặn mạnh (tùy chọn, mặc định tắt): ẩn thêm các khung trông giống quảng cáo trên những trang chưa có danh sách nào nhắm tới. Tắt riêng được cho từng trang.

🗂 KHAY QUẢNG CÁO
• Quảng cáo bị ẩn được gom vào một khay chứ không biến mất: xem nguồn của từng cái, hiện lại nếu trang bị vỡ.
• "Ẩn thêm phần tử…": bấm (hoặc chạm) vào phần còn sót, nó sẽ được ẩn trên trang đó; bấm "Hoàn tác" để bỏ.
• Tạm tắt GoGoChay trên một trang chỉ với một công tắc. Mở khay ở Side Panel của Chrome.

🛡 CẢNH BÁO ĐỊA CHỈ GIẢ MẠO
GoGoChay kiểm tra địa chỉ của trang bạn thực sự vào, kể cả sau khi bị chuyển hướng từ mạng xã hội, email hay tin nhắn.
• Thanh đỏ: tên trộn nhiều bảng chữ cái (ví dụ chữ "а" Kirin trong "pаypal.com"), dùng chữ hiếm chỉ để trông giống a–z, hoặc nhái tên một trang quen.
• Nhắc vàng: tên có ký tự ngoài a–z và bạn sắp nhập mật khẩu hoặc số thẻ.
Thanh cảnh báo tô các chữ đáng ngờ và ghi rõ tên trang bạn đang truy cập.
Cảnh báo được đưa ra tự động, chỉ dựa trên ký tự trong địa chỉ. Cảnh báo có thể sai: có cảnh báo không chứng minh trang đó lừa đảo, và không có cảnh báo cũng không có nghĩa là trang an toàn. Hãy giữ bật tính năng chống lừa đảo của trình duyệt.

🔒 QUYỀN RIÊNG TƯ
• Không request mạng, không thống kê, không chạy code từ xa, không cập nhật từ xa.
• Chỉ lưu các cài đặt của bạn, ngay trên máy.
• Mã nguồn mở (MIT): https://github.com/thanhhungpro8x/gogochay

Giao diện tiếng Việt, tiếng Anh và tiếng Pháp, tự theo ngôn ngữ trình duyệt.
Tên các thương hiệu chỉ được dùng để so sánh; GoGoChay không liên kết với các thương hiệu đó.
```

### Detailed description: Français
```
GoGoChay bloque les publicités, vous montre ce qu'il a masqué et vous avertit quand une adresse web ne fait que se faire passer pour un site que vous connaissez. Tout fonctionne sur votre appareil : aucune donnée n'est envoyée nulle part.

🚫 BLOCAGE DES PUBS
• Bloque les requêtes publicitaires avec EasyList, Liste FR (sites français) et ABPVN (sites vietnamiens). C'est le navigateur qui bloque : GoGoChay ne voit jamais votre trafic.
• Masque bannières, blocs « Sponsorisé » et emplacements publicitaires vides dès le chargement.
• Blocage renforcé en option (désactivé par défaut) : masque aussi les blocs qui ressemblent à des pubs sur les sites qu'aucune liste ne couvre. Désactivable par site.

🗂 LE PLATEAU
• Les pubs masquées sont rangées dans un plateau au lieu de disparaître : voyez d'où vient chacune, réaffichez-en une si une page casse.
• « Masquer un élément… » : cliquez (ou touchez) ce que les listes ont manqué. Il reste masqué sur ce site ; « Annuler » le rétablit.
• Mettez GoGoChay en pause sur un site d'un seul geste. Ouvrez le plateau dans le panneau latéral de Chrome.

🛡 ALERTE FAUSSES ADRESSES
GoGoChay vérifie l'adresse de la page où vous arrivez réellement, même après une redirection depuis un réseau social, un e-mail ou une messagerie.
• Barre rouge : le nom mélange des alphabets (par exemple un « а » cyrillique dans « pаypal.com »), utilise des lettres rares qui imitent a–z, ou copie le nom d'un site connu.
• Rappel jaune : le nom contient des caractères hors a–z et vous allez saisir un mot de passe ou un numéro de carte.
La barre surligne les lettres suspectes et indique le site réellement consulté.
Ces alertes sont automatiques et ne se fondent que sur les caractères de l'adresse. Elles peuvent se tromper : une alerte ne prouve pas qu'un site est frauduleux, et l'absence d'alerte ne garantit pas qu'un site est sûr. Gardez la protection anti-hameçonnage de votre navigateur activée.

🔒 CONFIDENTIALITÉ
• Aucune requête réseau, aucune statistique, aucun code distant, aucune mise à jour à distance.
• Seuls vos réglages sont enregistrés, localement.
• Open source (MIT) : https://github.com/thanhhungpro8x/gogochay

Interface en français, anglais et vietnamien, selon la langue de votre navigateur.
Les noms de marques ne servent qu'à la comparaison ; GoGoChay n'est affilié à aucune d'elles.
```

## 3. Privacy practices tab

**Single purpose**
```
GoGoChay makes web pages safer and cleaner to read: it blocks and hides ads, lists what it hid in a tray, and warns when the page's web address imitates another site.
```

**Permission justifications**

| Permission | Justification to paste |
|---|---|
| `declarativeNetRequest` | Blocks ad requests with static rule lists bundled in the extension (EasyList, Liste FR, ABPVN). The browser applies the rules; the extension does not read requests. Also used to pause blocking on sites the user chooses. |
| `storage` | Stores the user's own settings locally: paused sites, elements the user chose to hide, interface language, aggressive mode, address-warning setting, trusted sites. |
| `activeTab` | Shows how many requests were blocked on the tab where the user opened the tray. |
| `sidePanel` | Lets the user open the tray in Chrome's side panel. |
| Host permission (content script on all http/https pages) | Needed to hide ad elements on every page, list them in the tray, let the user hide leftover elements, and check the page's address for lookalike characters. Nothing is sent anywhere; the script only talks to the extension's own tray. |

**Remote code:** "No, I am not using remote code."

**Data usage:** tick **none** of the data types. Then tick all three certifications (no selling, no unrelated use, no creditworthiness use).

**Privacy policy URL**
```
https://github.com/thanhhungpro8x/gogochay/blob/main/PRIVACY.md
```

## 4. Distribution
Free · Public · All regions.

## 5. Notes
* Review usually takes a few days. Broad host access (content script on all sites) can mean a longer review; the justifications above address it.
* Don't use rankings or claims ("best", "#1") in the listing: the store forbids claims that misrepresent the item's status.

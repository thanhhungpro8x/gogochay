# Ad Tray

**An open-source, privacy-first ad blocker for Chrome and Safari that collects hidden ads into a tray instead of throwing them away.**

![tray](docs/tray.png)

Ad Tray blocks ad requests and hides ad elements, then shows everything it hid on the page in a small tray (toolbar popup, or Chrome's side panel). From the tray, you can bring back any single ad if hiding it broke the page, or pause Ad Tray on that site.

*(Tiếng Việt bên dưới · Français plus bas)*

## Why another ad blocker?

Ad blockers see every page you visit, so you have to trust them. Ad Tray is built so you don't need to trust its author. You can check it yourself:

| What it does NOT do | How you can check |
|---|---|
| No network requests, ever. No telemetry, no analytics, no remote list updates. | CSP `connect-src 'self'` in `manifest.json`; `scripts/verify.mjs` fails the build on `fetch`/XHR/WebSocket/beacon |
| No remote or dynamic code (`eval`, remote scripts, `import()`). | CSP `script-src 'self'` + `verify.mjs` |
| No access to cookies, history, downloads, or request contents. | `permissions` in `manifest.json`, allow-listed in `verify.mjs` |
| Doesn't store which pages you visit. The only thing stored is the list of sites *you* paused. | `chrome.storage.local` key `paused`, nothing else |
| No hidden list changes. The filter data comes from EasyList at a pinned commit, and CI rebuilds it and fails if the committed files differ. | `lists.config.json`, `.github/workflows/build.yml` |

### Permissions, explained

| Permission | Why |
|---|---|
| `declarativeNetRequest` | Lets the **browser** block ad requests using a static rule list. The extension never sees the requests. |
| `storage` | Remembers the sites where you paused Ad Tray. |
| `activeTab` | Shows the "requests blocked" count for the tab you clicked on. No install warning. |
| `sidePanel` | Chrome only: lets the tray open in the side panel. |
| content script on `http(s)://*/*` | Needed to hide ad elements with CSS and list them in the tray. This is why the store shows "read and change data on websites". The script only answers the tray, and only when you open it. ([source](extension/content.js), ~170 lines) |

The whole extension is ~360 lines of hand-written JavaScript: [`background.js`](extension/background.js), [`content.js`](extension/content.js), [`tray/`](extension/tray). Everything else is generated data.

## Install (from source)

### Chrome / Edge / Brave
1. Download `ad-tray-chrome.zip` from Releases (or build it, see below) and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, then click **Load unpacked** and pick the `extension` folder.

### Safari (macOS)

**Without Xcode:** each push builds the Safari app on GitHub Actions.
1. Open the repo's **Actions** tab, then the latest *build* run, and download the **ad-tray-safari** artifact.
2. Unzip it, then:
   ```bash
   xattr -dr com.apple.quarantine "Ad Tray.app"   # it was downloaded, unsigned
   mv "Ad Tray.app" /Applications/ && open "/Applications/Ad Tray.app"
   ```
3. Safari › Settings › Advanced › tick *Show features for web developers*, then Safari › Settings › **Developer** › tick **Allow unsigned extensions** (Safari turns this off again each time it restarts).
4. Safari › Settings › **Extensions** › enable **Ad Tray** and set it to **Always Allow on Every Website**. Without this, Safari blocks requests but doesn't hide ads, and the tray stays empty.

**With Xcode:** `./scripts/build-safari.sh`, then open `safari/Ad Tray/Ad Tray.xcodeproj` and Run the *Ad Tray* scheme. Same steps 3–4 apply.

Requires Safari 17+. Safari has no side panel, so the tray opens as a popup only.

## Build & verify

```bash
npm install          # only dev dependency: puppeteer-core (for the e2e test)
npm test             # unit tests of the EasyList → DNR converter
npm run build:lists  # regenerate rules from the pinned EasyList commit
npm run verify       # security self-check (permissions, CSP, forbidden APIs)
npm run test:e2e     # loads the extension in Chrome against a local fake site
npm run package      # → dist/ad-tray-chrome.zip
npm run update:lists # pin the latest EasyList commit and regenerate
```

## How it works

```
EasyList (pinned commit) ──► scripts/convert.mjs ──► rules/easylist.json   (network blocking, done by the browser)
                                                 └─► data/cosmetic.js      (CSS selectors to hide)
```

* **Network**: ~48,000 EasyList filters become ~2,700 declarativeNetRequest rules (rules that differ only by domain are merged into one `requestDomains` list).
* **Cosmetic**: ~13,600 generic selectors + selectors for ~6,600 specific sites, injected as one stylesheet at `document_start` so ads never flash. Invalid selectors are found and dropped automatically.
* **Tray**: when you open it, the content script lists the outermost hidden elements (source host, size, text) as plain text. Nothing is rendered as HTML.
* Filters that can't be translated faithfully (regex, `$csp`, `$redirect`, procedural `:has-text()`, scriptlets) are **skipped, never guessed**.

## Limitations

* YouTube and other video ads served from first-party domains need scriptlets. Ad Tray doesn't run any scriptlets on purpose (no code injection), so it won't block these.
* Only EasyList is bundled. More lists (EasyPrivacy, regional lists) can be added in `lists.config.json`.
* List updates come with extension updates, not over the network. That's the point.

## Publishing

* **Chrome Web Store**: one-time $5 developer fee. Upload `dist/ad-tray-chrome.zip`. Point the "single purpose" field to ad blocking and the privacy fields to "does not collect data".
* **Safari / Mac App Store**: needs the Apple Developer Program. Archive the Xcode project made by `build-safari.sh`.

---

## Tiếng Việt

**Ad Tray** là extension chặn quảng cáo mã nguồn mở cho Chrome và Safari. Quảng cáo bị ẩn không biến mất luôn mà được **gom vào một khay**: bạn xem lại được, hiện lại từng cái nếu trang bị vỡ, hoặc tạm tắt trên một trang.

Bạn không cần tin tác giả, vì có thể tự kiểm tra:
* **Không gửi bất kỳ request mạng nào**, không telemetry, không tải danh sách từ xa (CSP `connect-src 'self'`).
* **Không chạy code từ xa**, không `eval`.
* **Không đọc cookie, lịch sử hay nội dung request.** Việc chặn request do chính trình duyệt làm theo danh sách luật tĩnh.
* **Dữ liệu chặn lấy từ EasyList ở một commit cố định.** CI build lại từ đầu và báo lỗi nếu file trong repo khác đi.
* `npm run verify` tự kiểm tra quyền, CSP và các API bị cấm trước mỗi lần đóng gói.

Cài trên Chrome: `chrome://extensions` → bật Developer mode → Load unpacked → chọn thư mục `extension`.
Cài trên Safari: chạy `./scripts/build-safari.sh` trên Mac có Xcode, rồi Run project.

## Français

**Ad Tray** est un bloqueur de publicités open source pour Chrome et Safari. Les pubs masquées sont **rangées dans un plateau** : vous pouvez les revoir, en réafficher une si la page casse, ou mettre un site en pause. Aucune requête réseau, aucun code distant, aucune collecte de données. Tout est vérifiable dans le code et par `npm run verify`.

## License

Code: [MIT](LICENSE) © 2026 Thanh-Hung DOAN. Bundled filter data: EasyList, CC BY-SA 3.0 / GPLv3. See [NOTICE](NOTICE).

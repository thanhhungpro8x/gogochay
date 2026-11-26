# Privacy policy — GoGoChay

GoGoChay does not collect, store, transmit or sell any personal data.

* The extension makes **no network requests**. Blocking is done by the browser itself from a rule list bundled in the extension.
* The only data stored (locally, in `chrome.storage.local`) is what **you** set: the websites where you paused GoGoChay, the elements you hid with "Hide an element…" (one CSS selector per site), the tray language, and whether aggressive blocking is on (plus the sites where you turned it off), whether fake-address warnings are on, and the addresses you chose to trust. It never leaves your device.
* The tray shows information about ads hidden on the current page (source host, size, text). This information stays in your browser and is discarded when the tray closes.

Source code: https://github.com/thanhhungpro8x/gogochay

* The fake-address check runs entirely in your browser: it looks at the address of the page you are on and compares it with a list built into the extension. No address is sent anywhere.

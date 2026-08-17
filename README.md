<p align="center">
  <img src="src/extension/public/icons/sideterm.png" width="128" alt="SideTerm logo">
</p>

<h1 align="center">SideTerm</h1>

<p align="center">
  A real terminal in your browser's resizable side panel.
</p>

SideTerm keeps a full terminal beside your normal browser tabs, so you can code with AI, run development tools, or monitor a process without covering the page you are using.

## Features

- A real macOS or Linux login shell powered by SideTerm Bridge
- Multiple terminal tabs with custom names
- Side-by-side or top-and-bottom terminal stacks
- Resizable using the browser's standard side-panel controls
- Tabs, names, layout, recent output, and running processes survive closing the side panel
- No access to webpage content or browsing history

## Install

1. [Add SideTerm from the Chrome Web Store](https://chromewebstore.google.com/detail/sideterm/iibepfapncodkkpognfeamilpdkoimbe).
2. Open SideTerm and choose **Install SideTerm Bridge**.
3. Install the downloaded macOS `.pkg`, Linux `.deb`, or Linux `.rpm`, then return to SideTerm and choose **Reconnect**.
4. Pin SideTerm to the toolbar for quick access.

SideTerm supports macOS and 64-bit Linux. [SideTerm Bridge](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) connects the browser side panel to your local shell.

On Debian, Ubuntu, and related distributions, install the downloaded package with `sudo apt install ./SideTermBridge-*.deb`. On Fedora and related distributions, use `sudo dnf install ./SideTermBridge-*.rpm`.

## Using SideTerm

- Click **+** to open another terminal.
- Click the **pencil** to rename a terminal.
- Click **expand** to keep a terminal visible in the stack.
- Choose the vertical or horizontal layout button to arrange stacked terminals.
- Click **×** to close a terminal. SideTerm always keeps at least one terminal available.

Each new terminal starts in your home folder using your configured login shell. Closing the side panel keeps its terminals running. Fully quitting the browser ends all terminal processes; the saved tabs and layout return with fresh shells the next time SideTerm opens.

## Privacy and security

SideTerm does not inject scripts into websites and does not request permission to read page content or browsing history. Terminal input and output stay between the extension and SideTerm Bridge on your computer. Programs you run inside the terminal retain their own network and privacy behavior.

## Troubleshooting

- **SideTerm Bridge not found:** install or reinstall SideTerm Bridge, then click **Reconnect**.
- **Disconnected:** click **Reconnect**. If it disconnects again, reinstall SideTerm Bridge.
- **Shell exited:** click the restart icon on that terminal tab, or close it and create another terminal.

## Development

Requirements: macOS or Linux, Node.js 20.19 or newer, npm, and the platform's native build tools.

```bash
git clone https://github.com/ryanonmars/sideterm.git
cd sideterm
npm install
npm run install:dev
```

The development installer builds SideTerm, registers the native helper, and prints the unpacked extension directory. Load that directory from `chrome://extensions` or `brave://extensions` with Developer mode enabled.

```bash
npm test          # Run the test suite
npm run typecheck # Check TypeScript
npm run build     # Build the extension and native helper
```

Linux `.deb` and `.rpm` packages are built on Linux with `npm run package:linux`. The GitHub release workflow builds and attaches both formats automatically.

## Support

Report bugs or request features through [GitHub Issues](https://github.com/ryanonmars/sideterm/issues).

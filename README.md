# Obsidian Workbench Plugin

A plugin for Obsidian that enhances your workflow between Obsidian and browser-based AI applications like ComfyUI.

## Purpose

Workbench bridges the gap between your Obsidian vault and web-based AI tools, allowing for seamless interaction with your files directly from Obsidian. This plugin is designed to streamline your workflow when working with ComfyUI by eliminating manual file exports and imports, and enabling direct workflow execution.

## Key Features

- **ComfyUI Connection**: Connects to a running ComfyUI instance via its API.
    - Status bar indicator shows connection status (Offline, Connecting, Ready, Busy, Error).
    - Click the status bar item to attempt connection/reconnection.
- **Workflow Execution**: Run ComfyUI workflows directly from Obsidian.
    - Right-click on a `.json` workflow file in the Obsidian file explorer and select "Run ComfyUI Workflow".
- **API Integration**: Configure the connection to your ComfyUI API endpoint.
- **Polling**: Optionally polls the ComfyUI server to keep the status up-to-date.
- **Launch Helpers (Optional)**: Commands to attempt launching ComfyUI (requires configuration).

## Installation

1.  **Install the Plugin:**
    *   **Manual:** Download `main.js`, `manifest.json`, and `styles.css` from the latest release and place them in your vault's `.obsidian/plugins/Workbench-Plugin/` folder.
    *   **BRAT (Recommended for updates):** Install the BRAT community plugin, add the beta repository `YourGitHubUsername/YourRepoName`, and install "Workbench" through BRAT.
2.  **Enable the Plugin:** In Obsidian, go to Settings → Community Plugins, find "Workbench", and toggle it on.
3.  **Configure ComfyUI for CORS:** **This is crucial for the plugin to communicate with ComfyUI.**
    *   **If using ComfyUI Desktop:**
        1.  Go to the Server Config settings within ComfyUI Desktop.
        2.  Find the "Enable CORS header" option.
        3.  Set it to allow the Obsidian origin. You can either use `*` (allows all origins, less secure) or specify `app://obsidian.md`.
        4.  Restart ComfyUI Desktop.
    *   **If running ComfyUI via `python main.py`:**
        1.  Stop the ComfyUI server if it's running.
        2.  Restart it using the `--enable-cors` flag:
            ```bash
            python main.py --enable-cors
            ```
        3.  Alternatively, if that flag doesn't work or you need more specific control, look for flags like `--cors-allowed-origins` in your ComfyUI version and use:
            ```bash
            python main.py --cors-allowed-origins "app://obsidian.md"
            ```

## Configuration

1.  Open Obsidian Settings → Workbench.
2.  **ComfyUI API URL:** Enter the full URL of your running ComfyUI instance (e.g., `http://localhost:8188` or `http://127.0.0.1:8188`). The default ComfyUI port is often `8188`.
3.  **Enable Polling:** Check this box if you want the plugin to periodically check the ComfyUI status (Ready/Busy). Recommended.
4.  **(Optional) Launch Configuration:** Configure paths if you want to use the commands to *attempt* launching ComfyUI (experimental).

## Usage Examples

- **Check Connection:** Look at the status bar item in Obsidian to see if the plugin is connected to ComfyUI.
- **Run Workflow:** Right-click on a ComfyUI workflow `.json` file in the Obsidian file explorer and select "Run ComfyUI Workflow". A notice will appear, and the status bar will update to 'Busy' while running.

## Future Plans

- Send images/text from Obsidian notes to ComfyUI nodes.
- Receive generated images/data back into Obsidian notes.
- More robust error handling and feedback.
- Workflow templates and presets.

## Contributing

This plugin is in active development. Contributions, suggestions, and feedback are welcome! Please check the GitHub repository for contribution guidelines.

## Support

If you encounter any issues or have questions, please open an issue on the GitHub repository.

---

*Workbench: Bringing your AI workflows and knowledge base together*
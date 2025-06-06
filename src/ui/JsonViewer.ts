import { TextFileView, WorkspaceLeaf, MarkdownRenderer, App } from 'obsidian'; // Import App
import { JSON_CUSTOM_ICON_NAME } from './icons'; // Import icon name
import { JSON_VIEW_TYPE } from '../types/ui';

export class JsonView extends TextFileView {
    app: App; // Add app property

    constructor(app: App, leaf: WorkspaceLeaf) { // Add app to constructor
        super(leaf);
        this.app = app; // Store app instance
        console.log("JsonView: Constructor called");
    }

    getViewType(): string {
        return JSON_VIEW_TYPE;
    }

    // Add the getIcon method
    getIcon(): string {
        return JSON_CUSTOM_ICON_NAME; // Use imported constant
    }

    getDisplayText(): string {
        const name = this.file?.name ?? 'JSON File';
        // console.log(`JsonView: getDisplayText called, returning: ${name}`);
        return name;
    }

    getViewData(): string {
        // console.log("JsonView: getViewData called");
        return this.data;
    }

    setViewData(data: string, clear: boolean): void {
        console.log("JsonView: setViewData called", { dataLength: data?.length, clear, hasExistingData: !!this.data });
        // Note: TextFileView automatically sets `this.data = data` before calling this method.

        // Always clear the container first if requested or if rendering new data
        if (clear) {
            this.contentEl.empty();
        }

        // Render if data is provided (relying on `this.data` set by the base class),
        // regardless of the 'clear' flag's original intent.
        if (this.data && this.data.length > 0) {
             console.log("JsonView: Proceeding to render because this.data exists.");
             // Make the call async
             this.renderJson().then(() => {
                 console.log("JsonView: Asynchronous render completed.");
             }).catch(error => {
                 console.error("JsonView: Error during asynchronous render:", error);
                 // Handle potential errors during async rendering if needed
             });
        } else if (!clear) {
             // If clear was false but there's no data, clear the view.
             console.warn("JsonView: setViewData called with clear=false but no data is available. Clearing view.");
             this.contentEl.empty();
        } else {
             console.log("JsonView: setViewData called with clear=true and no data. View cleared.");
             // contentEl was already cleared if clear was true.
        }
    }

    clear(): void {
        console.log("JsonView: clear called");
        this.contentEl.empty();
        // this.data = ''; // Base class handles clearing data
    }

    // Make renderJson async
    async renderJson(): Promise<void> {
        console.log("JsonView: renderJson called. Data length:", this.data?.length);
        this.contentEl.empty(); // Clear previous content
        // Add Obsidian class for potentially better integration
        this.contentEl.addClasses(['json-view-container', 'markdown-rendered']);
        console.log("JsonView: Render container prepared.");

        if (!this.data) {
            console.warn("JsonView: No data available to render.");
            this.contentEl.createEl('div', { text: 'No data loaded for this file.', cls: 'json-view-error' });
            return;
        }

        try {
            console.log("JsonView: Attempting to parse JSON...");
            const parsedJson = JSON.parse(this.data);
            const formattedJson = JSON.stringify(parsedJson, null, 2); // Pretty print
            console.log("JsonView: JSON parsed and formatted successfully.");

            const markdown = '```json\n' + formattedJson + '\n```';

            // Await the rendering
            await MarkdownRenderer.render(this.app, markdown, this.contentEl, this.file?.path ?? '', this);
            console.log("JsonView: Rendered formatted JSON using MarkdownRenderer.render.");

        } catch (error) {
            console.error("JsonView: Error parsing or rendering JSON:", error);
            // Display error message
            this.contentEl.createEl('div', {
                text: `Error parsing JSON: ${error instanceof Error ? error.message : String(error)}`,
                cls: 'json-view-error'
            });
            // Display raw data in a standard pre/code block as fallback
            const pre = this.contentEl.createEl('pre');
            pre.createEl('code', { text: this.data });
            console.log("JsonView: Rendered raw JSON due to parsing error.");
        }
    }

    async onOpen() {
        console.log("JsonView: onOpen called");
        // TextFileView handles loading and calling setViewData. Usually no action needed here.
        // await super.onOpen(); // Call if base class has logic
    }

    async onClose() {
        console.log("JsonView: onClose called");
        this.clear();
        // await super.onClose(); // Call if base class has logic
    }

    // Read-only: No save method implemented
}

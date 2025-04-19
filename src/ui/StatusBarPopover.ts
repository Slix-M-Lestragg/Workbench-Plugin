import { App, Setting, ButtonComponent } from 'obsidian';
import type Workbench from '../main';
import type { ComfyStatus, SystemStats, QueueInfo } from '../comfy/types';
import { createPopper, Instance as PopperInstance, Placement } from '@popperjs/core'; // Import Popper.js

let popoverEl: HTMLElement | null = null;
let refreshIntervalId: number | null = null;
let outsideClickListener: ((event: MouseEvent) => void) | null = null;
let popperInstance: PopperInstance | null = null; // Variable to hold the Popper instance

/**
 * Removes the existing status popover if it exists.
 */
function removeStatusPopover() {
    if (popperInstance) {
        popperInstance.destroy(); // Destroy the Popper instance
        popperInstance = null;
    }
    if (popoverEl) {
        popoverEl.remove();
        popoverEl = null;
    }
    if (refreshIntervalId) {
        window.clearInterval(refreshIntervalId);
        refreshIntervalId = null;
    }
    if (outsideClickListener) {
        document.body.removeEventListener('click', outsideClickListener, true); // Use capture phase
        outsideClickListener = null;
    }
}

/**
 * Creates and shows the status popover.
 * @param plugin The Workbench plugin instance.
 * @param clickEvent The mouse event that triggered the popover (used for stopPropagation).
 * @param anchorElement Optional: The element to position relative to (e.g., status bar item).
 */
export function showStatusPopover(plugin: Workbench, clickEvent: MouseEvent, anchorElement?: HTMLElement) {
    // Remove any existing popover first
    removeStatusPopover();

    // Prevent the click that opened the popover from immediately closing it
    clickEvent.stopPropagation();

    popoverEl = document.createElement('div');
    popoverEl.addClasses(['wb-status-popover', 'menu']); // Use 'menu' class for basic styling
    // Apply fixed position early for Popper.js
    popoverEl.style.position = 'fixed';
    popoverEl.style.zIndex = 'var(--layer-menu)'; // Ensure z-index is set
    document.body.appendChild(popoverEl);

    // Initial rendering (needed to calculate size for Popper)
    renderPopoverContent(popoverEl, plugin);

    // --- Popper.js Positioning --- 
    if (anchorElement && popoverEl) {
        popperInstance = createPopper(anchorElement, popoverEl, {
            placement: 'top-end', // Position above and aligned to the right of the anchor
            modifiers: [
                {
                    name: 'offset',
                    options: {
                        offset: [0, 8], // Offset slightly away from the anchor (adjust as needed)
                    },
                },
                {
                    name: 'preventOverflow', // Keep it on screen
                    options: {
                        padding: 5, // Padding from window edges
                    },
                },
            ],
        });
    } else {
        // Fallback positioning if no anchor (e.g., top-right corner)
        if (popoverEl) {
            popoverEl.style.top = '5px';
            popoverEl.style.right = '5px';
            popoverEl.style.left = 'auto'; // Ensure left is not set
        }
        console.warn("Status popover anchor element not provided, using fallback position.");
    }

    // Set up refresh interval
    refreshIntervalId = window.setInterval(() => {
        if (popoverEl) { // Only render if popover still exists
            renderPopoverContent(popoverEl, plugin);
            // Update Popper position if content changes size (optional, might cause flicker)
            // popperInstance?.update();
        }
    }, 5000); // Refresh every 5 seconds

    // Add listener to close when clicking outside
    outsideClickListener = (event: MouseEvent) => {
        if (popoverEl && !popoverEl.contains(event.target as Node) && anchorElement && !anchorElement.contains(event.target as Node)) {
            // Close only if click is outside popover AND outside the original anchor
            removeStatusPopover();
        }
    };
    // Use capture phase to catch clicks before they are stopped by other elements
    document.body.addEventListener('click', outsideClickListener, true);
}

/**
 * Renders the content inside the popover element.
 * @param containerEl The popover HTML element.
 * @param plugin The Workbench plugin instance.
 */
async function renderPopoverContent(containerEl: HTMLElement, plugin: Workbench) {
    const currentStatus = plugin.currentComfyStatus;
    containerEl.empty(); // Clear previous content for refresh

    // --- Header Row ---
    const headerRow = containerEl.createDiv({ cls: 'wb-popover-row wb-popover-header' });
    headerRow.createEl('span', { text: 'ComfyUI:', cls: 'wb-popover-title-label' });
    const statusTextEl = headerRow.createEl('span', { text: currentStatus, cls: 'wb-popover-status-text' });
    statusTextEl.addClass(`wb-status-${currentStatus.toLowerCase()}`); // Add class for status-specific styling

    // Add connection button if disconnected
    if (currentStatus === 'Disconnected') {
        const buttonContainer = headerRow.createDiv({ cls: 'wb-popover-header-button' }); // Container for button
        // Capture the button instance
        const checkButton = new ButtonComponent(buttonContainer)
            .setButtonText('Check')
            .setCta()
            .setTooltip('Check Connection');

        // Use the button instance in the onClick handler
        checkButton.onClick(async () => {
            checkButton.setDisabled(true); // Use the component instance
            checkButton.setButtonText('...'); // Use the component instance
            await plugin.checkComfyConnection();
            // Re-render content immediately after check
            // Ensure popoverEl still exists before rendering
            if (popoverEl) {
                 renderPopoverContent(popoverEl, plugin);
            }
        });
    }

    // --- Progress Bar (if running) ---
    console.log('Current plugin state:', plugin);
    const progressValue = plugin.currentProgressValue;
    const progressMax = plugin.currentProgressMax;
    const runningPromptId = plugin.currentRunningPromptId;

    if (runningPromptId && progressValue !== null && progressMax !== null && progressMax > 0) {
        const progressContainer = containerEl.createDiv({ cls: 'wb-popover-section wb-progress-section' });
        const progressRow = progressContainer.createDiv({ cls: 'wb-popover-row' });
        progressRow.createSpan({ cls: 'wb-stat-label', text: `Run #${runningPromptId}:` }); // Show prompt ID

        const progressBarEl = progressRow.createEl('progress', { cls: 'wb-progress-bar' });
        progressBarEl.value = progressValue;
        progressBarEl.max = progressMax;

        const progressText = progressRow.createSpan({ cls: 'wb-stat-value wb-progress-text' });
        progressText.textContent = `${progressValue} / ${progressMax}`;
    }


    // --- System Stats ---
    const statsContainer = containerEl.createDiv({ cls: 'wb-popover-section wb-stats-section' });
    const statsLoadingEl = statsContainer.createEl('div', { text: 'Loading Stats...', cls: 'wb-loading-text' });

    try {
        const stats: SystemStats | null = await plugin.getSystemStats();
        statsLoadingEl.remove();

        if (stats) {
            // CPU & RAM Row
            const cpuRamRow = statsContainer.createDiv({ cls: 'wb-popover-row' });
            cpuRamRow.createSpan({ cls: 'wb-stat-label', text: 'CPU:' });
            const cpuText = `${stats.cpu_utilization?.toFixed(0) ?? 'N/A'}%`;
            cpuRamRow.createSpan({ cls: 'wb-stat-value', text: cpuText });
            cpuRamRow.createSpan({ cls: 'wb-stat-spacer' }); // Add spacer
            cpuRamRow.createSpan({ cls: 'wb-stat-label', text: 'RAM:' });
            cpuRamRow.createSpan({ cls: 'wb-stat-value', text: `${stats.ram_utilization?.toFixed(0) ?? 'N/A'}%` });

            // GPU Info
            if (stats.gpus && stats.gpus.length > 0) {
                // The check above ensures stats.gpus is valid here
                const showGpuIndex = stats.gpus.length > 1;
                stats.gpus.forEach((gpu, index) => {
                    const gpuRow = statsContainer.createDiv({ cls: 'wb-popover-row wb-gpu-row' });
                    // Determine label text outside createSpan
                    const gpuLabelText = `GPU${showGpuIndex ? index : ''}:`;
                    gpuRow.createSpan({ cls: 'wb-stat-label', text: gpuLabelText });
                    gpuRow.createSpan({ cls: 'wb-stat-value', text: `${gpu.gpu_utilization?.toFixed(0) ?? 'N/A'}%` });
                    gpuRow.createSpan({ cls: 'wb-stat-spacer' });
                    gpuRow.createSpan({ cls: 'wb-stat-label', text: 'VRAM:' });
                    // More compact VRAM display
                    const vramUsedGB = (gpu.vram_used / (1024 ** 3)).toFixed(1);
                    const vramTotalGB = (gpu.vram_total / (1024 ** 3)).toFixed(1);
                    gpuRow.createSpan({ cls: 'wb-stat-value', text: `${vramUsedGB}/${vramTotalGB}G` });
                    // Optionally add GPU name as tooltip or smaller text if needed
                    gpuRow.title = gpu.name;
                });
            } else {
                 statsContainer.createEl('p', { text: 'No GPU stats.', cls: 'wb-muted-text' });
            }
        } else {
            statsContainer.createEl('p', { text: 'Could not fetch stats.', cls: 'wb-error-text' });
        }
    } catch (error) {
        console.error("Error rendering system stats:", error);
        statsLoadingEl.remove();
        statsContainer.createEl('p', { text: 'Error loading stats.', cls: 'wb-error-text' });
    }

    // --- Queue Info ---
    // Fetch queue info regardless of status to show pending items even if Ready
    const queueContainer = containerEl.createDiv({ cls: 'wb-popover-section wb-queue-section' });
    const queueLoadingEl = queueContainer.createEl('div', { text: 'Loading Queue...', cls: 'wb-loading-text' });
    let queueInfo: QueueInfo | null = null;
    let queueError = false;

    try {
        queueInfo = await plugin.getQueueInfo();
        queueLoadingEl.remove();
    } catch (error) {
        console.error("Error rendering queue info:", error);
        queueLoadingEl.remove();
        queueContainer.createEl('p', { text: 'Error loading queue info.', cls: 'wb-error-text' });
        queueError = true;
    }

    if (!queueError && queueInfo) {
        const runningCount = queueInfo.queue_running.length;
        const pendingCount = queueInfo.queue_pending.length;
        const totalRemaining = runningCount + pendingCount;

        // Only show queue section if there's something pending OR if status is Busy and no progress bar shown
        const showQueueSection = pendingCount > 0 || (currentStatus === 'Busy' && !runningPromptId);

        if (showQueueSection) {
            const queueRow = queueContainer.createDiv({ cls: 'wb-popover-row' });
            queueRow.createSpan({ cls: 'wb-stat-label', text: 'Queue:' });
            queueRow.createSpan({ cls: 'wb-stat-value', text: `${totalRemaining}` });

            // Show running item details only if progress bar isn't already showing it
            if (runningCount > 0 && !runningPromptId) {
                const runningItem = queueInfo.queue_running[0];
                queueRow.createSpan({ cls: 'wb-stat-spacer' });
                queueRow.createSpan({ cls: 'wb-stat-label', text: 'Run:' });
                queueRow.createSpan({ cls: 'wb-stat-value wb-prompt-id', text: `#${runningItem?.[1] ?? '?'}` });
                queueRow.title = `Running Prompt ${runningItem?.[1] ?? 'N/A'}`; // Tooltip for full info
            } else if (pendingCount > 0) {
                 queueRow.createSpan({ cls: 'wb-muted-text', text: ` (Pending: ${pendingCount})` });
            } else if (currentStatus === 'Busy' && !runningPromptId) {
                 // Show finishing state if busy but no specific progress tracked
                 queueRow.createSpan({ cls: 'wb-muted-text', text: ` (Finishing...)` });
            }
        } else {
             // If queue is empty and status is not Busy, hide the section
             queueContainer.remove();
        }

    } else if (!queueError) {
        // If no error but queueInfo is null/empty, hide the section
        queueContainer.remove();
    } else {
        // If there was an error fetching queue info, ensure the container shows the error
        // The error message is already added inside the catch block, so just ensure container isn't removed
    }
}

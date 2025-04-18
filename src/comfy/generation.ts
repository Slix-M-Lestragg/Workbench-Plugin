import { ComfyApi, PromptBuilder, CallWrapper, NodeProgress, NodeData } from '@saintno/comfyui-sdk';
import type Workbench from '../main';
import { updateStatusBar } from '../ui/status_bar';
import { Notice } from 'obsidian';

// Define a type for the workflow structure for better type safety
// This matches the structure observed in ComfyUI API/JSON files
type ComfyWorkflow = NodeData; // NodeData from the SDK seems appropriate

// Define Output names we'll try to map
type WorkflowOutputs = 'image_output'; // We'll map the first SaveImage node to this

export async function runWorkflow(pluginInstance: Workbench, workflowData: ComfyWorkflow) {
    if (!pluginInstance.comfyApi || (pluginInstance.currentComfyStatus !== 'Ready' && pluginInstance.currentComfyStatus !== 'Busy')) {
        new Notice('ComfyUI is not connected or ready.');
        console.error('Attempted workflow execution while ComfyUI not ready.');
        updateStatusBar(pluginInstance, pluginInstance.currentComfyStatus, `ComfyUI not ready`); // Update status bar too
        return;
    }

    // --- Find the first SaveImage node to designate as output ---
    let outputNodeId: string | null = null;
    let outputKey: WorkflowOutputs | null = null;
    for (const nodeId in workflowData) {
        if (workflowData[nodeId]?.class_type === 'SaveImage') {
            outputNodeId = nodeId;
            outputKey = 'image_output';
            console.log(`Identified output node (SaveImage): ${outputNodeId}`);
            break; // Use the first one found
        }
    }

    const outputKeysArray: WorkflowOutputs[] = outputKey ? [outputKey] : [];
    // --- ---

    try {
        // 1. Create PromptBuilder
        // We pass the loaded workflow directly.
        // Input keys are empty [] as we assume the workflow is self-contained for now.
        // Output keys array contains 'image_output' if a SaveImage node was found.
        const builder = new PromptBuilder<string, WorkflowOutputs, ComfyWorkflow>(
            workflowData,
            [], // No dynamic inputs defined here
            outputKeysArray
        );

        // Map the identified output node ID to the 'image_output' key if found
        if (outputKey && outputNodeId) {
             // Use setRawOutputNode as node IDs are strings from the JSON keys
            builder.setRawOutputNode(outputKey, outputNodeId);
        } else {
            console.warn("No 'SaveImage' node found in the workflow. Output callbacks might not be specific.");
        }

        // The 'finalWorkflow' is just the builder instance itself in this case,
        // as we didn't call .input() to modify it.
        const finalWorkflow = builder;

        // 2. Create CallWrapper
        const runner = new CallWrapper(pluginInstance.comfyApi, finalWorkflow);

        let jobStartTime: number | null = null;

        // 3. Attach Callbacks
        runner.onPending((promptId) => {
            console.log(`Workflow queued with ID: ${promptId}`);
            updateStatusBar(pluginInstance, 'Busy', `Queued (ID: ${promptId?.substring(0, 8)}...)`);
        });

        runner.onStart((promptId) => {
            jobStartTime = Date.now();
            console.log(`Workflow started with ID: ${promptId}`);
            updateStatusBar(pluginInstance, 'Busy', `Running (ID: ${promptId?.substring(0, 8)}...)`);
        });

        runner.onProgress((info: NodeProgress, promptId) => {
            // console.log(`Progress (Prompt ${promptId}): Node ${info.node}, Step ${info.value}/${info.max}`);
            const progressPercent = info.max > 0 ? Math.round((info.value / info.max) * 100) : 0;
            const nodeTitle = workflowData[info.node]?._meta?.title || `Node ${info.node}`;
            updateStatusBar(pluginInstance, 'Busy', `Running: ${nodeTitle} ${info.value}/${info.max} (${progressPercent}%)`);
        });

        runner.onPreview((blob, promptId) => {
            console.log(`Preview received (Prompt ${promptId}): ${blob.size} bytes`);
            // TODO: Optionally display the preview blob in Obsidian UI
        });

        runner.onOutput((key, data, promptId) => {
             console.log(`Output received for key '${key}' (Prompt ${promptId}):`, data);
             if (key === 'image_output' && data?.images) {
                 // Handle the final image data from the SaveImage node
                 const imageName = data.images[0]?.filename;
                 if (imageName) {
                     new Notice(`Image generated: ${imageName}`);
                     // TODO: Potentially fetch the image using comfyApi.getImage() or construct URL
                     // and display/link it in Obsidian.
                 }
             }
        });

        runner.onFinished((finalOutputs, promptId) => {
            const duration = jobStartTime ? ((Date.now() - jobStartTime) / 1000).toFixed(1) : 'N/A';
            console.log(`Workflow finished (Prompt ${promptId}):`, finalOutputs);
            updateStatusBar(pluginInstance, 'Ready', `Workflow complete (${duration}s). Ready.`);
            // finalOutputs will contain { image_output: data } if mapping worked
            if (finalOutputs.image_output) {
                 console.log("Final output data:", finalOutputs.image_output);
            }
        });

        runner.onFailed((error, promptId) => {
            const duration = jobStartTime ? ((Date.now() - jobStartTime) / 1000).toFixed(1) : 'N/A';
            console.error(`Workflow failed (Prompt ${promptId}):`, error);
            new Notice(`Workflow failed: ${error.message}`);
            updateStatusBar(pluginInstance, 'Error', `Workflow failed (${duration}s): ${error.message}`);
        });

        // 4. Run the workflow
        console.log("Starting workflow execution...");
        new Notice('Starting ComfyUI workflow...');
        await runner.run();
        console.log("runner.run() promise resolved (workflow finished or failed).");

    } catch (error) {
        console.error("Error setting up or running workflow:", error);
        new Notice(`Error during workflow setup: ${error instanceof Error ? error.message : String(error)}`);
        updateStatusBar(pluginInstance, 'Error', 'Workflow setup error.');
    }
}
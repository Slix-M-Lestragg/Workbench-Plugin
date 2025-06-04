// Test script to verify HuggingFace search functionality
// Run this in the browser console when the plugin is loaded

async function testHuggingFaceSearch() {
    console.log('Testing HuggingFace Search Integration...');
    
    try {
        // Check if the ModelListView is properly registered
        const plugin = app.plugins.plugins['workbench-plugin'];
        if (!plugin) {
            console.error('Workbench plugin not found');
            return;
        }
        
        console.log('✓ Plugin found:', plugin);
        
        // Check if ModelListView type is registered
        const viewRegistry = app.viewRegistry;
        const hasModelView = viewRegistry.getViewCreator('comfyui-model-list-view');
        
        if (hasModelView) {
            console.log('✓ ModelListView type registered');
        } else {
            console.error('✗ ModelListView type not registered');
            return;
        }
        
        // Test opening the ModelListView
        const leaf = app.workspace.getLeaf(true);
        await leaf.setViewState({
            type: 'comfyui-model-list-view',
            active: true
        });
        
        console.log('✓ ModelListView opened successfully');
        
        // Check for HuggingFace search button
        setTimeout(() => {
            const searchButton = document.querySelector('.wb-search-hf-btn');
            if (searchButton) {
                console.log('✓ HuggingFace search button found');
                
                // Test clicking the search button
                searchButton.click();
                
                setTimeout(() => {
                    const modal = document.querySelector('.wb-hf-search-modal');
                    if (modal) {
                        console.log('✓ HuggingFace search modal opened');
                        
                        // Check for search input
                        const searchInput = modal.querySelector('.wb-search-input');
                        if (searchInput) {
                            console.log('✓ Search input found');
                        } else {
                            console.error('✗ Search input not found');
                        }
                        
                        // Close the modal
                        const closeBtn = modal.querySelector('.modal-close-button') || 
                                       document.querySelector('.modal-bg');
                        if (closeBtn) {
                            closeBtn.click();
                        }
                    } else {
                        console.error('✗ HuggingFace search modal not found');
                    }
                }, 100);
            } else {
                console.error('✗ HuggingFace search button not found');
            }
        }, 1000);
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Auto-run test if this script is loaded
if (typeof app !== 'undefined') {
    testHuggingFaceSearch();
} else {
    console.log('Test script loaded. Run testHuggingFaceSearch() in console when Obsidian is ready.');
}

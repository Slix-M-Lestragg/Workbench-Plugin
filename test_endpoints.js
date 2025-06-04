// Test different HuggingFace API endpoints to find the correct one
console.log('Testing HuggingFace API endpoints...');

// Test different possible endpoints
const endpoints = [
    'https://huggingface.co/api/models',
    'https://api-inference.huggingface.co/models', 
    'https://hub-api.huggingface.co/api/models',
    'https://huggingface.co/models',
    'https://huggingface.co/api/v2/models'
];

async function testEndpoint(url) {
    try {
        const response = await fetch(url + '?limit=1');
        console.log(`✅ ${url} - Status: ${response.status}`);
        if (response.ok) {
            const data = await response.json();
            console.log(`   Response type: ${Array.isArray(data) ? 'array' : typeof data}`);
            console.log(`   Sample data:`, JSON.stringify(data).substring(0, 100) + '...');
        }
        return response.ok;
    } catch (error) {
        console.log(`❌ ${url} - Error: ${error.message}`);
        return false;
    }
}

async function runTests() {
    for (const endpoint of endpoints) {
        await testEndpoint(endpoint);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
    }
}

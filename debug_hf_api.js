// Debug script to test HuggingFace API directly
const https = require('https');
const { URL } = require('url');

async function testHuggingFaceAPI() {
    console.log('🔍 Testing HuggingFace API endpoints...');
    
    // Test 1: Basic models endpoint without parameters
    try {
        console.log('\n1. Testing basic /models endpoint...');
        const url1 = 'https://huggingface.co/api/models?limit=5';
        const response1 = await makeRequest(url1);
        console.log('✅ Basic models endpoint works!');
        console.log('Sample response:', JSON.stringify(response1.slice(0, 1), null, 2));
    } catch (error) {
        console.log('❌ Basic models endpoint failed:', error.message);
    }
    
    // Test 2: Search with query parameter
    try {
        console.log('\n2. Testing search with search parameter...');
        const url2 = 'https://huggingface.co/api/models?search=stable-diffusion&limit=5';
        const response2 = await makeRequest(url2);
        console.log('✅ Search parameter works!');
        console.log('Found models:', response2.length);
    } catch (error) {
        console.log('❌ Search parameter failed:', error.message);
    }
    
    // Test 3: Different parameter combinations
    try {
        console.log('\n3. Testing different parameter combinations...');
        const url3 = 'https://huggingface.co/api/models?filter=text-to-image&limit=5';
        const response3 = await makeRequest(url3);
        console.log('✅ Filter parameter works!');
        console.log('Found models:', response3.length);
    } catch (error) {
        console.log('❌ Filter parameter failed:', error.message);
    }
    
    // Test 4: Sort parameters
    try {
        console.log('\n4. Testing sort parameters...');
        const url4 = 'https://huggingface.co/api/models?sort=downloads&direction=-1&limit=5';
        const response4 = await makeRequest(url4);
        console.log('✅ Sort parameters work!');
        console.log('Found models:', response4.length);
    } catch (error) {
        console.log('❌ Sort parameters failed:', error.message);
    }
    
    // Test 5: Combined parameters that might be causing 400
    try {
        console.log('\n5. Testing problematic parameter combination...');
        const url5 = 'https://huggingface.co/api/models?search=test&limit=10&sort=downloads&direction=-1';
        const response5 = await makeRequest(url5);
        console.log('✅ Combined parameters work!');
        console.log('Found models:', response5.length);
    } catch (error) {
        console.log('❌ Combined parameters failed:', error.message);
        console.log('This might be the source of our 400 error!');
    }
}

function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Obsidian-Workbench-Plugin/1.0.0'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch (parseError) {
                        reject(new Error(`Parse error: ${parseError.message}`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.end();
    });
}

// Run the test
testHuggingFaceAPI().catch(console.error);

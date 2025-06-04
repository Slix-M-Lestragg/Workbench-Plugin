// Simple HuggingFace API test
console.log('Testing HuggingFace API...');

fetch('https://huggingface.co/api/models?limit=5')
  .then(response => {
    console.log('Status:', response.status);
    if (response.ok) {
      return response.json();
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  })
  .then(data => {
    console.log('✅ Success! Found', data.length, 'models');
    console.log('First model:', data[0]?.id || 'No models');
  })
  .catch(error => {
    console.log('❌ Error:', error.message);
  });

// Test with search parameter
setTimeout(() => {
  console.log('\nTesting with search parameter...');
  fetch('https://huggingface.co/api/models?search=stable-diffusion&limit=5')
    .then(response => {
      console.log('Status:', response.status);
      if (response.ok) {
        return response.json();
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    })
    .then(data => {
      console.log('✅ Search success! Found', data.length, 'models');
    })
    .catch(error => {
      console.log('❌ Search error:', error.message);
    });
}, 1000);

// Test problematic combination
setTimeout(() => {
  console.log('\nTesting problematic combination...');
  fetch('https://huggingface.co/api/models?search=test&limit=10&sort=downloads&direction=-1')
    .then(response => {
      console.log('Status:', response.status);
      if (response.ok) {
        return response.json();
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    })
    .then(data => {
      console.log('✅ Combined params success! Found', data.length, 'models');
    })
    .catch(error => {
      console.log('❌ Combined params error:', error.message);
    });
}, 2000);

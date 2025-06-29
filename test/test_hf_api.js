const axios = require('axios');
require('dotenv').config({ path: './.env' });

async function testOmdb() {
  try {
    // Use the provided OMDb API key or fallback to env
    const apiKey = process.env.OMDB_API_KEY || 'ee716fdb';
    const title = 'Inception';
    const response = await axios.get('http://www.omdbapi.com/', {
      params: {
        t: title,
        apikey: apiKey,
      },
    });
    console.log('OMDb Movie Data:', response.data);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    console.error('Status:', error.response ? error.response.status : 'No status');
  }
}

testOmdb().then(() => process.exit(0)).catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
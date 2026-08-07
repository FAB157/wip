try {
  require('@google/genai');
  console.log('Successfully loaded @google/genai');
} catch (e) {
  console.error('Failed to load @google/genai:', e.message);
}

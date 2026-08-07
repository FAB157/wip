const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

console.log("TOGETHER_API_KEY from .env:", process.env.TOGETHER_API_KEY ? "exists" : "missing");
console.log("VITE_TOGETHER_API_KEY from .env:", process.env.VITE_TOGETHER_API_KEY ? "exists" : "missing");
console.log("System env TOGETHER_API_KEY:", process.env.TOGETHER_API_KEY ? "exists" : "missing");

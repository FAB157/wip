const axios = require('axios');
axios.get('http://localhost:3000/api/nominatim/search?q=Rome')
  .then(res => console.log("Success:", res.status))
  .catch(err => {
    console.error("Error Message:", err.message);
    console.error("Error Code:", err.code);
    if (err.response) {
      console.error("Response Status:", err.response.status);
      console.error("Response Data:", err.response.data);
    }
  });

const url = 'https://qfxxhzkkrkvbuekfknhh.supabase.co/rest/v1/user_profiles?email=eq.marmidicarrara@gmail.com';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEwMzU4NywiZXhwIjoyMDk0Njc5NTg3fQ.Q0QT3F2w8RlT88a7fY-wO2Mo2r26KeuA2ejZyYJ2d4Y';

async function checkAndFix() {
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key
      }
    });
    const profiles = await res.json();
    console.log("PROFILES FOUND:", profiles);
    if (profiles.length > 0) {
      const p = profiles[0];
      if (!p.is_admin) {
        console.log("User is not admin in database. Fixing it...");
        const patchRes = await fetch(`https://qfxxhzkkrkvbuekfknhh.supabase.co/rest/v1/user_profiles?id=eq.${p.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': key,
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ is_admin: true })
        });
        console.log("Patch response status:", patchRes.status);
      } else {
        console.log("User is already admin in database!");
      }
    } else {
      console.log("No profile found for email marmidicarrara@gmail.com. Please log in first.");
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

checkAndFix();

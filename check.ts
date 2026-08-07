import {createClient} from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('shared_pois').select('name, lat, lon, city')
  .in('name', ['vista cascata', 'Statua a Mazzini', 'Rudere Spolverina', 'La Rocchetta'])
  .then(res => {
    if (res.error) console.error(res.error);
    else console.log(res.data);
  });

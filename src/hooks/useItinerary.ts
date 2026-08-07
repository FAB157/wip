import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface ItineraryRecord {
  id: string;
  user_id: string;
  plan: any;
  constraints?: any;
  metadata?: any;
  status: string;
  created_at: string;
  updated_at: string;
}

export function useItinerary(itineraryId?: string) {
  const [itinerary, setItinerary] = useState<ItineraryRecord | null>(null);
  const [loading, setLoading] = useState(true);

  // Initial fetch
  useEffect(() => {
    if (!itineraryId) {
      setLoading(false);
      return;
    }

    const fetchItinerary = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('itineraries')
        .select('*')
        .eq('id', itineraryId)
        .single();
        
      if (!error && data) {
        setItinerary(data as ItineraryRecord);
      }
      setLoading(false);
    };

    fetchItinerary();
  }, [itineraryId]);

  // Real-time subscription
  useEffect(() => {
    if (!itineraryId) return;

    const channel = supabase
      .channel(`public:itineraries:id=${itineraryId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'itineraries',
          filter: `id=eq.${itineraryId}`
        },
        (payload) => {
          if (payload.new && payload.eventType === 'UPDATE') {
            setItinerary(payload.new as ItineraryRecord);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [itineraryId]);

  return { itinerary, loading };
}

-- Permette al client web di salvare i POI scaricati automaticamente da Overpass
CREATE POLICY "Permetti inserimento POI da auto-discovery" 
ON public.shared_pois 
FOR INSERT 
WITH CHECK (true);

-- Permette l'aggiornamento se il POI esiste già (necessario per l'upsert)
CREATE POLICY "Permetti aggiornamento POI da auto-discovery" 
ON public.shared_pois 
FOR UPDATE 
USING (true);

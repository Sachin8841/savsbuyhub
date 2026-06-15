ALTER TABLE public.returns 
  ADD CONSTRAINT returns_inventory_id_fkey 
  FOREIGN KEY (inventory_id) 
  REFERENCES public.inventory(id) 
  ON DELETE RESTRICT;

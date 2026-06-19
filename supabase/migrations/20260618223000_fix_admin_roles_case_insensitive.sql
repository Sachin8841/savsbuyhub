-- Fix Auth Trigger functions for Admin Emails (Case-Insensitive)
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_emails text[] := ARRAY[
    'sachinsathishkumar2005@gmail.com',
    'sathishabirami2002@gmail.com',
    'vanisathishkumar2003@gmail.com',
    'savsbuyhub@gmail.com',
    'savsbuyhubofficial@gmail.com'
  ];
  assigned_role public.app_role;
BEGIN
  IF LOWER(NEW.email) = ANY(admin_emails) THEN
    assigned_role := 'admin'::public.app_role;
  ELSE
    assigned_role := 'user'::public.app_role;
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role)
  ON CONFLICT (user_id) DO UPDATE SET role = assigned_role;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  assigned_role public.app_role;
BEGIN
  IF LOWER(NEW.email) IN (
    'sachinsathishkumar2005@gmail.com', 
    'sathishabirami2002@gmail.com', 
    'vanisathishkumar2003@gmail.com', 
    'savsbuyhub@gmail.com', 
    'savsbuyhubofficial@gmail.com'
  ) THEN
    assigned_role := 'admin'::public.app_role;
  ELSE
    assigned_role := 'user'::public.app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role)
  ON CONFLICT (user_id) DO UPDATE SET role = assigned_role;
  
  RETURN NEW;
END;
$$;

-- Retroactively update all existing users to admin role case-insensitively
UPDATE public.user_roles ur
SET role = 'admin'
FROM auth.users au
WHERE ur.user_id = au.id
  AND LOWER(au.email) IN (
    'sachinsathishkumar2005@gmail.com', 
    'sathishabirami2002@gmail.com', 
    'vanisathishkumar2003@gmail.com', 
    'savsbuyhub@gmail.com', 
    'savsbuyhubofficial@gmail.com'
  );

NOTIFY pgrst, 'reload schema';

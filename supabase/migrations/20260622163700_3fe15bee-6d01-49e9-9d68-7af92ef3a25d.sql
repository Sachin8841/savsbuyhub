CREATE OR REPLACE FUNCTION public.revoke_user_access(_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Only admins can revoke user access';
  END IF;

  IF _target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Admins cannot revoke their own access';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  DELETE FROM public.profiles WHERE user_id = _target_user_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_capital_account() FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_capital_delta(numeric, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_cash_movement(text, numeric, numeric, numeric, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_capital_accounts(numeric, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_sale_capital() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_return_penalty_capital() FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_user_access(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.record_cash_movement(text, numeric, numeric, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_capital_accounts(numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_access(uuid) TO authenticated;
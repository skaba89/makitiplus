"""Regression tests for MKP-007 SQL tenant guard lint."""
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location(
    "tenant_guard", Path(__file__).with_name("check_tenant_rpc_guard.py")
)
guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guard)

def sql(body, delim="$$"):
    return f"""CREATE OR REPLACE FUNCTION public.change_credit(
p_organization_id UUID, p_amount NUMERIC)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS {delim} BEGIN {body} RETURN gen_random_uuid(); END; {delim};"""

class TenantGuardTests(unittest.TestCase):
    def test_rejects_missing_guard(self):
        self.assertEqual(len(guard.audit_change("", sql("PERFORM 1;"))), 1)

    def test_accepts_explicit_membership(self):
        body = """IF NOT public.is_member_of_organization(p_organization_id)
THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF;"""
        self.assertEqual(guard.audit_change("", sql(body)), [])

    def test_rejects_super_admin_only(self):
        self.assertEqual(len(guard.audit_change("", sql("PERFORM public.is_super_admin();"))), 1)

    def test_rejects_comments_containing_fake_guard(self):
        self.assertEqual(len(guard.audit_change("", sql(
            "-- public.is_member_of_organization(p_organization_id)\n PERFORM 1;"))), 1)

    def test_rejects_plain_auth_uid(self):
        self.assertEqual(len(guard.audit_change("", sql("PERFORM auth.uid();"))), 1)

    def test_unchanged_historical_function_not_reported(self):
        definition = sql("PERFORM 1;")
        self.assertEqual(guard.audit_change(definition, definition), [])

    def test_modified_historical_function_is_checked(self):
        self.assertEqual(len(guard.audit_change(sql("PERFORM 2;"), sql("PERFORM 1;"))), 1)

    def test_dollar_tag_delimiter(self):
        self.assertEqual(len(guard.audit_change("", sql("PERFORM 1;", "$fn$"))), 1)

    def test_not_definer_is_ignored(self):
        self.assertEqual(guard.audit_change("", sql("PERFORM 1;").replace(
            "SECURITY DEFINER", "SECURITY INVOKER")), [])

if __name__ == "__main__":
    unittest.main()

"""Regression tests for the MKP-025 migration safety gate."""
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location(
    "migration_safety", Path(__file__).with_name("check_migration_safety.py")
)
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)


def rules(sql):
    return [rule for _, rule, _ in gate.audit_sql(sql)]


class DestructiveStatements(unittest.TestCase):
    def test_delete_without_where_is_blocked(self):
        self.assertEqual(rules("DELETE FROM public.sales;"), ["delete-without-where"])

    def test_delete_without_where_inside_do_block_is_blocked(self):
        sql = "DO $$ BEGIN DELETE FROM public.sale_items; RAISE NOTICE 'ok'; END $$;"
        self.assertEqual(rules(sql), ["delete-without-where"])

    def test_delete_without_where_at_end_of_file_is_blocked(self):
        self.assertEqual(rules("DELETE FROM products"), ["delete-without-where"])

    def test_targeted_delete_is_allowed(self):
        self.assertEqual(rules("DELETE FROM public.sales WHERE id = '1';"), [])

    def test_multiline_targeted_delete_is_allowed(self):
        sql = "DELETE FROM public.user_roles ur\n USING x\n WHERE ur.id = x.id;"
        self.assertEqual(rules(sql), [])

    def test_where_in_comment_does_not_satisfy_rule(self):
        self.assertEqual(rules("DELETE FROM sales /* WHERE id=1 */;"),
                         ["delete-without-where"])

    def test_where_in_next_statement_does_not_satisfy_rule(self):
        sql = "DELETE FROM sales; SELECT 1 WHERE true;"
        self.assertEqual(rules(sql), ["delete-without-where"])

    def test_truncate_is_blocked(self):
        self.assertEqual(rules("TRUNCATE public.sales CASCADE;"), ["truncate"])

    def test_commented_out_statement_is_ignored(self):
        self.assertEqual(rules("-- DELETE FROM sales;\n/* TRUNCATE sales; */ SELECT 1;"), [])

    def test_delete_on_policy_ddl_is_not_a_data_delete(self):
        sql = 'CREATE POLICY "p" ON sales FOR DELETE TO authenticated USING (true);'
        self.assertEqual(rules(sql), [])


class CredentialsAndPersonalData(unittest.TestCase):
    def test_auth_users_insert_and_password_are_blocked(self):
        sql = ("INSERT INTO auth.users (email, encrypted_password) "
               "VALUES ('x', crypt('Secret123!', gen_salt('bf')));")
        self.assertEqual(sorted(rules(sql)), ["auth-users-write", "hardcoded-password"])

    def test_auth_users_update_is_blocked(self):
        self.assertIn("auth-users-write", rules("UPDATE auth.users SET banned_until = now();"))

    def test_reading_auth_users_is_allowed(self):
        self.assertEqual(rules("SELECT id FROM auth.users WHERE id = auth.uid();"), [])

    def test_email_literal_is_blocked(self):
        self.assertEqual(rules("SELECT 1 WHERE e = 'owner@example.com';"), ["email-literal"])

    def test_crypt_on_parameter_is_allowed(self):
        self.assertEqual(rules("SELECT crypt(p_pin, gen_salt('bf'));"), [])


class Repository(unittest.TestCase):
    def test_current_migrations_pass(self):
        self.assertEqual(gate.main(), 0)


if __name__ == "__main__":
    unittest.main()

from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestPressingStore(TransactionCase):
    """The dedicated pressing point of sale.

    Worth a test because it runs exactly once, at install, inside a
    <function> the rest of the suite never touches — a mistake in it would
    otherwise only show up on a fresh database.
    """

    def test_scenario_builds_a_laundry_shop(self):
        config = self.env['pos.config'].browse(
            self.env['pos.config'].load_onboarding_pressing_scenario()['config_id'])

        self.assertTrue(config.laundry_mode)
        self.assertTrue(config.payment_method_ids,
                        "no payment method: the shop cannot take money")
        self.assertEqual(config.laundry_print_timing, 'intake')

        shirt = self.env.ref('addons_pressing_pos.product_pressing_chemise')
        self.assertTrue(shirt.is_laundry_item)
        self.assertTrue(shirt.available_in_pos)

        # A service is not a garment: it must never produce a tag or drag the
        # pickup date out.
        hem = self.env.ref('addons_pressing_pos.product_pressing_retouche')
        self.assertFalse(hem.is_laundry_item)

    def test_scenario_is_idempotent(self):
        """Called again — from the menu, or a re-install — it must not build
        a second shop next to the first."""
        first = self.env['pos.config'].load_onboarding_pressing_scenario()
        second = self.env['pos.config'].load_onboarding_pressing_scenario()
        self.assertEqual(first['config_id'], second['config_id'])

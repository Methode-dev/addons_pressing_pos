from odoo.tests import tagged
from odoo.addons.point_of_sale.tests.common import TestPoSCommon


@tagged('post_install', '-at_install')
class TestLaundryPosLoad(TestPoSCommon):
    """The POS session must still load with the module installed.

    Regression guard for the field-list overrides: in pos.load.mixin an empty
    ``_load_pos_data_fields`` means "read every field", because the mixin hands
    the list straight to ``read()`` and ``read([])`` reads all of them. Models
    like pos.config and pos.order rely on that default, so a naive
    ``super() + [...]`` turns "everything" into a four-item whitelist and the
    payload collapses — the session then dies client-side in processServerData.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.config = cls.basic_config
        cls.config.laundry_mode = True
        cls.shirt = cls.create_product('Chemise', cls.categ_basic, 6.0)
        cls.shirt.write({'is_laundry_item': True})

    def _loaded(self):
        self.open_new_session()
        session = self.config.current_session_id
        return session.load_data_params(), session.load_data([])

    def test_session_data_loads(self):
        params, data = self._loaded()
        self.assertIn('pos.config', data)
        self.assertTrue(data['pos.config'], "pos.config payload is empty")

    def test_core_fields_survive_our_overrides(self):
        """The fields core's own _load_pos_data_read reaches for."""
        _params, data = self._loaded()
        config_row = data['pos.config'][0]
        for field in ('use_pricelist', 'pricelist_id', 'currency_id', 'name'):
            self.assertIn(field, config_row,
                          f"core field {field!r} missing from the pos.config payload")

    def test_laundry_treatments_are_loaded(self):
        _params, data = self._loaded()
        self.assertIn('laundry.treatment', data)
        self.assertTrue(data['laundry.treatment'],
                        "laundry.treatment loaded no records — check the "
                        "group_pos_user ACL")

    def test_custom_fields_reach_the_client(self):
        params, data = self._loaded()

        def loaded_fields(model):
            """Declared fields, or the payload keys when the list is empty."""
            declared = params[model]['fields']
            if declared:
                return set(declared)
            rows = data.get(model) or []
            self.assertTrue(rows, f"no {model} rows to inspect")
            return set(rows[0])

        self.assertIn('laundry_mode', loaded_fields('pos.config'))
        self.assertIn('treatment_ids', loaded_fields('pos.order.line'))
        self.assertIn('is_laundry_item', loaded_fields('product.template'))
        # product.product is what an order line points at, and it carries an
        # explicit field list, so _inherits delegation is not enough.
        self.assertIn('is_laundry_item', loaded_fields('product.product'))

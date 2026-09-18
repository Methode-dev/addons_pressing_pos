from freezegun import freeze_time

from odoo import fields
from odoo.exceptions import UserError
from odoo.tests import tagged
from odoo.addons.point_of_sale.tests.common import TestPoSCommon


@tagged('post_install', '-at_install')
class TestLaundryPickup(TestPoSCommon):
    """Pickup-date arithmetic and the idempotency of the intake step.

    Every case pins the clock: the rule reads the wall clock in the shop's
    timezone, so an unpinned test would pass or fail depending on the hour it
    happens to run.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.config = cls.basic_config
        cls.config.write({
            'laundry_mode': True,
            'laundry_lead_days': 2,
            'laundry_cutoff_hour': 16.0,
            'laundry_ready_hour': 5.0,
            'laundry_closed_weekdays': '6',   # Sunday
        })
        # The rule is expressed in shop-local time; pin the user's timezone so
        # the naive-UTC conversion is what is actually under test.
        cls.env.user.tz = 'Europe/Paris'

        cls.shirt = cls.create_product('Chemise', cls.categ_basic, 6.0)
        cls.shirt.write({'is_laundry_item': True, 'laundry_lead_days': 0})
        cls.coat = cls.create_product('Manteau', cls.categ_basic, 22.0)
        cls.coat.write({'is_laundry_item': True, 'laundry_lead_days': 5})
        cls.hanger = cls.create_product('Cintre', cls.categ_basic, 1.0)

    def _pickup(self, lead_days=0):
        return self.env['pos.order'].laundry_compute_pickup(
            self.config.id, lead_days=lead_days)

    def _session(self):
        """The open session, opening one on first use.

        Opening a second session for the same config raises, so tests that
        build more than one order must share this one.
        """
        if not self.config.current_session_id:
            self.open_new_session()
        return self.config.current_session_id

    def _draft_order(self, products):
        """A draft pos.order with one line per (product, qty) pair."""
        return self.env['pos.order'].create({
            'session_id': self._session().id,
            'config_id': self.config.id,
            'company_id': self.config.company_id.id,
            'amount_tax': 0, 'amount_total': 0,
            'amount_paid': 0, 'amount_return': 0,
            'lines': [(0, 0, {
                'product_id': product.id,
                'qty': qty,
                'price_unit': product.list_price,
                'price_subtotal': product.list_price * qty,
                'price_subtotal_incl': product.list_price * qty,
            }) for product, qty in products],
        })

    # ------------------------------------------------------------------
    # laundry_compute_pickup
    # ------------------------------------------------------------------

    @freeze_time('2026-09-14 08:00:00')   # Monday 10:00 Paris, before cut-off
    def test_before_cutoff_uses_lead_days(self):
        # Monday + 2 days -> Wednesday, ready at 05:00 Paris = 03:00 UTC.
        self.assertEqual(self._pickup(), '2026-09-16 03:00:00')

    @freeze_time('2026-09-14 15:00:00')   # Monday 17:00 Paris, after cut-off
    def test_after_cutoff_adds_a_day(self):
        self.assertEqual(self._pickup(), '2026-09-17 03:00:00')

    @freeze_time('2026-09-17 08:00:00')   # Thursday 10:00 Paris
    def test_closed_weekday_is_skipped(self):
        # Thursday + 2 -> Saturday is open, so no skip is needed.
        self.assertEqual(self._pickup(), '2026-09-19 03:00:00')
        # Thursday + 3 -> Sunday is closed, roll to Monday.
        self.assertEqual(self._pickup(lead_days=3), '2026-09-21 03:00:00')

    @freeze_time('2026-09-14 20:00:00')   # Monday 22:00 Paris, Tuesday 00:00 UTC?
    def test_late_evening_does_not_land_a_day_early(self):
        """22:00 Paris is still Monday locally even though UTC agrees here.

        The regression guarded against is computing the offset from the UTC
        date instead of the shop-local one; at 22:00 Paris in summer the UTC
        date is still the 14th, but the cut-off must have fired.
        """
        # Past the 16:00 cut-off, so lead 2 + 1 -> Thursday.
        self.assertEqual(self._pickup(), '2026-09-17 03:00:00')

    @freeze_time('2026-09-14 08:00:00')
    def test_every_day_closed_raises(self):
        self.config.laundry_closed_weekdays = '0123456'
        with self.assertRaises(UserError):
            self._pickup()

    # ------------------------------------------------------------------
    # laundry_assign_number (intake)
    # ------------------------------------------------------------------

    @freeze_time('2026-09-14 08:00:00')
    def test_intake_assigns_number_and_pickup(self):
        order = self._draft_order([(self.shirt, 3)])
        order.laundry_assign_number()

        self.assertTrue(order.laundry_number)
        self.assertEqual(order.laundry_number_display,
                         str(order.laundry_number % 10000).zfill(4))
        self.assertEqual(len(order.laundry_number_display), 4)
        # Product lead 0 falls back to the config's 2 days.
        self.assertEqual(fields.Datetime.to_string(order.pickup_datetime),
                         '2026-09-16 03:00:00')

    @freeze_time('2026-09-14 08:00:00')
    def test_intake_is_idempotent(self):
        """A second intake must not burn a number.

        If this ever fails, the counter prints duplicate tags for one order.
        """
        order = self._draft_order([(self.shirt, 2)])
        order.laundry_assign_number()
        number, pickup = order.laundry_number, order.pickup_datetime

        order.laundry_assign_number()
        self.assertEqual(order.laundry_number, number)
        self.assertEqual(order.pickup_datetime, pickup)

    @freeze_time('2026-09-14 08:00:00')
    def test_lead_time_is_the_slowest_laundry_line(self):
        order = self._draft_order([(self.shirt, 1), (self.coat, 1)])
        order.laundry_assign_number()
        # The coat's 5 days wins over the shirt's fallback of 2.
        self.assertEqual(fields.Datetime.to_string(order.pickup_datetime),
                         '2026-09-19 03:00:00')

    @freeze_time('2026-09-14 08:00:00')
    def test_non_laundry_lines_do_not_drive_lead_time(self):
        self.hanger.laundry_lead_days = 9   # ignored: not a laundry item
        order = self._draft_order([(self.shirt, 1), (self.hanger, 1)])
        order.laundry_assign_number()
        self.assertEqual(fields.Datetime.to_string(order.pickup_datetime),
                         '2026-09-16 03:00:00')

    @freeze_time('2026-09-14 08:00:00')
    def test_explicit_pickup_is_not_overridden(self):
        order = self._draft_order([(self.coat, 1)])
        chosen = '2026-09-30 07:00:00'
        order.pickup_datetime = chosen
        order.laundry_assign_number()
        self.assertEqual(fields.Datetime.to_string(order.pickup_datetime), chosen)

    @freeze_time('2026-09-14 08:00:00')
    def test_intake_refuses_a_non_draft_order(self):
        """The fiscal hash chain must never see a mutated order."""
        order = self._draft_order([(self.shirt, 1)])
        order.laundry_assign_number()
        order.state = 'paid'
        with self.assertRaises(UserError):
            order.laundry_assign_number()

    @freeze_time('2026-09-14 08:00:00')
    def test_numbers_do_not_collide(self):
        first = self._draft_order([(self.shirt, 1)])
        first.laundry_assign_number()
        second = self._draft_order([(self.shirt, 1)])
        second.laundry_assign_number()
        self.assertNotEqual(first.laundry_number, second.laundry_number)

    @freeze_time('2026-09-14 08:00:00')
    def test_intake_requires_a_partner_when_configured(self):
        """The client checks this too, but the server is what must hold.

        A laundry tracks garments against a person; an order with no customer
        leaves a rack full of items nobody can be matched to.
        """
        self.config.laundry_require_partner = True
        order = self._draft_order([(self.shirt, 1)])
        with self.assertRaises(UserError):
            order.laundry_assign_number()

        order.partner_id = self.env['res.partner'].create({'name': 'Camille Roy'})
        order.laundry_assign_number()
        self.assertTrue(order.laundry_number)

    @freeze_time('2026-09-14 08:00:00')
    def test_mark_printed_is_separate_from_numbering(self):
        """Numbering and paper are two events, and only the second locks."""
        order = self._draft_order([(self.shirt, 1)])
        order.laundry_assign_number()
        self.assertFalse(order.laundry_tags_printed)

        order.laundry_mark_printed()
        self.assertTrue(order.laundry_tags_printed)
        # Idempotent: a reprint must not look like a different state.
        order.laundry_mark_printed()
        self.assertTrue(order.laundry_tags_printed)

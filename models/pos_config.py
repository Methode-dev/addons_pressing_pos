<<<<<<< HEAD
from odoo import fields, models
import logging

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import convert

_logger = logging.getLogger(__name__)


class PosConfig(models.Model):
    _inherit = 'pos.config'

    laundry_mode = fields.Boolean("Laundry mode")
    laundry_lead_days = fields.Integer(default=2)
    laundry_cutoff_hour = fields.Float(default=16.0)
    laundry_ready_hour = fields.Float(string="Ready at", default=5.0)
    laundry_closed_weekdays = fields.Char(
        string="Closed days", default='6',
        help="Weekday numbers, Monday=0. '6' = closed on Sunday and Monday.",
    )
    laundry_sequence_id = fields.Many2one('ir.sequence', copy=False)

    # --- Intake printing -------------------------------------------------
    laundry_print_timing = fields.Selection(
        [('intake', "At intake, before payment"),
         ('validation', "With the final receipt")],
        string="Print laundry documents", default='intake', required=True,
        help="At intake the garments are tagged while the customer is still "
             "handing them over, which is what a counter usually wants. "
             "Choose the other option if the shop prefers a single print run "
             "once the order is paid.",
    )
    laundry_print_tags = fields.Boolean(
        string="Garment tags", default=True,
        help="One tag per garment, to attach to the item.")
    laundry_print_workshop = fields.Boolean(
        string="Workshop ticket", default=True,
        help="The work order that stays with the batch. Carries no prices.")
    laundry_print_deposit = fields.Boolean(
        string="Deposit ticket", default=True,
        help="The customer's copy, handed over at intake. The fiscal receipt "
             "is printed separately once the order is paid.")
    laundry_require_partner = fields.Boolean(
        string="Customer required", default=False,
        help="Refuse intake until a customer is set on the order.")

    @api.model
    def _load_pos_data_fields(self, config):
        fields = super()._load_pos_data_fields(config)
        # An empty list means "load every field" (pos.load.mixin passes it
        # straight to read(), where [] reads all). Appending to it would turn
        # that into a whitelist and strip the payload, so leave it alone —
        # our fields are already covered.
        if not fields:
            return fields
        return fields + [
            'laundry_mode', 'laundry_lead_days', 'laundry_cutoff_hour',
            'laundry_ready_hour', 'laundry_closed_weekdays',
            'laundry_print_timing', 'laundry_print_tags',
            'laundry_print_workshop', 'laundry_print_deposit',
            'laundry_require_partner',
        ]

    def _laundry_get_sequence(self):
        self.ensure_one()
        if not self.laundry_sequence_id:
            self.laundry_sequence_id = self.env['ir.sequence'].sudo().create({
                'name': f"Laundry number - {self.name}",
                'code': f"pos.laundry.{self.id}",
                'implementation': 'standard',
                'padding': 1,
                'company_id': self.company_id.id,
            })
        return self.laundry_sequence_id

    # ------------------------------------------------------------------
    # Dedicated pressing shop
    # ------------------------------------------------------------------

    @api.model
    def _laundry_setup_pressing_shop_on_install(self):
        """Build the pressing shop at install, without being able to break it.

        The scenario needs a chart of accounts and a bank journal to create
        its payment methods; a database where accounting is not configured
        yet would otherwise fail the whole module install over demo content.
        The shop can be created later from
        Point of Sale > Configuration > Create the pressing shop.
        """
        try:
            return self.load_onboarding_pressing_scenario()
        except UserError as error:
            _logger.warning(
                "Could not create the pressing point of sale: %s. "
                "Create it later from Point of Sale > Configuration > "
                "Create the pressing shop.", error,
            )
            return False

    @api.model
    def load_onboarding_pressing_scenario(self):
        """Create a ready-to-use pressing point of sale.

        Mirrors core's own onboarding scenarios (clothes, bakery, furniture):
        a journal and payment methods, a pos.config, and a catalogue. The
        point is to have somewhere to press Pay and watch the documents come
        out without configuring anything first.

        Idempotent — the xml_id is what makes the shop findable again, so a
        second call returns the existing one rather than piling up shops.
        """
        ref = self._get_suffixed_ref_name('addons_pressing_pos.pos_config_pressing')
        existing = self.env.ref(ref, raise_if_not_found=False)
        if existing:
            return {'config_id': existing.id}

        journal, payment_method_ids = self._create_journal_and_payment_methods(
            cash_journal_vals={'name': _("Cash Pressing Demo"), 'show_on_dashboard': False},
        )
        config = self.create({
            # Never just "Pressing": a real shop of that name is exactly what
            # this database is for, and two identically named entries in the
            # POS picker send the cashier into the wrong one with no way to
            # tell. This shop is the sandbox and has to say so.
            'name': _("Pressing (demo)"),
            'company_id': self.env.company.id,
            'journal_id': journal.id,
            'payment_method_ids': payment_method_ids,
            'laundry_mode': True,
        })
        self.env['ir.model.data']._update_xmlids([{
            'xml_id': ref,
            'record': config,
            'noupdate': True,
        }])
        config._load_onboarding_pressing_demo_data()
        return {'config_id': config.id}

    def _load_onboarding_pressing_demo_data(self):
        self.ensure_one()
        convert.convert_file(
            self._env_with_clean_context(), 'addons_pressing_pos',
            'data/scenarios/pressing_data.xml', idref=None, mode='init', noupdate=True,
        )
        categories = self.get_record_by_ref([
            'addons_pressing_pos.pos_category_pressing_clothes',
            'addons_pressing_pos.pos_category_pressing_household',
            'addons_pressing_pos.pos_category_pressing_services',
        ])
        if categories:
            self.limit_categories = True
            self.iface_available_categ_ids = categories

    @api.model
    def action_laundry_create_pressing_shop(self):
        """Menu entry: create the pressing shop, then open it.

        Unlike the install-time wrapper this one lets errors surface — the
        user asked for the shop and needs to read why it could not be built.
        """
        config = self.browse(self.load_onboarding_pressing_scenario()['config_id'])
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'pos.config',
            'res_id': config.id,
            'view_mode': 'form',
            'target': 'current',
        }

from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # readonly=False on every one of these: a related field on
    # res.config.settings is readonly by default and the settings page then
    # discards what was typed into it without any error.
    pos_laundry_mode = fields.Boolean(
        related='pos_config_id.laundry_mode', readonly=False)
    pos_laundry_lead_days = fields.Integer(
        related='pos_config_id.laundry_lead_days', readonly=False)
    pos_laundry_cutoff_hour = fields.Float(
        related='pos_config_id.laundry_cutoff_hour', readonly=False)
    pos_laundry_ready_hour = fields.Float(
        related='pos_config_id.laundry_ready_hour', readonly=False)
    pos_laundry_closed_weekdays = fields.Char(
        related='pos_config_id.laundry_closed_weekdays', readonly=False)
    pos_laundry_print_timing = fields.Selection(
        related='pos_config_id.laundry_print_timing', readonly=False)
    pos_laundry_print_tags = fields.Boolean(
        related='pos_config_id.laundry_print_tags', readonly=False)
    pos_laundry_print_workshop = fields.Boolean(
        related='pos_config_id.laundry_print_workshop', readonly=False)
    pos_laundry_print_deposit = fields.Boolean(
        related='pos_config_id.laundry_print_deposit', readonly=False)
    pos_laundry_require_partner = fields.Boolean(
        related='pos_config_id.laundry_require_partner', readonly=False)

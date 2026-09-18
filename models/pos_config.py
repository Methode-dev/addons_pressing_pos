from odoo import fields, models


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

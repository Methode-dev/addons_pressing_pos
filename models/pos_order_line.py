from odoo import api, fields, models


class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    treatment_ids = fields.Many2many(
        'laundry.treatment',
        'pos_order_line_laundry_treatment_rel',
        'line_id', 'treatment_id',
        string="Treatments",
    )

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
            'treatment_ids',
        ]

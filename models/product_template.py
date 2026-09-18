from odoo import api, fields, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    is_laundry_item = fields.Boolean(
        string="Laundry item",
        help="Garments to tag. Uncheck for retail products and services.",
    )
    laundry_lead_days = fields.Integer(
        string="Lead time (days)",
        help="Overrides the POS default. 0 = use the POS setting.",
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
            'is_laundry_item', 'laundry_lead_days',
        ]

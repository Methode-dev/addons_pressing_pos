from odoo import api, models


class ProductProduct(models.Model):
    _inherit = 'product.product'

    @api.model
    def _load_pos_data_fields(self, config):
        fields = super()._load_pos_data_fields(config)
        # product.product ships an explicit field list, and it is the model the
        # POS puts on an order line. The laundry flags live on the template and
        # are only reachable here through _inherits delegation, so they have to
        # be requested by name — otherwise line.product_id.is_laundry_item is
        # undefined in the browser.
        if not fields:
            return fields
        return fields + [
            'is_laundry_item', 'laundry_lead_days',
        ]

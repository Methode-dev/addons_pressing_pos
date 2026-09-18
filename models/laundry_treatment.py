from odoo import api, fields, models


class LaundryTreatment(models.Model):
    _name = 'laundry.treatment'
    _inherit = ['pos.load.mixin']
    _description = 'Laundry treatment'
    _order = 'sequence, name'

    name = fields.Char(required=True, translate=True)
    code = fields.Char()
    sequence = fields.Integer(default=10)
    print_on_tag = fields.Boolean(default=True)
    active = fields.Boolean(default=True)

    @api.model
    def _load_pos_data_domain(self, data, config):
        return [('active', '=', True)]

    @api.model
    def _load_pos_data_fields(self, config):
        return ['id', 'name', 'code', 'sequence', 'print_on_tag']

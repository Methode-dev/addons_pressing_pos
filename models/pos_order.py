import pytz
from datetime import timedelta

from odoo import _, api, fields, models
from odoo.exceptions import UserError


class PosOrder(models.Model):
    _inherit = 'pos.order'

    laundry_number = fields.Integer(copy=False, index=True, readonly=True)
    laundry_number_display = fields.Char(
        string="Ticket n°",
        compute='_compute_laundry_number_display',
        store=True, index=True,
    )
    pickup_datetime = fields.Datetime(string="Ready for pickup")
    laundry_tags_printed = fields.Boolean(copy=False)

    @api.depends('laundry_number')
    def _compute_laundry_number_display(self):
        for order in self:
            order.laundry_number_display = (
                str(order.laundry_number % 10000).zfill(4)
                if order.laundry_number else False
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
            'laundry_number', 'laundry_number_display',
            'pickup_datetime', 'laundry_tags_printed',
        ]

    def laundry_assign_number(self):
        """Intake: give draft orders an authoritative ticket number and a
        pickup datetime.

        Idempotent: an order that already carries a number keeps it, and a
        pickup datetime chosen by the cashier is never overridden. Returns the
        POS data payload so the client can merge it straight into its store.
        """
        orders = self.exists()
        for order in orders:
            if order.state != 'draft':
                raise UserError(_(
                    "Intake is only possible on a draft order (order %s is %s).",
                    order.display_name, order.state,
                ))
            if order.config_id.laundry_require_partner and not order.partner_id:
                raise UserError(_(
                    "Set the customer before taking in the garments: the tags "
                    "and the pickup are tracked against them."
                ))
            if not order.laundry_number:
                sequence = order.config_id._laundry_get_sequence()
                order.laundry_number = int(sequence.next_by_id())
            if not order.pickup_datetime:
                order.pickup_datetime = order._laundry_default_pickup()
        if not orders:
            return {'pos.order': []}
        return orders.read_pos_data([], orders[0].config_id)

    def _laundry_default_pickup(self):
        """Pickup datetime for this order: the slowest of its laundry lines."""
        self.ensure_one()
        lead_days = max((
            line.product_id.laundry_lead_days
            for line in self.lines
            if line.product_id.is_laundry_item
        ), default=0)
        return self.laundry_compute_pickup(self.config_id.id, lead_days=lead_days)

    @api.model
    def laundry_compute_pickup(self, config_id, lead_days=0):
        """Authoritative pickup datetime. Returns a naive UTC string."""
        config = self.env['pos.config'].browse(config_id)
        tz = pytz.timezone(self.env.user.tz or 'Europe/Paris')
        local = pytz.utc.localize(fields.Datetime.now()).astimezone(tz)

        days = lead_days or config.laundry_lead_days
        if local.hour + local.minute / 60.0 >= config.laundry_cutoff_hour:
            days += 1

        target = local + timedelta(days=days)
        hour = int(config.laundry_ready_hour)
        target = target.replace(
            hour=hour,
            minute=int((config.laundry_ready_hour - hour) * 60),
            second=0, microsecond=0,
        )

        closed = {int(d) for d in (config.laundry_closed_weekdays or '') if d.isdigit()}
        for _i in range(30):
            if target.weekday() not in closed:
                break
            target += timedelta(days=1)
        else:
            raise UserError(_(
                "No opening day found within 30 days. Check the closed days "
                "configured on point of sale %s.", config.name,
            ))

        return fields.Datetime.to_string(target.astimezone(pytz.utc).replace(tzinfo=None))

    def laundry_mark_printed(self):
        """Record that the physical documents came out of the printer.

        Separate from laundry_assign_number because the two can diverge: the
        number is taken the moment the server sees the order, the paper only
        exists once the printer says so. Anything that locks the order keys
        off this flag, not off the number.
        """
        self.filtered(lambda order: not order.laundry_tags_printed).write({
            'laundry_tags_printed': True,
        })
        return True

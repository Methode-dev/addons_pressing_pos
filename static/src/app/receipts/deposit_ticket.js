import { Component } from "@odoo/owl";
import { formatCurrency } from "@web/core/currency";

/**
 * The customer's copy, handed over at intake.
 *
 * This is not the fiscal receipt — that one is core's OrderReceipt and is
 * printed when the order is paid. This is the claim ticket: what the customer
 * brings back to collect the garments, so it is built around the number and
 * the pickup date and lists what was left behind, not what it costs to the
 * cent.
 *
 * Sizes are explicit px against the 512px `.pos-receipt-print` canvas, for
 * the reason spelled out at the top of receipts.scss.
 */
export class DepositTicket extends Component {
    static template = "addons_pressing_pos.DepositTicket";
    static props = {
        order: Object,
    };

    get order() {
        return this.props.order;
    }

    get customerName() {
        return this.order.getPartner()?.name || "";
    }

    /** One row per line, with the garment count alongside. */
    get depositLines() {
        return this.order.lines
            .filter((line) => line.qty > 0)
            .map((line) => ({
                uuid: line.uuid,
                label: line.getFullProductName(),
                qty: Math.round(line.qty),
                isGarment: Boolean(line.product_id.is_laundry_item),
            }));
    }

    get garmentCount() {
        return this.order.laundryGarmentCount;
    }

    /** Mirrors OrderReceipt.formatCurrency: the order's currency, not the
        session user's, so a pricelist in another currency still reads right. */
    get total() {
        return formatCurrency(this.order.priceIncl, this.order.currency.id);
    }
}

import { Component } from "@odoo/owl";

/**
 * The sheet that stays with the batch in the workshop.
 *
 * Deliberately carries no prices: it is a work order, and it gets handled by
 * people who have no business seeing what the customer paid.
 */
export class WorkshopTicket extends Component {
    static template = "addons_pressing_pos.WorkshopTicket";
    static props = {
        order: Object,
    };

    get order() {
        return this.props.order;
    }

    get customerName() {
        return this.order.getPartner()?.name || "";
    }

    /**
     * One row per laundry line (not per garment): the workshop works a line at
     * a time, so three identical shirts with the same treatment are one row of
     * quantity 3, unlike the tags.
     */
    get workshopLines() {
        return this.order.lines
            .filter((line) => line.product_id.is_laundry_item && line.qty > 0)
            .map((line) => ({
                line,
                label: line.getFullProductName(),
                qty: Math.round(line.qty),
                treatments: line.treatment_ids.map((t) => t.name).join(", "),
                note: line.laundryNoteText,
            }));
    }

    get garmentCount() {
        return this.order.laundryGarmentCount;
    }
}

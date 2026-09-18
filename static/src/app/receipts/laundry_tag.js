import { Component } from "@odoo/owl";

/**
 * One tag per garment. Printed at intake and physically attached to the item,
 * so everything on it must be readable at arm's length on a rack.
 *
 * Sizing note: at print time the root element gets core's `.pos-receipt-print`
 * class, which is `width: 512px; font-size: 30px`. Every size below is chosen
 * against that 512px canvas, which is why they are explicit px — the renderer
 * rasterises the element at its own clientWidth, so rem/% would rescale with
 * whatever happens to be mounted around it.
 */
export class LaundryTag extends Component {
    static template = "addons_pressing_pos.LaundryTag";
    static props = {
        order: Object,
        tag: Object,
    };

    get order() {
        return this.props.order;
    }

    get tag() {
        return this.props.tag;
    }

    /** Surname only: a tag is narrow and the counter reads it at a glance. */
    get customerName() {
        const partner = this.order.getPartner();
        if (!partner) {
            return "";
        }
        return partner.name || "";
    }

    get treatmentLabels() {
        // Full names, not codes: the tag is read off a rack by a person, and
        // "Tache · Délicat" fits the 512px width just as well as "TACH · DELI".
        // This also keeps the tag consistent with the workshop ticket.
        return this.tag.treatments.map((t) => t.name || t.code).join(" · ");
    }
}

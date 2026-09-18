import { Component } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";

/**
 * Every laundry document for one order, on screen, at print geometry.
 *
 * Exists because the print path is a poor place to iterate on layout: it needs
 * hardware, it rasterises to monochrome, and with no printer attached each
 * document costs a separate browser print dialog. Each document here is
 * wrapped in `.pos-receipt-print` so it gets exactly the 512px canvas and 30px
 * base font the renderer will hand it.
 *
 * The list comes from the store, not from a second copy of the rules, so
 * turning a document off in the settings turns it off here too.
 *
 * Open it from the POS with:
 *   odoo.__WOWL_DEBUG__.root.env.services.pos.laundryPreview()
 */
export class LaundryPreviewDialog extends Component {
    static template = "addons_pressing_pos.LaundryPreviewDialog";
    static components = { Dialog };
    static props = {
        order: Object,
        close: Function,
    };

    setup() {
        this.pos = usePos();
    }

    get order() {
        return this.props.order;
    }

    /** The intake documents, plus the fiscal receipt they accompany. */
    get documents() {
        return [
            ...this.pos.laundryDocuments(this.order),
            {
                label: "Customer receipt",
                component: OrderReceipt,
                props: { order: this.order },
            },
        ];
    }
}

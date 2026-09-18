import { patch } from "@web/core/utils/patch";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";

patch(OrderSummary.prototype, {
    /**
     * Every numpad edit funnels through here — quantity, price, discount and
     * the remove key alike — which makes it the one place to refuse them all
     * on an order whose tags are already on the garments.
     *
     * Guarding the individual model methods instead would miss `remove`:
     * removeOrderline returns a boolean nobody reads, so a refusal there
     * would look to the cashier like the button is broken.
     */
    _setValue(val) {
        const order = this.currentOrder;
        if (order?.laundryLocked) {
            this.dialog.add(AlertDialog, order.laundryLockWarning);
            this.numberBuffer.reset();
            return;
        }
        return super._setValue(val);
    },
});

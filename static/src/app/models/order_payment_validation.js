import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import OrderPaymentValidation from "@point_of_sale/app/utils/order_payment_validation";

patch(OrderPaymentValidation.prototype, {
    /**
     * The "print with the receipt" timing.
     *
     * Core prints the fiscal receipt from here; the laundry documents follow
     * it so the whole set comes off the printer in one go. The number and the
     * pickup date were already taken at Pay, while the order was still a
     * draft — all that is left here is paper.
     *
     * Never let a printing problem fail validation: the money is already in
     * and the order is hashed. Say so and let the cashier reprint.
     */
    async afterOrderValidation() {
        const result = await super.afterOrderValidation(...arguments);

        const pos = this.pos;
        const order = this.order;
        if (
            pos.config.laundry_mode &&
            pos.config.laundry_print_timing === "validation" &&
            order?.laundry_number &&
            !order.laundry_tags_printed
        ) {
            try {
                await pos.printLaundryDocuments(order);
                await pos.data.call("pos.order", "laundry_mark_printed", [[order.id]]);
                order.laundry_tags_printed = true;
            } catch (error) {
                pos.dialog.add(AlertDialog, {
                    title: _t("Laundry documents not printed"),
                    body:
                        error.message ||
                        _t(
                            "The order is paid. Reprint the tags from the orders list when the printer is back."
                        ),
                });
            }
        }

        return result;
    },
});

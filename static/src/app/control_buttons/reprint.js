import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { ask } from "@point_of_sale/app/utils/make_awaitable_dialog";

/**
 * Reprint the intake documents for the current order.
 *
 * The counter needs this more often than it sounds: a jam, a torn tag, a
 * customer who lost the deposit ticket. Reprinting keeps the same number, so
 * the duplicate is harmless — which is exactly why it is a button and not a
 * back-office procedure.
 */
export class ReprintButton extends Component {
    static template = "addons_pressing_pos.ReprintButton";
    static props = {
        class: { type: String, optional: true },
        showLabel: { type: Boolean, optional: true },
    };

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
        this.notification = useService("notification");
    }

    get currentOrder() {
        return this.pos.getOrder();
    }

    get isAvailable() {
        return Boolean(this.currentOrder?.laundry_number);
    }

    async onClick() {
        const order = this.currentOrder;
        if (!order?.laundry_number) {
            this.notification.add(_t("This order has not been taken in yet."), {
                type: "warning",
            });
            return;
        }

        // ask() resolves false on cancel and on close, which is what we want:
        // a mistyped tap must not send a second set of tags to the rack.
        const confirmed = await ask(this.dialog, {
            title: _t("Reprint ticket %s", order.laundry_number_display),
            body: _t(
                "The same number is printed again. Throw the old tags away so the rack does not carry two sets."
            ),
        });
        if (!confirmed) {
            return;
        }
        await this.pos.laundryReprint(order);
    }
}

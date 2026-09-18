import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { DateTimeInput } from "@web/core/datetime/datetime_input";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { _t } from "@web/core/l10n/translation";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";

export class PickupDateDialog extends Component {
    static template = "addons_pressing_pos.PickupDateDialog";
    static components = { Dialog, DateTimeInput };
    static props = {
        startingValue: { type: [Object, { value: false }], optional: true },
        getPayload: Function,
        close: Function,
    };

    setup() {
        this.state = useState({ value: this.props.startingValue || false });
    }

    onChange(value) {
        this.state.value = value;
    }

    confirm() {
        this.props.getPayload(this.state.value);
        this.props.close();
    }
}

export class PickupDateButton extends Component {
    static template = "addons_pressing_pos.PickupDateButton";
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

    get label() {
        return this.currentOrder?.formattedPickupDate || "";
    }

    async onClick() {
        const order = this.currentOrder;
        if (!order) {
            return;
        }

        // Propose the shop's own answer rather than "now": the cashier is
        // confirming a date, not inventing one. Falling back to the existing
        // value keeps the dialog usable if the server is unreachable.
        let startingValue = order.pickup_datetime || false;
        if (!startingValue) {
            try {
                startingValue = await this.pos.laundryDefaultPickup(order);
            } catch {
                this.notification.add(
                    _t("Could not reach the server for the usual pickup date."),
                    { type: "warning" }
                );
            }
        }

        const picked = await makeAwaitable(this.dialog, PickupDateDialog, {
            startingValue,
        });
        if (picked) {
            order.pickup_datetime = picked;
        }
    }
}

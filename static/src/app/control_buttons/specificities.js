import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";

export class SpecificitiesDialog extends Component {
    static template = "addons_pressing_pos.SpecificitiesDialog";
    static components = { Dialog };
    static props = {
        treatments: Array,
        selectedIds: { type: Array, optional: true },
        note: { type: String, optional: true },
        getPayload: Function,
        close: Function,
    };
    static defaultProps = { selectedIds: [], note: "" };

    setup() {
        this.state = useState({
            selectedIds: [...this.props.selectedIds],
            note: this.props.note || "",
        });
    }

    isSelected(treatment) {
        return this.state.selectedIds.includes(treatment.id);
    }

    toggle(treatment) {
        if (this.isSelected(treatment)) {
            this.state.selectedIds = this.state.selectedIds.filter(
                (id) => id !== treatment.id
            );
        } else {
            this.state.selectedIds = [...this.state.selectedIds, treatment.id];
        }
    }

    confirm() {
        this.props.getPayload({
            selectedIds: this.state.selectedIds,
            note: this.state.note,
        });
        this.props.close();
    }
}

export class SpecificitiesButton extends Component {
    static template = "addons_pressing_pos.SpecificitiesButton";
    static props = {
        class: { type: String, optional: true },
        showLabel: { type: Boolean, optional: true },
    };

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
        this.notification = useService("notification");
    }

    get selectedLine() {
        return this.pos.getOrder()?.getSelectedOrderline();
    }

    async onClick() {
        const line = this.selectedLine;
        if (!line) {
            this.notification.add(_t("Select a garment first."), { type: "warning" });
            return;
        }

        const treatments = this.pos.models["laundry.treatment"].getAll();
        const payload = await makeAwaitable(this.dialog, SpecificitiesDialog, {
            treatments,
            selectedIds: line.treatment_ids.map((t) => t.id),
            note: line.laundryNoteText,
        });
        if (!payload) {
            return;
        }

        // Assigning an x2many replaces the whole set ("set" command), which is
        // exactly what a checkbox list means. An empty array clears it.
        line.treatment_ids = payload.selectedIds.map((id) =>
            this.pos.models["laundry.treatment"].get(id)
        );
        line.setLaundryNote(payload.note);
    }
}

import { patch } from "@web/core/utils/patch";
// Note the lowercase "l": core exports PosOrderline, not PosOrderLine
// (PosOrder, by contrast, is capitalised). Getting this wrong throws at
// bundle load and the POS never boots.
import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";

patch(PosOrderline.prototype, {
    /**
     * The workshop note as plain text.
     *
     * `note` is NOT a free-text field: core serialises it as a JSON array of
     * {text, colorIndex} (see getNote/setNote and Orderline.lineScreenValues,
     * which JSON.parse()s it). Assigning a bare string to it throws inside
     * OWL's render and takes the whole POS screen down, so the format has to
     * be respected on both read and write.
     */
    get laundryNoteText() {
        try {
            const entries = JSON.parse(this.note || "[]");
            return Array.isArray(entries)
                ? entries.map((n) => n.text).join("\n")
                : String(this.note || "");
        } catch {
            // Tolerate a note written as plain text by an older build.
            return this.note || "";
        }
    },

    /** Write plain text into `note` in the shape core expects. */
    setLaundryNote(text) {
        const entries = (text || "")
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => ({ text: line, colorIndex: 0 }));
        this.setNote(entries.length ? JSON.stringify(entries) : "");
    },

    /**
     * Refuse a quantity change once the garments carry printed tags.
     *
     * Returning the {title, body} object rather than throwing is core's own
     * convention here: OrderSummary checks for `!== true` and puts whatever
     * comes back into an AlertDialog. Barcode scanning reaches this method
     * too, which is why the guard sits on the model and not only on the
     * screen.
     */
    setQuantity(quantity, keep_price) {
        if (this.order_id?.laundryLocked) {
            return this.order_id.laundryLockWarning;
        }
        return super.setQuantity(quantity, keep_price);
    },
});

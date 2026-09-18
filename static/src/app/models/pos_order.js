import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { PosOrder } from "@point_of_sale/app/models/pos_order";

patch(PosOrder.prototype, {
    /**
     * One entry per physical garment, in printing order.
     *
     * A line with qty 3 yields three tags, because three garments go on three
     * hangers. The index/total pair is what the cashier reads back at pickup
     * ("3 of 7"), so it counts garments across the whole order, not lines.
     *
     * @returns {Array<{line, label, treatments, index, total}>}
     */
    laundryTags() {
        const tags = [];
        for (const line of this.lines) {
            if (!line.product_id.is_laundry_item) {
                continue;
            }
            // Refund lines carry a negative qty and must not produce tags.
            const count = Math.max(0, Math.round(line.qty));
            for (let i = 0; i < count; i++) {
                tags.push({
                    line,
                    label: line.getFullProductName(),
                    treatments: line.treatment_ids.filter((t) => t.print_on_tag),
                });
            }
        }
        return tags.map((tag, i) => ({ ...tag, index: i + 1, total: tags.length }));
    },

    /** How many garments this order commits us to. */
    get laundryGarmentCount() {
        return this.laundryTags().length;
    },

    /**
     * Pickup date for display. Empty string until intake has set it, so
     * templates can render it unconditionally.
     */
    get formattedPickupDate() {
        return this.pickup_datetime ? this.formatDateOrTime("pickup_datetime") : "";
    },

    /**
     * Whether the order is frozen because its garments are already tagged.
     *
     * The flag is set only once the documents actually came out of the
     * printer. From that moment the paper on the rack and the record have to
     * agree: a line added or removed afterwards would leave a garment with no
     * tag, or a tag with no garment, and nobody at the counter would know
     * which.
     */
    get laundryLocked() {
        return Boolean(this.laundry_tags_printed);
    },

    /** The single wording for every path that refuses an edit. */
    get laundryLockWarning() {
        return {
            title: _t("Garments already tagged"),
            // One literal, not a concatenation: the translation extractor
            // reads the source, and a `+` here would export nothing.
            body: _t(
                "Ticket %(number)s is printed and the tags are on the garments. Reprint the documents if this order really has to change.",
                { number: this.laundry_number_display || "" }
            ),
        };
    },
});

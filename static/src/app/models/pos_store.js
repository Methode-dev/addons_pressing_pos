import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { deserializeDateTime } from "@web/core/l10n/dates";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { LaundryPreviewDialog } from "@addons_pressing_pos/app/receipts/laundry_preview";
import { LaundryProofDialog } from "@addons_pressing_pos/app/receipts/laundry_proof";
import { LaundryTag } from "@addons_pressing_pos/app/receipts/laundry_tag";
import { WorkshopTicket } from "@addons_pressing_pos/app/receipts/workshop_ticket";
import { DepositTicket } from "@addons_pressing_pos/app/receipts/deposit_ticket";
import { LaundryDocumentBatch } from "@addons_pressing_pos/app/receipts/laundry_batch";

patch(PosStore.prototype, {
    /**
     * Intake step: persist the draft order server-side and get back an
     * authoritative ticket number and pickup date.
     *
     * Must complete before any tag is printed — a printed tag is a physical
     * commitment against an order the server has to know about.
     *
     * Idempotent: an order that already has a number is returned untouched.
     */
    async laundryIntake(order) {
        if (order.laundry_number) {
            return order;
        }

        // syncAllOrders skips orders it considers clean, so an already-synced
        // order simply keeps its id here.
        await this.syncAllOrders({ orders: [order], throw: true });

        if (!order.isSynced) {
            // Never call the server with a local uuid: it would silently
            // resolve to no record and we would print blank tags.
            throw new Error(
                _t("The order could not be saved. Intake needs a connection.")
            );
        }

        await this.data.callRelated("pos.order", "laundry_assign_number", [[order.id]]);
        return order;
    },

    /**
     * The pickup datetime the shop would propose for this order, as a luxon
     * DateTime.
     *
     * The calendar rule (cut-off hour, closed days, timezone) is deliberately
     * NOT mirrored here: the server owns it, and a second copy in JS would
     * drift from it the first time the shop changes its opening days. The
     * client only contributes the part it alone knows before the order is
     * persisted — how slow the garments on it are.
     *
     * Online-only, like intake itself.
     */
    async laundryDefaultPickup(order) {
        const leadDays = Math.max(
            0,
            ...order.lines
                .filter((line) => line.product_id.is_laundry_item)
                .map((line) => line.product_id.laundry_lead_days || 0)
        );
        const value = await this.data.call(
            "pos.order",
            "laundry_compute_pickup",
            [this.config.id],
            { lead_days: leadDays }
        );
        return deserializeDateTime(value);
    },

    // ------------------------------------------------------------------
    // Printing
    // ------------------------------------------------------------------

    /**
     * The documents to print for one order, in the order they leave the
     * printer: garment tags first (they are what the customer is watching get
     * attached), then the workshop copy, then the customer's deposit ticket.
     *
     * The fiscal receipt is not in this list — core prints it on validation,
     * and it already carries the ticket number through the QWeb extension in
     * customer_ticket.xml.
     */
    laundryDocuments(order) {
        const config = this.config;
        const documents = [];

        if (config.laundry_print_tags) {
            for (const tag of order.laundryTags()) {
                documents.push({
                    label: _t("Tag %(index)s/%(total)s", {
                        index: tag.index,
                        total: tag.total,
                    }),
                    component: LaundryTag,
                    props: { order, tag },
                });
            }
        }
        if (config.laundry_print_workshop) {
            documents.push({
                label: _t("Workshop ticket"),
                component: WorkshopTicket,
                props: { order },
            });
        }
        if (config.laundry_print_deposit) {
            documents.push({
                label: _t("Deposit ticket"),
                component: DepositTicket,
                props: { order },
            });
        }
        return documents;
    },

    /**
     * Render every intake document of an order into one detached element.
     *
     * One OWL mount for the whole set, never one per document. printer.print()
     * renders through the RenderContainer, which holds a single component slot
     * and resolves its promise from onMounted; driving it in a loop stalls on
     * the second document and the remaining tags never print. Core hits the
     * same wall and answers it the same way — printOrderChanges() renders its
     * elements up front and hands them to the printer, never the component.
     *
     * @returns {Array<HTMLElement>} one element per document, in print order
     */
    async laundryRenderDocuments(documents) {
        // The printer service owns the renderer; the store has no direct
        // handle on it and adding a service dependency would mean patching
        // PosStore.serviceDependencies for no gain.
        const batch = await this.printer.renderer.toHtml(LaundryDocumentBatch, { documents });
        const elements = [...batch.querySelectorAll(".laundry-batch-item > *")];

        // Loud on purpose. The previous version of this lost every document
        // after the first and the only symptom was a short stack of paper —
        // no error, nothing in the console. A count mismatch means garments
        // would go out untagged, so it stops the intake instead.
        if (elements.length !== documents.length) {
            throw new Error(
                `Rendered ${elements.length} of ${documents.length} laundry documents.`
            );
        }
        return elements;
    },

    /**
     * Print every intake document for an order.
     *
     * Two paths on purpose:
     *
     * - With a printer attached, one job per document, so the paper is cut
     *   between them and each tag comes off separately. That is the whole
     *   point of the tags. printHtml() takes an already-rendered element, so
     *   the loop costs nothing but the raster.
     * - Without one, a single combined job. The web fallback is window.print(),
     *   which blocks on a dialog per call; ten dialogs in a row is not a
     *   fallback, it is a wall. The batch template page-breaks where the cut
     *   would be.
     *
     * @returns {number} how many documents were actually sent
     */
    async printLaundryDocuments(order) {
        const documents = this.laundryDocuments(order);
        if (!documents.length) {
            return 0;
        }

        if (!this.hardwareProxy.printer) {
            await this.printer.print(
                LaundryDocumentBatch,
                { documents },
                { webPrintFallback: true }
            );
            return documents.length;
        }

        const elements = await this.laundryRenderDocuments(documents);
        for (const element of elements) {
            await this.printer.printHtml(element);
        }
        return elements.length;
    },

    /**
     * The whole intake: number the order, print its documents, and record
     * that the paper exists.
     *
     * The flag is written last and only on success, because it is what locks
     * the order against further edits. Getting that backwards would leave a
     * counter unable to correct an order whose tags never printed.
     */
    async laundryIntakeAndPrint(order) {
        await this.laundryIntake(order);
        await this.printLaundryDocuments(order);

        if (!order.laundry_tags_printed) {
            // Server first, then the local copy: if the call fails the order
            // stays editable, which is the recoverable end of the two. The
            // reverse would lock a counter out of an order the server still
            // believes is untagged.
            await this.data.call("pos.order", "laundry_mark_printed", [[order.id]]);
            order.laundry_tags_printed = true;
        }
        return order;
    },

    /**
     * Reprint, for the jam / torn tag / "I lost my ticket" cases.
     *
     * Deliberately reuses the same documents rather than a reduced set: a tag
     * that exists twice in the shop is a smaller problem than a garment with
     * no tag, and the number is unchanged either way.
     */
    async laundryReprint(order = null) {
        order = order || this.getOrder();
        if (!order?.laundry_number) {
            this.dialog.add(AlertDialog, {
                title: _t("Nothing to reprint"),
                body: _t("This order has not been taken in yet."),
            });
            return;
        }
        await this.printLaundryDocuments(order);
    },

    /**
     * Whether this order goes through intake at all.
     *
     * An order with no garment on it — a hem, a hanger, a pack of covers —
     * is an ordinary sale and must reach the payment screen untouched. Tying
     * intake to the garment count rather than to laundry_mode is what keeps
     * the till usable for those.
     */
    laundryNeedsIntake(order) {
        return Boolean(
            this.config.laundry_mode &&
                order &&
                !order.laundry_tags_printed &&
                order.laundryGarmentCount > 0
        );
    },

    /**
     * What blocks intake, as a message, or null when the order is good to go.
     */
    laundryIntakeBlocker(order) {
        if (this.config.laundry_require_partner && !order.getPartner()) {
            return _t(
                "Set the customer first: the garments are tracked against them until pickup."
            );
        }
        return null;
    },

    /**
     * Pay, with intake in front of it.
     *
     * The number is always taken here, whatever the print timing: this is the
     * last moment the order is still a draft, and laundry_assign_number
     * refuses anything else — deliberately, since that guard is what keeps the
     * French hash chain away from a mutated order.
     *
     * Printing is what moves: at the counter's option the paper comes out now,
     * while the customer is still handing garments over, or later with the
     * receipt.
     */
    async pay() {
        const order = this.getOrder();

        if (order?.canPay() && this.laundryNeedsIntake(order)) {
            const blocker = this.laundryIntakeBlocker(order);
            if (blocker) {
                this.dialog.add(AlertDialog, {
                    title: _t("Intake not possible"),
                    body: blocker,
                });
                return;
            }
            try {
                if (this.config.laundry_print_timing === "intake") {
                    await this.laundryIntakeAndPrint(order);
                } else {
                    await this.laundryIntake(order);
                }
            } catch (error) {
                this.dialog.add(AlertDialog, {
                    title: _t("Intake failed"),
                    body:
                        error.message ||
                        _t("The garments could not be taken in. Nothing was printed."),
                });
                return;
            }
        }

        return await super.pay(...arguments);
    },

    /**
     * Refuse a new line on an order whose garments are already tagged.
     *
     * This is the path a product click takes. Core's own assertEditable()
     * would have been the tidier hook, but addPaymentline() calls it too, so
     * locking there would make the tagged order impossible to pay.
     */
    async addLineToOrder(vals, order, opts = {}, configure = true) {
        if (order?.laundryLocked) {
            this.dialog.add(AlertDialog, order.laundryLockWarning);
            return;
        }
        return await super.addLineToOrder(vals, order, opts, configure);
    },

    /**
     * Show every laundry document for an order on screen, at print geometry.
     * A development aid for iterating on the layouts without hardware.
     */
    laundryPreview(order = null) {
        order = order || this.getOrder();
        if (!order) {
            return;
        }
        this.env.services.dialog.add(LaundryPreviewDialog, { order });
    },

    /**
     * The same documents after the printer's monochrome dithering.
     * Use this, not laundryPreview, to judge whether a layout survives the
     * thermal head — it is the last thing that differs from real paper.
     */
    laundryProof(order = null) {
        order = order || this.getOrder();
        if (!order) {
            return;
        }
        this.env.services.dialog.add(LaundryProofDialog, { order });
    },
});

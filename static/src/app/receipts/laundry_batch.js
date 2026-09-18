import { Component } from "@odoo/owl";
import { LaundryTag } from "./laundry_tag";
import { WorkshopTicket } from "./workshop_ticket";
import { DepositTicket } from "./deposit_ticket";

/**
 * Every intake document of one order, stacked into a single printable element.
 *
 * Only used on the web-print fallback path — the one that runs when no ePOS
 * or IoT printer is configured, which is every laptop the module is tried on.
 * There, PrinterService.printWeb() calls window.print() once per job, and a
 * seven-garment order would open ten browser print dialogs in a row, each
 * waiting on a human. Rendering the whole set as one document turns that back
 * into one dialog, with a CSS page break where the guillotine would be.
 *
 * A real printer does NOT go through here: it gets one job per document, so
 * the paper is cut between them and the tags come out separable.
 *
 * Takes the same {component, props} list the printer loop takes, so the two
 * paths can never print different sets. The components are declared here only
 * so OWL can resolve them by reference.
 */
export class LaundryDocumentBatch extends Component {
    static template = "addons_pressing_pos.LaundryDocumentBatch";
    static components = { LaundryTag, WorkshopTicket, DepositTicket };
    static props = {
        documents: Array,
    };
}

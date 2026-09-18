import { Component, onMounted, useRef, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { htmlToCanvas } from "@point_of_sale/app/services/render_service";
import { EpsonPrinter } from "@point_of_sale/app/utils/printer/epson_printer";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";

/**
 * The laundry documents as the thermal head will actually burn them.
 *
 * laundryPreview() shows the DOM: anti-aliased, full colour, and flattering.
 * The real print path is DOM -> canvas -> 1-bit Floyd-Steinberg dither ->
 * ePOS raster, and that conversion is where hairline borders disappear, grey
 * text turns to noise and thin fonts break up. This runs the exact same
 * canvas and the exact same dithering routine as the Epson driver, then paints
 * the resulting bitmap back on screen — so a layout can be judged without
 * hardware, paper, or a print dialog.
 *
 * Nothing is transmitted: the printer instance is a throwaway whose dithering
 * we borrow, and sendPrintingJob is never called.
 */
export class LaundryProofDialog extends Component {
    static template = "addons_pressing_pos.LaundryProofDialog";
    static components = { Dialog };
    static props = {
        order: Object,
        close: Function,
    };

    setup() {
        this.pos = usePos();
        this.root = useRef("root");
        this.state = useState({ status: "Rasterising…" });
        onMounted(() => this.build());
    }

    /** The same list the printer would receive, plus the fiscal receipt. */
    get documents() {
        const order = this.props.order;
        return [
            ...this.pos.laundryDocuments(order),
            { label: "Customer receipt", component: OrderReceipt, props: { order } },
        ];
    }

    async build() {
        const printer = new EpsonPrinter({ ip: "0.0.0.0" });
        const documents = this.documents;
        let dots = 0;

        try {
            // One render pass for the whole set, then rasterise each element.
            // Rendering them one at a time would stall on the second document
            // for the same reason the print loop used to — see
            // PosStore.laundryRenderDocuments.
            const elements = await this.pos.laundryRenderDocuments(documents);

            for (const [index, element] of elements.entries()) {
                const canvas = await htmlToCanvas(element, {
                    addClass: "pos-receipt-print",
                });
                const raster = printer.canvasToRaster(canvas);
                dots += raster.reduce((n, bit) => n + bit, 0);
                this.root.el?.appendChild(
                    this.paint(
                        documents[index]?.label || `Document ${index + 1}`,
                        raster,
                        canvas.width,
                        canvas.height
                    )
                );
            }
        } catch (error) {
            this.state.status = String(error.message || error);
            return;
        }

        this.state.status =
            `${documents.length} documents · ${dots.toLocaleString()} black dots · ` +
            `exactly what the printer receives`;
    }

    /** Paint a 0/1 raster back into a visible canvas, one dot per pixel. */
    paint(label, raster, width, height) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        const image = ctx.createImageData(width, height);
        for (let i = 0; i < raster.length; i++) {
            const value = raster[i] ? 0 : 255;
            image.data[i * 4] = value;
            image.data[i * 4 + 1] = value;
            image.data[i * 4 + 2] = value;
            image.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(image, 0, 0);

        const item = document.createElement("div");
        item.className = "laundry-proof-item";
        const caption = document.createElement("div");
        caption.className = "laundry-proof-caption";
        caption.textContent = `${label} — ${width}×${height} dots`;
        item.appendChild(caption);
        item.appendChild(canvas);
        return item;
    }
}

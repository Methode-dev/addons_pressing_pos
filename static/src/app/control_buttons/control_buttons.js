import { patch } from "@web/core/utils/patch";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { PickupDateButton } from "./pickup_date";
import { SpecificitiesButton } from "./specificities";
import { ReprintButton } from "./reprint";

// Registering the child components is separate from inheriting the template:
// without this, OWL cannot resolve the <PickupDateButton/> tag and the button
// simply never renders, with no build error.
patch(ControlButtons, {
    components: {
        ...ControlButtons.components,
        PickupDateButton,
        SpecificitiesButton,
        ReprintButton,
    },
});

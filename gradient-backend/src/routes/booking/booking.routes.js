import { listBookings, syncBookings } from "../../controllers/cal/cal.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = express.Router();

// BASE URL -> /booking
router.get("/cal-booking", adminAuth, listBookings);
router.post("/sync", adminAuth, syncBookings);

export default router;

import { Router } from "express";
import notVerifiedController from "../controllers/users/not-verified";
import verifyController from "../controllers/users/verify";
import deleteController from "../controllers/users/delete";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/all", requireAdmin, notVerifiedController);
router.post("/verify", requireAdmin, verifyController);
router.delete("/delete/:id", requireAdmin, deleteController);

export default router;

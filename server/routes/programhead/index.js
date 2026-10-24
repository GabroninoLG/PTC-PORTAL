import express from "express";

import classesRouter from "./classes.js";
import gradesRouter from "./grades.js";
import profileRouter from "./profile.js";
import transferevaluationRouter from "./transferEvaluations.js";
import offeringBatchesRouter from "./offeringBatches.js";

const router = express.Router();

router.use("/profile", profileRouter);
router.use("/classes", classesRouter);
router.use("/grades", gradesRouter);
router.use("/transfer-evaluations", transferevaluationRouter);
router.use("/offering-batches", offeringBatchesRouter);

export default router;

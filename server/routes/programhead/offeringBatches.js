import express from "express";
import db from "../../db.js";
import {
  createSystemNotification,
  findScheduleConflicts,
  hasCompleteSchedule,
  normalizeScheduleDays,
  secondsToDisplayTime,
  secondsToSqlTime,
  timeToSeconds,
  toPositiveInt,
  writeOfferingAudit,
} from "../../services/offeringBatchWorkflow.js";

const router = express.Router();

function getUser(req, res) {
  const userId = toPositiveInt(req.user?.user_id);

  if (!userId || req.user?.role_name !== "Program Head") {
    res.status(userId ? 403 : 401).json({
      success: false,
      message: userId
        ? "Program Head access is required."
        : "Authentication is required.",
    });
    return null;
  }

  return { user_id: userId };
}

async function getProgramHead(connection, userId) {
  const [rows] = await connection.execute(
    `
      SELECT
          ph.program_head_id,
          ph.department_id,
          f.faculty_id,
          d.department_name
      FROM program_heads ph
      INNER JOIN faculty f
        ON f.faculty_id = ph.faculty_id
      INNER JOIN departments d
        ON d.department_id = ph.department_id
      WHERE f.user_id = ?
        AND ph.is_active = 1
        AND (ph.start_date IS NULL OR ph.start_date <= CURDATE())
        AND (ph.end_date IS NULL OR ph.end_date >= CURDATE())
      ORDER BY ph.start_date DESC, ph.program_head_id DESC
      LIMIT 1
    `,
    [userId],
  );

  return rows[0] || null;
}

async function loadBatch(connection, batchId, userId) {
  const [batchRows] = await connection.execute(
    `
      SELECT
          cob.*,
          ay.academic_year,
          sem.semester_name,
          c.course_code,
          c.course_name,
          d.department_id,
          d.department_name,
          cu.curriculum_name
      FROM class_offering_batches cob
      INNER JOIN academic_years ay
        ON ay.academic_year_id = cob.academic_year_id
      INNER JOIN semesters sem
        ON sem.semester_id = cob.semester_id
      INNER JOIN courses c
        ON c.course_id = cob.course_id
      INNER JOIN departments d
        ON d.department_id = c.department_id
      INNER JOIN curriculum cu
        ON cu.curriculum_id = cob.curriculum_id
      WHERE cob.batch_id = ?
        AND cob.program_head_user_id = ?
      LIMIT 1
    `,
    [batchId, userId],
  );

  if (!batchRows.length) return null;

  const [offeringRows] = await connection.execute(
    `
      SELECT
          so.offering_id,
          so.batch_id,
          so.section_subject_id,
          so.subject_id,
          so.section_id,
          so.faculty_id,
          so.academic_year_id,
          so.semester_id,
          so.schedule_days,
          so.schedule_time,
          so.schedule_start_time,
          so.schedule_end_time,
          so.max_students,
          so.status AS offering_status,
          sub.subject_code,
          sub.subject_name,
          sub.units,
          sec.section_name,
          CONCAT_WS(
            ' ',
            f.first_name,
            NULLIF(f.middle_name, ''),
            f.last_name
          ) AS faculty_name
      FROM subject_offerings so
      INNER JOIN subjects sub
        ON sub.subject_id = so.subject_id
      INNER JOIN sections sec
        ON sec.section_id = so.section_id
      LEFT JOIN faculty f
        ON f.faculty_id = so.faculty_id
      WHERE so.batch_id = ?
      ORDER BY sec.section_name, sub.subject_code
    `,
    [batchId],
  );

  const [facultyRows] = await connection.execute(
    `
      SELECT
          f.faculty_id,
          f.employee_number,
          f.first_name,
          f.middle_name,
          f.last_name,
          CONCAT_WS(
            ' ',
            f.first_name,
            NULLIF(f.middle_name, ''),
            f.last_name
          ) AS faculty_name,
          r.role_name
      FROM faculty f
      INNER JOIN users u
        ON u.user_id = f.user_id
      INNER JOIN roles r
        ON r.role_id = u.role_id
      WHERE f.department_id = ?
        AND u.is_active = 1
        AND u.is_verified = 1
        AND u.is_archived = 0
        AND r.role_name IN ('Faculty', 'Program Head')
      ORDER BY f.last_name, f.first_name
    `,
    [Number(batchRows[0].department_id)],
  );

  return {
    ...batchRows[0],
    offerings: offeringRows,
    faculty_options: facultyRows,
  };
}

router.get("/", async (req, res) => {
  const actor = getUser(req, res);
  if (!actor) return;

  try {
    const [rows] = await db.execute(
      `
        SELECT
            cob.batch_id,
            cob.academic_year_id,
            ay.academic_year,
            cob.semester_id,
            sem.semester_name,
            cob.course_id,
            c.course_code,
            c.course_name,
            cob.curriculum_id,
            cu.curriculum_name,
            cob.year_level,
            cob.batch_status,
            cob.submitted_at,
            cob.returned_at,
            cob.published_at,
            (
              SELECT COUNT(*)
              FROM subject_offerings so
              WHERE so.batch_id = cob.batch_id
            ) AS offering_count,
            (
              SELECT COUNT(*)
              FROM subject_offerings so
              WHERE so.batch_id = cob.batch_id
                AND so.faculty_id IS NOT NULL
                AND so.schedule_start_time IS NOT NULL
                AND so.schedule_end_time IS NOT NULL
            ) AS scheduled_count
        FROM class_offering_batches cob
        INNER JOIN academic_years ay
          ON ay.academic_year_id = cob.academic_year_id
        INNER JOIN semesters sem
          ON sem.semester_id = cob.semester_id
        INNER JOIN courses c
          ON c.course_id = cob.course_id
        INNER JOIN curriculum cu
          ON cu.curriculum_id = cob.curriculum_id
        WHERE cob.program_head_user_id = ?
        ORDER BY cob.submitted_at DESC, cob.batch_id DESC
      `,
      [actor.user_id],
    );

    return res.json({ success: true, batches: rows });
  } catch (error) {
    console.error("GET PROGRAM HEAD OFFERING BATCHES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load assigned offering batches.",
    });
  }
});

router.get("/:batchId", async (req, res) => {
  const actor = getUser(req, res);
  if (!actor) return;

  const batchId = toPositiveInt(req.params.batchId);

  if (!batchId) {
    return res.status(400).json({
      success: false,
      message: "Invalid batch ID.",
    });
  }

  try {
    const batch = await loadBatch(db, batchId, actor.user_id);

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Assigned offering batch not found.",
      });
    }

    return res.json({ success: true, batch });
  } catch (error) {
    console.error("GET PROGRAM HEAD OFFERING BATCH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load the offering batch.",
    });
  }
});

router.put("/:batchId/offerings/:offeringId", async (req, res) => {
  const actor = getUser(req, res);
  if (!actor) return;

  const batchId = toPositiveInt(req.params.batchId);
  const offeringId = toPositiveInt(req.params.offeringId);
  const facultyId = toPositiveInt(req.body?.faculty_id);

  if (!batchId || !offeringId || !facultyId) {
    return res.status(400).json({
      success: false,
      message: "Valid batch_id, offering_id, and faculty_id are required.",
    });
  }

  const dayResult = normalizeScheduleDays(req.body?.schedule_days);

  if (!dayResult.valid) {
    return res.status(400).json({
      success: false,
      message: dayResult.invalid_value
        ? `Invalid schedule day: ${dayResult.invalid_value}.`
        : "At least one valid schedule day is required.",
    });
  }

  const startSeconds = timeToSeconds(req.body?.schedule_start_time);
  const endSeconds = timeToSeconds(req.body?.schedule_end_time);

  if (
    startSeconds === null ||
    endSeconds === null ||
    startSeconds >= endSeconds
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Provide valid start and end times; the end time must be later than the start time.",
    });
  }

  const scheduleDays = dayResult.days.join(", ");
  const scheduleStartTime = secondsToSqlTime(startSeconds);
  const scheduleEndTime = secondsToSqlTime(endSeconds);
  const scheduleTime = `${secondsToDisplayTime(startSeconds)} - ${secondsToDisplayTime(endSeconds)}`;

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const programHead = await getProgramHead(connection, actor.user_id);

    if (!programHead) {
      await connection.rollback();

      return res.status(403).json({
        success: false,
        message: "No active Program Head department assignment was found.",
      });
    }

    const [batchRows] = await connection.execute(
      `
        SELECT *
        FROM class_offering_batches
        WHERE batch_id = ?
          AND program_head_user_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [batchId, actor.user_id],
    );

    if (!batchRows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Assigned offering batch not found.",
      });
    }

    const batch = batchRows[0];

    if (batch.batch_status !== "Pending Program Head") {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Only batches pending Program Head scheduling can be edited.",
      });
    }

    const [offeringRows] = await connection.execute(
      `
        SELECT
            so.*,
            c.department_id,
            sub.subject_code,
            sec.section_name
        FROM subject_offerings so
        INNER JOIN sections sec
          ON sec.section_id = so.section_id
        INNER JOIN courses c
          ON c.course_id = sec.course_id
        INNER JOIN subjects sub
          ON sub.subject_id = so.subject_id
        WHERE so.offering_id = ?
          AND so.batch_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [offeringId, batchId],
    );

    if (!offeringRows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Offering does not belong to this batch.",
      });
    }

    const offering = offeringRows[0];

    if (Number(offering.department_id) !== Number(programHead.department_id)) {
      await connection.rollback();

      return res.status(403).json({
        success: false,
        message: "This batch is outside your Program Head department.",
      });
    }

    if (offering.status === "Cancelled") {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "A cancelled offering cannot be scheduled.",
      });
    }

    const [facultyRows] = await connection.execute(
      `
        SELECT
            f.faculty_id,
            f.department_id,
            u.is_active,
            u.is_verified,
            u.is_archived,
            r.role_name,
            CONCAT_WS(
              ' ',
              f.first_name,
              NULLIF(f.middle_name, ''),
              f.last_name
            ) AS faculty_name
        FROM faculty f
        INNER JOIN users u
          ON u.user_id = f.user_id
        INNER JOIN roles r
          ON r.role_id = u.role_id
        WHERE f.faculty_id = ?
        LIMIT 1
      `,
      [facultyId],
    );

    if (!facultyRows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Selected faculty record was not found.",
      });
    }

    const faculty = facultyRows[0];

    if (
      !["Faculty", "Program Head"].includes(faculty.role_name) ||
      Number(faculty.is_active) !== 1 ||
      Number(faculty.is_verified) !== 1 ||
      Number(faculty.is_archived) !== 0
    ) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Select an active, verified Faculty or Program Head account.",
      });
    }

    if (Number(faculty.department_id) !== Number(programHead.department_id)) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "The selected instructor must belong to your department.",
      });
    }

    const candidate = {
      academic_year_id: Number(offering.academic_year_id),
      semester_id: Number(offering.semester_id),
      section_id: Number(offering.section_id),
      faculty_id: facultyId,
      room_id: null,
      schedule_days: scheduleDays,
      schedule_time: scheduleTime,
      schedule_start_time: scheduleStartTime,
      schedule_end_time: scheduleEndTime,
    };

    const conflicts = await findScheduleConflicts(
      connection,
      candidate,
      offeringId,
    );

    if (conflicts.length) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "This schedule conflicts with an existing class.",
        conflicts,
      });
    }

    await connection.execute(
      `
        UPDATE subject_offerings
        SET faculty_id = ?,
            room_id = NULL,
            schedule_days = ?,
            schedule_time = ?,
            schedule_start_time = ?,
            schedule_end_time = ?,
            status = 'Closed'
        WHERE offering_id = ?
          AND batch_id = ?
      `,
      [
        facultyId,
        scheduleDays,
        scheduleTime,
        scheduleStartTime,
        scheduleEndTime,
        offeringId,
        batchId,
      ],
    );

    await writeOfferingAudit(
      connection,
      actor.user_id,
      "subject_offerings",
      offeringId,
      "UPDATE",
      {
        faculty_id: offering.faculty_id,
        schedule_days: offering.schedule_days,
        schedule_time: offering.schedule_time,
        status: offering.status,
      },
      {
        faculty_id: facultyId,
        schedule_days: scheduleDays,
        schedule_time: scheduleTime,
        status: "Closed",
      },
    );

    await connection.commit();

    return res.json({
      success: true,
      message:
        "Instructor and schedule saved. The offering remains closed until the Registrar publishes the batch.",
      offering: {
        offering_id: offeringId,
        batch_id: batchId,
        faculty_id: facultyId,
        faculty_name: faculty.faculty_name,
        schedule_days: scheduleDays,
        schedule_time: scheduleTime,
        schedule_start_time: scheduleStartTime,
        schedule_end_time: scheduleEndTime,
        status: "Closed",
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();

    console.error("SAVE PROGRAM HEAD BATCH SCHEDULE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to save the offering schedule.",
    });
  } finally {
    if (connection) connection.release();
  }
});

router.post("/:batchId/return-to-registrar", async (req, res) => {
  const actor = getUser(req, res);
  if (!actor) return;

  const batchId = toPositiveInt(req.params.batchId);

  if (!batchId) {
    return res.status(400).json({
      success: false,
      message: "Invalid batch ID.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [batchRows] = await connection.execute(
      `
        SELECT *
        FROM class_offering_batches
        WHERE batch_id = ?
          AND program_head_user_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [batchId, actor.user_id],
    );

    if (!batchRows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Assigned offering batch not found.",
      });
    }

    const batch = batchRows[0];

    if (batch.batch_status !== "Pending Program Head") {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "Only a batch pending scheduling can be returned to the Registrar.",
      });
    }

    const [offeringRows] = await connection.execute(
      `
        SELECT *
        FROM subject_offerings
        WHERE batch_id = ?
        ORDER BY offering_id
        FOR UPDATE
      `,
      [batchId],
    );

    if (!offeringRows.length) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "This batch has no subject offerings.",
      });
    }

    const incomplete = offeringRows.filter(
      (row) => !row.faculty_id || !hasCompleteSchedule(row),
    );

    if (incomplete.length) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "Assign an instructor and schedule to every offering before returning the batch.",
        incomplete_offering_ids: incomplete.map((row) =>
          Number(row.offering_id),
        ),
      });
    }

    for (const offering of offeringRows) {
      const conflicts = await findScheduleConflicts(
        connection,
        offering,
        Number(offering.offering_id),
      );

      if (conflicts.length) {
        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            "Resolve all schedule conflicts before returning this batch.",
          offering_id: Number(offering.offering_id),
          conflicts,
        });
      }
    }

    await connection.execute(
      `
        UPDATE class_offering_batches
        SET batch_status = 'Ready for Registrar',
            returned_by = ?,
            returned_at = NOW()
        WHERE batch_id = ?
      `,
      [actor.user_id, batchId],
    );

    await writeOfferingAudit(
      connection,
      actor.user_id,
      "class_offering_batches",
      batchId,
      "UPDATE",
      { batch_status: batch.batch_status },
      { batch_status: "Ready for Registrar" },
    );

    await createSystemNotification(
      connection,
      Number(batch.submitted_by),
      "Class offering batch ready for publication",
      `The Program Head completed and returned offering batch #${batchId}. Review it before publishing.`,
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "The completed batch was returned to the Registrar for review.",
      batch_id: batchId,
      batch_status: "Ready for Registrar",
    });
  } catch (error) {
    if (connection) await connection.rollback();

    console.error("RETURN OFFERING BATCH TO REGISTRAR ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to return the offering batch to the Registrar.",
    });
  } finally {
    if (connection) connection.release();
  }
});

export default router;

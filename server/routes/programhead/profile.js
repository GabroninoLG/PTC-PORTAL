import express from "express";
import db from "../../db.js";

const router = express.Router();

// =====================================================
// GET AUTHENTICATED PROGRAM HEAD PROFILE
//
// GET /api/program-head/profile
//
// Identity is always taken from req.user, which is
// populated by the authentication middleware.
// The frontend never chooses the faculty/program-head ID.
// =====================================================

router.get("/", async (req, res) => {
  try {
    const userId = Number(req.user?.user_id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    const [rows] = await db.execute(
      `
      SELECT
        ph.program_head_id,
        ph.faculty_id,
        ph.department_id,
        ph.start_date,
        ph.end_date,
        ph.is_active AS assignment_is_active,

        f.user_id,
        f.employee_number,
        f.first_name,
        f.middle_name,
        f.last_name,
        f.gender,
        f.birth_date,
        f.contact_number,
        COALESCE(NULLIF(f.email, ''), u.email) AS email,
        f.employment_status,
        f.hire_date,

        u.username,
        u.is_active AS account_is_active,
        u.is_verified,
        u.last_login,
        u.created_at AS account_created_at,

        d.department_code,
        d.department_name

      FROM users u

      INNER JOIN faculty f
        ON f.user_id = u.user_id

      INNER JOIN program_heads ph
        ON ph.faculty_id = f.faculty_id

      INNER JOIN departments d
        ON d.department_id = ph.department_id

      WHERE u.user_id = ?
        AND ph.is_active = 1
        AND (
          ph.start_date IS NULL
          OR ph.start_date <= CURDATE()
        )
        AND (
          ph.end_date IS NULL
          OR ph.end_date >= CURDATE()
        )

      ORDER BY
        COALESCE(ph.start_date, '1000-01-01') DESC,
        ph.program_head_id DESC

      LIMIT 1
      `,
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No active Program Head profile is connected to this account.",
      });
    }

    const row = rows[0];

    return res.json({
      success: true,
      profile: {
        program_head_id: Number(row.program_head_id),
        faculty_id: Number(row.faculty_id),
        user_id: Number(row.user_id),
        employee_number: row.employee_number,
        username: row.username,
        first_name: row.first_name,
        middle_name: row.middle_name,
        last_name: row.last_name,
        program_head_name: [row.first_name, row.middle_name, row.last_name]
          .filter(Boolean)
          .join(" "),
        gender: row.gender,
        birth_date: row.birth_date,
        contact_number: row.contact_number,
        email: row.email,
        department_id: Number(row.department_id),
        department_code: row.department_code,
        department_name: row.department_name,
        employment_status: row.employment_status,
        hire_date: row.hire_date,
        start_date: row.start_date,
        end_date: row.end_date,
        assignment_is_active: Boolean(row.assignment_is_active),
        account_is_active: Boolean(row.account_is_active),
        is_verified: Boolean(row.is_verified),
        last_login: row.last_login,
        account_created_at: row.account_created_at,
        role: "Program Head",
      },
    });
  } catch (error) {
    console.error("GET PROGRAM HEAD PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load the Program Head profile.",
    });
  }
});

export default router;

import express from "express";
import bcrypt from "bcrypt";
import db from "../../db.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function requiresFacultyProfile(role) {
  return role === "Faculty" || role === "Program Head";
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeUsername(value) {
  return normalizeText(value).toUpperCase();
}

const STAFF_GENDERS = new Set(["Male", "Female"]);
const EMPLOYMENT_STATUSES = new Set(["Regular", "Part-Time", "Contractual"]);

function normalizeOptionalText(value) {
  const text = normalizeText(value);
  return text || null;
}

function isValidDateInput(value) {
  if (!value) {
    return true;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateStaffProfileFields({
  firstName,
  lastName,
  departmentId,
  gender,
  birthDate,
  employmentStatus,
  hireDate,
}) {
  if (!firstName) {
    return "First name is required for Faculty and Program Head.";
  }

  if (!lastName) {
    return "Last name is required for Faculty and Program Head.";
  }

  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    return "Please select a valid department.";
  }

  if (gender && !STAFF_GENDERS.has(gender)) {
    return "Invalid gender value.";
  }

  if (employmentStatus && !EMPLOYMENT_STATUSES.has(employmentStatus)) {
    return "Invalid employment status.";
  }

  if (!isValidDateInput(birthDate)) {
    return "Birth date must use a valid YYYY-MM-DD date.";
  }

  if (!isValidDateInput(hireDate)) {
    return "Hire date must use a valid YYYY-MM-DD date.";
  }

  return "";
}

/*
|--------------------------------------------------------------------------
| GET DEPARTMENT OPTIONS
|--------------------------------------------------------------------------
|
| Used by:
| - Create User
| - Edit User
|
| IMPORTANT:
| This route must appear BEFORE router.get("/:id")
| otherwise "departments" could be interpreted as a user ID.
|
*/

router.get("/departments/options", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        department_id,
        department_code,
        department_name
      FROM departments
      ORDER BY
        department_code ASC,
        department_name ASC
    `);

    return res.json({
      success: true,
      departments: rows,
    });
  } catch (err) {
    console.error("GET DEPARTMENT OPTIONS ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to load departments.",
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET ALL USERS
|--------------------------------------------------------------------------
*/

router.get("/", async (req, res) => {
  try {
    const [rows] = await db.execute(`
  SELECT
    u.user_id,
    u.username,
    u.email,
    u.role_id,
    r.role_name AS role,
    u.is_active,
    u.is_verified,
    u.created_at,

    f.faculty_id,
    f.employee_number,
    f.first_name,
    f.middle_name,
    f.last_name,

    COALESCE(ph.department_id, f.department_id) AS department_id,
    d.department_code,
    d.department_name

  FROM users AS u

  INNER JOIN roles AS r
    ON r.role_id = u.role_id

  LEFT JOIN faculty AS f
    ON f.user_id = u.user_id

  LEFT JOIN program_heads AS ph
    ON ph.program_head_id = (
      SELECT MAX(ph2.program_head_id)
      FROM program_heads AS ph2
      WHERE ph2.faculty_id = f.faculty_id
        AND ph2.is_active = 1
    )

  LEFT JOIN departments AS d
    ON d.department_id = COALESCE(
      ph.department_id,
      f.department_id
    )

  WHERE u.is_archived = 0

  ORDER BY
    u.created_at DESC,
    u.user_id DESC
`);

    return res.json(rows);
  } catch (err) {
    console.error("GET USERS ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to load users.",
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET USER BY ID
|--------------------------------------------------------------------------
*/

router.get("/:id", async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid user ID.",
      });
    }

    const [rows] = await db.execute(
      `
      SELECT
        u.user_id,
        u.username,
        u.email,
        u.role_id,
        r.role_name AS role,
        u.is_active,
        u.is_verified,

        f.faculty_id,
        f.employee_number,
        f.first_name,
        f.middle_name,
        f.last_name,
        f.gender,
        DATE_FORMAT(f.birth_date, '%Y-%m-%d') AS birth_date,
        f.contact_number,
        f.employment_status,
        DATE_FORMAT(f.hire_date, '%Y-%m-%d') AS hire_date,

        COALESCE(ph.department_id, f.department_id) AS department_id,
        d.department_code,
        d.department_name,

        ph.program_head_id,
        DATE_FORMAT(ph.start_date, '%Y-%m-%d') AS program_head_start_date,
        DATE_FORMAT(ph.end_date, '%Y-%m-%d') AS program_head_end_date,
        ph.is_active AS program_head_is_active

      FROM users AS u

      INNER JOIN roles AS r
        ON r.role_id = u.role_id

      LEFT JOIN faculty AS f
        ON f.user_id = u.user_id

      LEFT JOIN program_heads AS ph
        ON ph.program_head_id = (
          SELECT MAX(ph2.program_head_id)
          FROM program_heads AS ph2
          WHERE ph2.faculty_id = f.faculty_id
            AND ph2.is_active = 1
        )

      LEFT JOIN departments AS d
        ON d.department_id = COALESCE(
          ph.department_id,
          f.department_id
        )

      WHERE u.user_id = ?

      LIMIT 1
      `,
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found.",
      });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error("GET USER ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to load user.",
    });
  }
});

/*
|--------------------------------------------------------------------------
| CREATE USER
|--------------------------------------------------------------------------
|
| Frontend sends ROLE NAME and, for Faculty / Program Head,
| the linked staff profile information.
|
| Faculty:
| users -> faculty
|
| Program Head:
| users -> faculty -> program_heads
|
*/

router.post("/", async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password ?? "");
  const role = normalizeText(req.body.role);

  const firstName = normalizeText(req.body.first_name);
  const middleName = normalizeText(req.body.middle_name);
  const lastName = normalizeText(req.body.last_name);
  const gender = normalizeText(req.body.gender);
  const birthDate = normalizeText(req.body.birth_date);
  const contactNumber = normalizeText(req.body.contact_number);
  const employmentStatus =
    normalizeText(req.body.employment_status) || "Regular";
  const hireDate = normalizeText(req.body.hire_date);

  const rawDepartmentId = req.body.department_id;
  const needsFacultyProfile = requiresFacultyProfile(role);

  if (!username || !email || !password || !role) {
    return res.status(400).json({
      success: false,
      error: "Please fill in all required fields.",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      error: "Password must be at least 8 characters.",
    });
  }

  let departmentId = null;

  if (needsFacultyProfile) {
    departmentId = Number(rawDepartmentId);

    const profileValidationError = validateStaffProfileFields({
      firstName,
      lastName,
      departmentId,
      gender,
      birthDate,
      employmentStatus,
      hireDate,
    });

    if (profileValidationError) {
      return res.status(400).json({
        success: false,
        error: profileValidationError,
      });
    }
  }

  let connection;

  try {
    const [roleRows] = await db.execute(
      `
      SELECT
        role_id,
        role_name
      FROM roles
      WHERE role_name = ?
      LIMIT 1
      `,
      [role],
    );

    if (roleRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid user role.",
      });
    }

    const roleId = roleRows[0].role_id;

    const [existingUsers] = await db.execute(
      `
      SELECT
        user_id,
        username,
        email
      FROM users
      WHERE username = ?
         OR email = ?
      LIMIT 1
      `,
      [username, email],
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Username or email already exists.",
      });
    }

    if (needsFacultyProfile) {
      const [departmentRows] = await db.execute(
        `
        SELECT department_id
        FROM departments
        WHERE department_id = ?
        LIMIT 1
        `,
        [departmentId],
      );

      if (departmentRows.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Selected department does not exist.",
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [userResult] = await connection.execute(
      `
      INSERT INTO users
      (
        username,
        email,
        password_hash,
        role_id,
        is_verified,
        is_active
      )
      VALUES
      (?, ?, ?, ?, ?, ?)
      `,
      [username, email, passwordHash, roleId, true, true],
    );

    const userId = userResult.insertId;

    let facultyId = null;
    let employeeNumber = null;

    if (needsFacultyProfile) {
      const prefix = role === "Program Head" ? "PH" : "FAC";
      employeeNumber = `${prefix}-${String(userId).padStart(4, "0")}`;

      const [facultyResult] = await connection.execute(
        `
        INSERT INTO faculty
        (
          user_id,
          employee_number,
          first_name,
          middle_name,
          last_name,
          gender,
          birth_date,
          contact_number,
          email,
          department_id,
          employment_status,
          hire_date
        )
        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          userId,
          employeeNumber,
          firstName,
          normalizeOptionalText(middleName),
          lastName,
          normalizeOptionalText(gender),
          normalizeOptionalText(birthDate),
          normalizeOptionalText(contactNumber),
          email,
          departmentId,
          employmentStatus,
          normalizeOptionalText(hireDate),
        ],
      );

      facultyId = facultyResult.insertId;
    }

    if (role === "Program Head") {
      await connection.execute(
        `
        INSERT INTO program_heads
        (
          faculty_id,
          department_id,
          is_active,
          start_date,
          end_date
        )
        VALUES
        (?, ?, 1, CURDATE(), NULL)
        `,
        [facultyId, departmentId],
      );
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message:
        role === "Faculty"
          ? "Faculty user and profile created successfully."
          : role === "Program Head"
            ? "Program Head user and profile created successfully."
            : "User created successfully.",
      user_id: userId,
      faculty_id: facultyId,
      employee_number: employeeNumber,
    });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("CREATE USER ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("CREATE USER ERROR:", err);

    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        error: "Username, email, or employee number already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to create user.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

/*
|--------------------------------------------------------------------------
| UPDATE USER
|--------------------------------------------------------------------------
*/

router.put("/:id", async (req, res) => {
  const userId = Number(req.params.id);

  const username = normalizeUsername(req.body.username);
  const email = normalizeEmail(req.body.email);
  const role = normalizeText(req.body.role);

  const firstName = normalizeText(req.body.first_name);
  const middleName = normalizeText(req.body.middle_name);
  const lastName = normalizeText(req.body.last_name);
  const gender = normalizeText(req.body.gender);
  const birthDate = normalizeText(req.body.birth_date);
  const contactNumber = normalizeText(req.body.contact_number);
  const employmentStatus =
    normalizeText(req.body.employment_status) || "Regular";
  const hireDate = normalizeText(req.body.hire_date);

  const isActive = req.body.is_active;
  const needsFacultyProfile = requiresFacultyProfile(role);

  let departmentId = null;

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid user ID.",
    });
  }

  if (!username || !email || !role) {
    return res.status(400).json({
      success: false,
      error: "Please fill in all required fields.",
    });
  }

  if (typeof isActive !== "boolean") {
    return res.status(400).json({
      success: false,
      error: "User status must be true or false.",
    });
  }

  if (needsFacultyProfile) {
    departmentId = Number(req.body.department_id);

    const profileValidationError = validateStaffProfileFields({
      firstName,
      lastName,
      departmentId,
      gender,
      birthDate,
      employmentStatus,
      hireDate,
    });

    if (profileValidationError) {
      return res.status(400).json({
        success: false,
        error: profileValidationError,
      });
    }
  }

  let connection;

  try {
    const [userRows] = await db.execute(
      `
      SELECT user_id
      FROM users
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId],
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found.",
      });
    }

    const [roleRows] = await db.execute(
      `
      SELECT
        role_id,
        role_name
      FROM roles
      WHERE role_name = ?
      LIMIT 1
      `,
      [role],
    );

    if (roleRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid user role.",
      });
    }

    const roleId = roleRows[0].role_id;

    const [duplicateRows] = await db.execute(
      `
      SELECT user_id
      FROM users
      WHERE
        (username = ? OR email = ?)
        AND user_id <> ?
      LIMIT 1
      `,
      [username, email, userId],
    );

    if (duplicateRows.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Username or email already belongs to another user.",
      });
    }

    if (needsFacultyProfile) {
      const [departmentRows] = await db.execute(
        `
        SELECT department_id
        FROM departments
        WHERE department_id = ?
        LIMIT 1
        `,
        [departmentId],
      );

      if (departmentRows.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Selected department does not exist.",
        });
      }
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [lockedUsers] = await connection.execute(
      `SELECT is_archived
   FROM users
   WHERE user_id = ?
   LIMIT 1
   FOR UPDATE`,
      [userId],
    );

    if (lockedUsers.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        error: "User not found.",
      });
    }

    if (Number(lockedUsers[0].is_archived) === 1) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        error: "Archived accounts cannot be edited.",
      });
    }

    await connection.execute(
      `
  UPDATE users
  SET
    username = ?,
    email = ?,
    role_id = ?,
    is_active = ?
  WHERE user_id = ?
    AND is_archived = 0
  `,
      [username, email, roleId, isActive, userId],
    );

    const [facultyRows] = await connection.execute(
      `
      SELECT
        faculty_id,
        employee_number
      FROM faculty
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId],
    );

    let facultyId = facultyRows.length > 0 ? facultyRows[0].faculty_id : null;

    if (needsFacultyProfile) {
      if (facultyId) {
        await connection.execute(
          `
          UPDATE faculty
          SET
            first_name = ?,
            middle_name = ?,
            last_name = ?,
            gender = ?,
            birth_date = ?,
            contact_number = ?,
            email = ?,
            department_id = ?,
            employment_status = ?,
            hire_date = ?
          WHERE faculty_id = ?
          `,
          [
            firstName,
            normalizeOptionalText(middleName),
            lastName,
            normalizeOptionalText(gender),
            normalizeOptionalText(birthDate),
            normalizeOptionalText(contactNumber),
            email,
            departmentId,
            employmentStatus,
            normalizeOptionalText(hireDate),
            facultyId,
          ],
        );
      } else {
        const prefix = role === "Program Head" ? "PH" : "FAC";
        const employeeNumber = `${prefix}-${String(userId).padStart(4, "0")}`;

        const [facultyResult] = await connection.execute(
          `
          INSERT INTO faculty
          (
            user_id,
            employee_number,
            first_name,
            middle_name,
            last_name,
            gender,
            birth_date,
            contact_number,
            email,
            department_id,
            employment_status,
            hire_date
          )
          VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            userId,
            employeeNumber,
            firstName,
            normalizeOptionalText(middleName),
            lastName,
            normalizeOptionalText(gender),
            normalizeOptionalText(birthDate),
            normalizeOptionalText(contactNumber),
            email,
            departmentId,
            employmentStatus,
            normalizeOptionalText(hireDate),
          ],
        );

        facultyId = facultyResult.insertId;
      }
    }

    if (role === "Program Head" && facultyId) {
      const [programHeadRows] = await connection.execute(
        `
        SELECT program_head_id
        FROM program_heads
        WHERE faculty_id = ?
        ORDER BY program_head_id DESC
        LIMIT 1
        `,
        [facultyId],
      );

      if (programHeadRows.length > 0) {
        await connection.execute(
          `
          UPDATE program_heads
          SET
            department_id = ?,
            is_active = 1,
            start_date = COALESCE(start_date, CURDATE()),
            end_date = NULL
          WHERE program_head_id = ?
          `,
          [departmentId, programHeadRows[0].program_head_id],
        );
      } else {
        await connection.execute(
          `
          INSERT INTO program_heads
          (
            faculty_id,
            department_id,
            is_active,
            start_date,
            end_date
          )
          VALUES
          (?, ?, 1, CURDATE(), NULL)
          `,
          [facultyId, departmentId],
        );
      }
    } else if (facultyId) {
      await connection.execute(
        `
        UPDATE program_heads
        SET
          is_active = 0,
          end_date = CASE
            WHEN end_date IS NULL THEN CURDATE()
            ELSE end_date
          END
        WHERE faculty_id = ?
          AND is_active = 1
        `,
        [facultyId],
      );
    }

    await connection.commit();

    return res.json({
      success: true,
      message:
        role === "Program Head"
          ? "Program Head account and profile updated successfully."
          : role === "Faculty"
            ? "Faculty account and profile updated successfully."
            : "User updated successfully.",
    });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("UPDATE USER ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("UPDATE USER ERROR:", err);

    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        error: "Username, email, or employee number already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to update user.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

/*
|--------------------------------------------------------------------------
| ACTIVATE / DEACTIVATE
|--------------------------------------------------------------------------
*/

router.patch("/:id/status", async (req, res) => {
  const userId = Number(req.params.id);
  const { is_active } = req.body;

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid user ID.",
    });
  }

  if (typeof is_active !== "boolean") {
    return res.status(400).json({
      success: false,
      error: "Status must be true or false.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Step 1: Check and lock the account.
    const [accountRows] = await connection.execute(
      `
      SELECT user_id, is_archived
      FROM users
      WHERE user_id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [userId],
    );

    // Step 2: Ensure the account exists.
    if (accountRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        error: "User not found.",
      });
    }

    // Step 3: Reject archived accounts.
    if (Number(accountRows[0].is_archived) === 1) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        error: "Archived accounts cannot have their status changed.",
      });
    }

    // Step 4: Update a nonarchived account.
    await connection.execute(
      `
      UPDATE users
      SET is_active = ?
      WHERE user_id = ?
        AND is_archived = 0
      `,
      [is_active, userId],
    );

    // Step 5: Save changes.
    await connection.commit();

    return res.json({
      success: true,
      message: is_active
        ? "User activated successfully."
        : "User deactivated successfully.",
    });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("UPDATE STATUS ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("UPDATE USER STATUS ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to update status.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

/*
|--------------------------------------------------------------------------
| RESET PASSWORD
|--------------------------------------------------------------------------
*/

router.patch("/:id/reset-password", async (req, res) => {
  const userId = Number(req.params.id);
  const password = String(req.body.password ?? "");

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid user ID.",
    });
  }

  if (!password) {
    return res.status(400).json({
      success: false,
      error: "Password is required.",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      error: "Password must be at least 8 characters.",
    });
  }
  let connection;
  try {
    const hash = await bcrypt.hash(password, 10);

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock and check the target account.
    const [accountRows] = await connection.execute(
      `SELECT is_archived
     FROM users
     WHERE user_id = ?
     LIMIT 1
     FOR UPDATE`,
      [userId],
    );

    if (accountRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        error: "User not found.",
      });
    }

    if (Number(accountRows[0].is_archived) === 1) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        error: "Archived accounts cannot have their passwords reset.",
      });
    }

    // Reset only nonarchived accounts.
    const [result] = await connection.execute(
      `UPDATE users
     SET password_hash = ?
     WHERE user_id = ?
       AND is_archived = 0`,
      [hash, userId],
    );

    if (result.affectedRows !== 1) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        error: "Account status changed. Password not reset.",
      });
    }

    await connection.commit();

    return res.json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("RESET PASSWORD ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("RESET PASSWORD ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to reset password.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
/*
|--------------------------------------------------------------------------
| ARCHIVE USER
|--------------------------------------------------------------------------
*/

router.delete("/:id", async (req, res) => {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();

    const [userRows] = await connection.execute(
      `
      SELECT
        user_id,
        username,
        is_archived
      FROM users
      WHERE user_id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [userId],
    );

    if (userRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const targetUser = userRows[0];

    if (Number(targetUser.is_archived) === 1) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "User is already archived.",
      });
    }

    // Prevent currently logged-in admin from archiving themself
    if (req.user && Number(req.user.user_id) === userId) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "You cannot archive your own account.",
      });
    }

    // Archive and deactivate account
    await connection.execute(
      `
      UPDATE users
      SET
        is_active = 0,
        is_archived = 1,
        archived_at = NOW(),
        scheduled_deletion_at = DATE_ADD(NOW(), INTERVAL 3 YEAR)
      WHERE user_id = ?
      `,
      [userId],
    );

    // Close active sessions
    await connection.execute(
      `
      UPDATE user_sessions
      SET is_active = 0
      WHERE user_id = ?
      `,
      [userId],
    );

    await connection.execute(
      `
      UPDATE login_sessions
      SET
        is_active = 0,
        logout_time = NOW()
      WHERE user_id = ?
        AND is_active = 1
      `,
      [userId],
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "User archived successfully.",
      user: {
        user_id: userId,
        username: targetUser.username,
      },
    });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("ARCHIVE USER ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("ARCHIVE USER ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to archive user.",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

export default router;

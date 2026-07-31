import express from "express";
import db from "../db.js";
import { logActivity } from "../utils/activityLogger.js";

const router = express.Router();

// ==========================================
// GET ALL ANNOUNCEMENTS
// GET /api/announcements
// ==========================================
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.execute(`

      SELECT

        a.announcement_id,
        a.title,
        a.content,

        u.username AS created_by,

        a.publish_date,
        a.expiry_date,
        a.is_active,
        a.created_at,


        GROUP_CONCAT(
          DISTINCT r.role_name
          ORDER BY r.role_name
          SEPARATOR ', '
        ) AS recipients,


        GROUP_CONCAT(
          DISTINCT f.original_name
          ORDER BY f.original_name
          SEPARATOR ', '
        ) AS attachments


      FROM announcements a


      LEFT JOIN users u
        ON a.created_by = u.user_id


      LEFT JOIN announcement_recipients ar
        ON a.announcement_id = ar.announcement_id


      LEFT JOIN roles r
        ON ar.role_id = r.role_id



      LEFT JOIN announcement_attachments aa
        ON a.announcement_id = aa.announcement_id



      LEFT JOIN files f
        ON aa.file_id = f.file_id



      GROUP BY

        a.announcement_id,
        a.title,
        a.content,
        u.username,
        a.publish_date,
        a.expiry_date,
        a.is_active,
        a.created_at



      ORDER BY a.publish_date DESC


      LIMIT 50

    `);

    res.json(rows);
  } catch (err) {
    console.error("GET ANNOUNCEMENTS ERROR:", err);

    res.status(500).json({
      error: "Failed to load announcements.",
    });
  }
});

// ==========================================
// GET SINGLE ANNOUNCEMENT
// GET /api/announcements/:id
// ==========================================

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.execute(
      `
SELECT

a.announcement_id,
a.title,
a.content,

u.username AS created_by,

a.publish_date,
a.expiry_date,
a.is_active,
a.created_at


FROM announcements a


LEFT JOIN users u

ON a.created_by = u.user_id


WHERE a.announcement_id = ?

`,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Announcement not found.",
      });
    }

    const [recipientRows] = await db.execute(
      `

SELECT

r.role_id,
r.role_name


FROM announcement_recipients ar


INNER JOIN roles r

ON ar.role_id = r.role_id



WHERE ar.announcement_id = ?

`,
      [id],
    );

    const [attachmentRows] = await db.execute(
      `

SELECT

f.file_id,
f.original_name,
f.file_path,
f.file_size,
f.mime_type


FROM announcement_attachments aa


INNER JOIN files f

ON aa.file_id = f.file_id



WHERE aa.announcement_id = ?

`,
      [id],
    );

    res.json({
      ...rows[0],

      recipients: recipientRows,

      attachments: attachmentRows,
    });
  } catch (err) {
    console.error("GET SINGLE ANNOUNCEMENT ERROR:", err);

    res.status(500).json({
      error: "Failed to load announcement.",
    });
  }
});
// ==========================================
// CREATE ANNOUNCEMENT
// POST /api/announcements
// ==========================================
router.post("/", async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      title,
      content,
      created_by,
      publish_date,
      expiry_date,
      is_active,
      recipients,
      attachments,
    } = req.body;

    // ===============================
    // CREATE ANNOUNCEMENT
    // ===============================

    const [result] = await connection.execute(
      `
INSERT INTO announcements
(
 title,
 content,
 created_by,
 publish_date,
 expiry_date,
 is_active
)

VALUES (?,?,?,?,?,?)

`,

      [title, content, created_by, publish_date, expiry_date, is_active],
    );

    const announcementId = result.insertId;

    // ===============================
    // SAVE RECIPIENT ROLES
    // ===============================

    if (Array.isArray(recipients) && recipients.length > 0) {
      for (const roleId of recipients) {
        await connection.execute(
          `

INSERT INTO announcement_recipients

(
 announcement_id,
 role_id
)

VALUES (?,?)

`,

          [announcementId, roleId],
        );
      }
    }

    // ===============================
    // SAVE ATTACHMENTS
    // ===============================

    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const fileId of attachments) {
        await connection.execute(
          `

INSERT INTO announcement_attachments

(
 announcement_id,
 file_id
)

VALUES (?,?)

`,

          [announcementId, fileId],
        );
      }
    }

    await connection.commit();

    await logActivity(
      created_by,

      "Create",

      "Announcements",

      `Created announcement "${title}".`,
    );

    res.status(201).json({
      message: "Announcement created successfully.",

      announcement_id: announcementId,
    });
  } catch (err) {
    await connection.rollback();

    console.error("CREATE ANNOUNCEMENT ERROR:", err);

    res.status(500).json({
      error: err.message,
    });
  } finally {
    connection.release();
  }
});
// ==========================================
// UPDATE ANNOUNCEMENT
// PUT /api/announcements/:id
// ==========================================

router.put("/:id", async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const {
      title,
      content,
      publish_date,
      expiry_date,
      is_active,
      recipients,
      attachments,
      updated_by,
    } = req.body;

    // ===============================
    // UPDATE ANNOUNCEMENT DATA
    // ===============================

    await connection.execute(
      `

UPDATE announcements

SET

title=?,
content=?,
publish_date=?,
expiry_date=?,
is_active=?

WHERE announcement_id=?

`,

      [title, content, publish_date, expiry_date, is_active, id],
    );

    // ===============================
    // UPDATE RECIPIENTS
    // ===============================

    // remove old recipients

    await connection.execute(
      `

DELETE FROM announcement_recipients

WHERE announcement_id=?

`,

      [id],
    );

    // insert new recipients

    if (Array.isArray(recipients) && recipients.length > 0) {
      for (const roleId of recipients) {
        await connection.execute(
          `

INSERT INTO announcement_recipients

(
announcement_id,
role_id
)

VALUES (?,?)

`,

          [id, roleId],
        );
      }
    }

    // ===============================
    // UPDATE ATTACHMENTS
    // ===============================

    // remove old attachment links

    await connection.execute(
      `

DELETE FROM announcement_attachments

WHERE announcement_id=?

`,

      [id],
    );

    // insert new attachments

    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const fileId of attachments) {
        await connection.execute(
          `

INSERT INTO announcement_attachments

(
announcement_id,
file_id
)

VALUES (?,?)

`,

          [id, fileId],
        );
      }
    }

    await connection.commit();

    await logActivity(
      updated_by,

      "Update",

      "Announcements",

      `Updated announcement "${title}".`,
    );

    res.json({
      message: "Announcement updated successfully.",
    });
  } catch (err) {
    await connection.rollback();

    console.error("UPDATE ANNOUNCEMENT ERROR:", err);

    res.status(500).json({
      error: err.message || "Failed to update announcement.",
    });
  } finally {
    connection.release();
  }
});
// ==========================================
// DELETE ANNOUNCEMENT
// DELETE /api/announcements/:id
// ==========================================
router.delete("/:id", async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { deleted_by } = req.body;

    // Get announcement title for activity log
    const [rows] = await connection.execute(
      `
      SELECT title
      FROM announcements
      WHERE announcement_id = ?
      `,
      [id],
    );

    if (rows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        error: "Announcement not found.",
      });
    }

    const title = rows[0].title;

    // ==========================================
    // DELETE ATTACHMENT CONNECTIONS
    // ==========================================
    await connection.execute(
      `
      DELETE FROM announcement_attachments
      WHERE announcement_id = ?
      `,
      [id],
    );

    // ==========================================
    // DELETE RECIPIENT CONNECTIONS
    // ==========================================
    await connection.execute(
      `
      DELETE FROM announcement_recipients
      WHERE announcement_id = ?
      `,
      [id],
    );

    // ==========================================
    // DELETE ANNOUNCEMENT
    // ==========================================
    await connection.execute(
      `
      DELETE FROM announcements
      WHERE announcement_id = ?
      `,
      [id],
    );

    await connection.commit();

    await logActivity(
      deleted_by,
      "Delete",
      "Announcements",
      `Deleted announcement "${title}".`,
    );

    res.json({
      message: "Announcement deleted successfully.",
    });
  } catch (err) {
    await connection.rollback();

    console.error("DELETE ANNOUNCEMENT ERROR:", err);

    res.status(500).json({
      error: "Failed to delete announcement.",
    });
  } finally {
    connection.release();
  }
});
// ==========================================
// CHANGE STATUS
// PATCH /api/announcements/:id/status
// ==========================================
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;

    const { is_active } = req.body;

    await db.execute(
      `
UPDATE announcements
SET is_active=?
WHERE announcement_id=?
`,

      [is_active, id],
    );

    res.json({
      message: "Announcement status updated.",
    });
  } catch (err) {
    console.error("STATUS UPDATE ERROR:", err);

    res.status(500).json({
      error: "Failed to update status.",
    });
  }
});
export default router;

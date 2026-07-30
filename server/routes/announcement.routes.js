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
        a.audience,
        u.username AS created_by,
        a.publish_date,
        a.expiry_date,
        a.is_active,
        a.created_at
      FROM announcements a
      LEFT JOIN users u
        ON a.created_by = u.user_id
      ORDER BY a.publish_date DESC
      LIMIT 50
    `);

    res.json(rows);
  } catch (err) {
    console.error("Announcement Error:", err);

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
        a.audience,
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

    res.json(rows[0]);
  } catch (err) {
    console.error(err);

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
  try {
    const {
      title,
      content,
      audience,
      created_by,
      publish_date,
      expiry_date,
      is_active,
    } = req.body;

    const [result] = await db.execute(
      `
      INSERT INTO announcements
      (
        title,
        content,
        audience,
        created_by,
        publish_date,
        expiry_date,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        title,
        content,
        audience,
        created_by,
        publish_date,
        expiry_date,
        is_active,
      ],
    );

    await logActivity(
      created_by,
      "Create",
      "Announcements",
      `Created announcement "${title}".`,
    );

    res.status(201).json({
      message: "Announcement created successfully.",
      announcement_id: result.insertId,
    });
  } catch (err) {
    console.error("CREATE ANNOUNCEMENT ERROR:", err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// ==========================================
// UPDATE ANNOUNCEMENT
// PUT /api/announcements/:id
// ==========================================
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const {
      title,
      content,
      audience,
      publish_date,
      expiry_date,
      is_active,
      updated_by,
    } = req.body;

    await db.execute(
      `
      UPDATE announcements
      SET
        title = ?,
        content = ?,
        audience = ?,
        publish_date = ?,
        expiry_date = ?,
        is_active = ?
      WHERE announcement_id = ?
      `,
      [title, content, audience, publish_date, expiry_date, is_active, id],
    );

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
    console.error(err);

    res.status(500).json({
      error: "Failed to update announcement.",
    });
  }
});

// ==========================================
// DELETE ANNOUNCEMENT
// DELETE /api/announcements/:id
// ==========================================
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { deleted_by } = req.body;

    const [rows] = await db.execute(
      "SELECT title FROM announcements WHERE announcement_id = ?",
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Announcement not found.",
      });
    }

    const title = rows[0].title;

    await db.execute("DELETE FROM announcements WHERE announcement_id = ?", [
      id,
    ]);

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
    console.error(err);

    res.status(500).json({
      error: "Failed to delete announcement.",
    });
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
      SET is_active = ?
      WHERE announcement_id = ?
      `,
      [is_active, id],
    );

    res.json({
      message: "Announcement status updated.",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to update announcement status.",
    });
  }
});

export default router;

// routes/students.routes.js
import express from "express";
import db from "../db.js";

const router = express.Router();

// GET /api/students — list all students
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, first_name AS firstName, last_name AS lastName,
              email, course, year_level AS yearLevel, section
       FROM students
       ORDER BY created_at DESC`,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch students" });
  }
});

// POST /api/students — create a new student
router.post("/", async (req, res) => {
  const { firstName, lastName, email, course, yearLevel, section } = req.body;

  if (!firstName || !lastName || !email || !course || !yearLevel || !section) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const yearPrefix = String(new Date().getFullYear()).slice(-2);

  try {
    // Find the highest existing sequence number for this course
    // (based on the last 4 digits of the id), then increment it.
    const [seqRows] = await db.execute(
      `SELECT MAX(CAST(RIGHT(id, 4) AS UNSIGNED)) AS maxSeq
       FROM students
       WHERE course = ?`,
      [course],
    );

    const nextSeq = (seqRows[0]?.maxSeq || 0) + 1;
    const sequence = String(nextSeq).padStart(4, "0");
    const id = `${yearPrefix}${course}-${sequence}`;

    await db.execute(
      `INSERT INTO students (id, first_name, last_name, email, course, year_level, section)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, firstName, lastName, email, course, yearLevel, section],
    );
    res
      .status(201)
      .json({ id, firstName, lastName, email, course, yearLevel, section });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create student" });
  }
});

// PUT /api/students/:id — update an existing student
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, email, course, yearLevel, section } = req.body;

  try {
    const [result] = await db.execute(
      `UPDATE students
       SET first_name = ?, last_name = ?, email = ?, course = ?, year_level = ?, section = ?
       WHERE id = ?`,
      [firstName, lastName, email, course, yearLevel, section, id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json({ id, firstName, lastName, email, course, yearLevel, section });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update student" });
  }
});

// DELETE /api/students/:id — delete a student
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.execute("DELETE FROM students WHERE id = ?", [
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete student" });
  }
});

export default router;

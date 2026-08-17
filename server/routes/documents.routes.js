import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import db from "../db.js";

const router = express.Router();

const uploadFolder = path.join(process.cwd(), "uploads/documents");

if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, {
    recursive: true,
  });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadFolder);
  },

  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// ==========================================
// REQUEST DOCUMENT
// POST /api/documents/request
// ==========================================

router.post("/request", async (req, res) => {
  try {
    const {
      user_id,
      document_type,
      remarks,
    } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required.",
      });
    }

    if (!document_type) {
      return res.status(400).json({
        success: false,
        message: "Document type is required.",
      });
    }

    // Find the student's student_id using the logged-in user's user_id
    const [students] = await db.execute(
      `
      SELECT student_id
      FROM students
      WHERE user_id = ?
      LIMIT 1
      `,
      [user_id],
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student record not found.",
      });
    }

    const student_id = students[0].student_id;

    const [result] = await db.execute(
      `
      INSERT INTO student_documents
      (
        student_id,
        document_type,
        remarks,
        verification_status
      )
      VALUES (?, ?, ?, 'Pending')
      `,
      [
        student_id,
        document_type,
        remarks || null,
      ],
    );

    res.status(201).json({
      success: true,
      message: "Document request submitted successfully.",
      document_id: result.insertId,
    });
  } catch (err) {
    console.error("DOCUMENT REQUEST ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Failed to submit document request.",
    });
    }
});

// ==========================================
// GET STUDENT DOCUMENT REQUESTS
// GET /api/documents/student/:studentId
// ==========================================

router.get("/student/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;

    const [rows] = await db.execute(
      `
      SELECT
        document_id,
        student_id,
        document_type,
        file_name,
        file_path,
        verification_status,
        remarks,
        verified_by,
        verified_at,
        uploaded_at
      FROM student_documents
      WHERE student_id = ?
      ORDER BY uploaded_at DESC
      `,
      [studentId],
    );

    res.json({
      success: true,
      documents: rows,
    });
  } catch (err) {
    console.error("GET DOCUMENT REQUESTS ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve document requests.",
    });
  }
});

// ==========================================
// UPLOAD DOCUMENT FILE
// POST /api/documents/:documentId/upload
// ==========================================

router.post(
  "/:documentId/upload",
  upload.single("file"),
  async (req, res) => {
    try {
      const { documentId } = req.params;
      const { user_id } = req.body;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No document file uploaded.",
        });
      }

      const [documents] = await db.execute(
        `
        SELECT document_id
        FROM student_documents
        WHERE document_id = ?
        LIMIT 1
        `,
        [documentId],
      );

      if (documents.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Document request not found.",
        });
      }

      const fileName = req.file.filename;
      const filePath = `uploads/documents/${fileName}`;

      await db.execute(
        `
        UPDATE student_documents
        SET
          file_name = ?,
          file_path = ?,
          verification_status = 'Ready for Release',
          verified_by = ?,
          verified_at = NOW()
        WHERE document_id = ?
        `,
        [
          req.file.originalname,
          filePath,
          user_id || null,
          documentId,
        ],
      );

      res.status(201).json({
        success: true,
        message: "Document uploaded and marked as ready for release.",
        document_id: Number(documentId),
        file_name: req.file.originalname,
        file_path: filePath,
      });
    } catch (err) {
      console.error("DOCUMENT UPLOAD ERROR:", err);

      res.status(500).json({
        success: false,
        message: "Failed to upload document.",
      });
    }
  },
);

// ==========================================
// UPDATE DOCUMENT STATUS
// PATCH /api/documents/:documentId/status
// ==========================================

router.patch("/:documentId/status", async (req, res) => {
  try {
    const { documentId } = req.params;
    const { status, verified_by, remarks } = req.body;

    const allowedStatuses = [
      "Processing",
      "Ready for Release",
      "Rejected",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document status.",
      });
    }

    // Check if document exists
    const [documents] = await db.execute(
      `
      SELECT document_id
      FROM student_documents
      WHERE document_id = ?
      LIMIT 1
      `,
      [documentId],
    );

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    // Update document
    const [result] = await db.execute(
      `
      UPDATE student_documents
      SET
        verification_status = ?,
        verified_by = ?,
        verified_at = CURRENT_TIMESTAMP,
        remarks = ?
      WHERE document_id = ?
      `,
      [
        status,
        verified_by || null,
        remarks || null,
        documentId,
      ],
    );

    res.json({
      success: true,
      message: "Document status updated successfully.",
      document_id: Number(documentId),
      status,
    });

  } catch (err) {
    console.error("UPDATE DOCUMENT STATUS ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Failed to update document status.",
    });
  }
});

// ==========================================
// GET ALL DOCUMENT REQUESTS FOR REGISTRAR
// GET /api/documents/registrar
// ==========================================

router.get("/registrar", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
      SELECT
        sd.document_id,
        sd.student_id,
        s.student_number,
        s.first_name,
        s.middle_name,
        s.last_name,
        sd.document_type,
        sd.file_name,
        sd.file_path,
        sd.verification_status,
        sd.remarks,
        sd.verified_by,
        sd.verified_at,
        sd.uploaded_at
      FROM student_documents sd
      INNER JOIN students s
        ON sd.student_id = s.student_id
      ORDER BY sd.uploaded_at DESC
      `,
    );

    res.json({
      success: true,
      documents: rows,
    });
  } catch (err) {
    console.error("GET REGISTRAR DOCUMENTS ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve document requests.",
    });
  }
});

export default router;
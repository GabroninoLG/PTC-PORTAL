import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import crypto from "crypto";
import db from "./db.js"; // CHANGED: shared connection, moved out of this file
import studentsRouter from "./routes/students.routes.js"; // ADDED

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  }),
);

app.use(express.json());

// ADDED: mount the students CRUD routes
app.use("/api/students", studentsRouter);

// =======================
// Nodemailer
// =======================
const transporter = nodemailer.createTransport({
  host: "smtp.ethereal.email",
  port: 587,
  secure: false,
  auth: {
    user: process.env.ETHEREAL_USER,
    pass: process.env.ETHEREAL_PASS,
  },
});

// =======================
// Login
// =======================
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: "Email and password are required.",
    });
  }

  try {
    const [rows] = await db.execute("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    if (rows.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    const user = rows[0];

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    // Generate OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // Remove previous OTP
    await db.execute("DELETE FROM otp_codes WHERE email = ?", [email]);

    // Expires in 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Save OTP
    await db.execute(
      `INSERT INTO otp_codes
      (email, otp, expires_at)
      VALUES (?, ?, ?)`,
      [email, otp, expiresAt],
    );

    // Send Email
    const info = await transporter.sendMail({
      from: '"PTC Portal" <noreply@ptc.edu.ph>',
      to: email,
      subject: "PTC Portal OTP",

      text: `Your OTP is ${otp}. It expires in 5 minutes.`,

      html: `
        <div style="font-family:Arial">
          <h2>PTC Portal</h2>

          <p>Your One-Time Password is:</p>

          <h1 style="letter-spacing:6px;color:#4f46e5;">
            ${otp}
          </h1>

          <p>This code expires in <b>5 minutes</b>.</p>
        </div>
      `,
    });

    console.log("Preview URL:", nodemailer.getTestMessageUrl(info));

    res.json({
      message: "OTP sent successfully.",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Server error.",
    });
  }
});

// =======================
// Verify OTP
// =======================
app.post("/auth/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({
      error: "Email and OTP are required.",
    });
  }

  try {
    const [otpRows] = await db.execute(
      `SELECT *
       FROM otp_codes
       WHERE email = ?
       AND otp = ?
       AND expires_at > NOW()`,
      [email, otp],
    );

    if (otpRows.length === 0) {
      return res.status(401).json({
        error: "Invalid or expired OTP.",
      });
    }

    // Delete OTP after success
    await db.execute("DELETE FROM otp_codes WHERE email = ?", [email]);

    const [userRows] = await db.execute(
      "SELECT email, role FROM users WHERE email = ?",
      [email],
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    res.json({
      email: userRows[0].email,
      role: userRows[0].role,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Server error.",
    });
  }
});

// =======================
// Start Server
// =======================
app.listen(3000, () => {
  console.log("🚀 Backend running at http://localhost:3000");
});

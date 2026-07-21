import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import crypto from "crypto";
import db from "./db.js"; // CHANGED: shared connection, moved out of this file
import studentsRouter from "./routes/students.routes.js"; // ADDED
import path from "path";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  }),
);

app.use(express.json());

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

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
    const [rows] = await db.execute(
      `
SELECT

u.user_id,
u.username,
u.email,
u.password_hash,
u.role_id,
u.is_verified,
u.is_active,
r.role_name

FROM users u

INNER JOIN roles r
ON u.role_id = r.role_id

WHERE u.email = ?
`,
      [email],
    );

    if (rows.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    const user = rows[0];
    if (!user.is_active) {
      return res.status(403).json({
        error: "Your account has been deactivated.",
      });
    }

    if (!user.is_verified) {
      return res.status(403).json({
        error: "Please verify your account first.",
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    // Generate OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    await db.execute(
      `
UPDATE users

SET last_login = NOW()

WHERE user_id = ?
`,
      [user.user_id],
    );

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

    // FIX: look up the user FIRST so we actually have an id/username
    // to log — previously this code referenced an undefined `user`
    // variable here (it only existed in the /auth/login handler above),
    // which threw a ReferenceError and made verify-otp always fail with
    // a 500 "Server error".
    const [userRows] = await db.execute(
      `
SELECT

u.user_id,

u.username,

u.email,

u.role_id,

r.role_name

FROM users u

JOIN roles r

ON u.role_id=r.role_id

WHERE u.email=?
`,
      [email],
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    const user = userRows[0];

    await db.execute(
      `
INSERT INTO activity_logs
(
user_id,
activity_type,
module_name,
description
)

VALUES
(
?,
'LOGIN',
'Authentication',
?
)
`,
      [user.user_id, `${user.username} logged into the system`],
    );

    res.json({
      user_id: userRows[0].user_id,

      username: userRows[0].username,

      email: userRows[0].email,

      role: userRows[0].role_name,

      role_id: userRows[0].role_id,
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

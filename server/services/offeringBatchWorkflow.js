const DAY_ALIASES = new Map([
  ["monday", "Monday"],
  ["mon", "Monday"],
  ["tuesday", "Tuesday"],
  ["tue", "Tuesday"],
  ["tues", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["wed", "Wednesday"],
  ["thursday", "Thursday"],
  ["thu", "Thursday"],
  ["thur", "Thursday"],
  ["thurs", "Thursday"],
  ["friday", "Friday"],
  ["fri", "Friday"],
  ["saturday", "Saturday"],
  ["sat", "Saturday"],
  ["sunday", "Sunday"],
  ["sun", "Sunday"],
]);

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function toPositiveInt(value) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : null;
}

export function normalizeScheduleDays(value) {
  const parts = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,/&]+/)
      : [];

  const days = [];

  for (const part of parts) {
    const key = String(part ?? "")
      .trim()
      .toLowerCase()
      .replace(/\./g, "");

    if (!key) {
      continue;
    }

    const day = DAY_ALIASES.get(key);

    if (!day) {
      return {
        valid: false,
        days: [],
        invalid_value: String(part),
      };
    }

    if (!days.includes(day)) {
      days.push(day);
    }
  }

  days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));

  return {
    valid: days.length > 0,
    days,
    invalid_value: null,
  };
}

export function timeToSeconds(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  let match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const second = Number(match[3] || 0);

    if (hour > 23 || minute > 59 || second > 59) {
      return null;
    }

    return hour * 3600 + minute * 60 + second;
  }

  match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3].toUpperCase();

  if (hour < 1 || hour > 12 || minute > 59) {
    return null;
  }

  if (hour === 12) {
    hour = 0;
  }

  if (meridiem === "PM") {
    hour += 12;
  }

  return hour * 3600 + minute * 60;
}

export function secondsToSqlTime(seconds) {
  const hour = Math.floor(seconds / 3600);
  const minute = Math.floor((seconds % 3600) / 60);
  const second = seconds % 60;

  return [hour, minute, second]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function secondsToDisplayTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function hasCompleteSchedule(row) {
  const days = normalizeScheduleDays(row?.schedule_days);
  const start = timeToSeconds(row?.schedule_start_time);
  const end = timeToSeconds(row?.schedule_end_time);

  return days.valid && start !== null && end !== null && start < end;
}

function getTimeRange(row) {
  let start = timeToSeconds(row.schedule_start_time);
  let end = timeToSeconds(row.schedule_end_time);

  if (start !== null && end !== null && start < end) {
    return { start, end };
  }

  const legacy = String(row.schedule_time || "")
    .trim()
    .replace(/[–—]/g, "-");

  const parts = legacy.split(/\s*-\s*/);

  if (parts.length !== 2) {
    return null;
  }

  start = timeToSeconds(parts[0]);
  end = timeToSeconds(parts[1]);

  return start !== null && end !== null && start < end ? { start, end } : null;
}

export async function findScheduleConflicts(
  connection,
  candidate,
  excludedOfferingId,
) {
  const candidateDays = normalizeScheduleDays(candidate.schedule_days).days;
  const candidateRange = getTimeRange(candidate);

  if (!candidateDays.length || !candidateRange) {
    return [];
  }

  const [rows] = await connection.execute(
    `
      SELECT
          so.offering_id,
          so.subject_id,
          so.section_id,
          so.faculty_id,
          so.room_id,
          so.schedule_days,
          so.schedule_time,
          so.schedule_start_time,
          so.schedule_end_time,
          so.status,
          sub.subject_code,
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
      WHERE so.academic_year_id = ?
        AND so.semester_id = ?
        AND so.status <> 'Cancelled'
        AND so.offering_id <> ?
    `,
    [
      candidate.academic_year_id,
      candidate.semester_id,
      excludedOfferingId || 0,
    ],
  );

  const conflicts = [];

  for (const row of rows) {
    const existingDays = normalizeScheduleDays(row.schedule_days).days;
    const commonDays = candidateDays.filter((day) =>
      existingDays.includes(day),
    );

    if (!commonDays.length) {
      continue;
    }

    const existingRange = getTimeRange(row);

    if (
      !existingRange ||
      !(
        candidateRange.start < existingRange.end &&
        existingRange.start < candidateRange.end
      )
    ) {
      continue;
    }

    const sameSection = Number(candidate.section_id) === Number(row.section_id);

    const sameFaculty =
      candidate.faculty_id &&
      Number(candidate.faculty_id) === Number(row.faculty_id);

    const sameRoom =
      candidate.room_id && Number(candidate.room_id) === Number(row.room_id);

    if (!sameSection && !sameFaculty && !sameRoom) {
      continue;
    }

    conflicts.push({
      offering_id: Number(row.offering_id),
      subject_code: row.subject_code,
      section_name: row.section_name,
      faculty_name: row.faculty_name,
      schedule_days: row.schedule_days,
      schedule_time: row.schedule_time,
      conflict_type: sameSection ? "section" : sameFaculty ? "faculty" : "room",
      common_days: commonDays,
    });
  }

  return conflicts;
}

export async function writeOfferingAudit(
  connection,
  userId,
  tableName,
  recordId,
  action,
  oldValues,
  newValues,
) {
  await connection.execute(
    `
      INSERT INTO audit_trail
        (user_id, table_name, record_id, action, old_values, new_values)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      tableName,
      recordId,
      action,
      oldValues == null ? null : JSON.stringify(oldValues),
      newValues == null ? null : JSON.stringify(newValues),
    ],
  );
}

export async function createSystemNotification(
  connection,
  userId,
  title,
  message,
) {
  await connection.execute(
    `
      INSERT INTO notifications
        (user_id, title, message, notification_type)
      VALUES (?, ?, ?, 'System')
    `,
    [userId, title, message],
  );
}

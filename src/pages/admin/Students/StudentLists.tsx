import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";
import {
  fallbackStudents,
  type StudentRecord,
} from "../../../data/studentFallbackData";


// ---------- Folder tree types ----------
type SectionMap = Record<string, StudentRecord[]>;
type CourseMap = Record<string, SectionMap>;
type FolderTree = Record<string, CourseMap>;

interface FolderSelection {
  year: string;
  course?: string;
  section?: string;
}

// ---------- Icons ----------
function FolderIcon({ open }: { open?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d={
          open
            ? "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3V7z M3 10h20l-2 9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2l-2-9z"
            : "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
        }
        fill="currentColor"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      className={`chevron ${open ? "open" : ""}`}
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SectionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export default function StudentManagement() {
  const navigate = useNavigate();
  const user = authService.getSession();
  const [students, setStudents] = useState<StudentRecord[]>(fallbackStudents);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Folder explorer state
  const [expandedYear, setExpandedYear] = useState<string | null>(null);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection | null>(
    null
  );

  useEffect(() => {
    if (!user || user.role !== "admin") {
      navigate("/login");
      return;
    }

    const fetchStudents = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("http://localhost:3000/api/students");

        if (!response.ok) {
          throw new Error("Unable to load student list.");
        }

        const data = (await response.json()) as StudentRecord[];
        if (data.length > 0) {
          setStudents(data);
        }
      } catch {
        setStudents(fallbackStudents);
        setError("Using saved student data while the server is unavailable.");
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, user?.role]);

  // ---------- Build folder tree dynamically from students ----------
  const folderTree: FolderTree = useMemo(() => {
    const tree: FolderTree = {};

    for (const student of students) {
      const year = student.yearLevel;
      const course = student.course;
      const section = student.section;

      if (!tree[year]) {
        tree[year] = {};
      }
      if (!tree[year][course]) {
        tree[year][course] = {};
      }
      if (!tree[year][course][section]) {
        tree[year][course][section] = [];
      }

      tree[year][course][section].push(student);
    }

    return tree;
  }, [students]);

  const toggleYear = (year: string) => {
    setExpandedYear((prev) => (prev === year ? null : year));
    setExpandedCourse(null);
  };

  const toggleCourse = (course: string) => {
    setExpandedCourse((prev) => (prev === course ? null : course));
  };

  // ---------- Filter students based on selected folder ----------
  const folderFilteredStudents = useMemo(() => {
    if (!selectedFolder) {
      return students;
    }

    return students.filter((student) => {
      if (student.yearLevel !== selectedFolder.year) return false;
      if (selectedFolder.course && student.course !== selectedFolder.course) {
        return false;
      }
      if (
        selectedFolder.section &&
        student.section !== selectedFolder.section
      ) {
        return false;
      }
      return true;
    });
  }, [students, selectedFolder]);

  // ---------- Apply search on top of folder filter ----------
  const filteredStudents = useMemo(() => {
    const term = searchTerm.toLowerCase();

    return folderFilteredStudents.filter((student) => {
      const values = [
        student.id,
        student.firstName,
        student.lastName,
        student.email,
        student.course,
        student.yearLevel,
        student.section,
      ];

      return values.some((value) => value.toLowerCase().includes(term));
    });
  }, [searchTerm, folderFilteredStudents]);

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="admin-manage-students">
        <h1>Student List</h1>
        <p style={{ marginTop: "-0.5rem", marginBottom: "1rem", color: "#6c757d" }}>
          Manage and review the students registered in the system.
        </p>

        <div className="file-explorer">
          {/* LEFT: Year > Course > Section tree */}
          <div className="folder-tree">
            {Object.keys(folderTree)
              .sort()
              .map((year) => {
                const isYearExpanded = expandedYear === year;
                const courses = folderTree[year];

                return (
                  <div key={year} className="folder-group">
                    <button
                      className="folder-row"
                      onClick={() => {
                        toggleYear(year);
                        setSelectedFolder({ year });
                      }}
                      type="button"
                    >
                      <ChevronIcon open={isYearExpanded} />
                      <FolderIcon open={isYearExpanded} />
                      <span className="folder-label">{year}</span>
                    </button>

                    {isYearExpanded && (
                      <div className="folder-children">
                        {Object.keys(courses)
                          .sort()
                          .map((course) => {
                            const isCourseExpanded = expandedCourse === course;
                            const sections = courses[course];

                            return (
                              <div key={course} className="folder-group">
                                <button
                                  className="folder-row sub-row"
                                  onClick={() => {
                                    toggleCourse(course);
                                    setSelectedFolder({ year, course });
                                  }}
                                  type="button"
                                >
                                  <ChevronIcon open={isCourseExpanded} />
                                  <FolderIcon open={isCourseExpanded} />
                                  <span className="folder-label">{course}</span>
                                </button>

                                {isCourseExpanded && (
                                  <div className="folder-children">
                                    {Object.keys(sections)
                                      .sort()
                                      .map((section) => {
                                        const isActive =
                                          selectedFolder?.year === year &&
                                          selectedFolder?.course === course &&
                                          selectedFolder?.section === section;

                                        return (
                                          <button
                                            key={section}
                                            className={`folder-child-row ${
                                              isActive ? "active" : ""
                                            }`}
                                            onClick={() =>
                                              setSelectedFolder({
                                                year,
                                                course,
                                                section,
                                              })
                                            }
                                            type="button"
                                          >
                                            <SectionIcon />
                                            <span>{section}</span>
                                          </button>
                                        );
                                      })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* RIGHT: Search + Stats + Student table */}
          <div className="folder-content">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem",
                marginBottom: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>
                  {selectedFolder
                    ? [
                        selectedFolder.year,
                        selectedFolder.course,
                        selectedFolder.section,
                      ]
                        .filter(Boolean)
                        .join(" / ")
                    : "All Students"}
                </h2>
              </div>
              <div style={{ minWidth: "260px" }}>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search student"
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.75rem",
                    borderRadius: "6px",
                    border: "1px solid #ced4da",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#f8f9fa",
                border: "1px solid #e9ecef",
                borderRadius: "8px",
                padding: "1rem",
                marginBottom: "1rem",
              }}
            >
              <strong>Total students:</strong> {filteredStudents.length}
            </div>

            {loading && <p>Loading student list...</p>}
            {error && <p style={{ color: "#6c757d" }}>{error}</p>}

            {!loading && !error && (
              <div
                style={{
                  overflowX: "auto",
                  backgroundColor: "#fff",
                  border: "1px solid #e9ecef",
                  borderRadius: "8px",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f8f9fa", textAlign: "left" }}>
                      <th
                        style={{
                          padding: "0.75rem",
                          borderBottom: "1px solid #dee2e6",
                        }}
                      >
                        Student ID
                      </th>
                      <th
                        style={{
                          padding: "0.75rem",
                          borderBottom: "1px solid #dee2e6",
                        }}
                      >
                        Name
                      </th>
                      <th
                        style={{
                          padding: "0.75rem",
                          borderBottom: "1px solid #dee2e6",
                        }}
                      >
                        Email
                      </th>
                      <th
                        style={{
                          padding: "0.75rem",
                          borderBottom: "1px solid #dee2e6",
                        }}
                      >
                        Course
                      </th>
                      <th
                        style={{
                          padding: "0.75rem",
                          borderBottom: "1px solid #dee2e6",
                        }}
                      >
                        Year
                      </th>
                      <th
                        style={{
                          padding: "0.75rem",
                          borderBottom: "1px solid #dee2e6",
                        }}
                      >
                        Section
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          style={{
                            padding: "1rem",
                            textAlign: "center",
                            color: "#6c757d",
                          }}
                        >
                          No students found.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((student) => (
                        <tr key={student.id}>
                          <td
                            style={{
                              padding: "0.75rem",
                              borderBottom: "1px solid #f1f3f5",
                            }}
                          >
                            {student.id}
                          </td>
                          <td
                            style={{
                              padding: "0.75rem",
                              borderBottom: "1px solid #f1f3f5",
                            }}
                          >
                            {student.firstName} {student.lastName}
                          </td>
                          <td
                            style={{
                              padding: "0.75rem",
                              borderBottom: "1px solid #f1f3f5",
                            }}
                          >
                            {student.email}
                          </td>
                          <td
                            style={{
                              padding: "0.75rem",
                              borderBottom: "1px solid #f1f3f5",
                            }}
                          >
                            {student.course}
                          </td>
                          <td
                            style={{
                              padding: "0.75rem",
                              borderBottom: "1px solid #f1f3f5",
                            }}
                          >
                            {student.yearLevel}
                          </td>
                          <td
                            style={{
                              padding: "0.75rem",
                              borderBottom: "1px solid #f1f3f5",
                            }}
                          >
                            {student.section}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
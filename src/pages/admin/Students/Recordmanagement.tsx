import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";
import { fallbackStudents, type StudentRecord } from "../../../data/studentFallbackData";

export default function RecordsManagement() {
  const navigate = useNavigate();
  const user = authService.getSession();
  const [students, setStudents] = useState<StudentRecord[]>(fallbackStudents);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState(fallbackStudents[0]?.id ?? "");

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
          throw new Error("Unable to load student records.");
        }

        const data = (await response.json()) as StudentRecord[];
        if (data.length > 0) {
          setStudents(data);
          setSelectedStudentId((current) => current || data[0].id);
        }
      } catch {
        setStudents(fallbackStudents);
        setSelectedStudentId(fallbackStudents[0]?.id ?? "");
        setError("Using saved student records while the server is unavailable.");
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, user?.role]);

  const filteredStudents = useMemo(() => {
    const term = searchTerm.toLowerCase();

    return students.filter((student) => {
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
  }, [searchTerm, students]);

  const selectedStudent = useMemo(() => {
    return students.find((student) => student.id === selectedStudentId) ?? null;
  }, [selectedStudentId, students]);

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <DashboardLayout>
      <div style={{ padding: "1rem 0" }}>
        <div style={{ marginBottom: "1rem" }}>
          <h1 style={{ marginBottom: "0.25rem" }}>Student Records</h1>
          <p style={{ margin: 0, color: "#6c757d" }}>
            Review student profile details and academic information from one place.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1.1fr) minmax(320px, 0.9fr)", gap: "1rem", alignItems: "start" }}>
          <div style={{ backgroundColor: "#fff", border: "1px solid #e9ecef", borderRadius: "8px", padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Student List</h3>
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search student"
                style={{ minWidth: "220px", padding: "0.55rem 0.7rem", borderRadius: "6px", border: "1px solid #ced4da" }}
              />
            </div>

            {loading && <p>Loading records...</p>}
            {error && <p style={{ color: "#6c757d" }}>{error}</p>}

            {!loading && (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {filteredStudents.length === 0 ? (
                  <p style={{ color: "#6c757d", margin: 0 }}>No matching student records.</p>
                ) : (
                  filteredStudents.map((student) => (
                    <button
                      key={student.id}
                      onClick={() => setSelectedStudentId(student.id)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.75rem",
                        borderRadius: "6px",
                        border: selectedStudentId === student.id ? "1px solid #0d6efd" : "1px solid #e9ecef",
                        backgroundColor: selectedStudentId === student.id ? "#eef5ff" : "#fff",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <span>
                        <strong>{student.firstName} {student.lastName}</strong>
                        <div style={{ color: "#6c757d", fontSize: "0.9rem" }}>{student.course}</div>
                      </span>
                      <span style={{ color: "#0d6efd", fontSize: "0.9rem" }}>{student.id}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div style={{ backgroundColor: "#fff", border: "1px solid #e9ecef", borderRadius: "8px", padding: "1rem" }}>
            {selectedStudent ? (
              <>
                <div style={{ marginBottom: "1rem" }}>
                  <h3 style={{ marginBottom: "0.25rem" }}>{selectedStudent.firstName} {selectedStudent.lastName}</h3>
                  <p style={{ margin: 0, color: "#6c757d" }}>Student ID: {selectedStudent.id}</p>
                </div>

                <div style={{ display: "grid", gap: "0.75rem" }}>
                  <div style={{ backgroundColor: "#f8f9fa", borderRadius: "8px", padding: "0.85rem" }}>
                    <strong>Contact</strong>
                    <div style={{ marginTop: "0.35rem" }}>{selectedStudent.email}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <div style={{ backgroundColor: "#f8f9fa", borderRadius: "8px", padding: "0.85rem" }}>
                      <strong>Course</strong>
                      <div style={{ marginTop: "0.35rem" }}>{selectedStudent.course}</div>
                    </div>
                    <div style={{ backgroundColor: "#f8f9fa", borderRadius: "8px", padding: "0.85rem" }}>
                      <strong>Year Level</strong>
                      <div style={{ marginTop: "0.35rem" }}>{selectedStudent.yearLevel}</div>
                    </div>
                  </div>
                  <div style={{ backgroundColor: "#f8f9fa", borderRadius: "8px", padding: "0.85rem" }}>
                    <strong>Section</strong>
                    <div style={{ marginTop: "0.35rem" }}>{selectedStudent.section}</div>
                  </div>
                  <div style={{ backgroundColor: "#eef5ff", border: "1px solid #d7e7ff", borderRadius: "8px", padding: "0.85rem" }}>
                    <strong>Record Status</strong>
                    <div style={{ marginTop: "0.35rem" }}>Active enrollment record available for review.</div>
                  </div>
                </div>
              </>
            ) : (
              <p style={{ color: "#6c757d", margin: 0 }}>Select a student to view their record.</p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  course: string;
  yearLevel: string;
  section: string;
};

export default function StudentManagement() {
  const navigate = useNavigate();
  const user = authService.getSession();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

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

        const data = (await response.json()) as Student[];
        setStudents(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, [navigate, user]);

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

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <DashboardLayout>
      <div style={{ padding: "1rem 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ marginBottom: "0.25rem" }}>Student List</h1>
            <p style={{ margin: 0, color: "#6c757d" }}>
              Manage and review the students registered in the system.
            </p>
          </div>
          <div style={{ minWidth: "260px" }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search student"
              style={{ width: "100%", padding: "0.65rem 0.75rem", borderRadius: "6px", border: "1px solid #ced4da" }}
            />
          </div>
        </div>

        <div style={{ backgroundColor: "#f8f9fa", border: "1px solid #e9ecef", borderRadius: "8px", padding: "1rem", marginBottom: "1rem" }}>
          <strong>Total students:</strong> {students.length}
        </div>

        {loading && <p>Loading student list...</p>}
        {error && <p style={{ color: "#dc3545" }}>{error}</p>}

        {!loading && !error && (
          <div style={{ overflowX: "auto", backgroundColor: "#fff", border: "1px solid #e9ecef", borderRadius: "8px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8f9fa", textAlign: "left" }}>
                  <th style={{ padding: "0.75rem", borderBottom: "1px solid #dee2e6" }}>Student ID</th>
                  <th style={{ padding: "0.75rem", borderBottom: "1px solid #dee2e6" }}>Name</th>
                  <th style={{ padding: "0.75rem", borderBottom: "1px solid #dee2e6" }}>Email</th>
                  <th style={{ padding: "0.75rem", borderBottom: "1px solid #dee2e6" }}>Course</th>
                  <th style={{ padding: "0.75rem", borderBottom: "1px solid #dee2e6" }}>Year</th>
                  <th style={{ padding: "0.75rem", borderBottom: "1px solid #dee2e6" }}>Section</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "1rem", textAlign: "center", color: "#6c757d" }}>
                      No students found.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => (
                    <tr key={student.id}>
                      <td style={{ padding: "0.75rem", borderBottom: "1px solid #f1f3f5" }}>{student.id}</td>
                      <td style={{ padding: "0.75rem", borderBottom: "1px solid #f1f3f5" }}>
                        {student.firstName} {student.lastName}
                      </td>
                      <td style={{ padding: "0.75rem", borderBottom: "1px solid #f1f3f5" }}>{student.email}</td>
                      <td style={{ padding: "0.75rem", borderBottom: "1px solid #f1f3f5" }}>{student.course}</td>
                      <td style={{ padding: "0.75rem", borderBottom: "1px solid #f1f3f5" }}>{student.yearLevel}</td>
                      <td style={{ padding: "0.75rem", borderBottom: "1px solid #f1f3f5" }}>{student.section}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

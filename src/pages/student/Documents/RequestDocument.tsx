import { useState } from "react";
import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { api } from "../../../services/api";
import { useNavigate } from "react-router-dom";

export default function RequestDocument() {
  const navigate = useNavigate();
  const user = authService.getSession();
  console.log("USER ID:", user?.user_id);
  console.log("USERNAME:", user?.username);
  console.log("ROLE:", user?.role);

  const [documentType, setDocumentType] = useState("");
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!user || user.role !== "Student") {
    navigate("/login");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setMessage("");
    setError("");

    if (!documentType) {
      setError("Please select a document type.");
      return;
    }

    try {
      setLoading(true);

      const result = await api.documents.request(
        user.user_id,
        documentType,
        remarks,
      );

      setMessage(result.message);

      setDocumentType("");
      setRemarks("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to submit document request.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="document-request">
        <h1>Request Document</h1>

        <p>
          Submit a request for an official school document.
        </p>

        {message && (
          <div className="document-success">
            {message}
          </div>
        )}

        {error && (
          <div className="document-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="documentType">
              Document Type
            </label>

            <select
              id="documentType"
              value={documentType}
              onChange={(e) =>
                setDocumentType(e.target.value)
              }
            >
              <option value="">
                Select document
              </option>

              <option value="Transcript">
                Transcript of Records
              </option>

              <option value="Certificate of Enrollment">
                Certificate of Enrollment
              </option>

              <option value="Certificate of Grades">
                Certificate of Grades
              </option>

              <option value="Good Moral Certificate">
                Good Moral Certificate
              </option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="remarks">
              Remarks
            </label>

            <textarea
              id="remarks"
              value={remarks}
              onChange={(e) =>
                setRemarks(e.target.value)
              }
              placeholder="Enter any additional information..."
              rows={4}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Submitting..."
              : "Submit Request"}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
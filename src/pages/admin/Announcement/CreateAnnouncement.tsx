import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import "../../../styles/announcementcreate.css";

const API_BASE_URL = "http://localhost:3000/api/announcements";

export default function CreateAnnouncement() {
  const navigate = useNavigate();
  const session = authService.getSession();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [audience, setAudience] = useState("Everyone");
  const [publishDate, setPublishDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session || session.role !== "Admin") {
      navigate("/login");
    }
  }, [session, navigate]);

  if (!session || session.role !== "Admin") {
    return null;
  }

  const userId = session.user_id;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    console.log("CURRENT SESSION:", session);

    if (!title.trim()) {
      alert("Title is required.");
      return;
    }

    if (!content.trim()) {
      alert("Content is required.");
      return;
    }

    if (!publishDate) {
      alert("Publish date is required.");
      return;
    }

    try {
      setLoading(true);

      const announcementData = {
        title: title.trim(),

        content: content.trim(),

        audience,

        created_by: userId,

        publish_date: `${publishDate} 00:00:00`,

        expiry_date: expiryDate ? `${expiryDate} 23:59:59` : null,

        is_active: isActive ? 1 : 0,
      };

      console.log("SENDING DATA:", announcementData);

      const response = await fetch(API_BASE_URL, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(announcementData),
      });

      const data = await response.json();

      console.log("SERVER RESPONSE:", data);

      if (!response.ok) {
        throw new Error(data.error || "Failed to create announcement.");
      }

      alert("Announcement created successfully!");

      navigate("/admin/announcements");
    } catch (error) {
      console.error("CREATE ANNOUNCEMENT ERROR:", error);

      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert("Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="admin-announcement-create">
        <div className="announcement-create-header">
          <h1>Create Announcement</h1>

          <p>Create a new announcement for the PTC Student Portal.</p>
        </div>

        <form className="announcement-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title</label>

            <input
              type="text"
              placeholder="Enter announcement title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Content</label>

            <textarea
              rows={8}
              placeholder="Write the announcement..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Audience</label>

              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
              >
                <option>Everyone</option>

                <option>Students</option>

                <option>Faculty</option>

                <option>Registrar</option>

                <option>Program Head</option>

                <option>Admin</option>
              </select>
            </div>

            <div className="form-group">
              <label>Status</label>

              <select
                value={isActive ? "true" : "false"}
                onChange={(e) => setIsActive(e.target.value === "true")}
              >
                <option value="true">Active</option>

                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Publish Date</label>

              <input
                type="date"
                value={publishDate}
                onChange={(e) => setPublishDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Expiry Date</label>

              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="cancel-btn"
              onClick={() => navigate("/admin/announcements")}
            >
              Cancel
            </button>

            <button type="submit" className="save-btn" disabled={loading}>
              {loading ? "Creating..." : "Create Announcement"}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}

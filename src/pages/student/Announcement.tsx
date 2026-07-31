import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";
import { useNavigate } from "react-router-dom";

export default function AnnouncementS() {
  const navigate = useNavigate();
  const user = authService.getSession();

  if (!user || user.role !== "Student") {
    navigate("/login");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="announcement-student">
        <p>announcement</p>
      </div>
    </DashboardLayout>
  );
}

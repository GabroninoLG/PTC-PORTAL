const API_BASE_URL = "http://localhost:3000";

export const api = {
  baseUrl: API_BASE_URL,

  documents: {
    async request(
      userId: number,
      documentType: string,
      remarks: string,
    ) {
      const res = await fetch(
        `${API_BASE_URL}/api/documents/request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: userId,
            document_type: documentType,
            remarks,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.message || "Failed to submit document request.",
        );
      }

      return data;
    },

    async getStudentRequests(studentId: number) {
      const res = await fetch(
        `${API_BASE_URL}/api/documents/student/${studentId}`,
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.message || "Failed to retrieve document requests.",
        );
      }

      return data;
    },
  },
};
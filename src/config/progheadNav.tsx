export const progheadNavGroups = [
  {
    id: "grade-approval",
    label: "Grade Approval",
    icon: "",
    children: [
      {
        label: "Pending Grades",
        path: "/proghead/gradeapproval/pending",
      },
      {
        label: "Approved Grades",
        path: "/proghead/gradeapproval/approved",
      },
      {
        label: "Rejected Grades",
        path: "/proghead/gradeapproval/rejected",
      },
    ],
  },
  {
    id: "curriculum",
    label: "Curriculum Management",
    icon: "",
    children: [
      {
        label: "Curriculum",
        path: "/proghead/curriculum",
      },
      {
        label: "Subjects",
        path: "/proghead/subjects",
      },
      {
        label: "Prerequisites",
        path: "/proghead/prerequisites",
      },
    ],
  },
  {
    id: "faculty",
    label: "Faculty Management",
    icon: "",
    children: [
      {
        label: "Faculty List",
        path: "/proghead/faculty",
      },
      {
        label: "Teaching Loads",
        path: "/proghead/faculty/loads",
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: "",
    children: [
      {
        label: "Enrollment Report",
        path: "/proghead/reports/enrollment",
      },
      {
        label: "Grade Report",
        path: "/proghead/reports/grades",
      },
    ],
  },
];

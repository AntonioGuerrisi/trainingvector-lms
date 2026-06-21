import type { Course, CourseProgressReport, DirectoryData, DirectoryVideo, H5PConfig, ProgressReportRow, ReportOverview, Role, User } from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const body = options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined;

  if (body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body
  });

  if (!response.ok) {
    const problem = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(problem.message ?? "Request failed");
  }

  return response.json() as Promise<T>;
}

export const api = {
  login(email: string, password: string) {
    return request<{ user: User; token: string }>("/api/auth/login", {
      method: "POST",
      body: { email, password }
    });
  },
  me(token: string) {
    return request<{ user: User }>("/api/auth/me", { token });
  },
  changePassword(token: string, payload: { currentPassword: string; newPassword: string; confirmNewPassword: string }) {
    return request<{ changed: boolean }>("/api/auth/password", {
      method: "PUT",
      token,
      body: payload
    });
  },
  courses(token: string) {
    return request<{ courses: Course[] }>("/api/courses", { token });
  },
  course(token: string, courseId: string) {
    return request<{ course: Course }>(`/api/courses/${courseId}`, { token });
  },
  updateProgress(
    token: string,
    payload: { courseId: string; videoId: string; watchedSeconds: number; lastPositionSeconds: number; percent: number; completed?: boolean }
  ) {
    return request<{ progress: unknown }>("/api/progress/video", {
      method: "POST",
      token,
      body: payload
    });
  },
  h5pEvent(
    token: string,
    payload: { courseId: string; videoId: string; interactionId?: string; type: string; payload: Record<string, unknown> }
  ) {
    return request<{ event: unknown }>("/api/progress/h5p-event", {
      method: "POST",
      token,
      body: payload
    });
  },
  overview(token: string) {
    return request<{ overview: ReportOverview }>("/api/reports/overview", { token });
  },
  courseReport(token: string, courseId: string) {
    return request<CourseProgressReport>(`/api/reports/courses/${courseId}`, { token });
  },
  progressReport(token: string) {
    return request<{ progress: ProgressReportRow[] }>("/api/reports/progress", { token });
  },
  directory(token: string) {
    return request<DirectoryData>("/api/directory", { token });
  },
  createUser(token: string, payload: { name: string; email: string; password: string; role: Role }) {
    return request<{ user: User }>("/api/admin/users", {
      method: "POST",
      token,
      body: payload
    });
  },
  updateUser(token: string, userId: string, payload: { name: string; email: string; role: Role }) {
    return request<{ user: User }>(`/api/admin/users/${userId}`, {
      method: "PUT",
      token,
      body: payload
    });
  },
  deleteUser(token: string, userId: string) {
    return request<{ deletedUserId: string }>(`/api/admin/users/${userId}`, {
      method: "DELETE",
      token
    });
  },
  resetUserPassword(token: string, userId: string, payload: { newPassword: string; confirmNewPassword: string }) {
    return request<{ user: User }>(`/api/admin/users/${userId}/password`, {
      method: "PUT",
      token,
      body: payload
    });
  },
  createGroup(token: string, payload: { name: string }) {
    return request<{ group: unknown }>("/api/admin/groups", {
      method: "POST",
      token,
      body: payload
    });
  },
  addGroupMember(token: string, groupId: string, payload: { userId: string; roleLabel?: string }) {
    return request<{ membership: unknown }>(`/api/admin/groups/${groupId}/members`, {
      method: "POST",
      token,
      body: payload
    });
  },
  createCourse(token: string, payload: { title: string; description: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" }) {
    return request<{ course: unknown }>("/api/admin/courses", {
      method: "POST",
      token,
      body: payload
    });
  },
  updateCourse(token: string, courseId: string, payload: { title: string; description: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" }) {
    return request<{ course: Course }>(`/api/admin/courses/${courseId}`, {
      method: "PUT",
      token,
      body: payload
    });
  },
  deleteCourse(token: string, courseId: string) {
    return request<{ deletedCourseId: string }>(`/api/admin/courses/${courseId}`, {
      method: "DELETE",
      token
    });
  },
  attachVideo(token: string, courseId: string, payload: { videoId: string; position: number; gatePrevious: boolean }) {
    return request<{ courseVideo: unknown }>(`/api/admin/courses/${courseId}/videos`, {
      method: "POST",
      token,
      body: payload
    });
  },
  assign(
    token: string,
    payload: { courseId?: string; videoId?: string; userId?: string; groupId?: string; dueAt?: string; notes?: string }
  ) {
    return request<{ assignment: unknown }>("/api/assignments", {
      method: "POST",
      token,
      body: payload
    });
  },
  uploadVideo(token: string, formData: FormData) {
    return request<{ video: unknown }>("/api/admin/videos/upload", {
      method: "POST",
      token,
      body: formData
    });
  },
  updateVideo(token: string, videoId: string, payload: { title: string; description: string; durationSeconds?: number | null; h5pConfig: H5PConfig }) {
    return request<{ video: DirectoryVideo }>(`/api/admin/videos/${videoId}`, {
      method: "PUT",
      token,
      body: payload
    });
  },
  deleteVideos(token: string, videoIds: string[]) {
    return request<{ deletedVideoIds: string[] }>("/api/admin/videos", {
      method: "DELETE",
      token,
      body: { videoIds }
    });
  },
  updateVideoH5P(token: string, videoId: string, payload: H5PConfig) {
    return request<{ video: unknown }>(`/api/admin/videos/${videoId}/h5p`, {
      method: "PUT",
      token,
      body: payload
    });
  }
};

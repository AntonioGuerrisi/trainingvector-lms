import type { Course, DirectoryData, ReportOverview, User } from "../types";

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
  directory(token: string) {
    return request<DirectoryData>("/api/directory", { token });
  },
  createCourse(token: string, payload: { title: string; description: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" }) {
    return request<{ course: unknown }>("/api/admin/courses", {
      method: "POST",
      token,
      body: payload
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
  }
};

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  BookOpenCheck,
  Check,
  ChevronRight,
  FileVideo,
  Lock,
  LogOut,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Upload,
  UserPlus,
  Users
} from "lucide-react";
import { api } from "./lib/api";
import { cn, formatPercent, resolveMediaUrl } from "./lib/utils";
import type { Course, CourseVideo, DirectoryData, H5PInteraction, ReportOverview, Role, User } from "./types";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";

const demoAccounts = [
  { label: "Admin", email: "admin@lms.local", password: "admin123" },
  { label: "Professor", email: "professor@lms.local", password: "professor123" },
  { label: "Student", email: "student@lms.local", password: "student123" }
];

function roleLabel(role: Role) {
  return role === "ADMIN" ? "Administrator" : role === "PROFESSOR" ? "Professor" : "Student";
}

function isStaff(role: Role) {
  return role === "ADMIN" || role === "PROFESSOR";
}

type ToastState = { type: "success" | "error"; message: string } | null;

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem("lms-token") ?? "");
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [overview, setOverview] = useState<ReportOverview | null>(null);
  const [directory, setDirectory] = useState<DirectoryData | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [toast, setToast] = useState<ToastState>(null);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? courses[0],
    [courses, selectedCourseId]
  );

  const selectedVideo = useMemo(
    () => selectedCourse?.videos.find((video) => video.id === selectedVideoId && !video.locked) ?? selectedCourse?.videos.find((video) => !video.locked),
    [selectedCourse, selectedVideoId]
  );

  async function refreshData(nextToken = token, nextUser = user) {
    if (!nextToken || !nextUser) {
      return;
    }

    setLoading(true);
    try {
      const courseResponse = await api.courses(nextToken);
      setCourses(courseResponse.courses);
      const firstCourse = courseResponse.courses[0];
      setSelectedCourseId((current) => current || firstCourse?.id || "");
      setSelectedVideoId((current) => current || firstCourse?.videos.find((video) => !video.locked)?.id || "");

      if (isStaff(nextUser.role)) {
        const [overviewResponse, directoryResponse] = await Promise.all([api.overview(nextToken), api.directory(nextToken)]);
        setOverview(overviewResponse.overview);
        setDirectory(directoryResponse);
      }
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Loading failed" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .me(token)
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        return refreshData(token, currentUser);
      })
      .catch(() => {
        localStorage.removeItem("lms-token");
        setToken("");
        setUser(null);
      });
  }, [token]);

  async function handleLogin(email: string, password: string) {
    setLoading(true);
    try {
      const response = await api.login(email, password);
      localStorage.setItem("lms-token", response.token);
      setToken(response.token);
      setUser(response.user);
      setToast({ type: "success", message: `Signed in as ${roleLabel(response.user.role)}` });
      await refreshData(response.token, response.user);
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Sign-in failed" });
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("lms-token");
    setToken("");
    setUser(null);
    setCourses([]);
    setOverview(null);
    setDirectory(null);
  }

  if (!user || !token) {
    return <LoginView onLogin={handleLogin} loading={loading} toast={toast} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BookOpenCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold leading-7">Video LMS</h1>
              <p className="text-sm text-muted-foreground">{roleLabel(user.role)} · {user.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refreshData()} disabled={loading} title="Refresh data">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
              Refresh
            </Button>
            <Button variant="ghost" size="icon" onClick={logout} title="Sign out">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:px-6">
        <aside className="space-y-4">
          <CourseList
            courses={courses}
            selectedCourseId={selectedCourse?.id ?? ""}
            selectedVideoId={selectedVideo?.id ?? ""}
            onSelectCourse={(courseId) => {
              setSelectedCourseId(courseId);
              const course = courses.find((entry) => entry.id === courseId);
              setSelectedVideoId(course?.videos.find((video) => !video.locked)?.id ?? "");
            }}
            onSelectVideo={(courseId, videoId) => {
              setSelectedCourseId(courseId);
              setSelectedVideoId(videoId);
            }}
          />
          {overview && <ReportSummary overview={overview} />}
        </aside>

        <section className="space-y-4">
          {selectedCourse && selectedVideo ? (
            <LearningPanel
              token={token}
              course={selectedCourse}
              video={selectedVideo}
              onProgressSaved={() => refreshData()}
              onToast={setToast}
            />
          ) : (
            <EmptyState />
          )}

          {isStaff(user.role) && directory && (
            <ManagementPanel
              token={token}
              role={user.role}
              courses={courses}
              directory={directory}
              onChanged={() => refreshData()}
              onToast={setToast}
            />
          )}
        </section>
      </main>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function LoginView({ onLogin, loading, toast }: { onLogin: (email: string, password: string) => Promise<void>; loading: boolean; toast: ToastState }) {
  const [email, setEmail] = useState("student@lms.local");
  const [password, setPassword] = useState("student123");

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle>Video LMS</CardTitle>
              <p className="text-sm text-muted-foreground">Training platform access</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void onLogin(email, password);
            }}
          >
            <label className="block text-sm font-medium">
              Email
              <input className="field mt-1" value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input className="field mt-1" value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
            </label>
            <Button className="w-full" disabled={loading}>
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              Sign in
            </Button>
          </form>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {demoAccounts.map((account) => (
              <Button
                key={account.email}
                variant="outline"
                size="sm"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
              >
                {account.label}
              </Button>
            ))}
          </div>
          {toast && <p className={cn("mt-3 text-sm", toast.type === "error" ? "text-destructive" : "text-primary")}>{toast.message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function CourseList({
  courses,
  selectedCourseId,
  selectedVideoId,
  onSelectCourse,
  onSelectVideo
}: {
  courses: Course[];
  selectedCourseId: string;
  selectedVideoId: string;
  onSelectCourse: (courseId: string) => void;
  onSelectVideo: (courseId: string, videoId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
          Courses
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {courses.map((course) => (
          <div key={course.id} className="rounded-md border bg-white">
            <button
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
              onClick={() => onSelectCourse(course.id)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{course.title}</span>
                <span className="text-xs text-muted-foreground">
                  {course.completedVideos}/{course.totalVideos} video · {formatPercent(course.progressPercent)}
                </span>
              </span>
              <ChevronRight className={cn("h-4 w-4 shrink-0", selectedCourseId === course.id && "text-primary")} aria-hidden="true" />
            </button>
            <div className="h-1 bg-muted">
              <div className="h-full bg-primary" style={{ width: `${course.progressPercent}%` }} />
            </div>
            {selectedCourseId === course.id && (
              <div className="divide-y">
                {course.videos.map((video) => (
                  <button
                    key={video.id}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition",
                      selectedVideoId === video.id && "bg-primary/10",
                      video.locked ? "text-muted-foreground" : "hover:bg-muted"
                    )}
                    disabled={video.locked}
                    onClick={() => onSelectVideo(course.id, video.id)}
                    type="button"
                  >
                    {video.locked ? <Lock className="h-4 w-4" aria-hidden="true" /> : video.progress.completed ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : <PlayCircle className="h-4 w-4" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate">{video.position}. {video.title}</span>
                    <span className="text-xs">{formatPercent(video.progress.percent)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function LearningPanel({
  token,
  course,
  video,
  onProgressSaved,
  onToast
}: {
  token: string;
  course: Course;
  video: CourseVideo;
  onProgressSaved: () => void;
  onToast: (toast: ToastState) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedRef = useRef(0);
  const [activeInteraction, setActiveInteraction] = useState<H5PInteraction | null>(null);
  const [answeredInteractions, setAnsweredInteractions] = useState<Set<string>>(new Set());

  useEffect(() => {
    setAnsweredInteractions(new Set());
    lastSavedRef.current = 0;
  }, [video.id]);

  async function saveProgress(completed = false) {
    const element = videoRef.current;
    if (!element || !Number.isFinite(element.duration) || element.duration <= 0) {
      return;
    }

    const percent = Math.min(100, Math.max(video.progress.percent, (element.currentTime / element.duration) * 100));
    await api.updateProgress(token, {
      courseId: course.id,
      videoId: video.id,
      watchedSeconds: Math.max(video.progress.watchedSeconds, element.currentTime),
      lastPositionSeconds: element.currentTime,
      percent,
      completed: completed || percent >= 95
    });
  }

  function handleTimeUpdate() {
    const element = videoRef.current;
    if (!element) {
      return;
    }

    const interactions = video.h5pConfig?.interactions ?? [];
    const nextInteraction = interactions.find(
      (interaction) => element.currentTime >= interaction.time && !answeredInteractions.has(interaction.id)
    );

    if (nextInteraction) {
      element.pause();
      setActiveInteraction(nextInteraction);
      return;
    }

    if (element.currentTime - lastSavedRef.current > 5) {
      lastSavedRef.current = element.currentTime;
      void saveProgress().catch((error) => onToast({ type: "error", message: error.message }));
    }
  }

  async function confirmInteraction(interaction: H5PInteraction) {
    setAnsweredInteractions((current) => new Set(current).add(interaction.id));
    setActiveInteraction(null);
    await api.h5pEvent(token, {
      courseId: course.id,
      videoId: video.id,
      interactionId: interaction.id,
      type: interaction.type,
      payload: { title: interaction.title, prompt: interaction.prompt, answeredAt: new Date().toISOString() }
    });
    await videoRef.current?.play().catch(() => undefined);
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-panel">
      <div className="bg-slate-950">
        <video
          key={video.id}
          ref={videoRef}
          className="aspect-video w-full bg-slate-950 object-contain"
          controls
          src={resolveMediaUrl(video.sourceUrl)}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => {
            void saveProgress(true)
              .then(onProgressSaved)
              .then(() => onToast({ type: "success", message: "Video completed" }))
              .catch((error) => onToast({ type: "error", message: error.message }));
          }}
        />
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <p className="text-sm font-medium text-primary">{course.title}</p>
          <h2 className="mt-1 text-2xl font-semibold leading-8">{video.title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{video.description}</p>
        </div>
        <div className="rounded-md border bg-muted/40 p-3">
          <div className="flex items-center justify-between text-sm">
            <span>Progress</span>
            <strong>{formatPercent(video.progress.percent)}</strong>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${video.progress.percent}%` }} />
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <FileVideo className="h-4 w-4" aria-hidden="true" />
            {video.h5pConfig?.interactions?.length ?? 0} H5P interactions
          </div>
        </div>
      </div>

      {activeInteraction && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-lg border bg-white p-5 shadow-panel">
            <h3 className="text-lg font-semibold">{activeInteraction.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{activeInteraction.prompt}</p>
            <div className="mt-5 flex justify-end">
              <Button onClick={() => void confirmInteraction(activeInteraction)}>
                <Check className="h-4 w-4" aria-hidden="true" />
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportSummary({ overview }: { overview: ReportOverview }) {
  const metrics = [
    { label: "Courses", value: overview.courses, icon: BookOpenCheck },
    { label: "Video", value: overview.videos, icon: FileVideo },
    { label: "Learners", value: overview.learners, icon: Users },
    { label: "Completed", value: overview.completedViews, icon: Check },
    { label: "Average", value: `${overview.averageProgress}%`, icon: BarChart3 },
    { label: "H5P events", value: overview.h5pEvents, icon: PlayCircle }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          Report
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-md border bg-white p-3">
              <metric.icon className="h-4 w-4 text-primary" aria-hidden="true" />
              <p className="mt-2 text-xl font-semibold">{metric.value}</p>
              <p className="text-xs text-muted-foreground">{metric.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ManagementPanel({
  token,
  role,
  courses,
  directory,
  onChanged,
  onToast
}: {
  token: string;
  role: Role;
  courses: Course[];
  directory: DirectoryData;
  onChanged: () => void;
  onToast: (toast: ToastState) => void;
}) {
  const [courseForm, setCourseForm] = useState({ title: "", description: "", status: "PUBLISHED" as const });
  const [attachForm, setAttachForm] = useState({ courseId: courses[0]?.id ?? "", videoId: directory.videos[0]?.id ?? "", position: "1", gatePrevious: true });
  const [assignmentForm, setAssignmentForm] = useState({ targetType: "group", contentType: "course", courseId: courses[0]?.id ?? "", videoId: directory.videos[0]?.id ?? "", userId: directory.users[0]?.id ?? "", groupId: directory.groups[0]?.id ?? "", dueAt: "", notes: "" });
  const [uploadForm, setUploadForm] = useState({ title: "", description: "", popupTime: "15", popupTitle: "Check", popupPrompt: "Do you confirm that you understood the content?" });
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    setAttachForm((current) => ({ ...current, courseId: current.courseId || courses[0]?.id || "", videoId: current.videoId || directory.videos[0]?.id || "" }));
    setAssignmentForm((current) => ({
      ...current,
      courseId: current.courseId || courses[0]?.id || "",
      videoId: current.videoId || directory.videos[0]?.id || "",
      userId: current.userId || directory.users[0]?.id || "",
      groupId: current.groupId || directory.groups[0]?.id || ""
    }));
  }, [courses, directory]);

  async function runAction(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      onToast({ type: "success", message });
      await onChanged();
    } catch (error) {
      onToast({ type: "error", message: error instanceof Error ? error.message : "Operation failed" });
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Courses
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input className="field" placeholder="Title" value={courseForm.title} onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })} />
          <textarea className="textarea-field" placeholder="Description" value={courseForm.description} onChange={(event) => setCourseForm({ ...courseForm, description: event.target.value })} />
          <select className="field" value={courseForm.status} onChange={(event) => setCourseForm({ ...courseForm, status: event.target.value as typeof courseForm.status })}>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <Button onClick={() => runAction(() => api.createCourse(token, courseForm), "Course created")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create course
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileVideo className="h-4 w-4" aria-hidden="true" />
            Video sequence
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <select className="field" value={attachForm.courseId} onChange={(event) => setAttachForm({ ...attachForm, courseId: event.target.value })}>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
          </select>
          <select className="field" value={attachForm.videoId} onChange={(event) => setAttachForm({ ...attachForm, videoId: event.target.value })}>
            {directory.videos.map((video) => <option key={video.id} value={video.id}>{video.title}</option>)}
          </select>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <input className="field" type="number" min="1" value={attachForm.position} onChange={(event) => setAttachForm({ ...attachForm, position: event.target.value })} />
            <label className="flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm">
              <input type="checkbox" checked={attachForm.gatePrevious} onChange={(event) => setAttachForm({ ...attachForm, gatePrevious: event.target.checked })} />
              Gate
            </label>
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              runAction(
                () => api.attachVideo(token, attachForm.courseId, { videoId: attachForm.videoId, position: Number(attachForm.position), gatePrevious: attachForm.gatePrevious }),
                "Video linked"
              )
            }
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            Link
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Assignments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <select className="field" value={assignmentForm.contentType} onChange={(event) => setAssignmentForm({ ...assignmentForm, contentType: event.target.value })}>
              <option value="course">Course</option>
              <option value="video">Video</option>
            </select>
            <select className="field" value={assignmentForm.targetType} onChange={(event) => setAssignmentForm({ ...assignmentForm, targetType: event.target.value })}>
              <option value="group">Group</option>
              <option value="user">User</option>
            </select>
          </div>
          {assignmentForm.contentType === "course" ? (
            <select className="field" value={assignmentForm.courseId} onChange={(event) => setAssignmentForm({ ...assignmentForm, courseId: event.target.value })}>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          ) : (
            <select className="field" value={assignmentForm.videoId} onChange={(event) => setAssignmentForm({ ...assignmentForm, videoId: event.target.value })}>
              {directory.videos.map((video) => <option key={video.id} value={video.id}>{video.title}</option>)}
            </select>
          )}
          {assignmentForm.targetType === "group" ? (
            <select className="field" value={assignmentForm.groupId} onChange={(event) => setAssignmentForm({ ...assignmentForm, groupId: event.target.value })}>
              {directory.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          ) : (
            <select className="field" value={assignmentForm.userId} onChange={(event) => setAssignmentForm({ ...assignmentForm, userId: event.target.value })}>
              {directory.users.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {roleLabel(entry.role)}</option>)}
            </select>
          )}
          <input className="field" type="datetime-local" value={assignmentForm.dueAt} onChange={(event) => setAssignmentForm({ ...assignmentForm, dueAt: event.target.value })} />
          <textarea className="textarea-field" placeholder="Notes" value={assignmentForm.notes} onChange={(event) => setAssignmentForm({ ...assignmentForm, notes: event.target.value })} />
          <Button
            onClick={() =>
              runAction(
                () =>
                  api.assign(token, {
                    courseId: assignmentForm.contentType === "course" ? assignmentForm.courseId : undefined,
                    videoId: assignmentForm.contentType === "video" ? assignmentForm.videoId : undefined,
                    groupId: assignmentForm.targetType === "group" ? assignmentForm.groupId : undefined,
                    userId: assignmentForm.targetType === "user" ? assignmentForm.userId : undefined,
                    dueAt: assignmentForm.dueAt ? new Date(assignmentForm.dueAt).toISOString() : undefined,
                    notes: assignmentForm.notes || undefined
                  }),
                "Assignment created"
              )
            }
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Assign
          </Button>
        </CardContent>
      </Card>

      {role === "ADMIN" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" aria-hidden="true" />
              Upload MP4
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input className="field" placeholder="Video title" value={uploadForm.title} onChange={(event) => setUploadForm({ ...uploadForm, title: event.target.value })} />
            <textarea className="textarea-field" placeholder="Description" value={uploadForm.description} onChange={(event) => setUploadForm({ ...uploadForm, description: event.target.value })} />
            <input className="field" type="file" accept="video/mp4" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input className="field" type="number" min="0" placeholder="Second" value={uploadForm.popupTime} onChange={(event) => setUploadForm({ ...uploadForm, popupTime: event.target.value })} />
              <input className="field sm:col-span-2" placeholder="Popup title" value={uploadForm.popupTitle} onChange={(event) => setUploadForm({ ...uploadForm, popupTitle: event.target.value })} />
            </div>
            <textarea className="textarea-field" placeholder="Popup text" value={uploadForm.popupPrompt} onChange={(event) => setUploadForm({ ...uploadForm, popupPrompt: event.target.value })} />
            <Button
              variant="secondary"
              onClick={() =>
                runAction(async () => {
                  if (!file) {
                    throw new Error("Select an MP4 file");
                  }
                  const formData = new FormData();
                  formData.set("video", file);
                  formData.set("title", uploadForm.title || file.name);
                  formData.set("description", uploadForm.description);
                  formData.set(
                    "h5pConfig",
                    JSON.stringify({
                      interactions: [
                        {
                          id: crypto.randomUUID(),
                          time: Number(uploadForm.popupTime),
                          type: "popup",
                          title: uploadForm.popupTitle,
                          prompt: uploadForm.popupPrompt
                        }
                      ]
                    })
                  );
                  await api.uploadVideo(token, formData);
                }, "Video uploaded")
              }
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Upload
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-lg border bg-white shadow-panel">
      <div className="text-center">
        <BookOpenCheck className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-semibold">No content available</h2>
        <p className="mt-1 text-sm text-muted-foreground">Assigned content will appear here.</p>
      </div>
    </div>
  );
}

function Toast({ toast, onClose }: { toast: Exclude<ToastState, null>; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border bg-white p-4 shadow-panel">
      <p className={cn("text-sm font-medium", toast.type === "error" ? "text-destructive" : "text-primary")}>{toast.message}</p>
    </div>
  );
}
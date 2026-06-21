import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Award,
  BarChart3,
  BookOpenCheck,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileVideo,
  Gauge,
  GraduationCap,
  Home,
  KeyRound,
  Layers,
  ListChecks,
  Lock,
  LogOut,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { api } from "./lib/api";
import { cn, formatPercent, resolveMediaUrl } from "./lib/utils";
import type { Course, CourseVideo, DirectoryData, DirectoryUser, DirectoryVideo, H5PInteraction, ProgressReportRow, ReportOverview, Role, User } from "./types";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";

type ToastState = { type: "success" | "error"; message: string } | null;
type ProgressSavedHandler = () => void | Promise<void>;
type PageId = "dashboard" | "catalog" | "videos" | "learning" | "users" | "groups" | "courses" | "progress" | "reports" | "settings";
type IconComponent = typeof Home;

type NavItem = {
  id: PageId;
  label: string;
  description: string;
  icon: IconComponent;
};

const demoAccounts = [
  { label: "Admin", email: "admin@lms.local", password: "admin123" },
  { label: "Professor", email: "professor@lms.local", password: "professor123" },
  { label: "Student", email: "student@lms.local", password: "student123" }
];

const roleOptions: Role[] = ["STUDENT", "PROFESSOR", "ADMIN"];

function roleLabel(role: Role) {
  return role === "ADMIN" ? "Administrator" : role === "PROFESSOR" ? "Professor" : "Student";
}

function isStaff(role: Role) {
  return role === "ADMIN" || role === "PROFESSOR";
}

function isCheckpointInteraction(interaction: H5PInteraction) {
  return interaction.type === "checkpoint";
}

function isStandaloneCourse(course: Course) {
  return course.id.startsWith("standalone:");
}

function navigationForRole(role: Role): NavItem[] {
  if (role === "ADMIN") {
    return [
      { id: "dashboard", label: "Dashboard", description: "System overview", icon: Home },
      { id: "users", label: "Users", description: "Create accounts", icon: UserPlus },
      { id: "groups", label: "Groups", description: "Learner cohorts", icon: Users },
      { id: "courses", label: "Courses", description: "Build paths", icon: Layers },
      { id: "progress", label: "Certification", description: "Review progress", icon: Award },
      { id: "videos", label: "Videos", description: "Library and H5P", icon: FileVideo },
      { id: "reports", label: "Reports", description: "Usage analytics", icon: BarChart3 },
      { id: "settings", label: "Settings", description: "Platform status", icon: Settings }
    ];
  }

  if (role === "PROFESSOR") {
    return [
      { id: "dashboard", label: "Dashboard", description: "Teaching overview", icon: Home },
      { id: "groups", label: "Groups", description: "Learner cohorts", icon: Users },
      { id: "videos", label: "Videos", description: "Library and H5P", icon: FileVideo },
      { id: "courses", label: "Courses", description: "Build paths", icon: Layers },
      { id: "progress", label: "Certification", description: "Review progress", icon: Award },
      { id: "reports", label: "Reports", description: "Course analytics", icon: BarChart3 },
      { id: "settings", label: "Settings", description: "Platform status", icon: Settings }
    ];
  }

  return [
    { id: "dashboard", label: "Dashboard", description: "Your progress", icon: Home },
    { id: "catalog", label: "Available courses", description: "Assigned course paths", icon: BookOpenCheck },
    { id: "videos", label: "Available videos", description: "Standalone videos", icon: FileVideo },
    { id: "settings", label: "Settings", description: "Account status", icon: Settings }
  ];
}

function progressSummary(courses: Course[]) {
  const videos = courses.flatMap((course) => course.videos);
  const completed = videos.filter((video) => video.progress.completed).length;
  const average = videos.length === 0 ? 0 : Math.round(videos.reduce((sum, video) => sum + video.progress.percent, 0) / videos.length);

  return { assignedCourses: courses.length, assignedVideos: videos.length, completedVideos: completed, averageProgress: average };
}

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem("lms-token") ?? "");
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [overview, setOverview] = useState<ReportOverview | null>(null);
  const [directory, setDirectory] = useState<DirectoryData | null>(null);
  const [progressRows, setProgressRows] = useState<ProgressReportRow[]>([]);
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [loading, setLoading] = useState(Boolean(token));
  const [toast, setToast] = useState<ToastState>(null);

  const selectedCourse = useMemo(() => courses.find((course) => course.id === selectedCourseId) ?? courses[0], [courses, selectedCourseId]);
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
      setSelectedCourseId((current) => (current && courseResponse.courses.some((course) => course.id === current) ? current : firstCourse?.id ?? ""));
      setSelectedVideoId((current) => {
        const stillAvailable = courseResponse.courses.some((course) => course.videos.some((video) => video.id === current && !video.locked));
        return current && stillAvailable ? current : firstCourse?.videos.find((video) => !video.locked)?.id ?? "";
      });

      if (isStaff(nextUser.role)) {
        const [overviewResponse, directoryResponse, progressResponse] = await Promise.all([api.overview(nextToken), api.directory(nextToken), api.progressReport(nextToken)]);
        setOverview(overviewResponse.overview);
        setDirectory(directoryResponse);
        setProgressRows(progressResponse.progress);
      } else {
        setOverview(null);
        setDirectory(null);
        setProgressRows([]);
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
        setActivePage("dashboard");
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
      setActivePage("dashboard");
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
    setProgressRows([]);
  }

  async function runAction(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      setToast({ type: "success", message });
      await refreshData();
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Operation failed" });
    }
  }

  function selectLearning(courseId: string, videoId?: string) {
    const course = courses.find((entry) => entry.id === courseId);
    const video = videoId ? course?.videos.find((entry) => entry.id === videoId) : course?.videos.find((entry) => !entry.locked);

    setSelectedCourseId(courseId);
    setSelectedVideoId(video?.id ?? "");
    setActivePage("learning");
  }

  if (!user || !token) {
    return <LoginView onLogin={handleLogin} loading={loading} toast={toast} />;
  }

  const navItems = navigationForRole(user.role);
  const activePageTitle = navItems.find((item) => item.id === activePage)?.label ?? (activePage === "learning" ? "Player" : "Dashboard");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b bg-white lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
            <div className="border-b px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Gauge className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold leading-6">TrainingVector LMS</h1>
                  <p className="text-sm text-muted-foreground">{roleLabel(user.role)} workspace</p>
                </div>
              </div>
            </div>

            <nav className="grid gap-1 p-3 sm:grid-cols-2 lg:grid-cols-1" aria-label="Main navigation">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  className={cn("flex min-h-14 items-center gap-3 rounded-md px-3 py-2 text-left transition", activePage === item.id ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                  onClick={() => setActivePage(item.id)}
                  type="button"
                >
                  <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{item.label}</span>
                    <span className={cn("block truncate text-xs", activePage === item.id ? "text-primary-foreground/80" : "text-muted-foreground")}>{item.description}</span>
                  </span>
                </button>
              ))}
            </nav>

            <div className="mt-auto border-t p-4">
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
              <div>
                <p className="text-sm font-medium text-primary">{roleLabel(user.role)}</p>
                <h2 className="text-2xl font-semibold leading-8">{activePageTitle}</h2>
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

          <main className="mx-auto max-w-7xl px-4 py-5 lg:px-6">
            <PageRouter
              activePage={activePage}
              token={token}
              user={user}
              courses={courses}
              selectedCourse={selectedCourse}
              selectedVideo={selectedVideo}
              directory={directory}
              overview={overview}
              progressRows={progressRows}
              onSelectLearning={selectLearning}
              onProgressSaved={() => refreshData()}
              onToast={setToast}
              onRunAction={runAction}
            />
          </main>
        </div>
      </div>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function PageRouter({
  activePage,
  token,
  user,
  courses,
  selectedCourse,
  selectedVideo,
  directory,
  overview,
  progressRows,
  onSelectLearning,
  onProgressSaved,
  onToast,
  onRunAction
}: {
  activePage: PageId;
  token: string;
  user: User;
  courses: Course[];
  selectedCourse?: Course;
  selectedVideo?: CourseVideo;
  directory: DirectoryData | null;
  overview: ReportOverview | null;
  progressRows: ProgressReportRow[];
  onSelectLearning: (courseId: string, videoId?: string) => void;
  onProgressSaved: ProgressSavedHandler;
  onToast: (toast: ToastState) => void;
  onRunAction: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  if (activePage === "dashboard") {
    return <DashboardPage user={user} courses={courses} directory={directory} overview={overview} progressRows={progressRows} onSelectLearning={onSelectLearning} />;
  }

  if (activePage === "catalog") {
    return <StudentCoursesPage courses={courses.filter((course) => !isStandaloneCourse(course))} onSelectLearning={onSelectLearning} />;
  }

  if (activePage === "videos") {
    if (user.role === "STUDENT") {
      return <StudentVideosPage courses={courses.filter(isStandaloneCourse)} onSelectLearning={onSelectLearning} />;
    }

    return directory ? <VideoManagementPage token={token} directory={directory} onRunAction={onRunAction} /> : <EmptyState title="Video library unavailable" description="Refresh the workspace or sign in with a staff account." />;
  }

  if (activePage === "learning") {
    return selectedCourse && selectedVideo ? (
      <LearningWorkspace token={token} course={selectedCourse} video={selectedVideo} onSelectLearning={onSelectLearning} onProgressSaved={onProgressSaved} onToast={onToast} />
    ) : (
      <EmptyState title="No available lesson" description="Open an available course or standalone video to start playback." />
    );
  }

  if (!directory && activePage !== "settings") {
    return <EmptyState title="Management data unavailable" description="Refresh the workspace or sign in with a staff account." />;
  }

  if (activePage === "users" && directory) {
    return <UserManagementPage token={token} directory={directory} onRunAction={onRunAction} />;
  }

  if (activePage === "groups" && directory) {
    return <GroupManagementPage token={token} directory={directory} onRunAction={onRunAction} />;
  }

  if (activePage === "courses" && directory) {
    return <CourseManagementPage token={token} courses={courses} directory={directory} onRunAction={onRunAction} />;
  }

  if (activePage === "progress") {
    return <ProgressCertificationPage courses={courses} progressRows={progressRows} />;
  }

  if (activePage === "reports") {
    return <ReportsPage overview={overview} courses={courses} progressRows={progressRows} />;
  }

  return <SettingsPage token={token} user={user} onRunAction={onRunAction} />;
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
              <CardTitle>TrainingVector LMS</CardTitle>
              <p className="text-sm text-muted-foreground">Business training platform</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void onLogin(email, password); }}>
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
              <Button key={account.email} variant="outline" size="sm" onClick={() => { setEmail(account.email); setPassword(account.password); }}>
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

function DashboardPage({
  user,
  courses,
  directory,
  overview,
  progressRows,
  onSelectLearning
}: {
  user: User;
  courses: Course[];
  directory: DirectoryData | null;
  overview: ReportOverview | null;
  progressRows: ProgressReportRow[];
  onSelectLearning: (courseId: string, videoId?: string) => void;
}) {
  if (user.role === "STUDENT") {
    const courseAssignments = courses.filter((course) => !isStandaloneCourse(course));
    const standaloneAssignments = courses.filter(isStandaloneCourse);
    const summary = progressSummary(courses);
    const nextCourse = courses.find((course) => course.videos.some((video) => !video.locked && !video.progress.completed));
    const nextVideo = nextCourse?.videos.find((video) => !video.locked && !video.progress.completed);

    return (
      <div className="space-y-5">
        <MetricGrid metrics={[
          { label: "Assigned courses", value: courseAssignments.length, icon: BookOpenCheck },
          { label: "Standalone videos", value: standaloneAssignments.length, icon: FileVideo },
          { label: "Completed videos", value: summary.completedVideos, icon: Check },
          { label: "Average progress", value: `${summary.averageProgress}%`, icon: Activity }
        ]} />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader><CardTitle>Course progress</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {courseAssignments.map((course) => <CourseProgressRow key={course.id} course={course} onOpen={() => onSelectLearning(course.id)} />)}
              {courseAssignments.length === 0 && <EmptyInline title="No course assignments" description="Assigned courses will appear here." />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Continue learning</CardTitle></CardHeader>
            <CardContent>
              {nextCourse && nextVideo ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold">{nextVideo.title}</p>
                  <p className="text-sm text-muted-foreground">{nextCourse.title}</p>
                  <Button onClick={() => onSelectLearning(nextCourse.id, nextVideo.id)}><PlayCircle className="h-4 w-4" aria-hidden="true" />Resume</Button>
                </div>
              ) : (
                <EmptyInline title="No pending videos" description="Completed learning items remain available in courses and videos." />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const staffMetrics = overview ? [
    { label: "Courses", value: overview.courses, icon: BookOpenCheck },
    { label: "Videos", value: overview.videos, icon: FileVideo },
    { label: "Learners", value: overview.learners, icon: Users },
    { label: "Average progress", value: `${overview.averageProgress}%`, icon: Activity }
  ] : [];

  return (
    <div className="space-y-5">
      <MetricGrid metrics={staffMetrics} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card><CardHeader><CardTitle>Recent videos</CardTitle></CardHeader><CardContent className="space-y-2">{directory?.videos.slice(0, 5).map((video) => <CompactItem key={video.id} title={video.title} detail={`${video.h5pConfig?.interactions?.length ?? 0} H5P checks`} />)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Groups</CardTitle></CardHeader><CardContent className="space-y-2">{directory?.groups.slice(0, 5).map((group) => <CompactItem key={group.id} title={group.name} detail={`${group.members.length} members`} />)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Progress review</CardTitle></CardHeader><CardContent className="space-y-2">{progressRows.slice(0, 5).map((row) => <CompactItem key={row.id} title={row.user.name} detail={`${row.video.title} - ${formatPercent(row.percent)}`} />)}</CardContent></Card>
      </div>
    </div>
  );
}

function StudentCoursesPage({ courses, onSelectLearning }: { courses: Course[]; onSelectLearning: (courseId: string, videoId?: string) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {courses.map((course) => (
        <Card key={course.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div><CardTitle>{course.title}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{course.description}</p></div>
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold">{formatPercent(course.progressPercent)}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${course.progressPercent}%` }} /></div>
            <div className="divide-y rounded-md border">
              {course.videos.map((video) => (
                <button key={video.id} className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm disabled:text-muted-foreground" disabled={video.locked} onClick={() => onSelectLearning(course.id, video.id)} type="button">
                  {video.locked ? <Lock className="h-4 w-4" aria-hidden="true" /> : video.progress.completed ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : <PlayCircle className="h-4 w-4" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate">{video.position}. {video.title}</span>
                  <span className="text-xs">{formatPercent(video.progress.percent)}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      {courses.length === 0 && <EmptyState title="No available courses" description="Assigned courses will appear here." />}
    </div>
  );
}

function StudentVideosPage({ courses, onSelectLearning }: { courses: Course[]; onSelectLearning: (courseId: string, videoId?: string) => void }) {
  const standaloneVideos = courses.flatMap((course) => {
    const video = course.videos[0];
    return video ? [{ course, video }] : [];
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {standaloneVideos.map(({ course, video }) => (
        <Card key={course.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div><CardTitle>{video.title}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{video.description}</p></div>
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold">{formatPercent(video.progress.percent)}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${video.progress.percent}%` }} /></div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><FileVideo className="h-4 w-4" aria-hidden="true" />{video.h5pConfig?.interactions?.length ?? 0} H5P interactions</div>
              <Button onClick={() => onSelectLearning(course.id, video.id)}><PlayCircle className="h-4 w-4" aria-hidden="true" />Open video</Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {standaloneVideos.length === 0 && <EmptyState title="No available videos" description="Standalone videos assigned to you will appear here." />}
    </div>
  );
}

function LearningWorkspace({ token, course, video, onSelectLearning, onProgressSaved, onToast }: { token: string; course: Course; video: CourseVideo; onSelectLearning: (courseId: string, videoId?: string) => void; onProgressSaved: ProgressSavedHandler; onToast: (toast: ToastState) => void }) {
  if (isStandaloneCourse(course)) {
    return <LearningPanel token={token} course={course} video={video} onProgressSaved={onProgressSaved} onToast={onToast} />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card>
        <CardHeader><CardTitle>Learning path</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-white">
            <div className="border-b px-3 py-2"><p className="truncate text-sm font-semibold">{course.title}</p><p className="text-xs text-muted-foreground">{formatPercent(course.progressPercent)}</p></div>
            <div className="divide-y">
              {course.videos.map((item) => (
                <button key={item.id} className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm", item.id === video.id && "bg-primary/10")} disabled={item.locked} onClick={() => onSelectLearning(course.id, item.id)} type="button">
                  {item.locked ? <Lock className="h-4 w-4" aria-hidden="true" /> : <PlayCircle className="h-4 w-4" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate">{item.position}. {item.title}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      <LearningPanel token={token} course={course} video={video} onProgressSaved={onProgressSaved} onToast={onToast} />
    </div>
  );
}

function LearningPanel({ token, course, video, onProgressSaved, onToast }: { token: string; course: Course; video: CourseVideo; onProgressSaved: ProgressSavedHandler; onToast: (toast: ToastState) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handledInteractionsRef = useRef<Set<string>>(new Set());
  const blockingPopupRef = useRef(false);
  const [activeInteraction, setActiveInteraction] = useState<H5PInteraction | null>(null);
  const [localProgress, setLocalProgress] = useState(video.progress);

  useEffect(() => { handledInteractionsRef.current = new Set(); blockingPopupRef.current = false; setActiveInteraction(null); setLocalProgress(video.progress); }, [video.id]);
  useEffect(() => {
    setLocalProgress((current) => ({
      percent: Math.max(current.percent, video.progress.percent),
      completed: current.completed || video.progress.completed,
      watchedSeconds: Math.max(current.watchedSeconds, video.progress.watchedSeconds),
      lastPositionSeconds: Math.max(current.lastPositionSeconds, video.progress.lastPositionSeconds)
    }));
  }, [video.progress.completed, video.progress.lastPositionSeconds, video.progress.percent, video.progress.watchedSeconds]);
  useEffect(() => { if (activeInteraction) { blockingPopupRef.current = true; videoRef.current?.pause(); } }, [activeInteraction]);

  function getPlaybackProgress(element: HTMLVideoElement, completed = false) {
    if (!Number.isFinite(element.duration) || element.duration <= 0) return null;
    const percent = Math.min(100, Math.max(video.progress.percent, localProgress.percent, (element.currentTime / element.duration) * 100));

    return {
      percent,
      completed: completed || video.progress.completed || localProgress.completed || percent >= 95,
      watchedSeconds: Math.max(video.progress.watchedSeconds, localProgress.watchedSeconds, element.currentTime),
      lastPositionSeconds: element.currentTime
    };
  }

  function syncLocalProgress(element: HTMLVideoElement, completed = false, updateVisibleProgress = true) {
    const progress = getPlaybackProgress(element, completed);
    if (!progress) return null;

    if (updateVisibleProgress) {
      setLocalProgress((current) => ({
        percent: Math.max(current.percent, progress.percent),
        completed: current.completed || progress.completed,
        watchedSeconds: Math.max(current.watchedSeconds, progress.watchedSeconds),
        lastPositionSeconds: progress.lastPositionSeconds
      }));
    }

    return progress;
  }

  async function saveProgress(completed = false, updateVisibleProgress = false) {
    const element = videoRef.current;
    if (!element) return;
    const progress = syncLocalProgress(element, completed, updateVisibleProgress);
    if (!progress) return;
    await api.updateProgress(token, { courseId: course.id, videoId: video.id, watchedSeconds: progress.watchedSeconds, lastPositionSeconds: progress.lastPositionSeconds, percent: progress.percent, completed: progress.completed });
  }

  function markInteractionHandled(interaction: H5PInteraction) {
    if (handledInteractionsRef.current.has(interaction.id)) return false;
    handledInteractionsRef.current.add(interaction.id);
    return true;
  }

  function recordInteraction(interaction: H5PInteraction, payload: Record<string, unknown>) {
    return api.h5pEvent(token, { courseId: course.id, videoId: video.id, interactionId: interaction.id, type: interaction.type, payload: { title: interaction.title, prompt: interaction.prompt, ...payload } });
  }

  async function saveCheckpointProgress(interaction: H5PInteraction) {
    const eventResult = recordInteraction(interaction, { reachedAt: new Date().toISOString(), mode: "transparent" }).then(() => null, (error: unknown) => error);

    await saveProgress(false, true);
    await onProgressSaved();

    const eventError = await eventResult;
    if (eventError) {
      throw eventError;
    }
  }

  function handleTimeUpdate() {
    const element = videoRef.current;
    if (!element || activeInteraction) return;

    const dueInteractions = [...(video.h5pConfig?.interactions ?? [])]
      .filter((interaction) => element.currentTime >= interaction.time && !handledInteractionsRef.current.has(interaction.id))
      .sort((first, second) => first.time - second.time);

    for (const interaction of dueInteractions.filter(isCheckpointInteraction)) {
      if (markInteractionHandled(interaction)) {
        void saveCheckpointProgress(interaction).catch((error) => onToast({ type: "error", message: error instanceof Error ? error.message : "Checkpoint progress refresh failed" }));
      }
    }

    const nextPopup = dueInteractions.find((interaction) => !isCheckpointInteraction(interaction));
    if (nextPopup && markInteractionHandled(nextPopup)) { blockingPopupRef.current = true; element.pause(); setActiveInteraction(nextPopup); void saveProgress(false, true).catch((error) => onToast({ type: "error", message: error.message })); }
  }

  function handleVideoPlay() {
    if (blockingPopupRef.current) {
      videoRef.current?.pause();
    }
  }

  async function confirmInteraction(interaction: H5PInteraction) {
    blockingPopupRef.current = false;
    setActiveInteraction(null);
    await recordInteraction(interaction, { confirmedAt: new Date().toISOString(), mode: "confirmed" });
    await videoRef.current?.play().catch(() => undefined);
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-panel">
      <div className="bg-slate-950"><video key={video.id} ref={videoRef} className="aspect-video w-full bg-slate-950 object-contain" controls controlsList="nodownload" disablePictureInPicture src={resolveMediaUrl(video.sourceUrl)} onPlay={handleVideoPlay} onTimeUpdate={handleTimeUpdate} onEnded={() => { void saveProgress(true, true).then(onProgressSaved).then(() => onToast({ type: "success", message: "Video completed" })).catch((error) => onToast({ type: "error", message: error.message })); }} /></div>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div><p className="text-sm font-medium text-primary">{course.title}</p><h2 className="mt-1 text-2xl font-semibold leading-8">{video.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{video.description}</p></div>
        <div className="rounded-md border bg-muted/40 p-3"><div className="flex items-center justify-between text-sm"><span>Progress</span><strong>{formatPercent(localProgress.percent)}</strong></div><div className="mt-2 h-2 rounded-full bg-white"><div className="h-2 rounded-full bg-primary" style={{ width: `${localProgress.percent}%` }} /></div><div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><FileVideo className="h-4 w-4" aria-hidden="true" />{video.h5pConfig?.interactions?.length ?? 0} H5P interactions</div></div>
      </div>
      {activeInteraction && <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/60 p-4"><div className="w-full max-w-md rounded-lg border bg-white p-5 shadow-panel"><h3 className="text-lg font-semibold">{activeInteraction.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{activeInteraction.prompt}</p><div className="mt-5 flex justify-end"><Button onClick={() => void confirmInteraction(activeInteraction).catch((error) => onToast({ type: "error", message: error.message }))}><Check className="h-4 w-4" aria-hidden="true" />Confirm</Button></div></div></div>}
    </div>
  );
}

function UserManagementPage({ token, directory, onRunAction }: { token: string; directory: DirectoryData; onRunAction: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [form, setForm] = useState({ name: "", email: "", password: "ChangeMe123", role: "STUDENT" as Role });
  const [editingUserId, setEditingUserId] = useState("");
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "STUDENT" as Role });
  const [resettingUserId, setResettingUserId] = useState("");
  const [resetForm, setResetForm] = useState({ newPassword: "", confirmNewPassword: "" });

  function startEditing(user: DirectoryUser) {
    setEditingUserId(user.id);
    setResettingUserId("");
    setEditForm({ name: user.name, email: user.email, role: user.role });
  }

  function startPasswordReset(user: DirectoryUser) {
    setResettingUserId(user.id);
    setEditingUserId("");
    setResetForm({ newPassword: "", confirmNewPassword: "" });
  }

  async function createUser() {
    await api.createUser(token, form);
    setForm({ name: "", email: "", password: "ChangeMe123", role: "STUDENT" });
  }

  async function saveUser() {
    await api.updateUser(token, editingUserId, editForm);
    setEditingUserId("");
  }

  async function resetPassword() {
    if (resetForm.newPassword !== resetForm.confirmNewPassword) {
      throw new Error("New password confirmation does not match");
    }

    await api.resetUserPassword(token, resettingUserId, resetForm);
    setResettingUserId("");
    setResetForm({ newPassword: "", confirmNewPassword: "" });
  }

  async function deleteUser(user: DirectoryUser) {
    if (!window.confirm(`Delete ${user.name}?`)) {
      return;
    }

    await onRunAction(async () => {
      await api.deleteUser(token, user.id);
      if (editingUserId === user.id) {
        setEditingUserId("");
      }
      if (resettingUserId === user.id) {
        setResettingUserId("");
      }
    }, "User deleted");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Card>
        <CardHeader><CardTitle>Create user</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <input className="field" placeholder="Full name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input className="field" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <input className="field" placeholder="Temporary password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          <select className="field" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
            {roleOptions.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
          </select>
          <Button onClick={() => onRunAction(createUser, "User created")}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />Create user
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>User directory</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            headers={["Name", "Email", "Role", "Actions"]}
            rows={directory.users.map((entry) => {
              const isEditing = editingUserId === entry.id;
              const isResetting = resettingUserId === entry.id;

              return [
                isEditing ? <input className="field min-w-44" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /> : <span className="font-medium">{entry.name}</span>,
                isResetting ? <input className="field min-w-52" type="password" placeholder="New password" value={resetForm.newPassword} onChange={(event) => setResetForm({ ...resetForm, newPassword: event.target.value })} /> : isEditing ? <input className="field min-w-56" type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /> : entry.email,
                isResetting ? <input className="field min-w-52" type="password" placeholder="Confirm password" value={resetForm.confirmNewPassword} onChange={(event) => setResetForm({ ...resetForm, confirmNewPassword: event.target.value })} /> : isEditing ? (
                  <select className="field min-w-44" value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value as Role })}>
                    {roleOptions.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                  </select>
                ) : roleLabel(entry.role),
                <div className="flex items-center gap-2">
                  {isEditing || isResetting ? (
                    <>
                      <Button size="icon" variant="default" title={isResetting ? "Reset password" : "Save user"} aria-label={isResetting ? "Reset password" : "Save user"} onClick={() => onRunAction(isResetting ? resetPassword : saveUser, isResetting ? "Password reset" : "User updated")}>
                        <Save className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Cancel" aria-label="Cancel" onClick={() => { setEditingUserId(""); setResettingUserId(""); }}>
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="outline" title="Edit user" aria-label="Edit user" onClick={() => startEditing(entry)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button size="icon" variant="outline" title="Reset password" aria-label="Reset password" onClick={() => startPasswordReset(entry)}>
                        <KeyRound className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button size="icon" variant="destructive" title="Delete user" aria-label="Delete user" onClick={() => void deleteUser(entry)}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </div>
              ];
            })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function VideoManagementPage({ token, directory, onRunAction }: { token: string; directory: DirectoryData; onRunAction: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [form, setForm] = useState({ title: "", description: "", popupTime: "15", popupTitle: "Check", popupPrompt: "Do you confirm that you understood the content?" });
  const [file, setFile] = useState<File | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState(directory.videos[0]?.id ?? "");
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const selectedVideo = directory.videos.find((video) => video.id === selectedVideoId) ?? directory.videos[0];

  useEffect(() => {
    setSelectedVideoId((current) => (current && directory.videos.some((video) => video.id === current) ? current : directory.videos[0]?.id ?? ""));
    setSelectedVideoIds((current) => new Set([...current].filter((videoId) => directory.videos.some((video) => video.id === videoId))));
  }, [directory.videos]);

  function toggleVideoSelection(videoId: string) {
    setSelectedVideoIds((current) => {
      const next = new Set(current);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  }

  async function uploadVideo() {
    if (!file) throw new Error("Select an MP4 file");
    const formData = new FormData();
    formData.set("video", file);
    formData.set("title", form.title || file.name);
    formData.set("description", form.description);
    formData.set("h5pConfig", JSON.stringify({ interactions: form.popupTitle ? [{ id: crypto.randomUUID(), time: Number(form.popupTime), type: "popup", title: form.popupTitle, prompt: form.popupPrompt }] : [] }));
    await api.uploadVideo(token, formData);
    setForm({ title: "", description: "", popupTime: "15", popupTitle: "Check", popupPrompt: "Do you confirm that you understood the content?" });
    setFile(null);
  }

  async function deleteSelectedVideos() {
    const videoIds = [...selectedVideoIds];
    if (videoIds.length === 0) throw new Error("Select at least one video");
    await api.deleteVideos(token, videoIds);
    setSelectedVideoIds(new Set());
  }

  function confirmDeleteSelectedVideos() {
    const videoCount = selectedVideoIds.size;
    if (videoCount === 0 || !window.confirm(`Delete ${videoCount} selected video${videoCount === 1 ? "" : "s"}?`)) {
      return;
    }

    void onRunAction(deleteSelectedVideos, "Selected videos deleted");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Upload MP4</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <input className="field" placeholder="Video title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            <textarea className="textarea-field" placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            <input className="field" type="file" accept="video/mp4" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-3 text-sm font-semibold">Initial H5P popup</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <input className="field" type="number" min="0" placeholder="Second" value={form.popupTime} onChange={(event) => setForm({ ...form, popupTime: event.target.value })} />
                <input className="field sm:col-span-2" placeholder="Popup title" value={form.popupTitle} onChange={(event) => setForm({ ...form, popupTitle: event.target.value })} />
              </div>
              <textarea className="textarea-field mt-2" placeholder="Popup text" value={form.popupPrompt} onChange={(event) => setForm({ ...form, popupPrompt: event.target.value })} />
            </div>
            <Button variant="secondary" onClick={() => onRunAction(uploadVideo, "Video uploaded")}><Upload className="h-4 w-4" aria-hidden="true" />Upload</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Video library</CardTitle>
              <Button variant="destructive" size="sm" disabled={selectedVideoIds.size === 0} onClick={confirmDeleteSelectedVideos}><Trash2 className="h-4 w-4" aria-hidden="true" />Delete selected</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {directory.videos.map((video) => (
              <div key={video.id} className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border bg-white px-3 py-3", selectedVideo?.id === video.id && "border-primary bg-primary/10")}>
                <input type="checkbox" checked={selectedVideoIds.has(video.id)} onChange={() => toggleVideoSelection(video.id)} aria-label={`Select ${video.title}`} />
                <button className="min-w-0 text-left" onClick={() => setSelectedVideoId(video.id)} type="button">
                  <span className="block truncate text-sm font-semibold">{video.title}</span>
                  <span className="text-xs text-muted-foreground">{video.h5pConfig?.interactions?.length ?? 0} H5P checks</span>
                </button>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
            ))}
            {directory.videos.length === 0 && <EmptyInline title="No videos" description="Uploaded videos will appear here." />}
          </CardContent>
        </Card>
      </div>

      {selectedVideo ? <VideoDetailEditor token={token} video={selectedVideo} onRunAction={onRunAction} /> : <EmptyState title="No video selected" description="Upload or select a video to edit metadata and H5P checkpoints." />}
    </div>
  );
}

function VideoDetailEditor({ token, video, onRunAction }: { token: string; video: DirectoryVideo; onRunAction: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [form, setForm] = useState({ title: video.title, description: video.description, durationSeconds: video.durationSeconds?.toString() ?? "" });
  const [interactions, setInteractions] = useState<H5PInteraction[]>(video.h5pConfig?.interactions ?? []);

  useEffect(() => {
    setForm({ title: video.title, description: video.description, durationSeconds: video.durationSeconds?.toString() ?? "" });
    setInteractions(video.h5pConfig?.interactions ?? []);
  }, [video.description, video.durationSeconds, video.h5pConfig, video.id, video.title]);

  async function saveVideo() {
    await api.updateVideo(token, video.id, {
      title: form.title,
      description: form.description,
      durationSeconds: form.durationSeconds ? Number(form.durationSeconds) : null,
      h5pConfig: { interactions }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><CardTitle>Edit video</CardTitle><p className="mt-1 text-sm text-muted-foreground">{video.title}</p></div>
          <Button onClick={() => onRunAction(saveVideo, "Video saved")}><Save className="h-4 w-4" aria-hidden="true" />Save video</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
          <label className="text-sm font-medium">Title<input className="field mt-1" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label className="text-sm font-medium">Duration<input className="field mt-1" type="number" min="1" placeholder="Seconds" value={form.durationSeconds} onChange={(event) => setForm({ ...form, durationSeconds: event.target.value })} /></label>
        </div>
        <label className="block text-sm font-medium">Description<textarea className="textarea-field mt-1" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <H5PInteractionEditor interactions={interactions} onChange={setInteractions} />
      </CardContent>
    </Card>
  );
}

function H5PInteractionEditor({ interactions, onChange }: { interactions: H5PInteraction[]; onChange: (interactions: H5PInteraction[]) => void }) {
  function updateInteraction(index: number, patch: Partial<H5PInteraction>) {
    onChange(interactions.map((interaction, position) => (position === index ? { ...interaction, ...patch } : interaction)));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold">H5P checkpoints</p>
        <Button variant="outline" onClick={() => onChange([...interactions, { id: crypto.randomUUID(), time: 0, type: "checkpoint", title: "New checkpoint", prompt: "Record that the learner reached this point." }])}><Plus className="h-4 w-4" aria-hidden="true" />Add checkpoint</Button>
      </div>
      {interactions.map((interaction, index) => (
        <div key={interaction.id} className="rounded-md border bg-white p-3">
          <div className="grid gap-3 md:grid-cols-[120px_1fr_1fr]">
            <label className="text-sm font-medium">Time<input className="field mt-1" type="number" min="0" value={interaction.time} onChange={(event) => updateInteraction(index, { time: Number(event.target.value) })} /></label>
            <label className="text-sm font-medium">Title<input className="field mt-1" value={interaction.title} onChange={(event) => updateInteraction(index, { title: event.target.value })} /></label>
            <label className="text-sm font-medium">Type<select className="field mt-1" value={interaction.type} onChange={(event) => updateInteraction(index, { type: event.target.value })}><option value="popup">Popup</option><option value="checkpoint">Checkpoint</option></select></label>
          </div>
          <label className="mt-3 block text-sm font-medium">Prompt<textarea className="textarea-field mt-1" value={interaction.prompt} onChange={(event) => updateInteraction(index, { prompt: event.target.value })} /></label>
          <div className="mt-3 flex justify-end"><Button variant="ghost" size="sm" onClick={() => onChange(interactions.filter((_, position) => position !== index))}>Remove</Button></div>
        </div>
      ))}
      {interactions.length === 0 && <EmptyInline title="No H5P interactions" description="Add checkpoints or popups to this video." />}
    </div>
  );
}

function VideoUploadPage({ token, directory, onRunAction }: { token: string; directory: DirectoryData; onRunAction: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [form, setForm] = useState({ title: "", description: "", popupTime: "15", popupTitle: "Check", popupPrompt: "Do you confirm that you understood the content?" });
  const [file, setFile] = useState<File | null>(null);
  async function uploadVideo() { if (!file) throw new Error("Select an MP4 file"); const formData = new FormData(); formData.set("video", file); formData.set("title", form.title || file.name); formData.set("description", form.description); formData.set("h5pConfig", JSON.stringify({ interactions: form.popupTitle ? [{ id: crypto.randomUUID(), time: Number(form.popupTime), type: "popup", title: form.popupTitle, prompt: form.popupPrompt }] : [] })); await api.uploadVideo(token, formData); }
  return <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]"><Card><CardHeader><CardTitle>Upload MP4</CardTitle></CardHeader><CardContent className="space-y-3"><input className="field" placeholder="Video title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /><textarea className="textarea-field" placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /><input className="field" type="file" accept="video/mp4" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><div className="rounded-md border bg-muted/30 p-3"><p className="mb-3 text-sm font-semibold">Initial H5P popup</p><div className="grid gap-2 sm:grid-cols-3"><input className="field" type="number" min="0" placeholder="Second" value={form.popupTime} onChange={(event) => setForm({ ...form, popupTime: event.target.value })} /><input className="field sm:col-span-2" placeholder="Popup title" value={form.popupTitle} onChange={(event) => setForm({ ...form, popupTitle: event.target.value })} /></div><textarea className="textarea-field mt-2" placeholder="Popup text" value={form.popupPrompt} onChange={(event) => setForm({ ...form, popupPrompt: event.target.value })} /></div><Button variant="secondary" onClick={() => onRunAction(uploadVideo, "Video uploaded")}><Upload className="h-4 w-4" aria-hidden="true" />Upload</Button></CardContent></Card><Card><CardHeader><CardTitle>Video library</CardTitle></CardHeader><CardContent className="space-y-2">{directory.videos.map((video) => <CompactItem key={video.id} title={video.title} detail={`${video.h5pConfig?.interactions?.length ?? 0} H5P checks`} />)}</CardContent></Card></div>;
}

function H5PManagementPage({ token, directory, onRunAction }: { token: string; directory: DirectoryData; onRunAction: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [selectedVideoId, setSelectedVideoId] = useState(directory.videos[0]?.id ?? "");
  const selectedVideo = directory.videos.find((video) => video.id === selectedVideoId) ?? directory.videos[0];
  if (!selectedVideo) return <EmptyState title="No videos" description="Upload an MP4 video before configuring H5P controls." />;
  return <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]"><Card><CardHeader><CardTitle>Videos</CardTitle></CardHeader><CardContent className="space-y-2">{directory.videos.map((video) => <button key={video.id} className={cn("flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left", selectedVideo.id === video.id && "border-primary bg-primary/10")} onClick={() => setSelectedVideoId(video.id)} type="button"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{video.title}</span><span className="text-xs text-muted-foreground">{video.h5pConfig?.interactions?.length ?? 0} configured interactions</span></span><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>)}</CardContent></Card><H5PEditor video={selectedVideo} onSave={(interactions) => onRunAction(() => api.updateVideoH5P(token, selectedVideo.id, { interactions }), "H5P configuration saved")} /></div>;
}

function H5PEditor({ video, onSave }: { video: DirectoryVideo; onSave: (interactions: H5PInteraction[]) => Promise<void> }) {
  const [interactions, setInteractions] = useState<H5PInteraction[]>(video.h5pConfig?.interactions ?? []);
  useEffect(() => { setInteractions(video.h5pConfig?.interactions ?? []); }, [video.id, video.h5pConfig]);
  function updateInteraction(index: number, patch: Partial<H5PInteraction>) { setInteractions((current) => current.map((interaction, position) => (position === index ? { ...interaction, ...patch } : interaction))); }
  return <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>{video.title}</CardTitle><p className="mt-1 text-sm text-muted-foreground">Configure multiple checkpoints and popups for this video.</p></div><Button variant="outline" onClick={() => setInteractions((current) => [...current, { id: crypto.randomUUID(), time: 0, type: "checkpoint", title: "New checkpoint", prompt: "Record that the learner reached this point." }])}><Plus className="h-4 w-4" aria-hidden="true" />Add checkpoint</Button></div></CardHeader><CardContent className="space-y-3">{interactions.map((interaction, index) => <div key={interaction.id} className="rounded-md border bg-white p-3"><div className="grid gap-3 md:grid-cols-[120px_1fr_1fr]"><label className="text-sm font-medium">Time<input className="field mt-1" type="number" min="0" value={interaction.time} onChange={(event) => updateInteraction(index, { time: Number(event.target.value) })} /></label><label className="text-sm font-medium">Title<input className="field mt-1" value={interaction.title} onChange={(event) => updateInteraction(index, { title: event.target.value })} /></label><label className="text-sm font-medium">Type<select className="field mt-1" value={interaction.type} onChange={(event) => updateInteraction(index, { type: event.target.value })}><option value="popup">Popup</option><option value="checkpoint">Checkpoint</option></select></label></div><label className="mt-3 block text-sm font-medium">Prompt<textarea className="textarea-field mt-1" value={interaction.prompt} onChange={(event) => updateInteraction(index, { prompt: event.target.value })} /></label><div className="mt-3 flex justify-end"><Button variant="ghost" size="sm" onClick={() => setInteractions((current) => current.filter((_, position) => position !== index))}>Remove</Button></div></div>)}{interactions.length === 0 && <EmptyInline title="No H5P interactions" description="Add checkpoints for transparent tracking or popups for learner confirmation." />}<Button onClick={() => onSave(interactions)}><Save className="h-4 w-4" aria-hidden="true" />Save H5P configuration</Button></CardContent></Card>;
}

function GroupManagementPage({ token, directory, onRunAction }: { token: string; directory: DirectoryData; onRunAction: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [groupName, setGroupName] = useState(""); const [selectedGroupId, setSelectedGroupId] = useState(directory.groups[0]?.id ?? ""); const [selectedUserId, setSelectedUserId] = useState(directory.users.find((user) => user.role === "STUDENT")?.id ?? directory.users[0]?.id ?? ""); const selectedGroup = directory.groups.find((group) => group.id === selectedGroupId) ?? directory.groups[0]; const learners = directory.users.filter((entry) => entry.role === "STUDENT");
  return <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]"><Card><CardHeader><CardTitle>Group setup</CardTitle></CardHeader><CardContent className="space-y-3"><input className="field" placeholder="Group name" value={groupName} onChange={(event) => setGroupName(event.target.value)} /><Button onClick={() => onRunAction(() => api.createGroup(token, { name: groupName }), "Group created")}><Plus className="h-4 w-4" aria-hidden="true" />Create group</Button><div className="border-t pt-3"><p className="mb-2 text-sm font-semibold">Add learner</p><select className="field" value={selectedGroup?.id ?? ""} onChange={(event) => setSelectedGroupId(event.target.value)}>{directory.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select className="field mt-2" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>{learners.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select><Button className="mt-2" variant="secondary" disabled={!selectedGroup} onClick={() => onRunAction(() => api.addGroupMember(token, selectedGroup!.id, { userId: selectedUserId, roleLabel: "learner" }), "Learner added")}><UserPlus className="h-4 w-4" aria-hidden="true" />Add to group</Button></div></CardContent></Card><Card><CardHeader><CardTitle>Groups and members</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-2">{directory.groups.map((group) => <div key={group.id} className="rounded-md border bg-white p-3"><p className="font-semibold">{group.name}</p><p className="text-sm text-muted-foreground">{group.members.length} members</p><div className="mt-3 space-y-2">{group.members.map((member) => <CompactItem key={member.user.id} title={member.user.name} detail={member.user.email} />)}</div></div>)}</CardContent></Card></div>;
}

function CourseManagementPage({ token, courses, directory, onRunAction }: { token: string; courses: Course[]; directory: DirectoryData; onRunAction: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [courseForm, setCourseForm] = useState({ title: "", description: "", status: "PUBLISHED" as Course["status"] });
  const [attachForm, setAttachForm] = useState({ courseId: courses[0]?.id ?? "", videoId: directory.videos[0]?.id ?? "", position: "1", gatePrevious: true });
  const [assignmentForm, setAssignmentForm] = useState({ targetType: "group", contentType: "course", courseId: courses[0]?.id ?? "", videoId: directory.videos[0]?.id ?? "", userId: directory.users[0]?.id ?? "", groupId: directory.groups[0]?.id ?? "", dueAt: "", notes: "" });
  useEffect(() => { setAttachForm((current) => ({ ...current, courseId: current.courseId || courses[0]?.id || "", videoId: current.videoId || directory.videos[0]?.id || "" })); setAssignmentForm((current) => ({ ...current, courseId: current.courseId || courses[0]?.id || "", videoId: current.videoId || directory.videos[0]?.id || "", userId: current.userId || directory.users[0]?.id || "", groupId: current.groupId || directory.groups[0]?.id || "" })); }, [courses, directory]);
  return <div className="grid gap-4 xl:grid-cols-3"><Card><CardHeader><CardTitle>Create course</CardTitle></CardHeader><CardContent className="space-y-3"><input className="field" placeholder="Title" value={courseForm.title} onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })} /><textarea className="textarea-field" placeholder="Description" value={courseForm.description} onChange={(event) => setCourseForm({ ...courseForm, description: event.target.value })} /><select className="field" value={courseForm.status} onChange={(event) => setCourseForm({ ...courseForm, status: event.target.value as Course["status"] })}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select><Button onClick={() => onRunAction(() => api.createCourse(token, courseForm), "Course created")}><Plus className="h-4 w-4" aria-hidden="true" />Create course</Button></CardContent></Card><Card><CardHeader><CardTitle>Sequence videos</CardTitle></CardHeader><CardContent className="space-y-3"><select className="field" value={attachForm.courseId} onChange={(event) => setAttachForm({ ...attachForm, courseId: event.target.value })}>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select><select className="field" value={attachForm.videoId} onChange={(event) => setAttachForm({ ...attachForm, videoId: event.target.value })}>{directory.videos.map((video) => <option key={video.id} value={video.id}>{video.title}</option>)}</select><div className="grid grid-cols-[1fr_auto] gap-3"><input className="field" type="number" min="1" value={attachForm.position} onChange={(event) => setAttachForm({ ...attachForm, position: event.target.value })} /><label className="flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm"><input type="checkbox" checked={attachForm.gatePrevious} onChange={(event) => setAttachForm({ ...attachForm, gatePrevious: event.target.checked })} />Gate</label></div><Button variant="secondary" onClick={() => onRunAction(() => api.attachVideo(token, attachForm.courseId, { videoId: attachForm.videoId, position: Number(attachForm.position), gatePrevious: attachForm.gatePrevious }), "Video linked")}><ChevronRight className="h-4 w-4" aria-hidden="true" />Link video</Button></CardContent></Card><Card><CardHeader><CardTitle>Assign learning</CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-2 gap-2"><select className="field" value={assignmentForm.contentType} onChange={(event) => setAssignmentForm({ ...assignmentForm, contentType: event.target.value })}><option value="course">Course</option><option value="video">Video</option></select><select className="field" value={assignmentForm.targetType} onChange={(event) => setAssignmentForm({ ...assignmentForm, targetType: event.target.value })}><option value="group">Group</option><option value="user">User</option></select></div>{assignmentForm.contentType === "course" ? <select className="field" value={assignmentForm.courseId} onChange={(event) => setAssignmentForm({ ...assignmentForm, courseId: event.target.value })}>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select> : <select className="field" value={assignmentForm.videoId} onChange={(event) => setAssignmentForm({ ...assignmentForm, videoId: event.target.value })}>{directory.videos.map((video) => <option key={video.id} value={video.id}>{video.title}</option>)}</select>}{assignmentForm.targetType === "group" ? <select className="field" value={assignmentForm.groupId} onChange={(event) => setAssignmentForm({ ...assignmentForm, groupId: event.target.value })}>{directory.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select> : <select className="field" value={assignmentForm.userId} onChange={(event) => setAssignmentForm({ ...assignmentForm, userId: event.target.value })}>{directory.users.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} - {roleLabel(entry.role)}</option>)}</select>}<input className="field" type="datetime-local" value={assignmentForm.dueAt} onChange={(event) => setAssignmentForm({ ...assignmentForm, dueAt: event.target.value })} /><textarea className="textarea-field" placeholder="Notes" value={assignmentForm.notes} onChange={(event) => setAssignmentForm({ ...assignmentForm, notes: event.target.value })} /><Button onClick={() => onRunAction(() => api.assign(token, { courseId: assignmentForm.contentType === "course" ? assignmentForm.courseId : undefined, videoId: assignmentForm.contentType === "video" ? assignmentForm.videoId : undefined, groupId: assignmentForm.targetType === "group" ? assignmentForm.groupId : undefined, userId: assignmentForm.targetType === "user" ? assignmentForm.userId : undefined, dueAt: assignmentForm.dueAt ? new Date(assignmentForm.dueAt).toISOString() : undefined, notes: assignmentForm.notes || undefined }), "Assignment created")}><ClipboardCheck className="h-4 w-4" aria-hidden="true" />Assign</Button></CardContent></Card></div>;
}

function ProgressCertificationPage({ courses, progressRows }: { courses: Course[]; progressRows: ProgressReportRow[] }) {
  const [courseFilter, setCourseFilter] = useState("all");
  const filteredRows = courseFilter === "all" ? progressRows : progressRows.filter((row) => row.course?.id === courseFilter);
  return <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Certification queue</CardTitle><p className="mt-1 text-sm text-muted-foreground">Review learner progress before issuing course certification.</p></div><select className="field max-w-xs" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}><option value="all">All courses</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></div></CardHeader><CardContent><ProgressTable rows={filteredRows} /></CardContent></Card>;
}

function ReportsPage({ overview, courses, progressRows }: { overview: ReportOverview | null; courses: Course[]; progressRows: ProgressReportRow[] }) {
  const metrics = overview ? [{ label: "Courses", value: overview.courses, icon: BookOpenCheck }, { label: "Videos", value: overview.videos, icon: FileVideo }, { label: "Learners", value: overview.learners, icon: Users }, { label: "Completed", value: overview.completedViews, icon: Check }, { label: "Average", value: `${overview.averageProgress}%`, icon: Activity }, { label: "H5P events", value: overview.h5pEvents, icon: ListChecks }] : [];
  return <div className="space-y-5"><MetricGrid metrics={metrics} /><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"><Card><CardHeader><CardTitle>Course completion</CardTitle></CardHeader><CardContent className="space-y-3">{courses.map((course) => <CourseProgressRow key={course.id} course={course} />)}</CardContent></Card><Card><CardHeader><CardTitle>Recent activity</CardTitle></CardHeader><CardContent className="space-y-2">{progressRows.slice(0, 8).map((row) => <CompactItem key={row.id} title={row.user.name} detail={`${row.video.title} - ${formatPercent(row.percent)}`} />)}</CardContent></Card></div></div>;
}

function SettingsPage({ token, user, onRunAction }: { token: string; user: User; onRunAction: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmNewPassword: "" });

  async function changePassword() {
    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      throw new Error("New password confirmation does not match");
    }

    await api.changePassword(token, passwordForm);
    setPasswordForm({ currentPassword: "", newPassword: "", confirmNewPassword: "" });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <CompactItem title="Name" detail={user.name} />
          <CompactItem title="Email" detail={user.email} />
          <CompactItem title="Role" detail={roleLabel(user.role)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Password</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <input className="field" type="password" placeholder="Current password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} />
          <input className="field" type="password" placeholder="New password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} />
          <input className="field" type="password" placeholder="Confirm new password" value={passwordForm.confirmNewPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmNewPassword: event.target.value })} />
          <Button onClick={() => onRunAction(changePassword, "Password changed")}>
            <KeyRound className="h-4 w-4" aria-hidden="true" />Change password
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Platform settings</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <CompactItem title="API endpoint" detail={import.meta.env.VITE_API_URL ?? "http://localhost:4000"} />
          <CompactItem title="Demo data" detail="Docker Compose seeds demo users when SEED_DEMO_DATA is enabled." />
          <CompactItem title="Versioning" detail="Application version is managed through VERSION and npm scripts." />
        </CardContent>
      </Card>
    </div>
  );
}

function MetricGrid({ metrics }: { metrics: Array<{ label: string; value: string | number; icon: IconComponent }> }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <Card key={metric.label}><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">{metric.label}</p><p className="mt-1 text-2xl font-semibold">{metric.value}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary"><metric.icon className="h-5 w-5" aria-hidden="true" /></div></div></CardContent></Card>)}</div>;
}

function CourseProgressRow({ course, onOpen }: { course: Course; onOpen?: () => void }) {
  return <div className="rounded-md border bg-white p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{course.title}</p><p className="text-xs text-muted-foreground">{course.completedVideos}/{course.totalVideos} videos completed</p></div>{onOpen && <Button size="sm" variant="outline" onClick={onOpen}>Open</Button>}</div><div className="mt-3 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${course.progressPercent}%` }} /></div></div>;
}

function CompactItem({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-md border bg-white px-3 py-2"><p className="truncate text-sm font-semibold">{title}</p><p className="truncate text-xs text-muted-foreground">{detail}</p></div>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted text-xs uppercase text-muted-foreground"><tr>{headers.map((header) => <th key={header} className="px-3 py-2">{header}</th>)}</tr></thead><tbody className="divide-y bg-white">{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-middle">{cell}</td>)}</tr>)}</tbody></table></div>;
}

function ProgressTable({ rows }: { rows: ProgressReportRow[] }) {
  return <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Learner</th><th className="px-3 py-2">Course</th><th className="px-3 py-2">Video</th><th className="px-3 py-2">Progress</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Updated</th></tr></thead><tbody className="divide-y bg-white">{rows.map((row) => <tr key={row.id}><td className="px-3 py-2 font-medium">{row.user.name}</td><td className="px-3 py-2">{row.course?.title ?? "Standalone video"}</td><td className="px-3 py-2">{row.video.title}</td><td className="px-3 py-2">{formatPercent(row.percent)}</td><td className="px-3 py-2">{row.completed ? "Ready to certify" : "Evidence pending"}</td><td className="px-3 py-2 text-muted-foreground">{new Date(row.updatedAt).toLocaleString()}</td></tr>)}</tbody></table>{rows.length === 0 && <EmptyInline title="No progress rows" description="Learner progress will appear after students start assigned videos." />}</div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="grid min-h-[360px] place-items-center rounded-lg border bg-white shadow-panel"><div className="px-4 text-center"><GraduationCap className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" /><h2 className="mt-3 text-lg font-semibold">{title}</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p></div></div>;
}

function EmptyInline({ title, description }: { title: string; description: string }) {
  return <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm"><p className="font-semibold">{title}</p><p className="mt-1 text-muted-foreground">{description}</p></div>;
}

function Toast({ toast, onClose }: { toast: Exclude<ToastState, null>; onClose: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onClose, 3200); return () => window.clearTimeout(timer); }, [onClose]);
  return <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border bg-white p-4 shadow-panel"><p className={cn("text-sm font-medium", toast.type === "error" ? "text-destructive" : "text-primary")}>{toast.message}</p></div>;
}

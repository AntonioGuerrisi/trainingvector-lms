export type Role = "STUDENT" | "PROFESSOR" | "ADMIN";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export type H5PInteraction = {
  id: string;
  time: number;
  type: "popup" | string;
  title: string;
  prompt: string;
};

export type H5PConfig = {
  interactions?: H5PInteraction[];
};

export type VideoProgress = {
  percent: number;
  completed: boolean;
  watchedSeconds: number;
  lastPositionSeconds: number;
};

export type CourseVideo = {
  id: string;
  title: string;
  description: string;
  sourceUrl: string;
  durationSeconds?: number;
  h5pConfig?: H5PConfig;
  position: number;
  gatePrevious: boolean;
  locked: boolean;
  progress: VideoProgress;
};

export type Course = {
  id: string;
  title: string;
  description: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  totalVideos: number;
  completedVideos: number;
  progressPercent: number;
  videos: CourseVideo[];
};

export type ReportOverview = {
  courses: number;
  videos: number;
  learners: number;
  completedViews: number;
  averageProgress: number;
  h5pEvents: number;
};

export type DirectoryUser = Pick<User, "id" | "name" | "email" | "role">;

export type DirectoryGroup = {
  id: string;
  name: string;
  members: Array<{ user: Pick<User, "id" | "name" | "email"> }>;
};

export type DirectoryVideo = {
  id: string;
  title: string;
  description: string;
  sourceUrl: string;
};

export type DirectoryData = {
  users: DirectoryUser[];
  groups: DirectoryGroup[];
  videos: DirectoryVideo[];
};

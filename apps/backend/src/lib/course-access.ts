import type { Course, CourseVideo, Role, Video, VideoProgress } from "@prisma/client";
import type { AuthUser } from "./auth.js";
import { getCompletedInteractionIds, getRequiredInteractionCompletion, type H5PEventReference } from "./h5p-progress.js";
import { HttpError } from "./http.js";
import { prisma } from "./prisma.js";

type CourseWithVideos = Course & {
  videos: Array<CourseVideo & { video: Video }>;
};

export function isPrivileged(role: Role) {
  return role === "ADMIN" || role === "PROFESSOR";
}

export async function getUserGroupIds(userId: string) {
  const groups = await prisma.groupMembership.findMany({ where: { userId }, select: { groupId: true } });
  return groups.map((group) => group.groupId);
}

export async function canAccessCourse(user: AuthUser, courseId: string) {
  if (isPrivileged(user.role)) {
    return true;
  }

  const groupIds = await getUserGroupIds(user.id);
  const assignment = await prisma.assignment.findFirst({
    where: {
      courseId,
      OR: [{ userId: user.id }, { groupId: { in: groupIds } }]
    },
    select: { id: true }
  });

  return Boolean(assignment);
}

export async function canAccessVideo(user: AuthUser, videoId: string) {
  if (isPrivileged(user.role)) {
    return true;
  }

  const groupIds = await getUserGroupIds(user.id);
  const assignment = await prisma.assignment.findFirst({
    where: {
      videoId,
      OR: [{ userId: user.id }, { groupId: { in: groupIds } }]
    },
    select: { id: true }
  });

  return Boolean(assignment);
}

export async function getCourseOrThrow(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      videos: {
        orderBy: { position: "asc" },
        include: { video: true }
      }
    }
  });

  if (!course) {
    throw new HttpError(404, "Course not found");
  }

  return course;
}

export async function getProgressForCourse(userId: string, courseId: string) {
  return prisma.videoProgress.findMany({ where: { userId, courseId } });
}

export async function getH5PEventsForCourse(userId: string, courseId: string) {
  return prisma.h5PEvent.findMany({
    where: { userId, courseId },
    select: { videoId: true, courseId: true, interactionId: true }
  });
}

export function serializeCourse(course: CourseWithVideos, progressRows: VideoProgress[], h5pEvents: H5PEventReference[], role: Role) {
  const progressByVideo = new Map(progressRows.map((progress) => [progress.videoId, progress]));
  let previousCompleted = true;

  const videos = course.videos.map((entry, index) => {
    const progress = progressByVideo.get(entry.videoId);
    const interactionCompletion = getRequiredInteractionCompletion(entry.video.h5pConfig, getCompletedInteractionIds(h5pEvents, entry.videoId, course.id));
    const effectivePercent = interactionCompletion?.percent ?? progress?.percent ?? 0;
    const effectiveCompleted = Boolean(progress?.completed && (interactionCompletion?.completed ?? true));
    const locked = !isPrivileged(role) && entry.gatePrevious && index > 0 && !previousCompleted;

    previousCompleted = effectiveCompleted;

    return {
      id: entry.video.id,
      title: entry.video.title,
      description: entry.video.description,
      sourceUrl: entry.video.sourceUrl,
      durationSeconds: entry.video.durationSeconds,
      h5pConfig: entry.video.h5pConfig,
      position: entry.position,
      gatePrevious: entry.gatePrevious,
      locked,
      progress: progress
        ? {
            percent: effectivePercent,
            completed: effectiveCompleted,
            watchedSeconds: progress.watchedSeconds,
            lastPositionSeconds: progress.lastPositionSeconds
          }
        : {
            percent: 0,
            completed: false,
            watchedSeconds: 0,
            lastPositionSeconds: 0
          }
    };
  });

  const completed = videos.filter((video) => video.progress.completed).length;

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    status: course.status,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    totalVideos: videos.length,
    completedVideos: completed,
    progressPercent: videos.length === 0 ? 0 : Math.round((completed / videos.length) * 100),
    videos
  };
}

export function standaloneCourseId(videoId: string) {
  return `standalone:${videoId}`;
}

export function standaloneVideoId(courseId: string) {
  return courseId.startsWith("standalone:") ? courseId.replace("standalone:", "") : null;
}

export async function assertVideoUnlocked(user: AuthUser, courseId: string | undefined, videoId: string) {
  if (!courseId || standaloneVideoId(courseId)) {
    const hasVideoAccess = await canAccessVideo(user, videoId);
    if (!hasVideoAccess) {
      throw new HttpError(403, "Video not assigned");
    }

    return;
  }

  const hasCourseAccess = await canAccessCourse(user, courseId);
  if (!hasCourseAccess) {
    throw new HttpError(403, "Course not assigned");
  }

  if (isPrivileged(user.role)) {
    return;
  }

  const course = await getCourseOrThrow(courseId);
  const progress = await getProgressForCourse(user.id, courseId);
  const h5pEvents = await getH5PEventsForCourse(user.id, courseId);
  const payload = serializeCourse(course, progress, h5pEvents, user.role);
  const video = payload.videos.find((entry) => entry.id === videoId);

  if (!video) {
    throw new HttpError(404, "Video not found in course");
  }

  if (video.locked) {
    throw new HttpError(423, "Previous video must be completed first");
  }
}
